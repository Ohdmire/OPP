use std::{
    cmp::Ordering,
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, RwLock,
        atomic::{AtomicBool, AtomicUsize, Ordering as AtomicOrdering},
    },
    time::{Duration, Instant, SystemTime},
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use chrono::{DateTime, Utc};
use image::{ImageFormat, ImageReader, Limits, codecs::jpeg::JpegEncoder, imageops::FilterType};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::error::{CommandError, CommandResult};
#[cfg(test)]
use crate::models::Ruleset;

use super::{
    models::{
        BeatmapQuery, BeatmapSort, Completeness, LocalBeatmapDetail, LocalBeatmapSetSummary,
        LocalBeatmapSummary, LocalClient, LocalLibrarySummary, LocalScanProgress,
        LocalSkinAssetPayload, LocalSkinAssetSummary, LocalSkinDetail, LocalSkinPreview,
        LocalSkinSummary, LocalSourceStatus, Page, ScanDiagnostic, SkinAssetKind, SkinQuery,
        SkinSort, SortDirection,
    },
    parser::{
        DIFFICULTY_ALGORITHM, calculate_strains, calculation_version, looks_like_beatmap,
        looks_like_skin_config, parse_beatmap, parse_skin, read_prefix, sha256,
    },
    sources::{ResolvedSource, SourceResolver},
};

const INDEX_SCHEMA: u32 = 5;
const MAX_QUERY_LIMIT: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct FileStamp {
    bytes: u64,
    modified_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum IndexedData {
    Ignored,
    Beatmap {
        summary: LocalBeatmapSummary,
        detail: Box<LocalBeatmapDetail>,
    },
    Skin {
        detail: LocalSkinDetail,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IndexedEntry {
    key: String,
    physical_path: PathBuf,
    stamp: FileStamp,
    content_hash: Option<String>,
    data: IndexedData,
    diagnostics: Vec<ScanDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalIndex {
    schema: u32,
    difficulty_algorithm: String,
    source_root: String,
    summary: LocalLibrarySummary,
    diagnostics: Vec<ScanDiagnostic>,
    entries: Vec<IndexedEntry>,
}

#[derive(Debug, Clone)]
enum CandidateKind {
    Beatmap,
    Skin { root: PathBuf },
    Unknown,
}

#[derive(Debug, Clone)]
struct Candidate {
    key: String,
    physical_path: PathBuf,
    logical_path: String,
    known_hash: Option<String>,
    stamp: FileStamp,
    kind: CandidateKind,
}

#[derive(Debug, Clone)]
struct SkinAssetLocation {
    skin_resource_id: String,
    root: PathBuf,
    summary: LocalSkinAssetSummary,
}

#[derive(Debug)]
struct Discovery {
    candidates: Vec<Candidate>,
    source_file_count: usize,
    source_bytes: u64,
    diagnostics: Vec<ScanDiagnostic>,
}

struct ProgressReporter {
    emit_event: Arc<dyn Fn(LocalScanProgress) + Send + Sync>,
    client: LocalClient,
    last_emit: Mutex<Instant>,
    last_percent: Mutex<f64>,
}

impl ProgressReporter {
    fn new(emit_event: Arc<dyn Fn(LocalScanProgress) + Send + Sync>, client: LocalClient) -> Self {
        Self {
            emit_event,
            client,
            last_emit: Mutex::new(Instant::now() - Duration::from_secs(1)),
            last_percent: Mutex::new(0.0),
        }
    }

    fn emit(&self, phase: &str, processed: usize, total: usize, percent: f64, force: bool) {
        let Ok(mut last_emit) = self.last_emit.lock() else {
            return;
        };
        if !force && last_emit.elapsed() < Duration::from_millis(100) {
            return;
        }
        let Ok(mut last_percent) = self.last_percent.lock() else {
            return;
        };
        let percent = percent.clamp(*last_percent, 100.0);
        *last_percent = percent;
        *last_emit = Instant::now();
        (self.emit_event)(LocalScanProgress {
            client: self.client,
            phase: phase.to_string(),
            processed,
            total,
            percent,
        });
    }
}

pub struct LocalAnalysisService {
    cache_dir: PathBuf,
    sources: SourceResolver,
    indexes: RwLock<BTreeMap<LocalClient, Arc<LocalIndex>>>,
    skin_assets: RwLock<BTreeMap<String, SkinAssetLocation>>,
    scans: Mutex<BTreeMap<LocalClient, Arc<AtomicBool>>>,
    pool: rayon::ThreadPool,
}

impl LocalAnalysisService {
    pub fn new(app_data_dir: &Path) -> CommandResult<Self> {
        let cache_dir = app_data_dir.join("local-analysis");
        fs::create_dir_all(&cache_dir)?;
        fs::create_dir_all(cache_dir.join("thumbnails"))?;
        let sources = SourceResolver::load(&cache_dir)?;
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(4)
            .thread_name(|index| format!("opp-local-analysis-{index}"))
            .build()
            .map_err(|error| {
                CommandError::new(
                    "LOCAL_ANALYSIS_INIT_ERROR",
                    format!("无法初始化本地分析线程池：{error}"),
                )
            })?;
        let mut indexes = BTreeMap::new();
        for client in [LocalClient::Stable, LocalClient::Lazer] {
            if let Some(index) = load_index(&cache_dir, client) {
                indexes.insert(client, Arc::new(index));
            }
        }

        Ok(Self {
            cache_dir,
            sources,
            indexes: RwLock::new(indexes),
            skin_assets: RwLock::new(BTreeMap::new()),
            scans: Mutex::new(BTreeMap::new()),
            pool,
        })
    }

    pub fn source_statuses(&self) -> CommandResult<Vec<LocalSourceStatus>> {
        [LocalClient::Stable, LocalClient::Lazer]
            .into_iter()
            .map(|client| self.source_status(client))
            .collect()
    }

    pub fn source_status(&self, client: LocalClient) -> CommandResult<LocalSourceStatus> {
        let mut resolved = self.sources.resolve(client)?;
        if let Some(index) = self.current_index(client)?
            && source_matches(&resolved, &index.source_root)
        {
            resolved.status.last_scanned_at = Some(index.summary.scanned_at.clone());
        }
        Ok(resolved.status)
    }

    pub fn set_source(
        &self,
        client: LocalClient,
        selected_path: &Path,
    ) -> CommandResult<LocalSourceStatus> {
        let mut resolved = self.sources.set_override(client, selected_path)?;
        if let Some(index) = self.current_index(client)?
            && source_matches(&resolved, &index.source_root)
        {
            resolved.status.last_scanned_at = Some(index.summary.scanned_at.clone());
        }
        Ok(resolved.status)
    }

    pub fn reset_source(&self, client: LocalClient) -> CommandResult<LocalSourceStatus> {
        let mut resolved = self.sources.reset(client)?;
        if let Some(index) = self.current_index(client)?
            && source_matches(&resolved, &index.source_root)
        {
            resolved.status.last_scanned_at = Some(index.summary.scanned_at.clone());
        }
        Ok(resolved.status)
    }

    pub fn summary(&self, client: LocalClient) -> CommandResult<Option<LocalLibrarySummary>> {
        let source = self.sources.resolve(client)?;
        Ok(self
            .current_index(client)?
            .filter(|index| source_matches(&source, &index.source_root))
            .map(|index| index.summary.clone()))
    }

    pub fn cancel_scan(&self, client: LocalClient) -> CommandResult<()> {
        if let Some(cancel) = self
            .scans
            .lock()
            .map_err(|_| CommandError::new("LOCAL_SCAN_STATE_ERROR", "扫描状态已损坏"))?
            .get(&client)
        {
            cancel.store(true, AtomicOrdering::Relaxed);
        }
        Ok(())
    }

    pub fn scan(
        &self,
        client: LocalClient,
        force: bool,
        emit_event: Arc<dyn Fn(LocalScanProgress) + Send + Sync>,
    ) -> CommandResult<LocalLibrarySummary> {
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut scans = self
                .scans
                .lock()
                .map_err(|_| CommandError::new("LOCAL_SCAN_STATE_ERROR", "扫描状态已损坏"))?;
            if scans.contains_key(&client) {
                return Err(CommandError::new(
                    "SCAN_IN_PROGRESS",
                    format!("{client} 已有扫描正在进行"),
                ));
            }
            scans.insert(client, Arc::clone(&cancel));
        }

        let result = self.run_scan(client, force, emit_event, &cancel);
        if let Ok(mut scans) = self.scans.lock() {
            scans.remove(&client);
        }
        result
    }

    fn run_scan(
        &self,
        client: LocalClient,
        force: bool,
        emit_event: Arc<dyn Fn(LocalScanProgress) + Send + Sync>,
        cancel: &AtomicBool,
    ) -> CommandResult<LocalLibrarySummary> {
        let source = self.sources.resolve(client)?;
        if !source.status.valid {
            return Err(CommandError::new(
                "INVALID_LOCAL_SOURCE",
                source.status.validation_errors.join("；"),
            ));
        }
        let source_root = source_root(&source)
            .ok_or_else(|| CommandError::new("INVALID_LOCAL_SOURCE", "本地资源数据根目录不可用"))?;
        let reporter = Arc::new(ProgressReporter::new(emit_event, client));
        reporter.emit("discovery", 0, 0, 0.0, true);

        let discovery = discover(&source, client, cancel, &reporter)?;
        check_cancelled(cancel)?;
        let total = discovery.candidates.len();
        reporter.emit("indexing", 0, total, 5.0, true);

        let previous = if force {
            None
        } else {
            self.current_index(client)?.filter(|index| {
                index.schema == INDEX_SCHEMA
                    && index.difficulty_algorithm == DIFFICULTY_ALGORITHM
                    && index.source_root == source_root
            })
        };
        let previous_entries = previous
            .as_ref()
            .map(|index| {
                index
                    .entries
                    .iter()
                    .map(|entry| (entry.key.clone(), entry.clone()))
                    .collect::<BTreeMap<_, _>>()
            })
            .unwrap_or_default();
        let processed = AtomicUsize::new(0);
        let reporter_for_pool = Arc::clone(&reporter);

        let mut entries = self.pool.install(|| {
            discovery
                .candidates
                .par_iter()
                .map(|candidate| {
                    if cancel.load(AtomicOrdering::Relaxed) {
                        return None;
                    }
                    let entry = previous_entries
                        .get(&candidate.key)
                        .filter(|cached| cached.stamp == candidate.stamp)
                        .cloned()
                        .unwrap_or_else(|| process_candidate(client, candidate));
                    let done = processed.fetch_add(1, AtomicOrdering::Relaxed) + 1;
                    let percent = if total == 0 {
                        90.0
                    } else {
                        5.0 + (done as f64 / total as f64) * 85.0
                    };
                    reporter_for_pool.emit("beatmaps", done, total, percent, false);
                    Some(entry)
                })
                .collect::<Vec<_>>()
        });
        check_cancelled(cancel)?;
        let mut entries = entries.drain(..).flatten().collect::<Vec<_>>();
        entries.sort_by(|left, right| left.key.cmp(&right.key));
        reporter.emit("difficulty", total, total, 94.0, true);
        reporter.emit("skins", total, total, 97.0, true);

        let mut diagnostics = discovery.diagnostics;
        diagnostics.extend(
            entries
                .iter()
                .flat_map(|entry| entry.diagnostics.iter().cloned()),
        );
        let summary = build_summary(
            client,
            &source_root,
            &entries,
            discovery.source_file_count,
            discovery.source_bytes,
            diagnostics.len(),
        );
        let index = LocalIndex {
            schema: INDEX_SCHEMA,
            difficulty_algorithm: DIFFICULTY_ALGORITHM.to_string(),
            source_root,
            summary: summary.clone(),
            diagnostics,
            entries,
        };
        check_cancelled(cancel)?;
        reporter.emit("finalizing", total, total, 99.0, true);
        persist_index(&self.cache_dir, client, &index)?;
        self.indexes
            .write()
            .map_err(|_| CommandError::new("LOCAL_INDEX_STATE_ERROR", "本地索引状态已损坏"))?
            .insert(client, Arc::new(index));
        reporter.emit("finalizing", total, total, 100.0, true);
        Ok(summary)
    }

    pub fn query_beatmaps(&self, query: BeatmapQuery) -> CommandResult<Page<LocalBeatmapSummary>> {
        let index = self.require_current_index(query.client)?;
        let search = query.search.trim().to_lowercase();
        let mut items = index
            .entries
            .iter()
            .filter_map(|entry| match &entry.data {
                IndexedData::Beatmap { summary, detail } => {
                    beatmap_matches(summary, detail, &query, &search).then(|| summary.clone())
                }
                _ => None,
            })
            .collect::<Vec<_>>();
        items.sort_by(|left, right| {
            let ordering = compare_beatmaps(left, right, query.sort);
            apply_direction(ordering, query.direction)
        });
        Ok(page(items, query.offset, query.limit))
    }

    pub fn query_beatmap_sets(
        &self,
        query: BeatmapQuery,
    ) -> CommandResult<Page<LocalBeatmapSetSummary>> {
        let index = self.require_current_index(query.client)?;
        let search = query.search.trim().to_lowercase();
        let mut grouped =
            BTreeMap::<String, Vec<(&LocalBeatmapSummary, &LocalBeatmapDetail)>>::new();
        for entry in &index.entries {
            let IndexedData::Beatmap { summary, detail } = &entry.data else {
                continue;
            };
            if beatmap_matches(summary, detail, &query, &search) {
                grouped
                    .entry(summary.set_key.clone())
                    .or_default()
                    .push((summary, detail));
            }
        }

        let mut sets = grouped
            .into_iter()
            .filter_map(|(set_key, mut maps)| {
                maps.sort_by(|(left, _), (right, _)| {
                    option_f64_order(left.stars, right.stars)
                        .then_with(|| text_order(&left.difficulty_name, &right.difficulty_name))
                });
                let (representative, _) = *maps.first()?;
                let creators = maps
                    .iter()
                    .map(|(summary, _)| summary.creator.clone())
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect::<Vec<_>>();
                let stars = maps
                    .iter()
                    .filter_map(|(summary, _)| summary.stars)
                    .collect::<Vec<_>>();
                let min_stars = stars.iter().copied().min_by(f64::total_cmp);
                let max_stars = stars.iter().copied().max_by(f64::total_cmp);
                let bpm = maps
                    .iter()
                    .map(|(summary, _)| summary.bpm)
                    .max_by(f64::total_cmp)
                    .unwrap_or_default();
                let length_ms = maps
                    .iter()
                    .map(|(summary, _)| summary.length_ms)
                    .max_by(f64::total_cmp)
                    .unwrap_or_default();
                let object_count = maps
                    .iter()
                    .map(|(summary, _)| summary.object_count)
                    .max()
                    .unwrap_or_default();
                let modified_at = maps
                    .iter()
                    .filter_map(|(summary, _)| summary.modified_at.clone())
                    .max();
                let background_resource_id = (query.client == LocalClient::Stable)
                    .then(|| {
                        maps.iter().find_map(|(summary, detail)| {
                            (!detail.background_file.trim().is_empty())
                                .then(|| summary.resource.resource_id.clone())
                        })
                    })
                    .flatten();
                Some(LocalBeatmapSetSummary {
                    set_key,
                    completeness: match query.client {
                        LocalClient::Stable => Completeness::Complete,
                        LocalClient::Lazer => Completeness::Partial,
                    },
                    grouping_inferred: representative.set_grouping_inferred,
                    beatmap_set_id: representative.beatmap_set_id,
                    title: representative.title.clone(),
                    title_unicode: representative.title_unicode.clone(),
                    artist: representative.artist.clone(),
                    artist_unicode: representative.artist_unicode.clone(),
                    creators,
                    min_stars,
                    max_stars,
                    bpm,
                    length_ms,
                    object_count,
                    modified_at,
                    background_resource_id,
                    difficulties: maps
                        .into_iter()
                        .map(|(summary, _)| summary.clone())
                        .collect(),
                })
            })
            .collect::<Vec<_>>();
        sets.sort_by(|left, right| {
            apply_direction(
                compare_beatmap_sets(left, right, query.sort),
                query.direction,
            )
        });
        Ok(page(sets, query.offset, query.limit))
    }

    pub fn beatmap_detail(
        &self,
        client: LocalClient,
        resource_id: &str,
    ) -> CommandResult<LocalBeatmapDetail> {
        let index = self.require_current_index(client)?;
        let entry = index
            .entries
            .iter()
            .find(|entry| {
                matches!(
                    &entry.data,
                    IndexedData::Beatmap { summary, .. }
                        if summary.resource.resource_id == resource_id
                )
            })
            .ok_or_else(|| CommandError::new("LOCAL_RESOURCE_NOT_FOUND", "未找到该谱面资源"))?;
        let mut detail = match &entry.data {
            IndexedData::Beatmap { detail, .. } => detail.as_ref().clone(),
            _ => unreachable!("entry matched beatmap"),
        };
        let bytes = fs::read(&entry.physical_path).map_err(|error| {
            CommandError::new(
                "LOCAL_RESOURCE_READ_ERROR",
                format!("无法读取谱面资源：{error}"),
            )
        })?;
        detail.strains = Some(
            calculate_strains(&bytes)
                .map_err(|message| CommandError::new("LOCAL_DIFFICULTY_ERROR", message))?,
        );
        Ok(detail)
    }

    pub fn beatmap_background(
        &self,
        client: LocalClient,
        resource_id: &str,
    ) -> CommandResult<Option<String>> {
        if client != LocalClient::Stable {
            return Ok(None);
        }
        let index = self.require_current_index(client)?;
        let entry = index
            .entries
            .iter()
            .find(|entry| {
                matches!(
                    &entry.data,
                    IndexedData::Beatmap { summary, .. }
                        if summary.resource.resource_id == resource_id
                )
            })
            .ok_or_else(|| CommandError::new("LOCAL_RESOURCE_NOT_FOUND", "未找到该谱面资源"))?;
        let detail = match &entry.data {
            IndexedData::Beatmap { detail, .. } => detail,
            _ => unreachable!("entry matched beatmap"),
        };
        let background_name = detail.background_file.trim();
        if background_name.is_empty() {
            return Ok(None);
        }
        let Some(beatmap_directory) = entry.physical_path.parent() else {
            return Ok(None);
        };
        let Ok(directory) = beatmap_directory.canonicalize() else {
            return Ok(None);
        };
        let Ok(background) = beatmap_directory.join(background_name).canonicalize() else {
            return Ok(None);
        };
        if !background.starts_with(&directory) {
            return Ok(None);
        }
        let Ok(metadata) = fs::metadata(&background) else {
            return Ok(None);
        };
        if !metadata.is_file() || metadata.len() > 32 * 1024 * 1024 {
            return Ok(None);
        }

        let stamp = stamp(&metadata);
        let cache_key = sha256(
            format!(
                "{}:{}:{}",
                background.to_string_lossy(),
                stamp.bytes,
                stamp.modified_ms
            )
            .as_bytes(),
        );
        let thumbnail_path = self
            .cache_dir
            .join("thumbnails")
            .join(format!("{cache_key}.jpg"));
        let thumbnail = if let Ok(bytes) = fs::read(&thumbnail_path) {
            bytes
        } else {
            let mut reader =
                match ImageReader::open(&background).and_then(ImageReader::with_guessed_format) {
                    Ok(reader) => reader,
                    Err(_) => return Ok(None),
                };
            let mut limits = Limits::default();
            limits.max_image_width = Some(8_192);
            limits.max_image_height = Some(8_192);
            limits.max_alloc = Some(128 * 1024 * 1024);
            reader.limits(limits);
            let Ok(image) = reader.decode() else {
                return Ok(None);
            };
            let thumbnail = image.resize(960, 540, FilterType::Triangle);
            let mut bytes = Vec::new();
            if JpegEncoder::new_with_quality(&mut bytes, 78)
                .encode_image(&thumbnail)
                .is_err()
            {
                return Ok(None);
            }
            let temporary = thumbnail_path.with_extension("jpg.tmp");
            if fs::write(&temporary, &bytes).is_ok() {
                let _ = fs::rename(temporary, &thumbnail_path);
            }
            bytes
        };
        Ok(Some(format!(
            "data:image/jpeg;base64,{}",
            BASE64_STANDARD.encode(thumbnail)
        )))
    }

    pub fn query_skins(&self, query: SkinQuery) -> CommandResult<Page<LocalSkinSummary>> {
        let index = self.require_current_index(query.client)?;
        let search = query.search.trim().to_lowercase();
        let mut items = index
            .entries
            .iter()
            .filter_map(|entry| match &entry.data {
                IndexedData::Skin { detail } => Some(detail.summary.clone()),
                _ => None,
            })
            .filter(|item| {
                search.is_empty()
                    || [&item.name, &item.author, &item.version]
                        .iter()
                        .any(|value| value.to_lowercase().contains(&search))
            })
            .collect::<Vec<_>>();
        items.sort_by(|left, right| {
            let ordering = compare_skins(left, right, query.sort);
            apply_direction(ordering, query.direction)
        });
        Ok(page(items, query.offset, query.limit))
    }

    pub fn skin_detail(
        &self,
        client: LocalClient,
        resource_id: &str,
    ) -> CommandResult<LocalSkinDetail> {
        let index = self.require_current_index(client)?;
        index
            .entries
            .iter()
            .find_map(|entry| match &entry.data {
                IndexedData::Skin { detail }
                    if detail.summary.resource.resource_id == resource_id =>
                {
                    Some(detail.clone())
                }
                _ => None,
            })
            .ok_or_else(|| CommandError::new("LOCAL_RESOURCE_NOT_FOUND", "未找到该 Skin 资源"))
    }

    pub fn skin_preview(
        &self,
        client: LocalClient,
        resource_id: &str,
    ) -> CommandResult<LocalSkinPreview> {
        let index = self.require_current_index(client)?;
        let entry = find_skin_entry(&index, resource_id)?;
        let completeness = match &entry.data {
            IndexedData::Skin { detail } => detail.summary.completeness,
            _ => unreachable!("entry matched skin"),
        };
        if client == LocalClient::Lazer {
            return Ok(LocalSkinPreview {
                skin_resource_id: resource_id.to_string(),
                completeness,
                images: Vec::new(),
                sounds: Vec::new(),
            });
        }
        let root = skin_root(entry)?;
        let assets = self.index_skin_assets(&root, resource_id)?;
        Ok(LocalSkinPreview {
            skin_resource_id: resource_id.to_string(),
            completeness,
            images: assets
                .iter()
                .filter(|asset| asset.kind == SkinAssetKind::Image)
                .cloned()
                .collect(),
            sounds: assets
                .into_iter()
                .filter(|asset| asset.kind == SkinAssetKind::Audio)
                .collect(),
        })
    }

    pub fn skin_asset(
        &self,
        client: LocalClient,
        skin_resource_id: &str,
        asset_resource_id: &str,
    ) -> CommandResult<LocalSkinAssetPayload> {
        if client != LocalClient::Stable {
            return Err(CommandError::new(
                "LOCAL_SKIN_ASSET_UNAVAILABLE",
                "Lazer 未读取 Realm，无法可靠确定该 Skin 的资源归属",
            ));
        }
        let index = self.require_current_index(client)?;
        let entry = find_skin_entry(&index, skin_resource_id)?;
        let root = skin_root(entry)?;
        let cached = self
            .skin_assets
            .read()
            .map_err(|_| CommandError::new("LOCAL_INDEX_STATE_ERROR", "Skin 预览索引状态已损坏"))?
            .get(asset_resource_id)
            .filter(|asset| asset.skin_resource_id == skin_resource_id && asset.root == root)
            .cloned();
        let asset = match cached {
            Some(asset) => asset,
            None => {
                self.index_skin_assets(&root, skin_resource_id)?;
                self.skin_assets
                    .read()
                    .map_err(|_| {
                        CommandError::new("LOCAL_INDEX_STATE_ERROR", "Skin 预览索引状态已损坏")
                    })?
                    .get(asset_resource_id)
                    .filter(|asset| {
                        asset.skin_resource_id == skin_resource_id && asset.root == root
                    })
                    .cloned()
                    .ok_or_else(|| {
                        CommandError::new("LOCAL_RESOURCE_NOT_FOUND", "未找到该 Skin 预览资源")
                    })?
            }
        };
        let asset = asset.summary;
        let path = root.join(Path::new(&asset.logical_path));
        let canonical_root = root.canonicalize().map_err(|error| {
            CommandError::new(
                "LOCAL_RESOURCE_READ_ERROR",
                format!("无法解析 Skin 目录：{error}"),
            )
        })?;
        let canonical_path = path.canonicalize().map_err(|error| {
            CommandError::new(
                "LOCAL_RESOURCE_READ_ERROR",
                format!("无法解析 Skin 资源：{error}"),
            )
        })?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(CommandError::new(
                "LOCAL_RESOURCE_OUTSIDE_ROOT",
                "Skin 资源位于允许目录之外",
            ));
        }

        let (mime_type, bytes) = match asset.kind {
            SkinAssetKind::Image => {
                let metadata = fs::metadata(&canonical_path).map_err(|error| {
                    CommandError::new(
                        "LOCAL_RESOURCE_READ_ERROR",
                        format!("无法读取 Skin 图片信息：{error}"),
                    )
                })?;
                if metadata.len() > 32 * 1024 * 1024 {
                    return Err(CommandError::new(
                        "LOCAL_RESOURCE_TOO_LARGE",
                        "Skin 图片超过 32 MB 预览上限",
                    ));
                }
                let mut reader = ImageReader::open(&canonical_path)
                    .and_then(ImageReader::with_guessed_format)
                    .map_err(|error| {
                        CommandError::new(
                            "LOCAL_IMAGE_DECODE_ERROR",
                            format!("无法识别 Skin 图片：{error}"),
                        )
                    })?;
                let mut limits = Limits::default();
                limits.max_image_width = Some(8_192);
                limits.max_image_height = Some(8_192);
                limits.max_alloc = Some(128 * 1024 * 1024);
                reader.limits(limits);
                let image = reader.decode().map_err(|error| {
                    CommandError::new(
                        "LOCAL_IMAGE_DECODE_ERROR",
                        format!("无法解码 Skin 图片：{error}"),
                    )
                })?;
                let preview = if image.width() > 1_024 || image.height() > 1_024 {
                    image.resize(1_024, 1_024, FilterType::Nearest)
                } else {
                    image
                };
                let mut cursor = Cursor::new(Vec::new());
                preview
                    .write_to(&mut cursor, ImageFormat::Png)
                    .map_err(|error| {
                        CommandError::new(
                            "LOCAL_IMAGE_ENCODE_ERROR",
                            format!("无法生成 Skin 图片预览：{error}"),
                        )
                    })?;
                ("image/png".to_string(), cursor.into_inner())
            }
            SkinAssetKind::Audio => {
                let bytes = fs::read(&canonical_path).map_err(|error| {
                    CommandError::new(
                        "LOCAL_RESOURCE_READ_ERROR",
                        format!("无法读取 Skin 音效：{error}"),
                    )
                })?;
                if bytes.len() > 24 * 1024 * 1024 {
                    return Err(CommandError::new(
                        "LOCAL_RESOURCE_TOO_LARGE",
                        "Skin 音效超过 24 MB 预览上限",
                    ));
                }
                let mime_type = audio_mime(&bytes).ok_or_else(|| {
                    CommandError::new("LOCAL_AUDIO_FORMAT_ERROR", "无法识别 Skin 音效格式")
                })?;
                (mime_type.to_string(), bytes)
            }
        };
        Ok(LocalSkinAssetPayload {
            resource_id: asset.resource_id,
            kind: asset.kind,
            data_url: format!("data:{mime_type};base64,{}", BASE64_STANDARD.encode(bytes)),
            mime_type,
        })
    }

    fn index_skin_assets(
        &self,
        root: &Path,
        skin_resource_id: &str,
    ) -> CommandResult<Vec<LocalSkinAssetSummary>> {
        let assets = enumerate_skin_assets(root, skin_resource_id);
        let mut cache = self
            .skin_assets
            .write()
            .map_err(|_| CommandError::new("LOCAL_INDEX_STATE_ERROR", "Skin 预览索引状态已损坏"))?;
        for asset in &assets {
            cache.insert(
                asset.resource_id.clone(),
                SkinAssetLocation {
                    skin_resource_id: skin_resource_id.to_string(),
                    root: root.to_path_buf(),
                    summary: asset.clone(),
                },
            );
        }
        Ok(assets)
    }

    fn current_index(&self, client: LocalClient) -> CommandResult<Option<Arc<LocalIndex>>> {
        self.indexes
            .read()
            .map(|indexes| indexes.get(&client).cloned())
            .map_err(|_| CommandError::new("LOCAL_INDEX_STATE_ERROR", "本地索引状态已损坏"))
    }

    fn require_current_index(&self, client: LocalClient) -> CommandResult<Arc<LocalIndex>> {
        let source = self.sources.resolve(client)?;
        self.current_index(client)?
            .filter(|index| source_matches(&source, &index.source_root))
            .ok_or_else(|| {
                CommandError::new("LOCAL_SCAN_REQUIRED", format!("请先扫描 {client} 本地资源"))
            })
    }
}

fn find_skin_entry<'a>(
    index: &'a LocalIndex,
    resource_id: &str,
) -> CommandResult<&'a IndexedEntry> {
    index
        .entries
        .iter()
        .find(|entry| {
            matches!(
                &entry.data,
                IndexedData::Skin { detail }
                    if detail.summary.resource.resource_id == resource_id
            )
        })
        .ok_or_else(|| CommandError::new("LOCAL_RESOURCE_NOT_FOUND", "未找到该 Skin 资源"))
}

fn skin_root(entry: &IndexedEntry) -> CommandResult<PathBuf> {
    entry
        .physical_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| CommandError::new("LOCAL_RESOURCE_READ_ERROR", "Skin 目录无效"))
}

fn enumerate_skin_assets(root: &Path, skin_resource_id: &str) -> Vec<LocalSkinAssetSummary> {
    let mut assets = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            let extension = entry
                .path()
                .extension()
                .and_then(|value| value.to_str())?
                .to_ascii_lowercase();
            let kind = match extension.as_str() {
                "bmp" | "gif" | "jpeg" | "jpg" | "png" | "webp" => SkinAssetKind::Image,
                "mp3" | "ogg" | "wav" => SkinAssetKind::Audio,
                _ => return None,
            };
            let logical_path = entry
                .path()
                .strip_prefix(root)
                .ok()?
                .to_string_lossy()
                .replace('\\', "/");
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let category = skin_asset_category(&logical_path, kind).to_string();
            let resource_id = format!(
                "skin-asset:{}",
                sha256(format!("{skin_resource_id}:{}", logical_path.to_lowercase()).as_bytes())
            );
            Some(LocalSkinAssetSummary {
                resource_id,
                kind,
                name,
                logical_path,
                extension,
                size: metadata.len(),
                category,
            })
        })
        .collect::<Vec<_>>();
    assets.sort_by(|left, right| {
        text_order(&left.category, &right.category)
            .then_with(|| text_order(&left.logical_path, &right.logical_path))
    });
    assets
}

fn skin_asset_category(path: &str, kind: SkinAssetKind) -> &'static str {
    let value = path.to_ascii_lowercase();
    if kind == SkinAssetKind::Audio {
        if value.contains("hit") || value.contains("slider") || value.contains("spinner") {
            return "击打音效";
        }
        return "界面音效";
    }
    if value.contains("mania") || value.contains("key") || value.contains("stage") {
        "Mania"
    } else if value.contains("cursor") {
        "光标"
    } else if value.contains("hit")
        || value.contains("approach")
        || value.contains("slider")
        || value.contains("spinner")
    {
        "游戏元素"
    } else if value.contains("rank") || value.contains("score") || value.contains("grade") {
        "成绩界面"
    } else {
        "界面元素"
    }
}

fn audio_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        Some("audio/wav")
    } else if bytes.starts_with(b"OggS") {
        Some("audio/ogg")
    } else if bytes.starts_with(b"ID3")
        || bytes
            .get(..2)
            .is_some_and(|prefix| prefix[0] == 0xff && prefix[1] & 0xe0 == 0xe0)
    {
        Some("audio/mpeg")
    } else {
        None
    }
}

fn discover(
    source: &ResolvedSource,
    client: LocalClient,
    cancel: &AtomicBool,
    reporter: &ProgressReporter,
) -> CommandResult<Discovery> {
    let mut discovery = Discovery {
        candidates: Vec::new(),
        source_file_count: 0,
        source_bytes: 0,
        diagnostics: Vec::new(),
    };

    match client {
        LocalClient::Stable => {
            if let Some(root) = source.beatmap_root.as_deref() {
                discover_stable_tree(root, root, false, cancel, reporter, &mut discovery)?;
            }
            if let Some(root) = source.skin_root.as_deref() {
                discover_stable_tree(root, root, true, cancel, reporter, &mut discovery)?;
            }
        }
        LocalClient::Lazer => {
            let root = source.repository_root.as_deref().ok_or_else(|| {
                CommandError::new("INVALID_LOCAL_SOURCE", "lazer files 仓库不可用")
            })?;
            for entry in WalkDir::new(root).follow_links(false) {
                check_cancelled(cancel)?;
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(error) => {
                        discovery.diagnostics.push(diagnostic(
                            "DISCOVERY_ERROR",
                            error.to_string(),
                            None,
                        ));
                        continue;
                    }
                };
                if !entry.file_type().is_file() {
                    continue;
                }
                let metadata = match entry.metadata() {
                    Ok(metadata) => metadata,
                    Err(error) => {
                        discovery.diagnostics.push(diagnostic(
                            "METADATA_ERROR",
                            error.to_string(),
                            Some(relative_path(root, entry.path())),
                        ));
                        continue;
                    }
                };
                discovery.source_file_count += 1;
                discovery.source_bytes = discovery.source_bytes.saturating_add(metadata.len());
                let logical = relative_path(root, entry.path());
                let known_hash = entry
                    .path()
                    .file_name()
                    .and_then(|value| value.to_str())
                    .filter(|value| {
                        value.len() == 64
                            && value.chars().all(|character| character.is_ascii_hexdigit())
                    })
                    .map(|value| value.to_ascii_lowercase());
                discovery.candidates.push(Candidate {
                    key: format!("lazer:{logical}"),
                    physical_path: entry.path().to_path_buf(),
                    logical_path: logical,
                    known_hash,
                    stamp: stamp(&metadata),
                    kind: CandidateKind::Unknown,
                });
                reporter.emit("discovery", discovery.source_file_count, 0, 2.0, false);
            }
        }
    }

    Ok(discovery)
}

fn discover_stable_tree(
    tree_root: &Path,
    logical_root: &Path,
    skins: bool,
    cancel: &AtomicBool,
    reporter: &ProgressReporter,
    discovery: &mut Discovery,
) -> CommandResult<()> {
    for entry in WalkDir::new(tree_root).follow_links(false) {
        check_cancelled(cancel)?;
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                discovery
                    .diagnostics
                    .push(diagnostic("DISCOVERY_ERROR", error.to_string(), None));
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                discovery.diagnostics.push(diagnostic(
                    "METADATA_ERROR",
                    error.to_string(),
                    Some(relative_path(logical_root, entry.path())),
                ));
                continue;
            }
        };
        discovery.source_file_count += 1;
        discovery.source_bytes = discovery.source_bytes.saturating_add(metadata.len());
        let logical = relative_path(logical_root, entry.path());
        let kind = if skins
            && entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case("skin.ini")
        {
            let root = entry.path().parent().unwrap_or(tree_root).to_path_buf();
            Some(CandidateKind::Skin { root })
        } else if !skins
            && entry
                .path()
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("osu"))
        {
            Some(CandidateKind::Beatmap)
        } else {
            None
        };
        if let Some(kind) = kind {
            let candidate_stamp = match &kind {
                CandidateKind::Skin { root } => directory_stamp(root),
                _ => stamp(&metadata),
            };
            discovery.candidates.push(Candidate {
                key: format!(
                    "stable:{}:{}",
                    if skins { "skin" } else { "beatmap" },
                    entry.path().to_string_lossy().to_lowercase()
                ),
                physical_path: entry.path().to_path_buf(),
                logical_path: format!("{}/{}", if skins { "Skins" } else { "Songs" }, logical),
                known_hash: None,
                stamp: candidate_stamp,
                kind,
            });
        }
        reporter.emit("discovery", discovery.source_file_count, 0, 2.0, false);
    }
    Ok(())
}

fn process_candidate(client: LocalClient, candidate: &Candidate) -> IndexedEntry {
    let mut diagnostics = Vec::new();
    let data = match &candidate.kind {
        CandidateKind::Beatmap => match fs::read(&candidate.physical_path) {
            Ok(bytes) => match parse_beatmap(
                client,
                &bytes,
                &candidate.logical_path,
                modified_iso(&candidate.physical_path),
                candidate.known_hash.as_deref(),
            ) {
                Ok(parsed) => {
                    if let Some(message) = parsed.warning {
                        diagnostics.push(diagnostic(
                            "DIFFICULTY_SKIPPED",
                            message,
                            Some(candidate.logical_path.clone()),
                        ));
                    }
                    IndexedData::Beatmap {
                        summary: parsed.summary,
                        detail: Box::new(parsed.detail),
                    }
                }
                Err(message) => {
                    diagnostics.push(diagnostic(
                        "BEATMAP_PARSE_ERROR",
                        message,
                        Some(candidate.logical_path.clone()),
                    ));
                    IndexedData::Ignored
                }
            },
            Err(error) => {
                diagnostics.push(diagnostic(
                    "RESOURCE_READ_ERROR",
                    error.to_string(),
                    Some(candidate.logical_path.clone()),
                ));
                IndexedData::Ignored
            }
        },
        CandidateKind::Skin { root } => match fs::read(&candidate.physical_path) {
            Ok(bytes) => match parse_skin(
                client,
                &bytes,
                &candidate.logical_path,
                modified_iso(&candidate.physical_path),
                candidate.known_hash.as_deref(),
                Some(root),
            ) {
                Ok(detail) => IndexedData::Skin { detail },
                Err(message) => {
                    diagnostics.push(diagnostic(
                        "SKIN_PARSE_ERROR",
                        message,
                        Some(candidate.logical_path.clone()),
                    ));
                    IndexedData::Ignored
                }
            },
            Err(error) => {
                diagnostics.push(diagnostic(
                    "RESOURCE_READ_ERROR",
                    error.to_string(),
                    Some(candidate.logical_path.clone()),
                ));
                IndexedData::Ignored
            }
        },
        CandidateKind::Unknown => process_unknown(client, candidate, &mut diagnostics),
    };
    let content_hash = match &data {
        IndexedData::Beatmap { summary, .. } => Some(summary.resource.content_hash.clone()),
        IndexedData::Skin { detail } => Some(detail.summary.resource.content_hash.clone()),
        IndexedData::Ignored => candidate.known_hash.clone(),
    };

    IndexedEntry {
        key: candidate.key.clone(),
        physical_path: candidate.physical_path.clone(),
        stamp: candidate.stamp.clone(),
        content_hash,
        data,
        diagnostics,
    }
}

fn process_unknown(
    client: LocalClient,
    candidate: &Candidate,
    diagnostics: &mut Vec<ScanDiagnostic>,
) -> IndexedData {
    let prefix = match read_prefix(&candidate.physical_path, 64 * 1024) {
        Ok(prefix) => prefix,
        Err(message) => {
            diagnostics.push(diagnostic(
                "RESOURCE_READ_ERROR",
                message,
                Some(candidate.logical_path.clone()),
            ));
            return IndexedData::Ignored;
        }
    };
    if !looks_like_beatmap(&prefix) && !looks_like_skin_config(&prefix) {
        return IndexedData::Ignored;
    }
    let bytes = match fs::read(&candidate.physical_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            diagnostics.push(diagnostic(
                "RESOURCE_READ_ERROR",
                error.to_string(),
                Some(candidate.logical_path.clone()),
            ));
            return IndexedData::Ignored;
        }
    };
    if looks_like_beatmap(&prefix) {
        match parse_beatmap(
            client,
            &bytes,
            &candidate.logical_path,
            modified_iso(&candidate.physical_path),
            candidate.known_hash.as_deref(),
        ) {
            Ok(mut parsed) => {
                parsed.summary.resource.logical_path = None;
                parsed.detail.summary.resource.logical_path = None;
                if let Some(message) = parsed.warning {
                    diagnostics.push(diagnostic("DIFFICULTY_SKIPPED", message, None));
                }
                IndexedData::Beatmap {
                    summary: parsed.summary,
                    detail: Box::new(parsed.detail),
                }
            }
            Err(message) => {
                diagnostics.push(diagnostic("BEATMAP_PARSE_ERROR", message, None));
                IndexedData::Ignored
            }
        }
    } else {
        match parse_skin(
            client,
            &bytes,
            &candidate.logical_path,
            modified_iso(&candidate.physical_path),
            candidate.known_hash.as_deref(),
            None,
        ) {
            Ok(mut detail) => {
                detail.summary.resource.logical_path = None;
                IndexedData::Skin { detail }
            }
            Err(message) => {
                diagnostics.push(diagnostic("SKIN_PARSE_ERROR", message, None));
                IndexedData::Ignored
            }
        }
    }
}

fn build_summary(
    client: LocalClient,
    source_root: &str,
    entries: &[IndexedEntry],
    source_file_count: usize,
    source_bytes: u64,
    diagnostic_count: usize,
) -> LocalLibrarySummary {
    let beatmaps = entries.iter().filter_map(|entry| match &entry.data {
        IndexedData::Beatmap { summary, .. } => Some(summary),
        _ => None,
    });
    let mut set_keys = BTreeSet::new();
    let mut beatmap_count = 0usize;
    let mut inferred = false;
    let mut mode_counts = BTreeMap::new();
    for beatmap in beatmaps {
        beatmap_count += 1;
        set_keys.insert(beatmap.set_key.clone());
        inferred |= beatmap.set_grouping_inferred;
        *mode_counts
            .entry(beatmap.ruleset.to_string())
            .or_insert(0usize) += 1;
    }
    let skin_count = entries
        .iter()
        .filter(|entry| matches!(entry.data, IndexedData::Skin { .. }))
        .count();

    LocalLibrarySummary {
        client,
        completeness: match client {
            LocalClient::Stable => Completeness::Complete,
            LocalClient::Lazer => Completeness::Partial,
        },
        source_root: source_root.to_string(),
        scanned_at: Utc::now().to_rfc3339(),
        beatmap_count,
        beatmap_set_count: set_keys.len(),
        beatmap_set_count_inferred: inferred,
        skin_count,
        source_file_count,
        source_bytes,
        diagnostic_count,
        mode_counts,
        calculation: calculation_version(),
    }
}

fn source_root(source: &ResolvedSource) -> Option<String> {
    source.status.data_root.clone()
}

fn source_matches(source: &ResolvedSource, indexed_root: &str) -> bool {
    source.status.valid && source_root(source).as_deref() == Some(indexed_root)
}

fn beatmap_matches(
    summary: &LocalBeatmapSummary,
    detail: &LocalBeatmapDetail,
    query: &BeatmapQuery,
    search: &str,
) -> bool {
    (search.is_empty()
        || [
            &summary.title,
            &summary.title_unicode,
            &summary.artist,
            &summary.artist_unicode,
            &summary.creator,
            &summary.difficulty_name,
            &detail.source,
            &detail.tags,
        ]
        .iter()
        .any(|value| value.to_lowercase().contains(search))
        || summary
            .beatmap_id
            .is_some_and(|id| id.to_string() == search)
        || summary
            .beatmap_set_id
            .is_some_and(|id| id.to_string() == search))
        && (query.rulesets.is_empty() || query.rulesets.contains(&summary.ruleset))
        && query
            .min_stars
            .is_none_or(|minimum| summary.stars.is_some_and(|stars| stars >= minimum))
        && query
            .max_stars
            .is_none_or(|maximum| summary.stars.is_some_and(|stars| stars <= maximum))
        && query.min_bpm.is_none_or(|minimum| summary.bpm >= minimum)
        && query.max_bpm.is_none_or(|maximum| summary.bpm <= maximum)
        && query
            .min_length_ms
            .is_none_or(|minimum| summary.length_ms >= minimum)
        && query
            .max_length_ms
            .is_none_or(|maximum| summary.length_ms <= maximum)
        && query
            .min_objects
            .is_none_or(|minimum| summary.object_count >= minimum)
        && query
            .max_objects
            .is_none_or(|maximum| summary.object_count <= maximum)
        && query.min_ar.is_none_or(|minimum| detail.ar >= minimum)
        && query.max_ar.is_none_or(|maximum| detail.ar <= maximum)
        && query.min_cs.is_none_or(|minimum| detail.cs >= minimum)
        && query.max_cs.is_none_or(|maximum| detail.cs <= maximum)
        && query.min_od.is_none_or(|minimum| detail.od >= minimum)
        && query.max_od.is_none_or(|maximum| detail.od <= maximum)
        && query
            .submitted
            .is_none_or(|submitted| summary.beatmap_set_id.is_some() == submitted)
}

fn compare_beatmaps(
    left: &LocalBeatmapSummary,
    right: &LocalBeatmapSummary,
    sort: BeatmapSort,
) -> Ordering {
    let ordering = match sort {
        BeatmapSort::Title => text_order(&left.title, &right.title),
        BeatmapSort::Artist => text_order(&left.artist, &right.artist),
        BeatmapSort::Creator => text_order(&left.creator, &right.creator),
        BeatmapSort::Stars => option_f64_order(left.stars, right.stars),
        BeatmapSort::Bpm => left.bpm.total_cmp(&right.bpm),
        BeatmapSort::Length => left.length_ms.total_cmp(&right.length_ms),
        BeatmapSort::ObjectCount => left.object_count.cmp(&right.object_count),
        BeatmapSort::ModifiedAt => left.modified_at.cmp(&right.modified_at),
    };
    ordering.then_with(|| left.resource.resource_id.cmp(&right.resource.resource_id))
}

fn compare_beatmap_sets(
    left: &LocalBeatmapSetSummary,
    right: &LocalBeatmapSetSummary,
    sort: BeatmapSort,
) -> Ordering {
    let ordering = match sort {
        BeatmapSort::Title => text_order(&left.title, &right.title),
        BeatmapSort::Artist => text_order(&left.artist, &right.artist),
        BeatmapSort::Creator => text_order(
            left.creators.first().map_or("", String::as_str),
            right.creators.first().map_or("", String::as_str),
        ),
        BeatmapSort::Stars => option_f64_order(left.max_stars, right.max_stars),
        BeatmapSort::Bpm => left.bpm.total_cmp(&right.bpm),
        BeatmapSort::Length => left.length_ms.total_cmp(&right.length_ms),
        BeatmapSort::ObjectCount => left.object_count.cmp(&right.object_count),
        BeatmapSort::ModifiedAt => left.modified_at.cmp(&right.modified_at),
    };
    ordering.then_with(|| left.set_key.cmp(&right.set_key))
}

fn compare_skins(left: &LocalSkinSummary, right: &LocalSkinSummary, sort: SkinSort) -> Ordering {
    let ordering = match sort {
        SkinSort::Name => text_order(&left.name, &right.name),
        SkinSort::Author => text_order(&left.author, &right.author),
        SkinSort::Size => left.total_bytes.cmp(&right.total_bytes),
        SkinSort::ModifiedAt => left.modified_at.cmp(&right.modified_at),
    };
    ordering.then_with(|| left.resource.resource_id.cmp(&right.resource.resource_id))
}

fn text_order(left: &str, right: &str) -> Ordering {
    left.to_lowercase().cmp(&right.to_lowercase())
}

fn option_f64_order(left: Option<f64>, right: Option<f64>) -> Ordering {
    match (left, right) {
        (Some(left), Some(right)) => left.total_cmp(&right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

fn apply_direction(ordering: Ordering, direction: SortDirection) -> Ordering {
    match direction {
        SortDirection::Asc => ordering,
        SortDirection::Desc => ordering.reverse(),
    }
}

fn page<T>(items: Vec<T>, offset: usize, requested_limit: usize) -> Page<T> {
    let total = items.len();
    let limit = requested_limit.clamp(1, MAX_QUERY_LIMIT);
    let items = items.into_iter().skip(offset).take(limit).collect();
    Page {
        items,
        total,
        offset,
        limit,
    }
}

fn stamp(metadata: &fs::Metadata) -> FileStamp {
    FileStamp {
        bytes: metadata.len(),
        modified_ms: metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_millis()),
    }
}

fn directory_stamp(root: &Path) -> FileStamp {
    let mut bytes = 0u64;
    let mut modified_ms = 0u128;
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if let Ok(metadata) = entry.metadata() {
            let current = stamp(&metadata);
            bytes = bytes.saturating_add(current.bytes);
            modified_ms = modified_ms.max(current.modified_ms);
        }
    }
    FileStamp { bytes, modified_ms }
}

fn modified_iso(path: &Path) -> Option<String> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(modified).to_rfc3339())
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn diagnostic(
    code: impl Into<String>,
    message: impl Into<String>,
    logical_path: Option<String>,
) -> ScanDiagnostic {
    ScanDiagnostic {
        code: code.into(),
        message: message.into(),
        logical_path,
        resource_id: None,
    }
}

fn check_cancelled(cancel: &AtomicBool) -> CommandResult<()> {
    if cancel.load(AtomicOrdering::Relaxed) {
        Err(CommandError::new("SCAN_CANCELLED", "本地资源扫描已取消"))
    } else {
        Ok(())
    }
}

fn index_path(cache_dir: &Path, client: LocalClient) -> PathBuf {
    cache_dir.join(format!("{client}-index.json"))
}

fn load_index(cache_dir: &Path, client: LocalClient) -> Option<LocalIndex> {
    let target = index_path(cache_dir, client);
    let backup = cache_dir.join(format!("{client}-index.json.bak"));
    [target, backup].into_iter().find_map(|path| {
        let bytes = fs::read(path).ok()?;
        let index: LocalIndex = serde_json::from_slice(&bytes).ok()?;
        (index.schema == INDEX_SCHEMA && index.difficulty_algorithm == DIFFICULTY_ALGORITHM)
            .then_some(index)
    })
}

fn persist_index(cache_dir: &Path, client: LocalClient, index: &LocalIndex) -> CommandResult<()> {
    let target = index_path(cache_dir, client);
    let temporary = cache_dir.join(format!("{client}-index.json.tmp"));
    let bytes = serde_json::to_vec(index)?;
    fs::write(&temporary, bytes)?;
    if target.exists() {
        let backup = cache_dir.join(format!("{client}-index.json.bak"));
        if backup.exists() {
            fs::remove_file(&backup)?;
        }
        fs::rename(&target, &backup)?;
        match fs::rename(&temporary, &target) {
            Ok(()) => {
                let _ = fs::remove_file(backup);
            }
            Err(error) => {
                let _ = fs::rename(backup, target);
                return Err(error.into());
            }
        }
    } else {
        fs::rename(temporary, target)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const OSU_FIXTURE: &str = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 0

[Metadata]
Title:Fixture
TitleUnicode:测试谱面
Artist:Artist
ArtistUnicode:艺术家
Creator:Mapper
Version:Normal
BeatmapID:-1
BeatmapSetID:-1

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:6
ApproachRate:7
SliderMultiplier:1.4
SliderTickRate:1

[Events]
0,0,"bg.jpg",0,0
2,1200,1400

[TimingPoints]
0,500,4,2,0,100,1,0

[HitObjects]
256,192,1000,1,0,0:0:0:0:
256,192,1500,1,0,0:0:0:0:
256,192,2000,8,0,2500
"#;

    fn beatmap(resource_id: &str, title: &str, stars: f64) -> LocalBeatmapSummary {
        LocalBeatmapSummary {
            resource: super::super::models::LocalResourceRef {
                resource_id: resource_id.into(),
                client: LocalClient::Stable,
                content_hash: "hash".into(),
                logical_path: None,
            },
            set_key: "set".into(),
            set_grouping_inferred: false,
            beatmap_id: None,
            beatmap_set_id: None,
            title: title.into(),
            title_unicode: title.into(),
            artist: "artist".into(),
            artist_unicode: "artist".into(),
            creator: "creator".into(),
            difficulty_name: "diff".into(),
            ruleset: Ruleset::Osu,
            format_version: 14,
            stars: Some(stars),
            max_pp: Some(100.0),
            max_combo: Some(1),
            bpm: 180.0,
            length_ms: 1_000.0,
            object_count: 1,
            cs: 4.0,
            ar: 8.0,
            od: 7.0,
            hp: 5.0,
            average_nps: 1.0,
            peak_nps: 1.0,
            modified_at: None,
            analysis_status: "ready".into(),
        }
    }

    #[test]
    fn pagination_caps_page_size() {
        let result = page((0..600).collect::<Vec<_>>(), 10, 1_000);
        assert_eq!(result.total, 600);
        assert_eq!(result.limit, 500);
        assert_eq!(result.items.len(), 500);
    }

    #[test]
    fn difficulty_sort_places_missing_values_last() {
        assert_eq!(option_f64_order(Some(2.0), None), Ordering::Less);
        assert_eq!(
            compare_beatmaps(
                &beatmap("a", "z", 2.0),
                &beatmap("b", "a", 3.0),
                BeatmapSort::Stars
            ),
            Ordering::Less
        );
    }

    #[test]
    fn corrupted_cache_is_ignored() {
        let directory = tempfile::tempdir().expect("cache");
        fs::write(
            index_path(directory.path(), LocalClient::Stable),
            "not json",
        )
        .expect("write");
        assert!(load_index(directory.path(), LocalClient::Stable).is_none());
    }

    fn empty_index(algorithm: &str) -> LocalIndex {
        LocalIndex {
            schema: INDEX_SCHEMA,
            difficulty_algorithm: algorithm.into(),
            source_root: "fixture".into(),
            summary: LocalLibrarySummary {
                client: LocalClient::Stable,
                completeness: Completeness::Complete,
                source_root: "fixture".into(),
                scanned_at: Utc::now().to_rfc3339(),
                beatmap_count: 0,
                beatmap_set_count: 0,
                beatmap_set_count_inferred: false,
                skin_count: 0,
                source_file_count: 0,
                source_bytes: 0,
                diagnostic_count: 0,
                mode_counts: BTreeMap::new(),
                calculation: calculation_version(),
            },
            diagnostics: Vec::new(),
            entries: Vec::new(),
        }
    }

    #[test]
    fn cache_recovers_from_backup_and_invalidates_algorithm_changes() {
        let directory = tempfile::tempdir().expect("cache");
        fs::write(
            index_path(directory.path(), LocalClient::Stable),
            "corrupted",
        )
        .expect("primary");
        fs::write(
            directory.path().join("stable-index.json.bak"),
            serde_json::to_vec(&empty_index(DIFFICULTY_ALGORITHM)).expect("json"),
        )
        .expect("backup");
        assert!(load_index(directory.path(), LocalClient::Stable).is_some());

        fs::write(
            directory.path().join("stable-index.json.bak"),
            serde_json::to_vec(&empty_index("old algorithm")).expect("json"),
        )
        .expect("old backup");
        assert!(load_index(directory.path(), LocalClient::Stable).is_none());
    }

    fn fixture_service() -> (
        tempfile::TempDir,
        tempfile::TempDir,
        LocalAnalysisService,
        PathBuf,
    ) {
        let app_data = tempfile::tempdir().expect("app data");
        let stable = tempfile::tempdir().expect("stable");
        fs::write(stable.path().join("osu!.exe"), []).expect("exe");
        fs::write(
            stable.path().join("osu!.fixture.cfg"),
            "BeatmapDirectory = Songs\nLastVersion = 20260725",
        )
        .expect("config");
        let set = stable.path().join("Songs").join("1 Fixture");
        fs::create_dir_all(&set).expect("songs");
        let beatmap = set.join("fixture.osu");
        fs::write(&beatmap, OSU_FIXTURE).expect("beatmap");
        image::RgbImage::from_pixel(8, 8, image::Rgb([24, 48, 72]))
            .save(set.join("bg.jpg"))
            .expect("background");
        let skin = stable.path().join("Skins").join("Fixture");
        fs::create_dir_all(&skin).expect("skin");
        fs::write(
            skin.join("skin.ini"),
            "[General]\nName: Fixture\nAuthor: OPP\nVersion: 2.7\n[Colours]\nCombo1: 255,120,180\n",
        )
        .expect("skin config");
        image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 255, 255, 128]))
            .save(skin.join("cursor.png"))
            .expect("skin image");
        fs::write(
            skin.join("normal-hitnormal.wav"),
            b"RIFF\x04\x00\x00\x00WAVE",
        )
        .expect("skin sound");

        let service = LocalAnalysisService::new(app_data.path()).expect("service");
        service
            .set_source(LocalClient::Stable, stable.path())
            .expect("source");
        (app_data, stable, service, beatmap)
    }

    #[test]
    fn stable_fixture_scans_queries_and_inventories_resources() {
        let (_app_data, _stable, service, _beatmap) = fixture_service();
        let cancel = AtomicBool::new(false);
        let summary = service
            .run_scan(LocalClient::Stable, false, Arc::new(|_| {}), &cancel)
            .expect("scan");
        assert_eq!(summary.beatmap_count, 1);
        assert_eq!(summary.beatmap_set_count, 1);
        assert_eq!(summary.skin_count, 1);

        let maps = service
            .query_beatmaps(BeatmapQuery::default())
            .expect("beatmaps");
        assert_eq!(maps.total, 1);
        assert_eq!(maps.items[0].title_unicode, "测试谱面");
        assert_eq!(maps.items[0].ruleset, Ruleset::Osu);
        let background = service
            .beatmap_background(LocalClient::Stable, &maps.items[0].resource.resource_id)
            .expect("background")
            .expect("background data");
        assert!(background.starts_with("data:image/jpeg;base64,"));

        let skins = service.query_skins(SkinQuery::default()).expect("skins");
        assert_eq!(skins.total, 1);
        let detail = service
            .skin_detail(LocalClient::Stable, &skins.items[0].resource.resource_id)
            .expect("skin detail");
        assert_eq!(detail.summary.accent_colors, vec![vec![255, 120, 180]]);
        assert_eq!(detail.inventory.expect("inventory").file_count, 3);
        let preview = service
            .skin_preview(LocalClient::Stable, &skins.items[0].resource.resource_id)
            .expect("skin preview");
        assert_eq!(preview.images.len(), 1);
        assert_eq!(preview.sounds.len(), 1);
        let image = service
            .skin_asset(
                LocalClient::Stable,
                &skins.items[0].resource.resource_id,
                &preview.images[0].resource_id,
            )
            .expect("skin image payload");
        assert!(image.data_url.starts_with("data:image/png;base64,"));
        let audio = service
            .skin_asset(
                LocalClient::Stable,
                &skins.items[0].resource.resource_id,
                &preview.sounds[0].resource_id,
            )
            .expect("skin audio payload");
        assert!(audio.data_url.starts_with("data:audio/wav;base64,"));
    }

    #[test]
    fn groups_difficulties_and_applies_structural_filters() {
        let (_app_data, _stable, service, beatmap) = fixture_service();
        fs::write(
            beatmap.with_file_name("hard.osu"),
            OSU_FIXTURE
                .replace("Version:Normal", "Version:Hard")
                .replace("ApproachRate:7", "ApproachRate:9"),
        )
        .expect("hard");
        let cancel = AtomicBool::new(false);
        service
            .run_scan(LocalClient::Stable, false, Arc::new(|_| {}), &cancel)
            .expect("scan");

        let sets = service
            .query_beatmap_sets(BeatmapQuery::default())
            .expect("sets");
        assert_eq!(sets.total, 1);
        assert_eq!(sets.items[0].difficulties.len(), 2);

        let filtered = service
            .query_beatmap_sets(BeatmapQuery {
                min_ar: Some(8.0),
                ..BeatmapQuery::default()
            })
            .expect("filtered sets");
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.items[0].difficulties.len(), 1);
        assert_eq!(filtered.items[0].difficulties[0].difficulty_name, "Hard");
    }

    #[test]
    fn incremental_scan_tracks_additions_and_deletions() {
        let (_app_data, _stable, service, beatmap) = fixture_service();
        let cancel = AtomicBool::new(false);
        service
            .run_scan(LocalClient::Stable, false, Arc::new(|_| {}), &cancel)
            .expect("first scan");

        let added = beatmap.with_file_name("added.osu");
        fs::write(
            &added,
            OSU_FIXTURE.replace("Version:Normal", "Version:Hard"),
        )
        .expect("add beatmap");
        let summary = service
            .run_scan(LocalClient::Stable, false, Arc::new(|_| {}), &cancel)
            .expect("incremental add");
        assert_eq!(summary.beatmap_count, 2);

        fs::remove_file(beatmap).expect("remove beatmap");
        let summary = service
            .run_scan(LocalClient::Stable, false, Arc::new(|_| {}), &cancel)
            .expect("incremental delete");
        assert_eq!(summary.beatmap_count, 1);
    }

    #[test]
    fn cancelled_scan_does_not_create_an_index() {
        let (_app_data, _stable, service, _beatmap) = fixture_service();
        let cancel = AtomicBool::new(true);
        let error = service
            .run_scan(LocalClient::Stable, false, Arc::new(|_| {}), &cancel)
            .expect_err("cancelled");
        assert_eq!(error.code, "SCAN_CANCELLED");
        assert!(
            service
                .summary(LocalClient::Stable)
                .expect("summary")
                .is_none()
        );
    }

    #[test]
    #[ignore = "requires explicit OPP_TEST_STABLE_ROOT / OPP_TEST_LAZER_ROOT"]
    fn scans_opt_in_machine_acceptance_sources() {
        let app_data = tempfile::tempdir().expect("app data");
        let service = LocalAnalysisService::new(app_data.path()).expect("service");
        let cancel = AtomicBool::new(false);
        let mut scanned = 0usize;

        for (variable, client) in [
            ("OPP_TEST_STABLE_ROOT", LocalClient::Stable),
            ("OPP_TEST_LAZER_ROOT", LocalClient::Lazer),
        ] {
            let Ok(path) = std::env::var(variable) else {
                continue;
            };
            service
                .set_source(client, Path::new(&path))
                .expect("acceptance source");
            let summary = service
                .run_scan(client, true, Arc::new(|_| {}), &cancel)
                .expect("acceptance scan");
            println!(
                "{}",
                serde_json::to_string_pretty(&summary).expect("summary json")
            );
            assert!(summary.beatmap_count > 0);
            if client == LocalClient::Stable {
                let skins = service
                    .query_skins(SkinQuery {
                        limit: 500,
                        ..SkinQuery::default()
                    })
                    .expect("acceptance skins");
                let mut image_count = 0usize;
                let mut sound_count = 0usize;
                let mut decoded_image = false;
                for skin in &skins.items {
                    let preview = service
                        .skin_preview(client, &skin.resource.resource_id)
                        .expect("acceptance skin preview");
                    image_count += preview.images.len();
                    sound_count += preview.sounds.len();
                    if !decoded_image {
                        decoded_image = preview.images.iter().any(|asset| {
                            service
                                .skin_asset(client, &skin.resource.resource_id, &asset.resource_id)
                                .is_ok()
                        });
                    }
                }
                println!("stable skin preview assets: {image_count} images, {sound_count} sounds");
                assert!(image_count > 0);
                assert!(sound_count > 0);
                assert!(decoded_image);
            }
            scanned += 1;
        }

        assert!(scanned > 0, "set at least one OPP_TEST_*_ROOT variable");
    }
}
