//! Data contracts returned by the game-session Tauri commands.

use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{local_analysis::LocalClient, models::Ruleset};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSnapshot {
    pub captured_at: DateTime<Utc>,
    pub username: String,
    pub pp: Option<f64>,
    pub global_rank: Option<u64>,
    pub hit_accuracy: Option<f64>,
    pub play_count: Option<u64>,
    pub play_time: Option<u64>,
    pub total_hits: Option<u64>,
    pub maximum_combo: Option<u64>,
    pub best_pp: Option<f64>,
    pub best_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSessionSummary {
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub ruleset: Ruleset,
    pub client: String,
    pub executable: String,
    pub start: UserSnapshot,
    pub end: Option<UserSnapshot>,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameMediaItem {
    pub client: LocalClient,
    pub path: String,
    pub kind: String,
    pub modified_at: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameReplayPayload {
    pub path: String,
    pub file_name: String,
    pub bytes_base64: String,
    pub video_ready: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayMapInfo {
    pub path: String,
    pub beatmap_hash: String,
    pub username: String,
    pub beatmap_id: Option<i32>,
    pub beatmap_resource_id: Option<String>,
    pub beatmap_title: Option<String>,
    pub submitted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameScreenshotPayload {
    pub path: String,
    pub file_name: String,
    pub mime_type: String,
    pub bytes_base64: String,
}

/// In-memory state for the currently launched osu! process.
pub struct GameSessionRuntime {
    pub active: Mutex<Option<GameSessionSummary>>,
}

impl Default for GameSessionRuntime {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}
