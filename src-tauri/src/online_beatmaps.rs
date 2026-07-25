use std::{
    collections::{BTreeSet, HashSet},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::{
    commands::ensure_access_token,
    error::{CommandError, CommandResult},
    models::Ruleset,
    state::AppState,
};

const MAX_COLLECT_RESULTS: usize = 500;
const MAX_BATCH_ITEMS: usize = 500;
const GENRE_IDS: &[u8] = &[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14];
const LANGUAGE_IDS: &[u8] = &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OnlineBeatmapSearchQuery {
    pub query: String,
    pub ruleset: Option<Ruleset>,
    pub status: String,
    pub genre: Option<u8>,
    pub language: Option<u8>,
    pub extras: Vec<String>,
    pub include_nsfw: bool,
    pub sort: String,
    pub artist: String,
    pub title: String,
    pub source: String,
    pub mapper: String,
    pub difficulty: String,
    pub tags: String,
    pub ranked_from: String,
    pub ranked_to: String,
    pub submitted_from: String,
    pub submitted_to: String,
    pub updated_from: String,
    pub updated_to: String,
    pub favourites_min: Option<f64>,
    pub favourites_max: Option<f64>,
    pub stars_min: Option<f64>,
    pub stars_max: Option<f64>,
    pub bpm_min: Option<f64>,
    pub bpm_max: Option<f64>,
    pub length_min: Option<f64>,
    pub length_max: Option<f64>,
    pub ar_min: Option<f64>,
    pub ar_max: Option<f64>,
    pub cs_min: Option<f64>,
    pub cs_max: Option<f64>,
    pub od_min: Option<f64>,
    pub od_max: Option<f64>,
    pub hp_min: Option<f64>,
    pub hp_max: Option<f64>,
    pub keys_min: Option<f64>,
    pub keys_max: Option<f64>,
    pub cursor_string: Option<String>,
    #[serde(default)]
    pub content_filter: String,
    #[serde(default)]
    pub grade: String,
    #[serde(default)]
    pub played: String,
}

impl OnlineBeatmapSearchQuery {
    fn to_api_parameters(&self) -> CommandResult<Vec<(String, String)>> {
        validate_date_range("ranked", &self.ranked_from, &self.ranked_to)?;
        validate_date_range("submitted", &self.submitted_from, &self.submitted_to)?;
        validate_date_range("updated", &self.updated_from, &self.updated_to)?;

        let mut filters = Vec::new();
        push_free_text(&mut filters, &self.query);
        push_text_filter(&mut filters, "artist", &self.artist);
        push_text_filter(&mut filters, "title", &self.title);
        push_text_filter(&mut filters, "source", &self.source);
        push_text_filter(&mut filters, "creator", &self.mapper);
        push_text_filter(&mut filters, "difficulty", &self.difficulty);
        for tag in self
            .tags
            .split(',')
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
        {
            push_text_filter(&mut filters, "tag", tag);
        }

        push_date_range(&mut filters, "ranked", &self.ranked_from, &self.ranked_to);
        push_date_range(
            &mut filters,
            "submitted",
            &self.submitted_from,
            &self.submitted_to,
        );
        push_date_range(
            &mut filters,
            "updated",
            &self.updated_from,
            &self.updated_to,
        );

        push_number_range(
            &mut filters,
            "favourites",
            self.favourites_min,
            self.favourites_max,
        )?;
        push_number_range(&mut filters, "stars", self.stars_min, self.stars_max)?;
        push_number_range(&mut filters, "bpm", self.bpm_min, self.bpm_max)?;
        push_number_range(&mut filters, "length", self.length_min, self.length_max)?;
        push_number_range(&mut filters, "ar", self.ar_min, self.ar_max)?;
        push_number_range(&mut filters, "cs", self.cs_min, self.cs_max)?;
        push_number_range(&mut filters, "od", self.od_min, self.od_max)?;
        push_number_range(&mut filters, "hp", self.hp_min, self.hp_max)?;
        push_number_range(&mut filters, "keys", self.keys_min, self.keys_max)?;

        let mut parameters = Vec::new();
        if !filters.is_empty() {
            parameters.push(("q".into(), filters.join(" ")));
        }
        if let Some(ruleset) = self.ruleset {
            parameters.push(("m".into(), ruleset_id(ruleset).to_string()));
        }

        let status = self.status.trim();
        if !status.is_empty() && status != "any" {
            const STATUSES: &[&str] = &[
                "leaderboard",
                "ranked",
                "qualified",
                "loved",
                "favourites",
                "pending",
                "wip",
                "graveyard",
                "mine",
            ];
            if !STATUSES.contains(&status) {
                return Err(CommandError::new("INVALID_FILTER", "未知的谱面状态筛选"));
            }
            parameters.push(("s".into(), status.into()));
        }
        if let Some(genre) = self.genre {
            validate_category("genre", genre, GENRE_IDS)?;
            parameters.push(("g".into(), genre.to_string()));
        }
        if let Some(language) = self.language {
            validate_category("language", language, LANGUAGE_IDS)?;
            parameters.push(("l".into(), language.to_string()));
        }

        if !self.content_filter.trim().is_empty() {
            let allowed = ["recommended", "converts", "follows", "spotlights", "featured_artists"];
            if !allowed.contains(&self.content_filter.trim()) {
                return Err(CommandError::new("INVALID_FILTER", "未知的内容筛选"));
            }
            parameters.push(("c".into(), self.content_filter.trim().into()));
        }
        if !self.grade.trim().is_empty() {
            parameters.push(("r".into(), self.grade.trim().into()));
        }
        if !self.played.trim().is_empty() {
            parameters.push(("played".into(), self.played.trim().into()));
        }

        let mut extras = BTreeSet::new();
        for extra in self.extras.iter().map(|extra| extra.trim()) {
            if extra.is_empty() {
                continue;
            }
            if !matches!(extra, "video" | "storyboard") {
                return Err(CommandError::new("INVALID_FILTER", "未知的附加内容筛选"));
            }
            extras.insert(extra);
        }
        if !extras.is_empty() {
            parameters.push(("e".into(), extras.into_iter().collect::<Vec<_>>().join(".")));
        }
        if self.include_nsfw {
            parameters.push(("nsfw".into(), "true".into()));
        }

        let sort = self.sort.trim();
        if !sort.is_empty() && sort != "relevance_desc" {
            const SORTS: &[&str] = &[
                "relevance_asc",
                "relevance_desc",
                "title_asc",
                "title_desc",
                "artist_asc",
                "artist_desc",
                "difficulty_asc",
                "difficulty_desc",
                "ranked_asc",
                "ranked_desc",
                "rating_asc",
                "rating_desc",
                "plays_asc",
                "plays_desc",
                "favourites_asc",
                "favourites_desc",
            ];
            if !SORTS.contains(&sort) {
                return Err(CommandError::new("INVALID_FILTER", "未知的排序方式"));
            }
            parameters.push(("sort".into(), sort.into()));
        }
        if let Some(cursor) = self
            .cursor_string
            .as_deref()
            .map(str::trim)
            .filter(|cursor| !cursor.is_empty())
        {
            parameters.push(("cursor_string".into(), cursor.into()));
        }
        Ok(parameters)
    }

}

#[derive(Debug, Serialize)]
pub struct CollectedBeatmapsets {
    pub items: Vec<Value>,
    pub available_total: Option<u64>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BeatmapDownloadItem {
    pub beatmapset_id: u64,
    pub artist: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct BeatmapDownloadRequest {
    pub destination: String,
    pub items: Vec<BeatmapDownloadItem>,
    #[serde(default = "default_download_provider")]
    pub provider: String,
    #[serde(default)]
    pub overwrite: bool,
}

fn default_download_provider() -> String {
    "catboy".into()
}

#[derive(Debug, Clone, Serialize)]
pub struct BeatmapDownloadFailure {
    pub beatmapset_id: u64,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct BeatmapDownloadResult {
    pub destination: String,
    pub total: usize,
    pub completed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub failures: Vec<BeatmapDownloadFailure>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BeatmapDownloadProgress {
    pub phase: String,
    pub total: usize,
    pub processed: usize,
    pub completed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub current_beatmapset_id: Option<u64>,
    pub current_title: Option<String>,
    pub message: Option<String>,
}

struct DownloadProgressCounts {
    total: usize,
    processed: usize,
    completed: usize,
    skipped: usize,
    failed: usize,
}

async fn download_with_adapters(
    state: &AppState,
    beatmapset_id: u64,
    provider: &str,
) -> CommandResult<crate::providers::ProviderBytes> {
    let result = match provider {
        "nerinyan" => {
            match state.providers.nerinyan_osz(beatmapset_id).await {
                Ok(download) => Ok(download),
                Err(first) => state.providers.catboy_osz(beatmapset_id).await.map_err(|second| (first, second)),
            }
        }
        "catboy" => {
            match state.providers.catboy_osz(beatmapset_id).await {
                Ok(download) => Ok(download),
                Err(first) => state.providers.nerinyan_osz(beatmapset_id).await.map_err(|second| (first, second)),
            }
        }
        _ => return Err(CommandError::new("DOWNLOAD_ADAPTER_DISABLED", "未启用镜像下载适配器，请先选择 Catboy 或 Nerinyan")),
    };
    result.map_err(|(first, second)| CommandError::new(
        "BEATMAP_DOWNLOAD_FAILED",
        format!("{}: {}; {}: {}", provider, first.message, if provider == "catboy" { "nerinyan" } else { "catboy" }, second.message),
    ))
}

fn normalize_official_response(value: &mut Value) {
    annotate_source(value, "official");
    if let Some(items) = value.get_mut("beatmapsets").and_then(Value::as_array_mut) {
        for item in items {
            annotate_source(item, "official");
        }
    }
}

fn annotate_source(value: &mut Value, source: &str) {
    if let Some(object) = value.as_object_mut() {
        object.insert("opp_source".into(), Value::String(source.into()));
        object.insert("opp_fetched_at".into(), Value::String(chrono::Utc::now().to_rfc3339()));
    }
}

#[tauri::command]
pub async fn search_online_beatmapsets(
    query: OnlineBeatmapSearchQuery,
    state: State<'_, AppState>,
) -> CommandResult<Value> {
    search_with_adapters(&query, &state).await
}

async fn search_with_adapters(query: &OnlineBeatmapSearchQuery, state: &AppState) -> CommandResult<Value> {
    let access_token = ensure_access_token(state).await?;
    let mut value = state.api.search_beatmapsets(&access_token, &query.to_api_parameters()?).await?;
    normalize_official_response(&mut value);
    Ok(value)
}

#[tauri::command]
pub async fn collect_online_beatmapsets(
    mut query: OnlineBeatmapSearchQuery,
    limit: usize,
    state: State<'_, AppState>,
) -> CommandResult<CollectedBeatmapsets> {
    let limit = limit.clamp(1, MAX_COLLECT_RESULTS);
    query.cursor_string = None;
    let mut items = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_cursors = HashSet::new();
    let mut available_total = None;

    loop {
        let response = search_with_adapters(&query, &state).await?;
        available_total = available_total.or_else(|| response.get("total").and_then(Value::as_u64));
        let page_items = response
            .get("beatmapsets")
            .and_then(Value::as_array)
            .ok_or_else(|| CommandError::new("INVALID_DATA", "osu! 搜索响应缺少 beatmapsets"))?;

        for item in page_items {
            let Some(id) = item.get("id").and_then(Value::as_u64) else {
                continue;
            };
            if seen_ids.insert(id) {
                items.push(item.clone());
            }
            if items.len() >= limit {
                break;
            }
        }
        if items.len() >= limit {
            break;
        }

        let Some(cursor) = response
            .get("cursor_string")
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|cursor| !cursor.is_empty())
        else {
            break;
        };
        if !seen_cursors.insert(cursor.clone()) {
            break;
        }
        query.cursor_string = Some(cursor);
        tokio::time::sleep(Duration::from_millis(150)).await;
    }

    let truncated = available_total.is_some_and(|total| items.len() < total as usize);
    Ok(CollectedBeatmapsets {
        items,
        available_total,
        truncated,
    })
}

#[tauri::command]
pub async fn get_online_beatmapset(
    beatmapset_id: u64,
    state: State<'_, AppState>,
) -> CommandResult<Value> {
    let access_token = ensure_access_token(&state).await?;
    let mut value = state.api.get_beatmapset(&access_token, beatmapset_id).await?;
    annotate_source(&mut value, "official");
    Ok(value)
}

#[tauri::command]
pub async fn get_online_beatmap(
    beatmap_id: u64,
    state: State<'_, AppState>,
) -> CommandResult<Value> {
    let mut value = state.providers.nerinyan_beatmap(beatmap_id).await?;
    annotate_source(&mut value, "nerinyan");
    Ok(value)
}

#[tauri::command]
pub async fn get_online_beatmap_provider_status(
    state: State<'_, AppState>,
) -> CommandResult<Vec<crate::providers::ProviderStatus>> {
    Ok(state.providers.statuses().await)
}

#[tauri::command]
pub async fn download_online_beatmapsets(
    app: AppHandle,
    request: BeatmapDownloadRequest,
) -> CommandResult<BeatmapDownloadResult> {
    if request.items.is_empty() {
        return Err(CommandError::new("EMPTY_DOWNLOAD_QUEUE", "下载队列为空"));
    }
    if request.items.len() > MAX_BATCH_ITEMS {
        return Err(CommandError::new(
            "DOWNLOAD_LIMIT_EXCEEDED",
            format!("单次最多下载 {MAX_BATCH_ITEMS} 个谱面集"),
        ));
    }

    let state = app.state::<AppState>();
    let destination = prepare_destination(&request.destination)?;
    let mut unique_ids = HashSet::new();
    let items = request
        .items
        .into_iter()
        .filter(|item| unique_ids.insert(item.beatmapset_id))
        .collect::<Vec<_>>();
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut runtime = state
            .beatmap_download
            .lock()
            .map_err(|_| CommandError::new("STATE_ERROR", "下载队列状态锁已损坏"))?;
        if runtime.is_some() {
            return Err(CommandError::new(
                "DOWNLOAD_ALREADY_RUNNING",
                "已有一个批量下载任务正在运行",
            ));
        }
        *runtime = Some(cancel.clone());
    }

    let total = items.len();
    let mut completed = 0;
    let mut skipped = 0;
    let mut failures = Vec::new();
    emit_progress(
        &app,
        BeatmapDownloadProgress {
            phase: "started".into(),
            total,
            processed: 0,
            completed,
            skipped,
            failed: 0,
            current_beatmapset_id: None,
            current_title: None,
            message: Some(format!("准备下载 {total} 个谱面集")),
        },
    );

    for (index, item) in items.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let processed = index;
        if !request.overwrite
            && find_existing_beatmapset(&destination, item.beatmapset_id).is_some()
        {
            skipped += 1;
            emit_progress(
                &app,
                progress_for_item(
                    "skipped",
                    DownloadProgressCounts {
                        total,
                        processed: processed + 1,
                        completed,
                        skipped,
                        failed: failures.len(),
                    },
                    item,
                    Some("目标目录中已存在该谱面集".into()),
                ),
            );
            continue;
        }

        emit_progress(
            &app,
            progress_for_item(
                "downloading",
                DownloadProgressCounts {
                    total,
                    processed,
                    completed,
                    skipped,
                    failed: failures.len(),
                },
                item,
                None,
            ),
        );

        match download_with_adapters(&state, item.beatmapset_id, &request.provider).await {
            Ok(download) if cancel.load(Ordering::Relaxed) => {
                let _ = download;
                break;
            }
            Ok(download) => {
                let file_name = download_file_name(item, download.suggested_filename.as_deref());
                let target = destination.join(file_name);
                let temporary = destination.join(format!(
                    ".opp-{}-{}.part",
                    item.beatmapset_id,
                    Uuid::new_v4().simple()
                ));
                let write_result = async {
                    tokio::fs::write(&temporary, download.bytes).await?;
                    if request.overwrite && target.exists() {
                        tokio::fs::remove_file(&target).await?;
                    }
                    tokio::fs::rename(&temporary, &target).await
                }
                .await;

                match write_result {
                    Ok(()) => {
                        completed += 1;
                        emit_progress(
                            &app,
                            progress_for_item(
                                "completed",
                                DownloadProgressCounts {
                                    total,
                                    processed: processed + 1,
                                    completed,
                                    skipped,
                                    failed: failures.len(),
                                },
                                item,
                                Some(target.to_string_lossy().into_owned()),
                            ),
                        );
                    }
                    Err(error) => {
                        let _ = tokio::fs::remove_file(&temporary).await;
                        failures.push(BeatmapDownloadFailure {
                            beatmapset_id: item.beatmapset_id,
                            title: item.title.clone(),
                            message: error.to_string(),
                        });
                        emit_progress(
                            &app,
                            progress_for_item(
                                "failed",
                                DownloadProgressCounts {
                                    total,
                                    processed: processed + 1,
                                    completed,
                                    skipped,
                                    failed: failures.len(),
                                },
                                item,
                                Some(error.to_string()),
                            ),
                        );
                    }
                }
            }
            Err(error) => {
                let terminal_error = matches!(error.code.as_str(), "PERMISSION_DENIED");
                failures.push(BeatmapDownloadFailure {
                    beatmapset_id: item.beatmapset_id,
                    title: item.title.clone(),
                    message: error.message.clone(),
                });
                emit_progress(
                    &app,
                    progress_for_item(
                        "failed",
                        DownloadProgressCounts {
                            total,
                            processed: processed + 1,
                            completed,
                            skipped,
                            failed: failures.len(),
                        },
                        item,
                        Some(error.message),
                    ),
                );
                if terminal_error {
                    break;
                }
            }
        }

        if index + 1 < total && !cancel.load(Ordering::Relaxed) {
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }

    let cancelled = cancel.load(Ordering::Relaxed);
    let result = BeatmapDownloadResult {
        destination: destination.to_string_lossy().into_owned(),
        total,
        completed,
        skipped,
        failed: failures.len(),
        cancelled,
        failures,
    };
    emit_progress(
        &app,
        BeatmapDownloadProgress {
            phase: if cancelled { "cancelled" } else { "finished" }.into(),
            total,
            processed: completed + skipped + result.failed,
            completed,
            skipped,
            failed: result.failed,
            current_beatmapset_id: None,
            current_title: None,
            message: Some(if cancelled {
                "下载任务已取消".into()
            } else {
                format!(
                    "下载完成：成功 {}，跳过 {}，失败 {}",
                    completed, skipped, result.failed
                )
            }),
        },
    );

    if let Ok(mut runtime) = state.beatmap_download.lock()
        && runtime
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &cancel))
    {
        *runtime = None;
    }
    Ok(result)
}

#[tauri::command]
pub fn cancel_online_beatmap_download(state: State<'_, AppState>) -> CommandResult<()> {
    let runtime = state
        .beatmap_download
        .lock()
        .map_err(|_| CommandError::new("STATE_ERROR", "下载队列状态锁已损坏"))?;
    let Some(cancel) = runtime.as_ref() else {
        return Err(CommandError::new(
            "DOWNLOAD_NOT_RUNNING",
            "当前没有批量下载任务",
        ));
    };
    cancel.store(true, Ordering::Relaxed);
    Ok(())
}

fn push_free_text(filters: &mut Vec<String>, value: &str) {
    let value = value.trim();
    if !value.is_empty() {
        filters.push(value.into());
    }
}

fn push_text_filter(filters: &mut Vec<String>, field: &str, value: &str) {
    let value = value.trim();
    if !value.is_empty() {
        filters.push(format!("{field}={}", quote_filter_value(value)));
    }
}

fn push_date_range(filters: &mut Vec<String>, field: &str, from: &str, to: &str) {
    if !from.trim().is_empty() {
        filters.push(format!("{field}>={}", from.trim()));
    }
    if !to.trim().is_empty() {
        filters.push(format!("{field}<={}", to.trim()));
    }
}

fn push_number_range(
    filters: &mut Vec<String>,
    field: &str,
    min: Option<f64>,
    max: Option<f64>,
) -> CommandResult<()> {
    if min.is_some_and(|value| !value.is_finite() || value < 0.0)
        || max.is_some_and(|value| !value.is_finite() || value < 0.0)
    {
        return Err(CommandError::new(
            "INVALID_FILTER",
            format!("{field} 的筛选值必须是非负数字"),
        ));
    }
    if let (Some(min), Some(max)) = (min, max)
        && min > max
    {
        return Err(CommandError::new(
            "INVALID_FILTER",
            format!("{field} 的最小值不能大于最大值"),
        ));
    }
    if let Some(min) = min {
        filters.push(format!("{field}>={}", compact_number(min)));
    }
    if let Some(max) = max {
        filters.push(format!("{field}<={}", compact_number(max)));
    }
    Ok(())
}

fn compact_number(value: f64) -> String {
    let value = format!("{value:.4}");
    value.trim_end_matches('0').trim_end_matches('.').into()
}

fn quote_filter_value(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn parse_date(field: &str, value: &str) -> CommandResult<Option<NaiveDate>> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| CommandError::new("INVALID_FILTER", format!("{field} 必须是 YYYY-MM-DD")))
}

fn validate_date_range(field: &str, from: &str, to: &str) -> CommandResult<()> {
    let from = parse_date(&format!("{field}_from"), from)?;
    let to = parse_date(&format!("{field}_to"), to)?;
    if let (Some(from), Some(to)) = (from, to)
        && from > to
    {
        return Err(CommandError::new(
            "INVALID_FILTER",
            format!("{field} 的起始日期不能晚于截止日期"),
        ));
    }
    Ok(())
}

fn validate_category(field: &str, value: u8, allowed: &[u8]) -> CommandResult<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(CommandError::new(
            "INVALID_FILTER",
            format!("未知的 {field} 筛选值"),
        ))
    }
}

fn ruleset_id(ruleset: Ruleset) -> u8 {
    match ruleset {
        Ruleset::Osu => 0,
        Ruleset::Taiko => 1,
        Ruleset::Fruits => 2,
        Ruleset::Mania => 3,
    }
}

fn prepare_destination(value: &str) -> CommandResult<PathBuf> {
    let value = value.trim();
    if value.is_empty() {
        return Err(CommandError::new("INVALID_DESTINATION", "请选择下载目录"));
    }
    let destination = PathBuf::from(value);
    std::fs::create_dir_all(&destination)?;
    let destination = destination.canonicalize()?;
    if !destination.is_dir() {
        return Err(CommandError::new("INVALID_DESTINATION", "下载目标不是目录"));
    }
    Ok(destination)
}

fn find_existing_beatmapset(destination: &Path, beatmapset_id: u64) -> Option<PathBuf> {
    let prefix = format!("{beatmapset_id} ");
    let exact = format!("{beatmapset_id}.osz");
    std::fs::read_dir(destination)
        .ok()?
        .filter_map(Result::ok)
        .find_map(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            ((name == exact || name.starts_with(&prefix))
                && name.to_ascii_lowercase().ends_with(".osz"))
            .then(|| entry.path())
        })
}

fn download_file_name(item: &BeatmapDownloadItem, suggested: Option<&str>) -> String {
    let fallback = format!(
        "{} {} - {}.osz",
        item.beatmapset_id,
        item.artist.trim(),
        item.title.trim()
    );
    let suggested = suggested
        .and_then(|name| Path::new(name).file_name())
        .and_then(|name| name.to_str())
        .filter(|name| name.to_ascii_lowercase().ends_with(".osz"))
        .unwrap_or(&fallback);
    let with_id = if suggested.starts_with(&item.beatmapset_id.to_string()) {
        suggested.to_string()
    } else {
        format!("{} {suggested}", item.beatmapset_id)
    };
    sanitize_filename(&with_id)
}

fn sanitize_filename(value: &str) -> String {
    let mut sanitized = value
        .chars()
        .map(|character| {
            if character.is_control() || r#"<>:"/\|?*"#.contains(character) {
                '_'
            } else {
                character
            }
        })
        .take(180)
        .collect::<String>();
    sanitized = sanitized.trim_matches([' ', '.']).to_string();
    if sanitized.is_empty() {
        sanitized = "beatmapset.osz".into();
    }
    if !sanitized.to_ascii_lowercase().ends_with(".osz") {
        sanitized.push_str(".osz");
    }
    sanitized
}

fn progress_for_item(
    phase: &str,
    counts: DownloadProgressCounts,
    item: &BeatmapDownloadItem,
    message: Option<String>,
) -> BeatmapDownloadProgress {
    BeatmapDownloadProgress {
        phase: phase.into(),
        total: counts.total,
        processed: counts.processed,
        completed: counts.completed,
        skipped: counts.skipped,
        failed: counts.failed,
        current_beatmapset_id: Some(item.beatmapset_id),
        current_title: Some(format!("{} — {}", item.artist, item.title)),
        message,
    }
}

fn emit_progress(app: &AppHandle, progress: BeatmapDownloadProgress) {
    let _ = app.emit("beatmap-download-progress", progress);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query() -> OnlineBeatmapSearchQuery {
        OnlineBeatmapSearchQuery {
            query: "j-pop".into(),
            ruleset: Some(Ruleset::Mania),
            status: "ranked".into(),
            sort: "ranked_desc".into(),
            mapper: "Mapper Name".into(),
            ranked_from: "2025-01-01".into(),
            ranked_to: "2025-12-31".into(),
            stars_min: Some(4.25),
            stars_max: Some(6.5),
            ..Default::default()
        }
    }

    #[test]
    fn builds_official_search_syntax_for_priority_filters() {
        let parameters = query().to_api_parameters().expect("parameters");
        let q = parameters
            .iter()
            .find(|(key, _)| key == "q")
            .map(|(_, value)| value.as_str())
            .expect("q");
        assert!(q.contains("creator=\"Mapper Name\""));
        assert!(q.contains("ranked>=2025-01-01"));
        assert!(q.contains("ranked<=2025-12-31"));
        assert!(q.contains("stars>=4.25"));
        assert!(q.contains("stars<=6.5"));
        assert!(parameters.contains(&("m".into(), "3".into())));
        assert!(parameters.contains(&("s".into(), "ranked".into())));
    }

    #[test]
    fn rejects_inverted_numeric_ranges_and_invalid_dates() {
        let mut invalid_range = query();
        invalid_range.stars_min = Some(7.0);
        invalid_range.stars_max = Some(4.0);
        assert!(invalid_range.to_api_parameters().is_err());

        let mut invalid_date = query();
        invalid_date.ranked_from = "2025/01/01".into();
        assert!(invalid_date.to_api_parameters().is_err());

        let mut inverted_dates = query();
        inverted_dates.ranked_from = "2025-12-31".into();
        inverted_dates.ranked_to = "2025-01-01".into();
        assert!(inverted_dates.to_api_parameters().is_err());
    }

    #[test]
    fn rejects_unknown_api_filter_values() {
        let mut invalid_genre = query();
        invalid_genre.genre = Some(8);
        assert!(invalid_genre.to_api_parameters().is_err());

        let mut invalid_extra = query();
        invalid_extra.extras = vec!["background".into()];
        assert!(invalid_extra.to_api_parameters().is_err());
    }

    #[test]
    fn sanitizes_windows_download_names() {
        let item = BeatmapDownloadItem {
            beatmapset_id: 42,
            artist: "A/B".into(),
            title: "Title: Test?".into(),
        };
        assert_eq!(download_file_name(&item, None), "42 A_B - Title_ Test_.osz");
        assert_eq!(
            download_file_name(&item, Some("../remote.osz")),
            "42 remote.osz"
        );
    }

    #[test]
    fn content_filters_use_official_parameters() {
        let mut query = query();
        query.content_filter = "spotlights".into();
        assert!(query.to_api_parameters().unwrap().contains(&("c".into(), "spotlights".into())));
    }
}
