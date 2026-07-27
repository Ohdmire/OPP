mod models;
mod service;

use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::{error::CommandResult, models::AppSettings, state::AppState};

pub use models::{TosuLogEntry, TosuStatus};
pub use service::TosuRuntime;

fn settings(state: &AppState) -> CommandResult<AppSettings> {
    Ok(state.store.snapshot()?.settings)
}

async fn api_reachable(base: &str) -> bool {
    let Ok(base) = service::normalize_base_url(base) else {
        return false;
    };
    reqwest::Client::new()
        .get(format!("{base}/json/v2"))
        .send()
        .await
        .is_ok()
}

fn current_status(state: &AppState, settings: &AppSettings, api_reachable: bool) -> TosuStatus {
    let executable_path = settings.tosu_executable_path.clone();
    let owned_by_opp = service::is_owned_running(&state.tosu);
    TosuStatus {
        installed: executable_path.as_ref().is_some_and(|path| {
            service::validate_executable(PathBuf::from(path).as_path()).is_ok()
        }),
        executable_path,
        api_base_url: settings.tosu_api_base_url.clone(),
        api_reachable,
        running: owned_by_opp || service::process_running() || api_reachable,
        owned_by_opp,
        dashboard_url: settings.tosu_api_base_url.clone(),
        last_error: service::last_error(&state.tosu),
        lyrics: models::TosuLyricsStatus {
            installed: settings
                .tosu_lyrics_executable_path
                .as_ref()
                .is_some_and(|path| {
                    service::validate_lyrics_executable(PathBuf::from(path).as_path()).is_ok()
                }),
            executable_path: settings.tosu_lyrics_executable_path.clone(),
            running: service::is_lyrics_owned_running(&state.tosu)
                || service::lyrics_process_running(),
            owned_by_opp: service::is_lyrics_owned_running(&state.tosu),
            proxy_url: "http://127.0.0.1:41280/lyrics/".into(),
        },
    }
}

#[tauri::command]
pub async fn get_tosu_status(
    state: State<'_, AppState>,
    app: AppHandle,
) -> CommandResult<TosuStatus> {
    let settings = settings(&state)?;
    let reachable = api_reachable(&settings.tosu_api_base_url).await;
    if reachable {
        service::ensure_live_connection(
            state.tosu.clone(),
            settings.tosu_api_base_url.clone(),
            app,
        );
    }
    Ok(current_status(&state, &settings, reachable))
}

#[tauri::command]
pub fn get_tosu_logs(state: State<'_, AppState>) -> CommandResult<Vec<TosuLogEntry>> {
    Ok(service::logs(&state.tosu))
}

#[tauri::command]
pub fn set_tosu_executable(path: String, state: State<'_, AppState>) -> CommandResult<TosuStatus> {
    let executable = service::validate_executable(PathBuf::from(path).as_path())?;
    let saved = executable.display().to_string();
    state
        .store
        .update(|persisted| persisted.settings.tosu_executable_path = Some(saved))?;
    let settings = settings(&state)?;
    Ok(current_status(&state, &settings, false))
}

#[tauri::command]
pub fn set_tosu_lyrics_executable(
    path: String,
    state: State<'_, AppState>,
) -> CommandResult<TosuStatus> {
    let executable = service::validate_lyrics_executable(PathBuf::from(path).as_path())?;
    let saved = executable.display().to_string();
    state
        .store
        .update(|persisted| persisted.settings.tosu_lyrics_executable_path = Some(saved))?;
    let settings = settings(&state)?;
    Ok(current_status(&state, &settings, false))
}

#[tauri::command]
pub fn start_tosu(state: State<'_, AppState>, app: AppHandle) -> CommandResult<()> {
    start_managed_tosu(&state, app)
}

pub fn start_managed_tosu(state: &AppState, app: AppHandle) -> CommandResult<()> {
    let settings = settings(state)?;
    service::start(state.tosu.clone(), &settings, app)
}

#[tauri::command]
pub fn stop_tosu(state: State<'_, AppState>, app: AppHandle) -> CommandResult<()> {
    service::stop(&state.tosu, &app)
}
