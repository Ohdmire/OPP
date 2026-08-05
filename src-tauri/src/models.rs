use std::{collections::BTreeMap, fmt};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Ruleset {
    Osu,
    Taiko,
    Fruits,
    Mania,
}

impl Ruleset {
    #[cfg(test)]
    pub const ALL: [Self; 4] = [Self::Osu, Self::Taiko, Self::Fruits, Self::Mania];
}

impl fmt::Display for Ruleset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = match self {
            Self::Osu => "osu",
            Self::Taiko => "taiko",
            Self::Fruits => "fruits",
            Self::Mania => "mania",
        };
        f.write_str(value)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ScoreCategory {
    Best,
    Pinned,
    Recent,
}

impl fmt::Display for ScoreCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Best => "best",
            Self::Pinned => "pinned",
            Self::Recent => "recent",
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnProfile {
    pub id: u64,
    pub username: String,
    pub avatar_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_data_url: Option<String>,
    pub country_code: String,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub is_online: bool,
    #[serde(default)]
    pub is_supporter: bool,
    #[serde(default)]
    pub is_restricted: Option<bool>,
    #[serde(default)]
    pub last_visit: Option<String>,
    #[serde(default)]
    pub playmode: Option<String>,
    #[serde(default)]
    pub statistics: Option<Value>,
    #[serde(default)]
    pub statistics_rulesets: Option<Value>,
    #[serde(default)]
    pub rank_history: Option<Value>,
    #[serde(default)]
    pub monthly_playcounts: Option<Vec<Value>>,
    #[serde(default)]
    pub replays_watched_counts: Option<Vec<Value>>,
    #[serde(default)]
    pub badges: Option<Vec<Value>>,
    #[serde(default)]
    pub groups: Option<Vec<Value>>,
    #[serde(default)]
    pub user_achievements: Option<Vec<Value>>,
    #[serde(default)]
    pub account_history: Option<Vec<Value>>,
    #[serde(default)]
    pub page: Option<Value>,
    #[serde(default)]
    pub cover: Option<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Score {
    #[serde(default)]
    pub id: Option<u64>,
    pub user_id: u64,
    #[serde(default)]
    pub accuracy: f64,
    #[serde(default)]
    pub pp: Option<f64>,
    #[serde(default)]
    pub rank: String,
    #[serde(default)]
    pub total_score: Option<u64>,
    #[serde(default)]
    pub legacy_total_score: Option<u64>,
    #[serde(default)]
    pub max_combo: Option<u64>,
    #[serde(default)]
    pub ended_at: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub has_replay: Option<bool>,
    #[serde(default)]
    pub mods: Vec<Value>,
    #[serde(default)]
    pub statistics: Value,
    #[serde(default)]
    pub maximum_statistics: Option<Value>,
    #[serde(default)]
    pub beatmap: Option<Value>,
    #[serde(default)]
    pub beatmapset: Option<Value>,
    #[serde(default)]
    pub weight: Option<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cached<T> {
    pub data: T,
    pub fetched_at: DateTime<Utc>,
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub reduce_motion: bool,
    #[serde(default)]
    pub similarity_index_directory: Option<String>,
    #[serde(default)]
    pub beatmap_download_directory: Option<String>,
    #[serde(default)]
    pub default_beatmap_download_provider: BeatmapDownloadProvider,
    #[serde(default)]
    pub open_downloaded_beatmaps_after_download: bool,
    #[serde(default)]
    pub replay_export_directory: Option<String>,
    #[serde(default)]
    pub tosu_executable_path: Option<String>,
    #[serde(default = "default_tosu_api_base_url")]
    pub tosu_api_base_url: String,
    #[serde(default)]
    pub launch_tosu_with_game: bool,
    #[serde(default)]
    pub tosu_lyrics_executable_path: Option<String>,
    #[serde(default = "default_launch_tosu_lyrics")]
    pub launch_tosu_lyrics_with_tosu: bool,
    #[serde(default = "default_theme_primary")]
    pub theme_primary: String,
    #[serde(default = "default_theme_secondary")]
    pub theme_secondary: String,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default)]
    pub launch_tosu_on_game_detect: bool,
    #[serde(default = "default_obs_websocket_url")]
    pub obs_websocket_url: String,
    #[serde(default)]
    pub obs_selected_scene: Option<String>,
    #[serde(default)]
    pub launch_tosu_on_obs_detect: bool,
    #[serde(default)]
    pub suppress_tosu_launch_prompt: bool,
    #[serde(default)]
    pub game_session_analysis_on_detect: bool,
    #[serde(default = "default_preview_volume")]
    pub preview_volume: u8,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BeatmapDownloadProvider {
    #[default]
    Hinai,
    Catboy,
    Nerinyan,
}

fn default_tosu_api_base_url() -> String {
    "http://127.0.0.1:24050".into()
}

fn default_launch_tosu_lyrics() -> bool {
    true
}

fn default_theme_primary() -> String {
    "cyan".into()
}

fn default_theme_secondary() -> String {
    "pink".into()
}

fn default_theme_mode() -> String {
    "dark".into()
}

fn default_preview_volume() -> u8 {
    65
}

fn default_obs_websocket_url() -> String {
    "ws://127.0.0.1:4455".into()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            reduce_motion: false,
            similarity_index_directory: None,
            beatmap_download_directory: None,
            default_beatmap_download_provider: BeatmapDownloadProvider::default(),
            open_downloaded_beatmaps_after_download: false,
            replay_export_directory: None,
            tosu_executable_path: None,
            tosu_api_base_url: default_tosu_api_base_url(),
            launch_tosu_with_game: false,
            tosu_lyrics_executable_path: None,
            launch_tosu_lyrics_with_tosu: default_launch_tosu_lyrics(),
            theme_primary: default_theme_primary(),
            theme_secondary: default_theme_secondary(),
            theme_mode: default_theme_mode(),
            launch_tosu_on_game_detect: false,
            obs_websocket_url: default_obs_websocket_url(),
            obs_selected_scene: None,
            launch_tosu_on_obs_detect: false,
            suppress_tosu_launch_prompt: false,
            game_session_analysis_on_detect: false,
            preview_volume: default_preview_volume(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub credentials_configured: bool,
    pub connected: bool,
    pub client_id: Option<String>,
    pub callback_url: String,
    pub user_id: Option<u64>,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingOAuth {
    pub authorization_url: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthResult {
    pub ok: bool,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedCredentials {
    pub client_id: String,
    pub callback_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisconnectResult {
    pub revoked: bool,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheRecord {
    pub value: Value,
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedState {
    pub client_id: Option<String>,
    pub token_expires_at: Option<DateTime<Utc>>,
    pub current_user_id: Option<u64>,
    pub username: Option<String>,
    #[serde(default)]
    pub settings: AppSettings,
    #[serde(default)]
    pub cache: BTreeMap<String, CacheRecord>,
    #[serde(default)]
    pub last_manual_refresh: BTreeMap<String, DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub expires_in: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rulesets_use_api_names() {
        assert_eq!(
            Ruleset::ALL.map(|mode| mode.to_string()),
            ["osu", "taiko", "fruits", "mania"]
        );
    }

    #[test]
    fn profile_keeps_unknown_api_fields() {
        let profile: OwnProfile = serde_json::from_value(serde_json::json!({
            "id": 1,
            "username": "player",
            "avatar_url": "https://example.test/avatar.png",
            "country_code": "CN",
            "new_api_field": {"kept": true}
        }))
        .expect("profile should parse");

        assert_eq!(
            profile.extra.get("new_api_field"),
            Some(&serde_json::json!({"kept": true}))
        );
    }

    #[test]
    fn settings_default_to_hinai_downloads() {
        let settings: AppSettings =
            serde_json::from_value(serde_json::json!({})).expect("settings should parse");

        assert_eq!(
            settings.default_beatmap_download_provider,
            BeatmapDownloadProvider::Hinai
        );
        assert_eq!(
            serde_json::to_value(settings)
                .expect("settings should serialize")
                .get("default_beatmap_download_provider"),
            Some(&serde_json::json!("hinai"))
        );
    }
}
