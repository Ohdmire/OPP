use std::{fs, path::{Path, PathBuf}, process::Command, sync::Mutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::ensure_access_token,
    error::{CommandError, CommandResult},
    local_analysis::LocalClient,
    models::{Ruleset, Score},
    state::AppState,
};

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
pub struct GameScreenshotPayload {
    pub path: String,
    pub file_name: String,
    pub mime_type: String,
    pub bytes_base64: String,
}

pub struct GameSessionRuntime {
    pub active: Mutex<Option<GameSessionSummary>>,
}

impl Default for GameSessionRuntime {
    fn default() -> Self { Self { active: Mutex::new(None) } }
}

fn number(value: &serde_json::Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|n| n as u64)))
}

fn decimal(value: &serde_json::Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|n| n as f64)))
}

async fn snapshot(state: &AppState, ruleset: Ruleset) -> CommandResult<UserSnapshot> {
    let token = ensure_access_token(state).await?;
    let profile = state.api.get_own_profile(&token, ruleset).await?;
    let stats = profile.statistics.as_ref().unwrap_or(&serde_json::Value::Null);
    let scores: Vec<Score> = state.api.get_best_scores(&token, profile.id, ruleset).await.unwrap_or_default();
    Ok(UserSnapshot {
        captured_at: Utc::now(), username: profile.username,
        pp: decimal(stats, "pp"), global_rank: number(stats, "global_rank"),
        hit_accuracy: decimal(stats, "hit_accuracy"), play_count: number(stats, "play_count"),
        play_time: number(stats, "play_time"), total_hits: number(stats, "total_hits"),
        maximum_combo: number(stats, "maximum_combo"),
        best_pp: scores.iter().filter_map(|s| s.pp).reduce(f64::max), best_count: scores.len(),
    })
}

fn process_running(_client: LocalClient) -> bool {
    #[cfg(windows)]
    { Command::new("tasklist").creation_flags(CREATE_NO_WINDOW).args(["/FI", "IMAGENAME eq osu!.exe", "/NH"]).output().map(|o| String::from_utf8_lossy(&o.stdout).to_ascii_lowercase().contains("osu!.exe")).unwrap_or(false) }
    #[cfg(not(windows))]
    { Command::new("pgrep").args(["-x", "osu!"]).output().map(|o| o.status.success()).unwrap_or(false) }
}

fn executable(root: &str) -> Option<PathBuf> {
    let root = Path::new(root);
    ["osu!.exe", "osu!.app/Contents/MacOS/osu!", "osu!"]
        .iter().map(|name| root.join(name)).find(|path| path.is_file())
}

#[tauri::command]
pub async fn start_game_session(ruleset: Ruleset, client: LocalClient, state: State<'_, AppState>) -> CommandResult<GameSessionSummary> {
    if process_running(client) { return Err(CommandError::new("GAME_ALREADY_RUNNING", "osu! 已经在运行")); }
    let source = state.local_analysis.source_status(client)?;
    let root = source.install_root.ok_or_else(|| CommandError::new("GAME_NOT_FOUND", format!("未找到 osu! {client} 安装目录")))?;
    let exe = executable(&root).ok_or_else(|| CommandError::new("GAME_NOT_FOUND", "安装目录中未找到 osu! 可执行文件"))?;
    let start = snapshot(&state, ruleset).await?;
    let mut launch = Command::new(&exe);
    launch.current_dir(&root);
    #[cfg(windows)]
    launch.creation_flags(CREATE_NO_WINDOW);
    launch.spawn().map_err(|e| CommandError::new("GAME_START_FAILED", format!("无法启动 osu!：{e}")))?;
    let summary = GameSessionSummary { started_at: Utc::now(), ended_at: None, ruleset, client: client.to_string(), executable: exe.display().to_string(), start, end: None, running: true };
    *state.game_session.active.lock().map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))? = Some(summary.clone());
    Ok(summary)
}

#[tauri::command]
pub async fn get_game_session_status(state: State<'_, AppState>) -> CommandResult<Option<GameSessionSummary>> {
    let current = state.game_session.active.lock().map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))?.clone();
    let Some(mut summary) = current else { return Ok(None) };
    let client = if summary.client.eq_ignore_ascii_case("lazer") { LocalClient::Lazer } else { LocalClient::Stable };
    if summary.running && !process_running(client) {
        summary.running = false; summary.ended_at = Some(Utc::now()); summary.end = Some(snapshot(&state, summary.ruleset).await?);
        *state.game_session.active.lock().map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))? = Some(summary.clone());
    }
    Ok(Some(summary))
}

fn media_roots(state: &AppState, client: LocalClient) -> CommandResult<Vec<PathBuf>> {
    let source = state.local_analysis.source_status(client)?;
    let mut roots = Vec::new();
    let mut add = |path: PathBuf| { if let Ok(path) = path.canonicalize() { if path.is_dir() && !roots.iter().any(|item: &PathBuf| item == &path) { roots.push(path); } } };
    let add_base = |base: PathBuf, add: &mut dyn FnMut(PathBuf)| {
        for name in ["Screenshots", "screenshots", "Replays", "replays"] { add(base.join(name)); }
        let files = base.join("files");
        for name in ["Screenshots", "screenshots", "Replays", "replays"] { add(files.join(name)); }
    };
    for root in source.install_root.into_iter().chain(source.data_root.into_iter()) {
        add_base(PathBuf::from(root), &mut add);
    }
    let app_names = if client == LocalClient::Stable { vec!["osu!"] } else { vec!["osu", "osu!"] };
    for env_name in ["APPDATA", "LOCALAPPDATA"] {
        if let Some(app_data) = std::env::var_os(env_name) {
            for name in &app_names { add_base(PathBuf::from(&app_data).join(name), &mut add); }
        }
    }
    Ok(roots)
}

fn within_root(candidate: &Path, root: &Path) -> bool {
    let candidate = candidate.to_string_lossy().to_ascii_lowercase();
    let root = root.to_string_lossy().to_ascii_lowercase();
    candidate == root || candidate.starts_with(&(root.clone() + "\\")) || candidate.starts_with(&(root + "/"))
}

#[tauri::command]
pub fn list_game_media(client: LocalClient, state: State<'_, AppState>) -> CommandResult<Vec<GameMediaItem>> {
    let mut items = Vec::new();
    for root in media_roots(&state, client)? {
        for entry in walkdir::WalkDir::new(root).follow_links(false).into_iter().filter_map(Result::ok).filter(|e| e.file_type().is_file()) {
            let path = entry.path(); let ext = path.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
            let kind = if ext == "osr" { "replay" } else if ["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) { "screenshot" } else { continue };
            let metadata = entry.metadata().map_err(|e| CommandError::new("MEDIA_READ_FAILED", e.to_string()))?;
            items.push(GameMediaItem { client, path: path.display().to_string(), kind: kind.into(), modified_at: metadata.modified().ok().map(chrono::DateTime::<Utc>::from).map(|d| d.to_rfc3339()), size: metadata.len() });
        }
    }
    items.sort_by(|a,b| b.modified_at.cmp(&a.modified_at)); items.truncate(200); Ok(items)
}

#[tauri::command]
pub fn read_game_replay(client: LocalClient, path: String, state: State<'_, AppState>) -> CommandResult<GameReplayPayload> {
    let candidate = PathBuf::from(&path).canonicalize().map_err(|e| CommandError::new("REPLAY_NOT_FOUND", e.to_string()))?;
    let allowed = media_roots(&state, client)?.into_iter().any(|root| within_root(&candidate, &root) && candidate.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("osr")));
    if !allowed { return Err(CommandError::new("REPLAY_PATH_NOT_ALLOWED", "回放文件不在 osu! 数据目录内")); }
    let bytes = fs::read(&candidate).map_err(|e| CommandError::new("REPLAY_READ_FAILED", e.to_string()))?;
    Ok(GameReplayPayload { path: candidate.display().to_string(), file_name: candidate.file_name().and_then(|x| x.to_str()).unwrap_or("replay.osr").into(), bytes_base64: STANDARD.encode(bytes), video_ready: false, note: "已读取原始 .osr 数据；视频生成接口预留中".into() })
}

#[tauri::command]
pub fn read_game_screenshot(client: LocalClient, path: String, state: State<'_, AppState>) -> CommandResult<GameScreenshotPayload> {
    let candidate = PathBuf::from(&path).canonicalize().map_err(|e| CommandError::new("SCREENSHOT_NOT_FOUND", e.to_string()))?;
    let ext = candidate.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
    let allowed_ext = ["png", "jpg", "jpeg", "webp"].contains(&ext.as_str());
    let allowed = media_roots(&state, client)?.into_iter().any(|root| within_root(&candidate, &root)) && allowed_ext;
    if !allowed { return Err(CommandError::new("SCREENSHOT_PATH_NOT_ALLOWED", "截图文件不在 osu! 数据目录内")); }
    let mime_type = match ext.as_str() { "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp", _ => "image/png" }.into();
    let bytes = fs::read(&candidate).map_err(|e| CommandError::new("SCREENSHOT_READ_FAILED", e.to_string()))?;
    Ok(GameScreenshotPayload { path: candidate.display().to_string(), file_name: candidate.file_name().and_then(|x| x.to_str()).unwrap_or("screenshot.png").into(), mime_type, bytes_base64: STANDARD.encode(bytes) })
}

#[tauri::command]
pub fn open_media_in_explorer(client: LocalClient, path: String, state: State<'_, AppState>) -> CommandResult<()> {
    let candidate = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| CommandError::new("MEDIA_NOT_FOUND", e.to_string()))?;
    let extension = candidate.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
    let allowed_extension = extension == "osr" || ["png", "jpg", "jpeg", "webp"].contains(&extension.as_str());
    let allowed = candidate.is_file()
        && allowed_extension
        && media_roots(&state, client)?.into_iter().any(|root| within_root(&candidate, &root));
    if !allowed {
        return Err(CommandError::new("MEDIA_PATH_NOT_ALLOWED", "媒体文件不在 osu! 数据目录内"));
    }

    #[cfg(windows)]
    {
        Command::new("explorer.exe")
            .args(["/select,", &candidate.to_string_lossy()])
            .spawn()
            .map_err(|e| CommandError::new("EXPLORER_OPEN_FAILED", e.to_string()))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = candidate;
        Err(CommandError::new("EXPLORER_UNSUPPORTED", "当前平台不支持在资源管理器中定位文件"))
    }
}
