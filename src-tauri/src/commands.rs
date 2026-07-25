use chrono::{Duration, Utc};
use tauri::{AppHandle, State};

use crate::{
    error::{CommandError, CommandResult},
    models::{
        AppSettings, AuthStatus, CacheRecord, Cached, DisconnectResult, OwnProfile, PendingOAuth,
        Ruleset, SavedCredentials, Score, TokenSet,
    },
    oauth,
    state::AppState,
};

const PROFILE_CACHE_SECONDS: i64 = 300;
const SCORE_CACHE_SECONDS: i64 = 600;
const MANUAL_REFRESH_SECONDS: i64 = 60;

#[tauri::command]
pub fn get_auth_status(state: State<'_, AppState>) -> CommandResult<AuthStatus> {
    let snapshot = state.store.snapshot()?;
    let has_secret = state.credentials.get_client_secret()?.is_some();
    let tokens = state.credentials.get_tokens()?;
    Ok(AuthStatus {
        credentials_configured: snapshot.client_id.is_some() && has_secret,
        connected: tokens.is_some(),
        client_id: snapshot.client_id,
        callback_url: oauth::CALLBACK_URL.into(),
        user_id: snapshot.current_user_id,
        username: snapshot.username,
    })
}

#[tauri::command]
pub fn save_oauth_credentials(
    client_id: String,
    client_secret: String,
    state: State<'_, AppState>,
) -> CommandResult<SavedCredentials> {
    let client_id = client_id.trim().to_string();
    let client_secret = client_secret.trim();
    if client_id.is_empty()
        || !client_id
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        return Err(CommandError::new(
            "INVALID_CLIENT_ID",
            "Client ID 必须是数字",
        ));
    }
    if client_secret.len() < 16 {
        return Err(CommandError::new(
            "INVALID_CLIENT_SECRET",
            "Client Secret 格式无效",
        ));
    }

    state.credentials.set_client_secret(client_secret)?;
    state.credentials.clear_tokens()?;
    state.avatar_cache.clear()?;
    state.store.update(|persisted| {
        persisted.client_id = Some(client_id.clone());
        persisted.token_expires_at = None;
        persisted.current_user_id = None;
        persisted.username = None;
        persisted.cache.clear();
        persisted.last_manual_refresh.clear();
    })?;

    Ok(SavedCredentials {
        client_id,
        callback_url: oauth::CALLBACK_URL.into(),
    })
}

#[tauri::command]
pub async fn begin_oauth_login(app: AppHandle) -> CommandResult<PendingOAuth> {
    oauth::begin(app).await
}

#[tauri::command]
pub fn cancel_oauth_login(state: State<'_, AppState>) -> CommandResult<()> {
    oauth::cancel(&state)
}

#[tauri::command]
pub async fn disconnect_osu(
    revoke: bool,
    state: State<'_, AppState>,
) -> CommandResult<DisconnectResult> {
    let mut revoked = false;
    let mut warning = None;
    if revoke && let Some(tokens) = state.credentials.get_tokens()? {
        match state.api.revoke_current_token(&tokens.access_token).await {
            Ok(()) => revoked = true,
            Err(error) => warning = Some(error.message),
        }
    }

    state.credentials.clear_tokens()?;
    state.avatar_cache.clear()?;
    state.store.update(|persisted| {
        persisted.token_expires_at = None;
        persisted.current_user_id = None;
        persisted.username = None;
        persisted.cache.clear();
        persisted.last_manual_refresh.clear();
    })?;
    Ok(DisconnectResult { revoked, warning })
}

#[tauri::command]
pub async fn get_own_profile(
    ruleset: Ruleset,
    force_refresh: bool,
    state: State<'_, AppState>,
) -> CommandResult<Cached<OwnProfile>> {
    let key = format!("profile:{ruleset}");
    let snapshot = state.store.snapshot()?;
    let cached = snapshot.cache.get(&key).cloned();
    if !force_refresh {
        if let Some(record) = cached.as_ref()
            && Utc::now() - record.fetched_at < Duration::seconds(PROFILE_CACHE_SECONDS)
        {
            let mut cached_profile = profile_from_cache(record, false)?;
            attach_avatar(&state, &mut cached_profile.data, false).await;
            return Ok(cached_profile);
        }
    } else {
        enforce_manual_cooldown(&state, &key)?;
    }

    let access_token = ensure_access_token(&state).await?;
    match state.api.get_own_profile(&access_token, ruleset).await {
        Ok(mut profile) => {
            let fetched_at = Utc::now();
            let value = serde_json::to_value(&profile)?;
            state.store.update(|persisted| {
                persisted.current_user_id = Some(profile.id);
                persisted.username = Some(profile.username.clone());
                persisted
                    .cache
                    .insert(key, CacheRecord { value, fetched_at });
            })?;
            attach_avatar(&state, &mut profile, force_refresh).await;
            Ok(Cached {
                data: profile,
                fetched_at,
                stale: false,
            })
        }
        Err(error) if can_use_stale_cache(&error) && cached.is_some() => {
            let mut cached_profile =
                profile_from_cache(&cached.expect("cache checked above"), true)?;
            attach_avatar(&state, &mut cached_profile.data, false).await;
            Ok(cached_profile)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn get_best_scores(
    ruleset: Ruleset,
    force_refresh: bool,
    state: State<'_, AppState>,
) -> CommandResult<Cached<Vec<Score>>> {
    let key = format!("scores:{ruleset}");
    let snapshot = state.store.snapshot()?;
    let cached = snapshot.cache.get(&key).cloned();
    if !force_refresh {
        if let Some(record) = cached.as_ref()
            && Utc::now() - record.fetched_at < Duration::seconds(SCORE_CACHE_SECONDS)
        {
            return scores_from_cache(record, false);
        }
    } else {
        enforce_manual_cooldown(&state, &key)?;
    }

    let user_id = snapshot
        .current_user_id
        .ok_or_else(|| CommandError::new("PROFILE_REQUIRED", "请先加载个人资料，再查看最佳成绩"))?;
    let access_token = ensure_access_token(&state).await?;
    match state
        .api
        .get_best_scores(&access_token, user_id, ruleset)
        .await
    {
        Ok(scores) => {
            let fetched_at = Utc::now();
            let value = serde_json::to_value(&scores)?;
            state.store.update(|persisted| {
                persisted
                    .cache
                    .insert(key, CacheRecord { value, fetched_at });
            })?;
            Ok(Cached {
                data: scores,
                fetched_at,
                stale: false,
            })
        }
        Err(error) if can_use_stale_cache(&error) && cached.is_some() => {
            scores_from_cache(&cached.expect("cache checked above"), true)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub fn clear_profile_cache(state: State<'_, AppState>) -> CommandResult<()> {
    state.store.update(|persisted| {
        persisted.cache.clear();
        persisted.last_manual_refresh.clear();
    })?;
    state.avatar_cache.clear()
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> CommandResult<AppSettings> {
    Ok(state.store.snapshot()?.settings)
}

#[tauri::command]
pub fn update_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> CommandResult<AppSettings> {
    state
        .store
        .update(|persisted| persisted.settings = settings.clone())?;
    Ok(settings)
}

fn enforce_manual_cooldown(state: &AppState, key: &str) -> CommandResult<()> {
    let now = Utc::now();
    state.store.update(|persisted| {
        if let Some(previous) = persisted.last_manual_refresh.get(key) {
            let elapsed = now.signed_duration_since(*previous).num_seconds();
            if elapsed < MANUAL_REFRESH_SECONDS {
                return Err(CommandError::new("REFRESH_COOLDOWN", "请稍后再手动刷新")
                    .retry_after(Some((MANUAL_REFRESH_SECONDS - elapsed) as u64)));
            }
        }
        persisted.last_manual_refresh.insert(key.into(), now);
        Ok(())
    })?
}

pub(crate) async fn ensure_access_token(state: &AppState) -> CommandResult<String> {
    let _refresh_guard = state.token_refresh.lock().await;
    let tokens = state
        .credentials
        .get_tokens()?
        .ok_or_else(CommandError::auth_required)?;
    if tokens.expires_at > Utc::now() + Duration::seconds(60) {
        return Ok(tokens.access_token);
    }

    let refresh_token = tokens
        .refresh_token
        .as_deref()
        .ok_or_else(CommandError::auth_required)?;
    let snapshot = state.store.snapshot()?;
    let client_id = snapshot
        .client_id
        .ok_or_else(CommandError::credentials_required)?;
    let client_secret = state
        .credentials
        .get_client_secret()?
        .ok_or_else(CommandError::credentials_required)?;
    let response = match state
        .api
        .refresh_token(&client_id, &client_secret, refresh_token)
        .await
    {
        Ok(response) => response,
        Err(_) => {
            state.credentials.clear_tokens()?;
            state
                .store
                .update(|persisted| persisted.token_expires_at = None)?;
            return Err(CommandError::auth_required());
        }
    };
    let refreshed = TokenSet {
        access_token: response.access_token,
        refresh_token: response.refresh_token.or(tokens.refresh_token),
        expires_at: Utc::now() + Duration::seconds(response.expires_in),
    };
    state.credentials.set_tokens(&refreshed)?;
    state
        .store
        .update(|persisted| persisted.token_expires_at = Some(refreshed.expires_at))?;
    Ok(refreshed.access_token)
}

fn profile_from_cache(record: &CacheRecord, stale: bool) -> CommandResult<Cached<OwnProfile>> {
    Ok(Cached {
        data: serde_json::from_value(record.value.clone())?,
        fetched_at: record.fetched_at,
        stale,
    })
}

async fn attach_avatar(state: &AppState, profile: &mut OwnProfile, force_refresh: bool) {
    profile.avatar_data_url = state
        .avatar_cache
        .load_or_fetch(profile.id, &profile.avatar_url, force_refresh)
        .await
        .unwrap_or(None);
}

fn scores_from_cache(record: &CacheRecord, stale: bool) -> CommandResult<Cached<Vec<Score>>> {
    Ok(Cached {
        data: serde_json::from_value(record.value.clone())?,
        fetched_at: record.fetched_at,
        stale,
    })
}

fn can_use_stale_cache(error: &CommandError) -> bool {
    matches!(
        error.code.as_str(),
        "NETWORK_ERROR" | "SERVER_ERROR" | "RATE_LIMITED"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cached_profile_can_be_marked_stale() {
        let record = CacheRecord {
            value: serde_json::json!({
                "id": 1,
                "username": "cached",
                "avatar_url": "https://example.test/avatar.png",
                "country_code": "CN"
            }),
            fetched_at: Utc::now(),
        };
        let cached = profile_from_cache(&record, true).expect("cache");
        assert!(cached.stale);
        assert_eq!(cached.data.username, "cached");
    }

    #[test]
    fn only_transient_errors_allow_stale_data() {
        assert!(can_use_stale_cache(&CommandError::network("offline")));
        assert!(!can_use_stale_cache(&CommandError::auth_required()));
    }
}
