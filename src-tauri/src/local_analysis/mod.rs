pub(crate) mod lazer_realm;
mod models;
pub(crate) mod parser;
mod service;
mod sources;

use std::{path::Path, sync::Arc};

pub use models::{
    BeatmapQuery, LocalBeatmapDetail, LocalBeatmapSetSummary, LocalBeatmapSummary, LocalClient,
    LocalIndexLoadStatus, LocalLibrarySummary, LocalScanProgress, LocalSkinAssetPayload,
    LocalSkinDetail, LocalSkinPreview, LocalSkinSummary, LocalSourceStatus, Page, SkinQuery,
};
pub use service::LocalAnalysisService;
use tauri::{AppHandle, Emitter, State};

use crate::{
    error::{CommandError, CommandResult},
    state::AppState,
};

#[tauri::command(async)]
pub fn get_local_sources(state: State<'_, AppState>) -> CommandResult<Vec<LocalSourceStatus>> {
    state.local_analysis.source_statuses()
}

#[tauri::command(async)]
pub fn get_local_index_status(state: State<'_, AppState>) -> CommandResult<LocalIndexLoadStatus> {
    state.local_analysis.index_load_status()
}

#[tauri::command(async)]
pub fn set_local_source(
    client: LocalClient,
    path: String,
    state: State<'_, AppState>,
) -> CommandResult<LocalSourceStatus> {
    state
        .local_analysis
        .set_source(client, Path::new(path.trim()))
}

#[tauri::command(async)]
pub fn reset_local_source(
    client: LocalClient,
    state: State<'_, AppState>,
) -> CommandResult<LocalSourceStatus> {
    state.local_analysis.reset_source(client)
}

#[tauri::command(async)]
pub fn get_local_summary(
    client: LocalClient,
    state: State<'_, AppState>,
) -> CommandResult<Option<LocalLibrarySummary>> {
    state.local_analysis.summary(client)
}

#[tauri::command]
pub async fn scan_local_source(
    client: LocalClient,
    force: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<LocalLibrarySummary> {
    let service = Arc::clone(&state.local_analysis);
    let emit_event = Arc::new(move |progress: LocalScanProgress| {
        let _ = app.emit("local-scan-progress", progress);
    });
    tokio::task::spawn_blocking(move || service.scan(client, force, emit_event))
        .await
        .map_err(|error| {
            CommandError::new(
                "LOCAL_SCAN_TASK_ERROR",
                format!("本地扫描任务异常结束：{error}"),
            )
        })?
}

#[tauri::command]
pub fn cancel_local_scan(client: LocalClient, state: State<'_, AppState>) -> CommandResult<()> {
    state.local_analysis.cancel_scan(client)
}

#[tauri::command(async)]
pub fn query_local_beatmaps(
    query: BeatmapQuery,
    state: State<'_, AppState>,
) -> CommandResult<Page<LocalBeatmapSummary>> {
    state.local_analysis.query_beatmaps(query)
}

#[tauri::command(async)]
pub fn query_local_beatmap_sets(
    query: BeatmapQuery,
    state: State<'_, AppState>,
) -> CommandResult<Page<LocalBeatmapSetSummary>> {
    state.local_analysis.query_beatmap_sets(query)
}

#[tauri::command(async)]
pub fn get_local_beatmap_detail(
    client: LocalClient,
    resource_id: String,
    state: State<'_, AppState>,
) -> CommandResult<LocalBeatmapDetail> {
    state.local_analysis.beatmap_detail(client, &resource_id)
}

#[tauri::command(async)]
pub fn get_local_beatmap_path(
    client: LocalClient,
    resource_id: String,
    state: State<'_, AppState>,
) -> CommandResult<String> {
    state.local_analysis.beatmap_file_path(client, &resource_id)
}

#[tauri::command]
pub async fn get_local_beatmap_background(
    client: LocalClient,
    resource_id: String,
    state: State<'_, AppState>,
) -> CommandResult<Option<String>> {
    let service = Arc::clone(&state.local_analysis);
    tokio::task::spawn_blocking(move || service.beatmap_background(client, &resource_id))
        .await
        .map_err(|error| {
            CommandError::new(
                "LOCAL_BACKGROUND_TASK_ERROR",
                format!("谱面背景处理任务异常结束：{error}"),
            )
        })?
}

#[tauri::command(async)]
pub fn query_local_skins(
    query: SkinQuery,
    state: State<'_, AppState>,
) -> CommandResult<Page<LocalSkinSummary>> {
    state.local_analysis.query_skins(query)
}

#[tauri::command(async)]
pub fn get_local_skin_detail(
    client: LocalClient,
    resource_id: String,
    state: State<'_, AppState>,
) -> CommandResult<LocalSkinDetail> {
    state.local_analysis.skin_detail(client, &resource_id)
}

#[tauri::command]
pub async fn get_local_skin_preview(
    client: LocalClient,
    resource_id: String,
    state: State<'_, AppState>,
) -> CommandResult<LocalSkinPreview> {
    let service = Arc::clone(&state.local_analysis);
    tokio::task::spawn_blocking(move || service.skin_preview(client, &resource_id))
        .await
        .map_err(|error| {
            CommandError::new(
                "LOCAL_SKIN_PREVIEW_TASK_ERROR",
                format!("Skin 预览索引任务异常结束：{error}"),
            )
        })?
}

#[tauri::command]
pub async fn get_local_skin_asset(
    client: LocalClient,
    skin_resource_id: String,
    asset_resource_id: String,
    state: State<'_, AppState>,
) -> CommandResult<LocalSkinAssetPayload> {
    let service = Arc::clone(&state.local_analysis);
    tokio::task::spawn_blocking(move || {
        service.skin_asset(client, &skin_resource_id, &asset_resource_id)
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "LOCAL_SKIN_ASSET_TASK_ERROR",
            format!("Skin 资源预览任务异常结束：{error}"),
        )
    })?
}

#[tauri::command]
pub async fn replace_local_skin_asset(
    client: LocalClient,
    skin_resource_id: String,
    asset_resource_id: String,
    replacement_path: String,
    save_as_new: bool,
    new_skin_name: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let service = Arc::clone(&state.local_analysis);
    tokio::task::spawn_blocking(move || {
        service.replace_skin_asset(
            client,
            &skin_resource_id,
            &asset_resource_id,
            Path::new(&replacement_path),
            save_as_new,
            new_skin_name.as_deref(),
        )
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "LOCAL_SKIN_REPLACE_TASK_ERROR",
            format!("Skin 资源替换任务异常结束：{error}"),
        )
    })?
}
