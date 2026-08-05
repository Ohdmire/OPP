mod models;

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::Duration,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    account::ensure_access_token,
    error::{CommandError, CommandResult},
    local_analysis::LocalClient,
    models::{Ruleset, Score},
    state::AppState,
    tosu::start_managed_tosu,
};

use models::{
    GameClientStatus, GameMediaItem, GameReplayPayload, GameScreenshotPayload, GameSessionSummary,
    GameStatusSnapshot, ReplayMapInfo, UserSnapshot,
};
pub use models::{GameMonitorRuntime, GameSessionRuntime};

fn number(value: &serde_json::Value, key: &str) -> Option<u64> {
    value
        .get(key)
        .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|n| n as u64)))
}

fn decimal(value: &serde_json::Value, key: &str) -> Option<f64> {
    value
        .get(key)
        .and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|n| n as f64)))
}

async fn snapshot(state: &AppState, ruleset: Ruleset) -> CommandResult<UserSnapshot> {
    let token = ensure_access_token(state).await?;
    let profile = state.api.get_own_profile(&token, ruleset).await?;
    let stats = profile
        .statistics
        .as_ref()
        .unwrap_or(&serde_json::Value::Null);
    let scores: Vec<Score> = state
        .api
        .get_best_scores(&token, profile.id, ruleset)
        .await
        .unwrap_or_default();
    Ok(UserSnapshot {
        captured_at: Utc::now(),
        username: profile.username,
        pp: decimal(stats, "pp"),
        global_rank: number(stats, "global_rank"),
        hit_accuracy: decimal(stats, "hit_accuracy"),
        play_count: number(stats, "play_count"),
        play_time: number(stats, "play_time"),
        total_hits: number(stats, "total_hits"),
        maximum_combo: number(stats, "maximum_combo"),
        best_pp: scores.iter().filter_map(|s| s.pp).reduce(f64::max),
        best_count: scores.len(),
    })
}

fn running_executables() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        Command::new("powershell.exe")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-Process -Name 'osu!' -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }",
            ])
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(PathBuf::from)
                .collect())
            .unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        Command::new("pgrep")
            .args(["-a", "-x", "osu!"])
            .output()
            .map(|output| {
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .filter_map(|line| line.split_whitespace().nth(1))
                    .map(PathBuf::from)
                    .collect()
            })
            .unwrap_or_default()
    }
}

fn same_executable(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

fn executable_running(executable: &Path, running: &[PathBuf]) -> bool {
    running.iter().any(|path| same_executable(path, executable))
}

pub(crate) fn executable(client: LocalClient, root: &str) -> Option<PathBuf> {
    let root = Path::new(root);
    let names = if client == LocalClient::Lazer {
        vec![root.join("current").join("osu!.exe"), root.join("osu!.exe")]
    } else {
        vec![
            root.join("osu!.exe"),
            root.join("osu!.app/Contents/MacOS/osu!"),
            root.join("osu!"),
        ]
    };
    names.into_iter().find(|path| path.is_file())
}

fn scan_game_status(
    local_analysis: &crate::local_analysis::LocalAnalysisService,
) -> GameStatusSnapshot {
    let running = running_executables();
    let detected_at = Utc::now();
    let clients = [LocalClient::Stable, LocalClient::Lazer]
        .into_iter()
        .map(|client| {
            let executable = local_analysis
                .source_status(client)
                .ok()
                .and_then(|source| source.install_root)
                .and_then(|root| executable(client, &root));
            GameClientStatus {
                client,
                running: executable
                    .as_deref()
                    .is_some_and(|path| executable_running(path, &running)),
                executable: executable.map(|path| path.display().to_string()),
                detected_at,
            }
        })
        .collect();
    GameStatusSnapshot { clients }
}

fn any_client_started(previous: &GameStatusSnapshot, next: &GameStatusSnapshot) -> bool {
    next.clients.iter().any(|after| {
        after.running
            && !previous
                .clients
                .iter()
                .any(|before| before.client == after.client && before.running)
    })
}

/// Launch the app-lifetime monitor. The event is emitted only when a client
/// changes state; the command always returns the most recent snapshot.
pub fn start_game_monitor(
    local_analysis: Arc<crate::local_analysis::LocalAnalysisService>,
    monitor: Arc<GameMonitorRuntime>,
    app: AppHandle,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            let service = local_analysis.clone();
            let next = tokio::task::spawn_blocking(move || scan_game_status(&service))
                .await
                .unwrap_or_else(|_| GameStatusSnapshot {
                    clients: Vec::new(),
                });
            let (changed, game_started) = monitor
                .current
                .lock()
                .map(|mut current| {
                    let changed = current.clients.len() != next.clients.len()
                        || current
                            .clients
                            .iter()
                            .zip(&next.clients)
                            .any(|(before, after)| {
                                before.client != after.client
                                    || before.running != after.running
                                    || before.executable != after.executable
                            });
                    let game_started = any_client_started(&current, &next);
                    *current = next.clone();
                    (changed, game_started)
                })
                .unwrap_or((false, false));
            if changed {
                if game_started
                    && app
                        .state::<AppState>()
                        .store
                        .snapshot()
                        .map(|saved| saved.settings.launch_tosu_on_game_detect)
                        .unwrap_or(false)
                {
                    let state = app.state::<AppState>();
                    let _ = start_managed_tosu(&state, app.clone());
                }
                let _ = app.emit("game-status-changed", next);
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

#[tauri::command]
pub fn get_game_status(state: State<'_, AppState>) -> CommandResult<GameStatusSnapshot> {
    state
        .game_monitor
        .current
        .lock()
        .map(|current| current.clone())
        .map_err(|_| CommandError::new("GAME_STATUS_LOCKED", "游戏状态不可用"))
}

#[tauri::command]
pub async fn start_game_session(
    ruleset: Ruleset,
    client: LocalClient,
    launch_tosu: Option<bool>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> CommandResult<GameSessionSummary> {
    let source = state.local_analysis.source_status(client)?;
    let root = source.install_root.ok_or_else(|| {
        CommandError::new("GAME_NOT_FOUND", format!("未找到 osu! {client} 安装目录"))
    })?;
    let exe = executable(client, &root)
        .ok_or_else(|| CommandError::new("GAME_NOT_FOUND", "安装目录中未找到 osu! 可执行文件"))?;
    if executable_running(&exe, &running_executables()) {
        return Err(CommandError::new("GAME_ALREADY_RUNNING", "osu! 已经在运行"));
    }
    if launch_tosu.unwrap_or(false) {
        start_managed_tosu(&state, app)?;
    }
    let start = snapshot(&state, ruleset).await?;
    let mut launch = Command::new(&exe);
    launch.current_dir(&root);
    #[cfg(windows)]
    launch.creation_flags(CREATE_NO_WINDOW);
    launch
        .spawn()
        .map_err(|e| CommandError::new("GAME_START_FAILED", format!("无法启动 osu!：{e}")))?;
    let summary = GameSessionSummary {
        started_at: Utc::now(),
        ended_at: None,
        ruleset,
        client: client.to_string(),
        executable: exe.display().to_string(),
        start,
        end: None,
        running: true,
    };
    *state
        .game_session
        .active
        .lock()
        .map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))? =
        Some(summary.clone());
    Ok(summary)
}

/// Starts a comparable session for an osu! process launched outside OPP.
/// The process monitor calls this after a running client is observed, so the
/// normal end-of-session poll can still produce a before/after summary.
#[tauri::command]
pub async fn start_detected_game_session(
    ruleset: Ruleset,
    client: LocalClient,
    state: State<'_, AppState>,
) -> CommandResult<GameSessionSummary> {
    let source = state.local_analysis.source_status(client)?;
    let root = source.install_root.ok_or_else(|| {
        CommandError::new("GAME_NOT_FOUND", format!("未找到 osu! {client} 安装目录"))
    })?;
    let exe = executable(client, &root)
        .ok_or_else(|| CommandError::new("GAME_NOT_FOUND", "安装目录中未找到 osu! 可执行文件"))?;
    if !executable_running(&exe, &running_executables()) {
        return Err(CommandError::new(
            "GAME_NOT_RUNNING",
            "未检测到正在运行的 osu! 客户端",
        ));
    }
    {
        let active = state
            .game_session
            .active
            .lock()
            .map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))?;
        if let Some(summary) = active.as_ref()
            && summary.running
            && same_executable(Path::new(&summary.executable), &exe)
        {
            return Ok(summary.clone());
        }
    }
    let start = snapshot(&state, ruleset).await?;
    let summary = GameSessionSummary {
        started_at: Utc::now(),
        ended_at: None,
        ruleset,
        client: client.to_string(),
        executable: exe.display().to_string(),
        start,
        end: None,
        running: true,
    };
    *state
        .game_session
        .active
        .lock()
        .map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))? =
        Some(summary.clone());
    Ok(summary)
}

#[tauri::command]
pub async fn get_game_session_status(
    state: State<'_, AppState>,
) -> CommandResult<Option<GameSessionSummary>> {
    let current = state
        .game_session
        .active
        .lock()
        .map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))?
        .clone();
    let Some(mut summary) = current else {
        return Ok(None);
    };
    if summary.running
        && !executable_running(Path::new(&summary.executable), &running_executables())
    {
        summary.running = false;
        summary.ended_at = Some(Utc::now());
        summary.end = Some(snapshot(&state, summary.ruleset).await?);
        *state
            .game_session
            .active
            .lock()
            .map_err(|_| CommandError::new("SESSION_LOCKED", "游戏会话状态不可用"))? =
            Some(summary.clone());
    }
    Ok(Some(summary))
}

pub(crate) fn media_roots(state: &AppState, client: LocalClient) -> CommandResult<Vec<PathBuf>> {
    let source = state.local_analysis.source_status(client)?;
    let mut roots = Vec::new();
    let mut add = |path: PathBuf| {
        if let Ok(path) = path.canonicalize()
            && path.is_dir()
            && !roots.iter().any(|item: &PathBuf| item == &path)
        {
            roots.push(path);
        }
    };
    let add_base = |base: PathBuf, add: &mut dyn FnMut(PathBuf)| {
        for name in ["Screenshots", "screenshots", "Replays", "replays"] {
            add(base.join(name));
        }
        let files = base.join("files");
        for name in ["Screenshots", "screenshots", "Replays", "replays"] {
            add(files.join(name));
        }
    };
    for root in source
        .install_root
        .into_iter()
        .chain(source.data_root.into_iter())
    {
        add_base(PathBuf::from(root), &mut add);
    }
    let app_names = if client == LocalClient::Stable {
        vec!["osu!"]
    } else {
        vec!["osu", "osu!"]
    };
    for env_name in ["APPDATA", "LOCALAPPDATA"] {
        if let Some(app_data) = std::env::var_os(env_name) {
            for name in &app_names {
                add_base(PathBuf::from(&app_data).join(name), &mut add);
            }
        }
    }
    Ok(roots)
}

pub(crate) fn within_root(candidate: &Path, root: &Path) -> bool {
    let candidate = candidate.to_string_lossy().to_ascii_lowercase();
    let root = root.to_string_lossy().to_ascii_lowercase();
    candidate == root
        || candidate.starts_with(&(root.clone() + "\\"))
        || candidate.starts_with(&(root + "/"))
}

pub(crate) fn load_game_replay_file(
    client: LocalClient,
    path: &str,
    state: &AppState,
) -> CommandResult<Vec<u8>> {
    let candidate = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| CommandError::new("REPLAY_NOT_FOUND", error.to_string()))?;
    let allowed = media_roots(state, client)?.into_iter().any(|root| {
        within_root(&candidate, &root)
            && candidate
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("osr"))
    });
    if !allowed {
        return Err(CommandError::new(
            "REPLAY_PATH_NOT_ALLOWED",
            "回放文件不在 osu! 的 Replays 目录中",
        ));
    }
    let metadata = fs::metadata(&candidate)
        .map_err(|error| CommandError::new("REPLAY_READ_FAILED", error.to_string()))?;
    if metadata.len() > 32 * 1024 * 1024 {
        return Err(CommandError::new(
            "REPLAY_TOO_LARGE",
            "回放文件超过 32 MB，已拒绝上传",
        ));
    }
    fs::read(&candidate).map_err(|error| CommandError::new("REPLAY_READ_FAILED", error.to_string()))
}

pub(crate) fn parse_replay_metadata(bytes: &[u8]) -> CommandResult<(String, String)> {
    fn read_string(bytes: &[u8], offset: &mut usize) -> CommandResult<String> {
        let marker = *bytes
            .get(*offset)
            .ok_or_else(|| CommandError::new("REPLAY_PARSE_FAILED", "回放文件结构不完整"))?;
        *offset += 1;
        if marker == 0 {
            return Ok(String::new());
        }
        if marker != 0x0b {
            return Err(CommandError::new(
                "REPLAY_PARSE_FAILED",
                "回放文件字符串标记无效",
            ));
        }
        let mut length = 0usize;
        let mut shift = 0;
        loop {
            let byte = *bytes.get(*offset).ok_or_else(|| {
                CommandError::new("REPLAY_PARSE_FAILED", "回放文件长度字段不完整")
            })?;
            *offset += 1;
            length |= usize::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                break;
            }
            shift += 7;
            if shift > usize::BITS - 7 {
                return Err(CommandError::new(
                    "REPLAY_PARSE_FAILED",
                    "回放文件字符串过长",
                ));
            }
        }
        let end = offset
            .checked_add(length)
            .ok_or_else(|| CommandError::new("REPLAY_PARSE_FAILED", "回放文件长度溢出"))?;
        let value = std::str::from_utf8(
            bytes
                .get(*offset..end)
                .ok_or_else(|| CommandError::new("REPLAY_PARSE_FAILED", "回放文件字符串越界"))?,
        )
        .map_err(|_| CommandError::new("REPLAY_PARSE_FAILED", "回放文件字符串编码无效"))?
        .to_string();
        *offset = end;
        Ok(value)
    }
    if bytes.len() < 5 {
        return Err(CommandError::new("REPLAY_PARSE_FAILED", "回放文件过短"));
    }
    let mut offset = 5;
    let beatmap_hash = read_string(bytes, &mut offset)?;
    let username = read_string(bytes, &mut offset)?;
    Ok((beatmap_hash, username))
}

#[tauri::command]
pub fn list_game_media(
    client: LocalClient,
    state: State<'_, AppState>,
) -> CommandResult<Vec<GameMediaItem>> {
    let mut items = Vec::new();
    for root in media_roots(&state, client)? {
        for entry in walkdir::WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let kind = if ext == "osr" {
                "replay"
            } else if ["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) {
                "screenshot"
            } else {
                continue;
            };
            let metadata = entry
                .metadata()
                .map_err(|e| CommandError::new("MEDIA_READ_FAILED", e.to_string()))?;
            items.push(GameMediaItem {
                client,
                path: path.display().to_string(),
                kind: kind.into(),
                modified_at: metadata
                    .modified()
                    .ok()
                    .map(chrono::DateTime::<Utc>::from)
                    .map(|d| d.to_rfc3339()),
                size: metadata.len(),
            });
        }
    }
    items.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    items.truncate(200);
    Ok(items)
}

#[tauri::command]
pub fn read_game_replay(
    client: LocalClient,
    path: String,
    state: State<'_, AppState>,
) -> CommandResult<GameReplayPayload> {
    let candidate = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| CommandError::new("REPLAY_NOT_FOUND", e.to_string()))?;
    let allowed = media_roots(&state, client)?.into_iter().any(|root| {
        within_root(&candidate, &root)
            && candidate
                .extension()
                .and_then(|x| x.to_str())
                .is_some_and(|x| x.eq_ignore_ascii_case("osr"))
    });
    if !allowed {
        return Err(CommandError::new(
            "REPLAY_PATH_NOT_ALLOWED",
            "回放文件不在 osu! 数据目录内",
        ));
    }
    let bytes = load_game_replay_file(client, &path, &state)?;
    Ok(GameReplayPayload {
        path: candidate.display().to_string(),
        file_name: candidate
            .file_name()
            .and_then(|x| x.to_str())
            .unwrap_or("replay.osr")
            .into(),
        bytes_base64: STANDARD.encode(bytes),
        video_ready: false,
        note: "已读取原始 .osr 数据；可在“回放渲染”页面提交给 o!rdr 生成视频。".into(),
    })
}

#[tauri::command]
pub fn inspect_game_replay(
    client: LocalClient,
    path: String,
    state: State<'_, AppState>,
) -> CommandResult<ReplayMapInfo> {
    let bytes = load_game_replay_file(client, &path, &state)?;
    let (beatmap_hash, username) = parse_replay_metadata(&bytes)?;
    let beatmap = state
        .local_analysis
        .find_beatmap_by_md5(client, &beatmap_hash)?;
    Ok(ReplayMapInfo {
        path,
        beatmap_hash: beatmap_hash.clone(),
        username,
        beatmap_id: beatmap.as_ref().and_then(|map| map.beatmap_id),
        beatmap_resource_id: beatmap.as_ref().map(|map| map.resource.resource_id.clone()),
        beatmap_title: beatmap.as_ref().map(|map| {
            format!(
                "{} — {} [{}]",
                map.artist_unicode, map.title_unicode, map.difficulty_name
            )
        }),
        submitted: beatmap.as_ref().and_then(|map| map.beatmap_id).is_some(),
    })
}

#[tauri::command]
pub fn read_game_screenshot(
    client: LocalClient,
    path: String,
    state: State<'_, AppState>,
) -> CommandResult<GameScreenshotPayload> {
    let candidate = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| CommandError::new("SCREENSHOT_NOT_FOUND", e.to_string()))?;
    let ext = candidate
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed_ext = ["png", "jpg", "jpeg", "webp"].contains(&ext.as_str());
    let allowed = media_roots(&state, client)?
        .into_iter()
        .any(|root| within_root(&candidate, &root))
        && allowed_ext;
    if !allowed {
        return Err(CommandError::new(
            "SCREENSHOT_PATH_NOT_ALLOWED",
            "截图文件不在 osu! 数据目录内",
        ));
    }
    let mime_type = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    }
    .into();
    let bytes = fs::read(&candidate)
        .map_err(|e| CommandError::new("SCREENSHOT_READ_FAILED", e.to_string()))?;
    Ok(GameScreenshotPayload {
        path: candidate.display().to_string(),
        file_name: candidate
            .file_name()
            .and_then(|x| x.to_str())
            .unwrap_or("screenshot.png")
            .into(),
        mime_type,
        bytes_base64: STANDARD.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::same_executable;

    #[test]
    fn matches_windows_executables_without_case_sensitivity() {
        assert!(same_executable(
            Path::new("C:/Games/osu!/osu!.exe"),
            Path::new("c:/games/OSU!/OSU!.EXE")
        ));
    }
}

#[tauri::command]
pub fn open_media_in_explorer(
    client: LocalClient,
    path: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let candidate = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| CommandError::new("MEDIA_NOT_FOUND", e.to_string()))?;
    let extension = candidate
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed_extension =
        extension == "osr" || ["png", "jpg", "jpeg", "webp"].contains(&extension.as_str());
    let allowed = candidate.is_file()
        && allowed_extension
        && media_roots(&state, client)?
            .into_iter()
            .any(|root| within_root(&candidate, &root));
    if !allowed {
        return Err(CommandError::new(
            "MEDIA_PATH_NOT_ALLOWED",
            "媒体文件不在 osu! 数据目录内",
        ));
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
        Err(CommandError::new(
            "EXPLORER_UNSUPPORTED",
            "当前平台不支持在资源管理器中定位文件",
        ))
    }
}
