use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs,
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, atomic::Ordering},
    time::Duration,
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
use futures_util::{StreamExt, stream};
use md5::Md5;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::{
    account::ensure_access_token,
    error::{CommandError, CommandResult},
    game_session::get_game_status,
    local_analysis::{LocalBeatmapSummary, LocalClient},
    state::AppState,
};

const SHARE_PREFIX: &str = "OPPC2";
const LEGACY_SHARE_PREFIX: &str = "OPPC1";
const MAX_SHARE_BYTES: usize = 8 * 1024 * 1024;
const MAX_PRESENCE_CACHE_ENTRIES: usize = 50_000;
const MAX_PRESENCE_CACHE_BYTES: usize = 16 * 1024 * 1024;
const MAX_INSTALL_ARCHIVES: usize = 500;
const MAX_ARCHIVE_COMPRESSED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ARCHIVE_FILES: usize = 10_000;
const MAX_OSU_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 200;
const MAX_INSTALL_EXPANDED_BYTES: u64 = 1024 * 1024 * 1024;

fn ensure_collection_task_active(state: &AppState) -> CommandResult<()> {
    if state.collection_task_cancel.load(Ordering::Relaxed) {
        Err(CommandError::new(
            "COLLECTION_TASK_CANCELLED",
            "收藏夹同步已取消",
        ))
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn begin_collection_task(state: State<'_, AppState>) {
    state.collection_task_cancel.store(false, Ordering::Relaxed);
}

#[tauri::command]
pub fn cancel_collection_task(state: State<'_, AppState>) -> CommandResult<()> {
    state.collection_task_cancel.store(true, Ordering::Relaxed);
    if let Some(cancel) = state
        .beatmap_download
        .lock()
        .map_err(|_| CommandError::new("STATE_ERROR", "下载队列状态锁已损坏"))?
        .as_ref()
    {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CollectionSource {
    Opp,
    Stable,
    Lazer,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CollectionEntry {
    pub id: String,
    pub beatmap_id: Option<i32>,
    pub beatmapset_id: Option<i32>,
    pub checksum: Option<String>,
    pub ruleset: Option<String>,
    pub difficulty_name: String,
    pub title: String,
    pub artist: String,
    pub creator: String,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CollectionFolder {
    pub id: String,
    pub name: String,
    pub creator: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: CollectionSource,
    pub read_only: bool,
    pub pending_write: bool,
    pub entries: Vec<CollectionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionCandidate {
    pub beatmap_id: Option<i32>,
    pub beatmapset_id: Option<i32>,
    pub checksum: Option<String>,
    pub ruleset: Option<String>,
    pub difficulty_name: String,
    pub title: String,
    pub artist: String,
    pub creator: String,
    #[serde(default)]
    pub local_client: Option<LocalClient>,
    #[serde(default)]
    pub local_resource_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionSourceStatus {
    pub client: LocalClient,
    pub available: bool,
    pub read_only: bool,
    pub message: String,
    pub refreshed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionSnapshot {
    pub folders: Vec<CollectionFolder>,
    pub sources: Vec<CollectionSourceStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionSyncStatus {
    pub available: bool,
    pub in_sync: bool,
    pub pending_changes: bool,
    pub game_changed: bool,
    pub missing_downloadable_count: usize,
    pub missing_unresolved_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionSharePreview {
    pub name: String,
    pub creator: String,
    pub created_at: String,
    pub exported_at: String,
    pub entries: Vec<CollectionEntry>,
    pub available_count: usize,
    pub downloadable_count: usize,
    pub unresolved_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionDownloadItem {
    pub beatmapset_id: i32,
    pub artist: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionWriteResult {
    pub written_folders: usize,
    pub skipped_entries: usize,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionInstallResult {
    pub installed_sets: usize,
    pub resolved_entries: usize,
    pub unresolved_entries: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct CollectionOpenResult {
    pub opened: usize,
    pub failed: usize,
    pub failures: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CollectionTaskProgress {
    pub phase: String,
    pub processed: usize,
    pub total: usize,
    pub message: String,
}

fn emit_collection_progress(
    app: &AppHandle,
    phase: &str,
    processed: usize,
    total: usize,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "collection-task-progress",
        CollectionTaskProgress {
            phase: phase.into(),
            processed,
            total,
            message: message.into(),
        },
    );
}

#[derive(Debug, Clone)]
struct DownloadedBeatmap {
    beatmapset_id: Option<i32>,
    checksum: String,
    ruleset: Option<String>,
    difficulty_name: String,
    title: String,
    artist: String,
    creator: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CollectionFile {
    #[serde(default)]
    sharded: bool,
    #[serde(default)]
    folder_order: Vec<String>,
    #[serde(default)]
    folders: Vec<CollectionFolder>,
    #[serde(default)]
    stable_fingerprint: Option<String>,
    #[serde(default)]
    stable_version: Option<i32>,
    #[serde(default)]
    refreshed_at: Option<String>,
    #[serde(default)]
    local_presence_cache: HashMap<String, LocalPresenceCacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalPresenceCacheEntry {
    present: bool,
    scan_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CollectionCacheFile {
    #[serde(default)]
    local_presence_cache: HashMap<String, LocalPresenceCacheEntry>,
}

#[derive(Default)]
struct CollectionPersistedBytes {
    collections: Vec<u8>,
    cache: Vec<u8>,
    folders: HashMap<String, Vec<u8>>,
}

fn cached_local_presence(
    cache: &HashMap<String, LocalPresenceCacheEntry>,
    checksum: &str,
    scan_at: &Option<String>,
) -> Option<bool> {
    cache
        .get(checksum)
        .filter(|cached| &cached.scan_at == scan_at)
        .map(|cached| cached.present)
}

pub struct CollectionService {
    path: PathBuf,
    cache_path: PathBuf,
    folders_path: PathBuf,
    value: Mutex<CollectionFile>,
    persist: Mutex<CollectionPersistedBytes>,
}

impl CollectionService {
    pub fn new(app_data_dir: &Path) -> CommandResult<Self> {
        fs::create_dir_all(app_data_dir)?;
        let path = app_data_dir.join("collections.json");
        let collection_bytes = fs::read(&path).unwrap_or_default();
        let mut value: CollectionFile = serde_json::from_slice(&collection_bytes)
            .ok()
            .unwrap_or_default();
        let cache_path = app_data_dir.join("collections-cache.json");
        let cache_bytes = fs::read(&cache_path).unwrap_or_default();
        if let Ok(cache) = serde_json::from_slice::<CollectionCacheFile>(&cache_bytes) {
            value.local_presence_cache = cache.local_presence_cache;
        }
        let folders_path = app_data_dir.join("collections-data");
        fs::create_dir_all(&folders_path)?;
        let mut persisted_folders = HashMap::new();
        let mut sharded_folders = HashMap::new();
        for entry in fs::read_dir(&folders_path)?.filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json")
            {
                continue;
            }
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            let Ok(folder) = serde_json::from_slice::<CollectionFolder>(&bytes) else {
                continue;
            };
            persisted_folders.insert(folder.id.clone(), bytes);
            sharded_folders.insert(folder.id.clone(), folder);
        }
        if value.sharded {
            value.folders = value
                .folder_order
                .iter()
                .filter_map(|id| sharded_folders.remove(id))
                .collect();
            let mut remaining = sharded_folders.into_values().collect::<Vec<_>>();
            remaining.sort_by(|left, right| left.id.cmp(&right.id));
            value.folders.extend(remaining);
        }
        prune_presence_cache(&mut value.local_presence_cache);
        Ok(Self {
            path,
            cache_path,
            folders_path,
            value: Mutex::new(value),
            persist: Mutex::new(CollectionPersistedBytes {
                collections: collection_bytes,
                cache: cache_bytes,
                folders: persisted_folders,
            }),
        })
    }

    fn update<R>(
        &self,
        action: impl FnOnce(&mut CollectionFile) -> CommandResult<R>,
    ) -> CommandResult<R> {
        let mut persisted = self
            .persist
            .lock()
            .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹持久化状态不可用"))?;
        let (result, file) = {
            let mut file = self
                .value
                .lock()
                .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
            let result = action(&mut file)?;
            prune_presence_cache(&mut file.local_presence_cache);
            (result, file.clone())
        };
        let cache = CollectionCacheFile {
            local_presence_cache: file.local_presence_cache.clone(),
        };
        let folders = file.folders.clone();
        let mut durable = file;
        durable.sharded = true;
        durable.folder_order = folders.iter().map(|folder| folder.id.clone()).collect();
        durable.folders.clear();
        durable.local_presence_cache.clear();
        let collection_bytes = serde_json::to_vec_pretty(&durable)?;
        let cache_bytes = serde_json::to_vec(&cache)?;
        if persisted.cache != cache_bytes {
            let temporary = self.cache_path.with_extension("json.tmp");
            fs::write(&temporary, &cache_bytes)?;
            atomic_replace(&temporary, &self.cache_path)?;
            persisted.cache = cache_bytes;
        }
        let mut current_folder_ids = HashSet::new();
        for folder in folders {
            current_folder_ids.insert(folder.id.clone());
            let bytes = serde_json::to_vec(&folder)?;
            if persisted.folders.get(&folder.id) == Some(&bytes) {
                continue;
            }
            let target = self
                .folders_path
                .join(format!("{}.json", folder_storage_key(&folder.id)));
            let temporary = target.with_extension("json.tmp");
            fs::write(&temporary, &bytes)?;
            atomic_replace(&temporary, &target)?;
            persisted.folders.insert(folder.id, bytes);
        }
        let removed = persisted
            .folders
            .keys()
            .filter(|id| !current_folder_ids.contains(*id))
            .cloned()
            .collect::<Vec<_>>();
        for id in removed {
            let target = self
                .folders_path
                .join(format!("{}.json", folder_storage_key(&id)));
            if target.exists() {
                fs::remove_file(target)?;
            }
            persisted.folders.remove(&id);
        }
        if persisted.collections != collection_bytes {
            let temporary = self.path.with_extension("json.tmp");
            fs::write(&temporary, &collection_bytes)?;
            atomic_replace(&temporary, &self.path)?;
            persisted.collections = collection_bytes;
        }
        Ok(result)
    }

    fn snapshot(&self, statuses: Vec<CollectionSourceStatus>) -> CommandResult<CollectionSnapshot> {
        let file = self
            .value
            .lock()
            .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
        Ok(CollectionSnapshot {
            folders: file.folders.clone(),
            sources: statuses,
        })
    }

    fn create(&self, name: &str, creator: &str) -> CommandResult<CollectionFolder> {
        let name = validate_name(name)?;
        self.update(|file| {
            let now = Utc::now().to_rfc3339();
            let folder = CollectionFolder {
                id: Uuid::new_v4().to_string(),
                name,
                creator: creator.trim().to_string(),
                created_at: now.clone(),
                updated_at: now,
                source: CollectionSource::Opp,
                read_only: false,
                pending_write: true,
                entries: Vec::new(),
            };
            file.folders.push(folder.clone());
            Ok(folder)
        })
    }

    fn rename(&self, folder_id: &str, name: &str) -> CommandResult<()> {
        let name = validate_name(name)?;
        self.update(|file| {
            let folder = folder_mut(file, folder_id)?;
            ensure_writable(folder)?;
            folder.name = name;
            touch(folder);
            Ok(())
        })
    }

    fn delete(&self, folder_id: &str) -> CommandResult<()> {
        self.update(|file| {
            let index = file
                .folders
                .iter()
                .position(|folder| folder.id == folder_id)
                .ok_or_else(|| CommandError::new("COLLECTION_NOT_FOUND", "未找到收藏夹"))?;
            ensure_writable(&file.folders[index])?;
            file.folders.remove(index);
            Ok(())
        })
    }

    fn add_entries(
        &self,
        folder_id: &str,
        candidates: Vec<CollectionCandidate>,
    ) -> CommandResult<()> {
        self.update(|file| {
            let folder = folder_mut(file, folder_id)?;
            ensure_writable(folder)?;
            for candidate in candidates {
                let entry = candidate_to_entry(candidate);
                if !folder
                    .entries
                    .iter()
                    .any(|current| same_entry(current, &entry))
                {
                    folder.entries.push(entry);
                }
            }
            touch(folder);
            Ok(())
        })
    }

    fn remove_entry(&self, folder_id: &str, entry_id: &str) -> CommandResult<()> {
        self.update(|file| {
            let folder = folder_mut(file, folder_id)?;
            ensure_writable(folder)?;
            folder.entries.retain(|entry| entry.id != entry_id);
            touch(folder);
            Ok(())
        })
    }
}

fn folder_storage_key(id: &str) -> String {
    format!("{:x}", Sha256::digest(id.as_bytes()))
}

fn prune_presence_cache(cache: &mut HashMap<String, LocalPresenceCacheEntry>) {
    let mut entries = cache
        .iter()
        .map(|(key, value)| {
            let bytes = serde_json::to_vec(&(key, value)).map_or(0, |bytes| bytes.len());
            (key.clone(), bytes)
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    let mut total_bytes = entries.iter().map(|(_, bytes)| *bytes).sum::<usize>();
    let mut total_entries = entries.len();
    for (key, bytes) in entries {
        if total_entries <= MAX_PRESENCE_CACHE_ENTRIES && total_bytes <= MAX_PRESENCE_CACHE_BYTES {
            break;
        }
        cache.remove(&key);
        total_entries = total_entries.saturating_sub(1);
        total_bytes = total_bytes.saturating_sub(bytes);
    }
}

fn validate_name(name: &str) -> CommandResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(CommandError::new(
            "INVALID_COLLECTION_NAME",
            "收藏夹名称需为 1 到 120 个字符",
        ));
    }
    Ok(name.to_string())
}

fn folder_mut<'a>(
    file: &'a mut CollectionFile,
    folder_id: &str,
) -> CommandResult<&'a mut CollectionFolder> {
    file.folders
        .iter_mut()
        .find(|folder| folder.id == folder_id)
        .ok_or_else(|| CommandError::new("COLLECTION_NOT_FOUND", "未找到收藏夹"))
}

fn ensure_writable(folder: &CollectionFolder) -> CommandResult<()> {
    if folder.read_only {
        Err(CommandError::new(
            "COLLECTION_READ_ONLY",
            "该收藏夹来自只读的 osu!lazer 数据",
        ))
    } else {
        Ok(())
    }
}

fn touch(folder: &mut CollectionFolder) {
    folder.updated_at = Utc::now().to_rfc3339();
    if folder.source != CollectionSource::Lazer {
        folder.pending_write = true;
    }
}

fn candidate_to_entry(candidate: CollectionCandidate) -> CollectionEntry {
    // Online API responses may contain an official checksum even though the
    // beatmap is not installed locally. Only local candidates are resolved.
    let resolved = candidate.local_client.is_some() && candidate.checksum.is_some();
    CollectionEntry {
        id: Uuid::new_v4().to_string(),
        beatmap_id: candidate.beatmap_id,
        beatmapset_id: candidate.beatmapset_id,
        checksum: candidate.checksum.map(|value| value.to_ascii_lowercase()),
        ruleset: candidate.ruleset,
        difficulty_name: candidate.difficulty_name,
        title: candidate.title,
        artist: candidate.artist,
        creator: candidate.creator,
        // Online entries do not have a local checksum until osu! imports them.
        resolved,
    }
}

fn same_entry(left: &CollectionEntry, right: &CollectionEntry) -> bool {
    match (left.beatmap_id, right.beatmap_id) {
        (Some(a), Some(b)) => a == b,
        _ => left
            .checksum
            .as_deref()
            .zip(right.checksum.as_deref())
            .is_some_and(|(a, b)| a.eq_ignore_ascii_case(b)),
    }
}

fn atomic_replace(temporary: &Path, target: &Path) -> std::io::Result<()> {
    if target.exists() {
        let backup = target.with_extension("bak");
        if backup.exists() {
            fs::remove_file(&backup)?;
        }
        fs::rename(target, &backup)?;
        match fs::rename(temporary, target) {
            Ok(()) => {
                let _ = fs::remove_file(backup);
                Ok(())
            }
            Err(error) => {
                let _ = fs::rename(backup, target);
                Err(error)
            }
        }
    } else {
        fs::rename(temporary, target)
    }
}

#[derive(Debug, Clone)]
struct StableCollection {
    name: String,
    checksums: Vec<String>,
}

#[derive(Debug, Clone)]
struct StableDb {
    version: i32,
    folders: Vec<StableCollection>,
}

fn read_i32(bytes: &[u8], offset: &mut usize) -> CommandResult<i32> {
    let end = offset
        .checked_add(4)
        .ok_or_else(|| CommandError::new("COLLECTION_PARSE_FAILED", "收藏夹文件长度无效"))?;
    let slice = bytes
        .get(*offset..end)
        .ok_or_else(|| CommandError::new("COLLECTION_PARSE_FAILED", "收藏夹文件不完整"))?;
    *offset = end;
    Ok(i32::from_le_bytes(slice.try_into().expect("i32 slice")))
}

fn read_uleb(bytes: &[u8], offset: &mut usize) -> CommandResult<usize> {
    let mut value = 0usize;
    let mut shift = 0usize;
    loop {
        let byte = *bytes
            .get(*offset)
            .ok_or_else(|| CommandError::new("COLLECTION_PARSE_FAILED", "收藏夹字符串不完整"))?;
        *offset += 1;
        value |= usize::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
        shift += 7;
        if shift > 56 {
            return Err(CommandError::new(
                "COLLECTION_PARSE_FAILED",
                "收藏夹字符串长度无效",
            ));
        }
    }
}

fn read_osu_string(bytes: &[u8], offset: &mut usize) -> CommandResult<String> {
    let marker = *bytes
        .get(*offset)
        .ok_or_else(|| CommandError::new("COLLECTION_PARSE_FAILED", "收藏夹字符串不完整"))?;
    *offset += 1;
    if marker == 0 {
        return Ok(String::new());
    }
    if marker != 0x0b {
        return Err(CommandError::new(
            "COLLECTION_PARSE_FAILED",
            "收藏夹字符串标记无效",
        ));
    }
    let length = read_uleb(bytes, offset)?;
    let end = offset
        .checked_add(length)
        .ok_or_else(|| CommandError::new("COLLECTION_PARSE_FAILED", "收藏夹字符串长度无效"))?;
    let slice = bytes
        .get(*offset..end)
        .ok_or_else(|| CommandError::new("COLLECTION_PARSE_FAILED", "收藏夹字符串不完整"))?;
    *offset = end;
    String::from_utf8(slice.to_vec())
        .map_err(|_| CommandError::new("COLLECTION_PARSE_FAILED", "收藏夹字符串不是 UTF-8"))
}

fn push_uleb(value: usize, output: &mut Vec<u8>) {
    let mut value = value;
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        output.push(byte);
        if value == 0 {
            break;
        }
    }
}

fn push_osu_string(value: &str, output: &mut Vec<u8>) {
    if value.is_empty() {
        output.push(0);
        return;
    }
    output.push(0x0b);
    push_uleb(value.len(), output);
    output.extend_from_slice(value.as_bytes());
}

fn parse_stable_db(bytes: &[u8]) -> CommandResult<StableDb> {
    let mut offset = 0;
    let version = read_i32(bytes, &mut offset)?;
    let count = read_i32(bytes, &mut offset)?;
    if !(0..=10_000).contains(&count) {
        return Err(CommandError::new(
            "COLLECTION_PARSE_FAILED",
            "收藏夹数量超出限制",
        ));
    }
    let mut folders = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let name = read_osu_string(bytes, &mut offset)?;
        let maps = read_i32(bytes, &mut offset)?;
        if !(0..=100_000).contains(&maps) {
            return Err(CommandError::new(
                "COLLECTION_PARSE_FAILED",
                "收藏夹谱面数超出限制",
            ));
        }
        let mut checksums = Vec::with_capacity(maps as usize);
        for _ in 0..maps {
            checksums.push(read_osu_string(bytes, &mut offset)?);
        }
        folders.push(StableCollection { name, checksums });
    }
    Ok(StableDb { version, folders })
}

fn encode_stable_db(db: &StableDb) -> CommandResult<Vec<u8>> {
    let mut output = Vec::new();
    output.extend_from_slice(&db.version.to_le_bytes());
    let count = i32::try_from(db.folders.len())
        .map_err(|_| CommandError::new("COLLECTION_WRITE_FAILED", "收藏夹数量过多"))?;
    output.extend_from_slice(&count.to_le_bytes());
    for folder in &db.folders {
        push_osu_string(&folder.name, &mut output);
        let maps = i32::try_from(folder.checksums.len())
            .map_err(|_| CommandError::new("COLLECTION_WRITE_FAILED", "收藏夹谱面过多"))?;
        output.extend_from_slice(&maps.to_le_bytes());
        for checksum in &folder.checksums {
            push_osu_string(checksum, &mut output);
        }
    }
    Ok(output)
}

fn stable_path(state: &AppState) -> CommandResult<PathBuf> {
    let source = state.local_analysis.source_status(LocalClient::Stable)?;
    let root = source.install_root.ok_or_else(|| {
        CommandError::new("COLLECTION_SOURCE_UNAVAILABLE", "未配置 osu!stable 目录")
    })?;
    Ok(PathBuf::from(root).join("collection.db"))
}

fn file_fingerprint(path: &Path) -> CommandResult<String> {
    let bytes = fs::read(path)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn source_statuses(state: &AppState) -> Vec<CollectionSourceStatus> {
    [LocalClient::Stable, LocalClient::Lazer]
        .into_iter()
        .map(|client| {
            let source = state.local_analysis.source_status(client).ok();
            let available = source.as_ref().is_some_and(|value| value.valid);
            let (read_only, message) = match client {
                LocalClient::Stable => (
                    false,
                    if available {
                        "可读取和写回 collection.db"
                    } else {
                        "请先在设置中配置 osu!stable 目录"
                    },
                ),
                LocalClient::Lazer => (
                    true,
                    if available {
                        "lazer 收藏夹当前为只读；此版本不会修改 client.realm"
                    } else {
                        "请先在设置中配置 osu!lazer 数据目录"
                    },
                ),
            };
            CollectionSourceStatus {
                client,
                available,
                read_only,
                message: message.into(),
                refreshed_at: None,
            }
        })
        .collect()
}

#[tauri::command(async)]
pub fn list_collections(state: State<'_, AppState>) -> CommandResult<CollectionSnapshot> {
    state.collections.snapshot(source_statuses(&state))
}

#[tauri::command(async)]
pub fn get_collection_sync_status(
    state: State<'_, AppState>,
) -> CommandResult<CollectionSyncStatus> {
    let path = match stable_path(&state) {
        Ok(path) => path,
        Err(_) => {
            return Ok(CollectionSyncStatus {
                available: false,
                in_sync: false,
                pending_changes: false,
                game_changed: false,
                missing_downloadable_count: 0,
                missing_unresolved_count: 0,
            });
        }
    };
    let current_fingerprint = if path.is_file() {
        file_fingerprint(&path)?
    } else {
        String::new()
    };
    let file = state
        .collections
        .value
        .lock()
        .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
    let pending_changes = file
        .folders
        .iter()
        .any(|folder| folder.source != CollectionSource::Lazer && folder.pending_write);
    let game_changed = file.stable_fingerprint.as_deref().unwrap_or("") != current_fingerprint;
    let mut downloadable_sets = HashSet::new();
    let mut missing_unresolved_count = 0;
    for entry in file
        .folders
        .iter()
        .filter(|folder| folder.source != CollectionSource::Lazer)
        .flat_map(|folder| &folder.entries)
        .filter(|entry| !entry.resolved)
    {
        if let Some(beatmapset_id) = entry.beatmapset_id {
            downloadable_sets.insert(beatmapset_id);
        } else {
            missing_unresolved_count += 1;
        }
    }
    Ok(CollectionSyncStatus {
        available: true,
        in_sync: !pending_changes && !game_changed,
        pending_changes,
        game_changed,
        missing_downloadable_count: downloadable_sets.len(),
        missing_unresolved_count,
    })
}

fn stable_collection_entry(
    checksum: String,
    local: Option<&LocalBeatmapSummary>,
    previous: Option<&CollectionEntry>,
) -> CollectionEntry {
    if let Some(local) = local {
        return CollectionEntry {
            id: previous
                .map(|entry| entry.id.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            checksum: Some(checksum.to_ascii_lowercase()),
            beatmap_id: local.beatmap_id,
            beatmapset_id: local.beatmap_set_id,
            ruleset: Some(local.ruleset.to_string()),
            difficulty_name: local.difficulty_name.clone(),
            title: local.title_unicode.clone(),
            artist: local.artist_unicode.clone(),
            creator: local.creator.clone(),
            resolved: true,
        };
    }
    if let Some(previous) = previous {
        let mut preserved = previous.clone();
        preserved.checksum = Some(checksum.to_ascii_lowercase());
        return preserved;
    }
    CollectionEntry {
        id: Uuid::new_v4().to_string(),
        checksum: Some(checksum.to_ascii_lowercase()),
        beatmap_id: None,
        beatmapset_id: None,
        ruleset: None,
        difficulty_name: "未解析难度".into(),
        title: "未解析谱面".into(),
        artist: String::new(),
        creator: String::new(),
        resolved: false,
    }
}

fn refresh_stable_collections(
    path: PathBuf,
    collections: std::sync::Arc<CollectionService>,
    local_analysis: std::sync::Arc<crate::local_analysis::LocalAnalysisService>,
) -> CommandResult<()> {
    // Refresh the incremental local index first so collection.db hashes are
    // resolved against the files that are currently in the Songs directory.
    // A concurrent scan is harmless: the existing index remains available.
    let _ = local_analysis.scan(LocalClient::Stable, false, std::sync::Arc::new(|_| {}));
    let (db, fingerprint) = if path.is_file() {
        let bytes = fs::read(&path)?;
        (
            parse_stable_db(&bytes)?,
            format!("{:x}", Sha256::digest(&bytes)),
        )
    } else {
        (
            StableDb {
                version: 20200101,
                folders: Vec::new(),
            },
            String::new(),
        )
    };
    let checksums = db
        .folders
        .iter()
        .flat_map(|folder| folder.checksums.iter())
        .map(|checksum| checksum.to_ascii_lowercase())
        .collect::<std::collections::BTreeSet<_>>();
    let resolved = local_analysis
        .find_beatmaps_by_md5(LocalClient::Stable, &checksums)
        .unwrap_or_default();
    collections.update(|file| {
        let now = Utc::now().to_rfc3339();
        let mut matched = HashSet::new();
        let mut imported = Vec::new();
        for item in db.folders {
            let existing = file
                .folders
                .iter()
                .enumerate()
                .find(|(index, folder)| {
                    folder.source != CollectionSource::Lazer
                        && folder.name == item.name
                        && !matched.contains(index)
                })
                .map(|(index, _)| index);
            let previous_entries = existing
                .map(|index| file.folders[index].entries.clone())
                .unwrap_or_default();
            let entries = item
                .checksums
                .into_iter()
                .map(|checksum| {
                    let local = resolved.get(&checksum.to_ascii_lowercase());
                    let previous = previous_entries.iter().find(|entry| {
                        entry
                            .checksum
                            .as_deref()
                            .is_some_and(|value| value.eq_ignore_ascii_case(&checksum))
                    });
                    stable_collection_entry(checksum, local, previous)
                })
                .collect();
            if let Some(index) = existing {
                matched.insert(index);
                let folder = &mut file.folders[index];
                folder.entries = entries;
                folder.pending_write = false;
                folder.updated_at = now.clone();
            } else {
                imported.push(CollectionFolder {
                    id: Uuid::new_v4().to_string(),
                    name: item.name,
                    creator: "本地游戏收藏夹".into(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    source: CollectionSource::Stable,
                    read_only: false,
                    pending_write: false,
                    entries,
                });
            }
        }
        let retained_ids = matched
            .into_iter()
            .filter_map(|index| file.folders.get(index).map(|folder| folder.id.clone()))
            .collect::<HashSet<_>>();
        file.folders.retain(|folder| {
            folder.source != CollectionSource::Stable || retained_ids.contains(&folder.id)
        });
        file.folders.extend(imported);
        file.stable_version = Some(db.version);
        file.stable_fingerprint = Some(fingerprint);
        file.refreshed_at = Some(now);
        Ok(())
    })
}

#[tauri::command]
pub async fn refresh_collections(
    client: LocalClient,
    state: State<'_, AppState>,
) -> CommandResult<CollectionSnapshot> {
    if client == LocalClient::Lazer {
        return state.collections.snapshot(source_statuses(&state));
    }
    let path = stable_path(&state)?;
    let collections = std::sync::Arc::clone(&state.collections);
    let local_analysis = std::sync::Arc::clone(&state.local_analysis);
    tokio::task::spawn_blocking(move || {
        refresh_stable_collections(path, collections, local_analysis)
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "COLLECTION_REFRESH_TASK_ERROR",
            format!("收藏夹刷新任务异常结束：{error}"),
        )
    })??;
    state.collections.snapshot(source_statuses(&state))
}

#[tauri::command(async)]
pub fn create_collection(
    name: String,
    creator: String,
    state: State<'_, AppState>,
) -> CommandResult<CollectionFolder> {
    state.collections.create(&name, &creator)
}
#[tauri::command(async)]
pub fn rename_collection(
    folder_id: String,
    name: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.collections.rename(&folder_id, &name)
}
#[tauri::command(async)]
pub fn delete_collection(folder_id: String, state: State<'_, AppState>) -> CommandResult<()> {
    state.collections.delete(&folder_id)
}
#[tauri::command(async)]
pub fn add_collection_entries(
    folder_id: String,
    mut candidates: Vec<CollectionCandidate>,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    for candidate in &mut candidates {
        if candidate.checksum.is_none()
            && let (Some(client), Some(resource_id)) = (
                candidate.local_client,
                candidate.local_resource_id.as_deref(),
            )
            && let Ok(path) = state.local_analysis.beatmap_file_path(client, resource_id)
            && let Ok(bytes) = fs::read(path)
        {
            candidate.checksum = Some(format!("{:x}", Md5::digest(bytes)));
        }
    }
    state.collections.add_entries(&folder_id, candidates)
}
#[tauri::command(async)]
pub fn remove_collection_entry(
    folder_id: String,
    entry_id: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.collections.remove_entry(&folder_id, &entry_id)
}

#[tauri::command(async)]
pub fn write_stable_collections(
    state: State<'_, AppState>,
) -> CommandResult<CollectionWriteResult> {
    ensure_collection_task_active(&state)?;
    if get_game_status(state.clone())?
        .clients
        .iter()
        .any(|client| client.client == LocalClient::Stable && client.running)
    {
        return Err(CommandError::new(
            "GAME_RUNNING",
            "请关闭 osu!stable 后再写回收藏夹",
        ));
    }
    let path = stable_path(&state)?;
    state.collections.update(|file| {
        let current = if path.is_file() {
            file_fingerprint(&path)?
        } else {
            String::new()
        };
        if file.stable_fingerprint.as_deref().unwrap_or("") != current {
            return Err(CommandError::new(
                "COLLECTION_CONFLICT",
                "游戏收藏夹已在 OPP 外被修改，请先刷新后再写回",
            ));
        }
        let mut skipped_entries = 0usize;
        let folders = file
            .folders
            .iter()
            .filter(|folder| folder.source != CollectionSource::Lazer)
            .map(|folder| {
                let checksums = folder
                    .entries
                    .iter()
                    .filter_map(|entry| {
                        match entry
                            .checksum
                            .as_deref()
                            .filter(|checksum| !checksum.is_empty())
                        {
                            Some(value) => Some(value.to_string()),
                            None => {
                                skipped_entries += 1;
                                None
                            }
                        }
                    })
                    .collect();
                StableCollection {
                    name: folder.name.clone(),
                    checksums,
                }
            })
            .collect::<Vec<_>>();
        let db = StableDb {
            version: file.stable_version.unwrap_or(20200101),
            folders,
        };
        let bytes = encode_stable_db(&db)?;
        let temporary = path.with_extension("db.tmp");
        fs::write(&temporary, bytes)?;
        let backup = if path.exists() {
            let backup = path.with_extension("db.bak");
            if backup.exists() {
                fs::remove_file(&backup)?;
            }
            fs::rename(&path, &backup)?;
            Some(backup)
        } else {
            None
        };
        if let Err(error) = fs::rename(&temporary, &path) {
            if let Some(backup) = &backup {
                let _ = fs::rename(backup, &path);
            }
            return Err(CommandError::from(error));
        }
        file.stable_fingerprint = Some(file_fingerprint(&path)?);
        file.refreshed_at = Some(Utc::now().to_rfc3339());
        for folder in &mut file.folders {
            if folder.source != CollectionSource::Lazer {
                folder.pending_write = false;
            }
        }
        Ok(CollectionWriteResult {
            written_folders: db.folders.len(),
            skipped_entries,
            backup_path: backup.map(|value| value.display().to_string()),
        })
    })
}

#[derive(Serialize, Deserialize)]
struct SharePayload {
    version: u8,
    name: String,
    creator: String,
    created_at: String,
    exported_at: String,
    entries: Vec<CollectionEntry>,
}

fn push_share_string(value: &str, output: &mut Vec<u8>) {
    push_uleb(value.len(), output);
    output.extend_from_slice(value.as_bytes());
}

fn read_share_string(bytes: &[u8], offset: &mut usize) -> CommandResult<String> {
    let length = read_uleb(bytes, offset)?;
    let end = offset
        .checked_add(length)
        .ok_or_else(|| CommandError::new("INVALID_SHARE_CODE", "分享码字符串长度无效"))?;
    let value = std::str::from_utf8(
        bytes
            .get(*offset..end)
            .ok_or_else(|| CommandError::new("INVALID_SHARE_CODE", "分享码内容不完整"))?,
    )
    .map_err(|_| CommandError::new("INVALID_SHARE_CODE", "分享码文本无效"))?
    .to_string();
    *offset = end;
    Ok(value)
}

fn encode_share(payload: &SharePayload) -> CommandResult<String> {
    // Online entries use only their stable IDs. This is the information needed
    // to identify an exact difficulty and cuts large share codes dramatically.
    let mut raw = vec![2_u8];
    push_share_string(&payload.name, &mut raw);
    push_share_string(&payload.creator, &mut raw);
    push_share_string(&payload.created_at, &mut raw);
    push_share_string(&payload.exported_at, &mut raw);
    push_uleb(payload.entries.len(), &mut raw);
    for entry in &payload.entries {
        if let (Some(beatmapset_id), Some(beatmap_id)) = (entry.beatmapset_id, entry.beatmap_id) {
            raw.push(0);
            push_uleb(beatmapset_id as usize, &mut raw);
            push_uleb(beatmap_id as usize, &mut raw);
            continue;
        }
        raw.push(1);
        let checksum = entry.checksum.as_deref().unwrap_or("");
        push_share_string(checksum, &mut raw);
        push_share_string(entry.ruleset.as_deref().unwrap_or(""), &mut raw);
        push_share_string(&entry.difficulty_name, &mut raw);
        push_share_string(&entry.title, &mut raw);
        push_share_string(&entry.artist, &mut raw);
        push_share_string(&entry.creator, &mut raw);
    }
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(&raw)?;
    let encoded = encoder.finish()?;
    let checksum = Sha256::digest(&encoded);
    Ok(format!(
        "{SHARE_PREFIX}.{}.{}",
        URL_SAFE_NO_PAD.encode(encoded),
        URL_SAFE_NO_PAD.encode(checksum)
    ))
}

fn decode_share(code: &str) -> CommandResult<SharePayload> {
    let parts = code.trim().split('.').collect::<Vec<_>>();
    if parts.len() != 3 || ![SHARE_PREFIX, LEGACY_SHARE_PREFIX].contains(&parts[0]) {
        return Err(CommandError::new(
            "INVALID_SHARE_CODE",
            "不是有效的 OPP 收藏夹分享码",
        ));
    }
    let encoded = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| CommandError::new("INVALID_SHARE_CODE", "分享码内容无法读取"))?;
    if encoded.len() > MAX_SHARE_BYTES {
        return Err(CommandError::new("INVALID_SHARE_CODE", "分享码过大"));
    }
    let expected = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|_| CommandError::new("INVALID_SHARE_CODE", "分享码校验值无效"))?;
    if expected.as_slice() != Sha256::digest(&encoded).as_slice() {
        return Err(CommandError::new(
            "INVALID_SHARE_CODE",
            "分享码校验失败，内容可能不完整",
        ));
    }
    let mut decoder = ZlibDecoder::new(encoded.as_slice());
    let mut raw = Vec::new();
    decoder
        .by_ref()
        .take((MAX_SHARE_BYTES + 1) as u64)
        .read_to_end(&mut raw)?;
    if raw.len() > MAX_SHARE_BYTES {
        return Err(CommandError::new("INVALID_SHARE_CODE", "分享码解压后过大"));
    }
    if parts[0] == LEGACY_SHARE_PREFIX {
        let payload: SharePayload = serde_json::from_slice(&raw)?;
        if payload.version != 1 {
            return Err(CommandError::new(
                "UNSUPPORTED_SHARE_CODE",
                "此分享码版本暂不支持",
            ));
        }
        return Ok(payload);
    }
    let mut offset = 0;
    if *raw
        .first()
        .ok_or_else(|| CommandError::new("INVALID_SHARE_CODE", "分享码内容为空"))?
        != 2
    {
        return Err(CommandError::new(
            "UNSUPPORTED_SHARE_CODE",
            "此分享码版本暂不支持",
        ));
    }
    offset += 1;
    let name = read_share_string(&raw, &mut offset)?;
    let creator = read_share_string(&raw, &mut offset)?;
    let created_at = read_share_string(&raw, &mut offset)?;
    let exported_at = read_share_string(&raw, &mut offset)?;
    let count = read_uleb(&raw, &mut offset)?;
    if count > 100_000 {
        return Err(CommandError::new(
            "INVALID_SHARE_CODE",
            "分享码谱面数量超出限制",
        ));
    }
    let mut entries = Vec::with_capacity(count);
    for _ in 0..count {
        let kind = *raw
            .get(offset)
            .ok_or_else(|| CommandError::new("INVALID_SHARE_CODE", "分享码内容不完整"))?;
        offset += 1;
        let entry = if kind == 0 {
            let beatmapset_id = i32::try_from(read_uleb(&raw, &mut offset)?)
                .map_err(|_| CommandError::new("INVALID_SHARE_CODE", "谱面集 ID 无效"))?;
            let beatmap_id = i32::try_from(read_uleb(&raw, &mut offset)?)
                .map_err(|_| CommandError::new("INVALID_SHARE_CODE", "谱面 ID 无效"))?;
            CollectionEntry {
                id: Uuid::new_v4().to_string(),
                beatmap_id: Some(beatmap_id),
                beatmapset_id: Some(beatmapset_id),
                checksum: None,
                ruleset: None,
                difficulty_name: format!("#{beatmap_id}"),
                title: format!("谱面集 #{beatmapset_id}"),
                artist: String::new(),
                creator: String::new(),
                resolved: false,
            }
        } else if kind == 1 {
            let checksum = read_share_string(&raw, &mut offset)?;
            let ruleset = read_share_string(&raw, &mut offset)?;
            CollectionEntry {
                id: Uuid::new_v4().to_string(),
                beatmap_id: None,
                beatmapset_id: None,
                checksum: (!checksum.is_empty()).then_some(checksum),
                ruleset: (!ruleset.is_empty()).then_some(ruleset),
                difficulty_name: read_share_string(&raw, &mut offset)?,
                title: read_share_string(&raw, &mut offset)?,
                artist: read_share_string(&raw, &mut offset)?,
                creator: read_share_string(&raw, &mut offset)?,
                resolved: false,
            }
        } else {
            return Err(CommandError::new(
                "INVALID_SHARE_CODE",
                "分享码条目类型无效",
            ));
        };
        entries.push(entry);
    }
    Ok(SharePayload {
        version: 1,
        name,
        creator,
        created_at,
        exported_at,
        entries,
    })
}

fn preview_payload(payload: SharePayload, state: &AppState) -> CollectionSharePreview {
    let checksums = payload
        .entries
        .iter()
        .filter_map(|entry| {
            entry
                .checksum
                .as_ref()
                .map(|value| value.to_ascii_lowercase())
        })
        .collect::<BTreeSet<_>>();
    let resolved = [LocalClient::Stable, LocalClient::Lazer]
        .into_iter()
        .filter_map(|client| {
            state
                .local_analysis
                .find_beatmaps_by_md5(client, &checksums)
                .ok()
        })
        .flat_map(|found| found.into_keys())
        .collect::<HashSet<_>>();
    let entries = payload
        .entries
        .into_iter()
        .map(|mut entry| {
            entry.resolved = entry
                .checksum
                .as_deref()
                .is_some_and(|checksum| resolved.contains(&checksum.to_ascii_lowercase()));
            entry
        })
        .collect::<Vec<_>>();
    let available_count = entries.iter().filter(|entry| entry.resolved).count();
    let downloadable_count = entries
        .iter()
        .filter(|entry| !entry.resolved && entry.beatmapset_id.is_some())
        .count();
    let unresolved_count = entries
        .len()
        .saturating_sub(available_count + downloadable_count);
    CollectionSharePreview {
        name: payload.name,
        creator: payload.creator,
        created_at: payload.created_at,
        exported_at: payload.exported_at,
        entries,
        available_count,
        downloadable_count,
        unresolved_count,
    }
}

#[tauri::command(async)]
pub fn export_collection_share(
    folder_id: String,
    creator: String,
    state: State<'_, AppState>,
) -> CommandResult<String> {
    let file = state
        .collections
        .value
        .lock()
        .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
    let folder = file
        .folders
        .iter()
        .find(|folder| folder.id == folder_id)
        .ok_or_else(|| CommandError::new("COLLECTION_NOT_FOUND", "未找到收藏夹"))?;
    encode_share(&SharePayload {
        version: 1,
        name: folder.name.clone(),
        creator: if creator.trim().is_empty() {
            folder.creator.clone()
        } else {
            creator.trim().into()
        },
        created_at: folder.created_at.clone(),
        exported_at: Utc::now().to_rfc3339(),
        entries: folder.entries.clone(),
    })
}

#[tauri::command(async)]
pub fn preview_collection_share(
    code: String,
    state: State<'_, AppState>,
) -> CommandResult<CollectionSharePreview> {
    Ok(preview_payload(decode_share(&code)?, &state))
}

#[tauri::command(async)]
pub fn import_collection_share(
    code: String,
    state: State<'_, AppState>,
) -> CommandResult<CollectionFolder> {
    let payload = decode_share(&code)?;
    state.collections.update(|file| {
        let now = Utc::now().to_rfc3339();
        let folder = CollectionFolder {
            id: Uuid::new_v4().to_string(),
            name: payload.name,
            creator: payload.creator,
            created_at: payload.created_at,
            updated_at: now,
            source: CollectionSource::Opp,
            read_only: false,
            pending_write: true,
            entries: payload.entries,
        };
        file.folders.push(folder.clone());
        Ok(folder)
    })
}

#[tauri::command]
pub async fn get_collection_download_items(
    folder_ids: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Vec<CollectionDownloadItem>> {
    ensure_collection_task_active(&state)?;
    let selected = folder_ids.into_iter().collect::<HashSet<_>>();
    let resolution_candidates = {
        let file = state
            .collections
            .value
            .lock()
            .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
        file.folders
            .iter()
            .filter(|folder| selected.contains(&folder.id))
            .flat_map(|folder| {
                folder.entries.iter().filter_map(|entry| {
                    entry.checksum.clone().map(|checksum| {
                        (
                            folder.id.clone(),
                            entry.id.clone(),
                            checksum.to_ascii_lowercase(),
                            entry.resolved,
                        )
                    })
                })
            })
            .collect::<Vec<_>>()
    };
    let stable_scan_at = state
        .local_analysis
        .summary(LocalClient::Stable)?
        .map(|summary| summary.scanned_at);
    let presence_cache = state
        .collections
        .value
        .lock()
        .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?
        .local_presence_cache
        .clone();
    let cached_resolution = resolution_candidates
        .iter()
        .filter_map(|(_, _, checksum, _)| {
            cached_local_presence(&presence_cache, checksum, &stable_scan_at)
                .map(|present| (checksum.clone(), present))
        })
        .collect::<HashMap<_, _>>();
    let checksums_to_scan = resolution_candidates
        .iter()
        .map(|(_, _, checksum, _)| checksum.clone())
        .filter(|checksum| !cached_resolution.contains_key(checksum))
        .collect::<BTreeSet<_>>();
    let mut scanned_resolution = HashMap::new();
    if stable_scan_at.is_some() && !checksums_to_scan.is_empty() {
        emit_collection_progress(
            &app,
            "checking",
            cached_resolution.len(),
            cached_resolution.len() + checksums_to_scan.len(),
            format!(
                "已命中 {} 条缓存，正在核对 {} 个本地谱面 MD5",
                cached_resolution.len(),
                checksums_to_scan.len()
            ),
        );
        ensure_collection_task_active(&state)?;
        let found = state
            .local_analysis
            .find_beatmaps_by_md5(LocalClient::Stable, &checksums_to_scan)
            .unwrap_or_default();
        scanned_resolution.extend(
            checksums_to_scan
                .iter()
                .map(|checksum| (checksum.clone(), found.contains_key(checksum))),
        );
    } else if !cached_resolution.is_empty() {
        emit_collection_progress(
            &app,
            "checking",
            cached_resolution.len(),
            cached_resolution.len(),
            format!("已从缓存确认 {} 个谱面 MD5", cached_resolution.len()),
        );
    }
    if !cached_resolution.is_empty() || !scanned_resolution.is_empty() {
        state.collections.update(|file| {
            for (checksum, present) in &scanned_resolution {
                file.local_presence_cache.insert(
                    checksum.clone(),
                    LocalPresenceCacheEntry {
                        present: *present,
                        scan_at: stable_scan_at.clone(),
                    },
                );
            }
            for folder in &mut file.folders {
                if !selected.contains(&folder.id) {
                    continue;
                }
                for entry in &mut folder.entries {
                    let Some(checksum) = entry.checksum.as_deref() else {
                        continue;
                    };
                    if let Some(resolved) = cached_resolution
                        .get(checksum)
                        .or_else(|| scanned_resolution.get(checksum))
                    {
                        entry.resolved = *resolved;
                    }
                }
            }
            Ok(())
        })?;
    }

    let unresolved_checksums = {
        let file = state
            .collections
            .value
            .lock()
            .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
        file.folders
            .iter()
            .filter(|folder| selected.contains(&folder.id))
            .flat_map(|folder| folder.entries.iter())
            .filter(|entry| !entry.resolved && entry.beatmapset_id.is_none())
            .filter_map(|entry| entry.checksum.as_deref().map(str::to_ascii_lowercase))
            .collect::<HashSet<_>>()
    };

    if !unresolved_checksums.is_empty() {
        emit_collection_progress(
            &app,
            "checking",
            0,
            unresolved_checksums.len(),
            format!("正在查询 {} 个旧 MD5", unresolved_checksums.len()),
        );
        let access_token = ensure_access_token(&state).await.map_err(|_| {
            CommandError::new(
                "COLLECTION_LOOKUP_AUTH_REQUIRED",
                format!(
                    "有 {} 个缺失谱面只有旧 MD5。请先登录 osu! 账号，以便查询对应谱面后自动下载",
                    unresolved_checksums.len()
                ),
            )
        })?;
        let mut resolved = HashMap::<String, serde_json::Value>::new();
        let lookups = stream::iter(unresolved_checksums.iter().cloned())
            .map(|checksum| {
                let access_token = &access_token;
                let state = &state;
                async move {
                    ensure_collection_task_active(state)?;
                    let value = state
                        .api
                        .lookup_beatmap_by_checksum(access_token, &checksum)
                        .await
                        .ok()
                        .filter(|value| {
                            value
                                .get("id")
                                .and_then(serde_json::Value::as_i64)
                                .is_some()
                                && value
                                    .get("beatmapset_id")
                                    .and_then(serde_json::Value::as_i64)
                                    .is_some()
                        });
                    Ok::<_, CommandError>((checksum, value))
                }
            })
            .buffer_unordered(4);
        futures_util::pin_mut!(lookups);
        let mut processed = 0usize;
        while let Some(result) = lookups.next().await {
            let (checksum, value) = result?;
            if let Some(value) = value {
                resolved.insert(checksum, value);
            }
            processed += 1;
            emit_collection_progress(
                &app,
                "checking",
                processed,
                unresolved_checksums.len(),
                format!(
                    "正在解析旧收藏条目 {}/{}",
                    processed,
                    unresolved_checksums.len()
                ),
            );
        }
        if !resolved.is_empty() {
            state.collections.update(|file| {
                for folder in file
                    .folders
                    .iter_mut()
                    .filter(|folder| selected.contains(&folder.id))
                {
                    for entry in &mut folder.entries {
                        let Some(value) = entry
                            .checksum
                            .as_deref()
                            .and_then(|checksum| resolved.get(&checksum.to_ascii_lowercase()))
                        else {
                            continue;
                        };
                        entry.beatmap_id = value
                            .get("id")
                            .and_then(serde_json::Value::as_i64)
                            .and_then(|id| i32::try_from(id).ok());
                        entry.beatmapset_id = value
                            .get("beatmapset_id")
                            .and_then(serde_json::Value::as_i64)
                            .and_then(|id| i32::try_from(id).ok());
                        if let Some(version) =
                            value.get("version").and_then(serde_json::Value::as_str)
                        {
                            entry.difficulty_name = version.to_string();
                        }
                        if let Some(mode) = value.get("mode").and_then(serde_json::Value::as_str) {
                            entry.ruleset = Some(mode.to_string());
                        }
                        if let Some(set) = value.get("beatmapset") {
                            if let Some(title) = set
                                .get("title_unicode")
                                .or_else(|| set.get("title"))
                                .and_then(serde_json::Value::as_str)
                            {
                                entry.title = title.to_string();
                            }
                            if let Some(artist) = set
                                .get("artist_unicode")
                                .or_else(|| set.get("artist"))
                                .and_then(serde_json::Value::as_str)
                            {
                                entry.artist = artist.to_string();
                            }
                            if let Some(creator) =
                                set.get("creator").and_then(serde_json::Value::as_str)
                            {
                                entry.creator = creator.to_string();
                            }
                        }
                    }
                }
                Ok(())
            })?;
        }
    }

    let file = state
        .collections
        .value
        .lock()
        .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
    let mut seen = HashSet::new();
    let items = file
        .folders
        .iter()
        .filter(|folder| selected.contains(&folder.id))
        .flat_map(|folder| folder.entries.iter())
        .filter(|entry| !entry.resolved)
        .filter_map(|entry| {
            entry
                .beatmapset_id
                .filter(|id| seen.insert(*id))
                .map(|beatmapset_id| CollectionDownloadItem {
                    beatmapset_id,
                    artist: entry.artist.clone(),
                    title: entry.title.clone(),
                })
        })
        .collect::<Vec<_>>();
    if items.is_empty() && !unresolved_checksums.is_empty() {
        return Err(CommandError::new(
            "COLLECTION_LOOKUP_FAILED",
            format!(
                "{} 个缺失谱面只有旧 MD5，osu! 官网未能找到对应谱面，当前无法自动下载",
                unresolved_checksums.len()
            ),
        ));
    }
    Ok(items)
}

fn osu_metadata_value<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let mut in_metadata = false;
    for raw_line in text.lines() {
        let line = raw_line.trim().trim_start_matches('\u{feff}');
        if line.starts_with('[') && line.ends_with(']') {
            in_metadata = line.eq_ignore_ascii_case("[Metadata]");
            continue;
        }
        if !in_metadata {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case(key) {
            return Some(value.trim());
        }
    }
    None
}

fn parse_downloaded_beatmap(bytes: &[u8]) -> Option<(i32, DownloadedBeatmap)> {
    let text = String::from_utf8_lossy(bytes);
    let beatmap_id = osu_metadata_value(&text, "BeatmapID")?.parse().ok()?;
    let beatmapset_id =
        osu_metadata_value(&text, "BeatmapSetID").and_then(|value| value.parse().ok());
    let mode = text.lines().find_map(|raw_line| {
        let line = raw_line.trim();
        line.strip_prefix("Mode:")
            .and_then(|value| value.trim().parse::<u8>().ok())
    });
    let ruleset = mode.map(|value| match value {
        1 => "taiko",
        2 => "fruits",
        3 => "mania",
        _ => "osu",
    });
    Some((
        beatmap_id,
        DownloadedBeatmap {
            beatmapset_id,
            checksum: format!("{:x}", Md5::digest(bytes)),
            ruleset: ruleset.map(str::to_string),
            difficulty_name: osu_metadata_value(&text, "Version")
                .unwrap_or("")
                .to_string(),
            title: osu_metadata_value(&text, "TitleUnicode")
                .filter(|value| !value.is_empty())
                .or_else(|| osu_metadata_value(&text, "Title"))
                .unwrap_or("")
                .to_string(),
            artist: osu_metadata_value(&text, "ArtistUnicode")
                .filter(|value| !value.is_empty())
                .or_else(|| osu_metadata_value(&text, "Artist"))
                .unwrap_or("")
                .to_string(),
            creator: osu_metadata_value(&text, "Creator")
                .unwrap_or("")
                .to_string(),
        },
    ))
}

/// Reads downloaded archives and hydrates compact share-code entries with the
/// exact MD5 required by collection.db. The archives are intentionally opened
/// by osu! only after collection.db has been written.
#[tauri::command(async)]
pub fn install_collection_downloads(
    folder_ids: Vec<String>,
    archive_paths: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<CollectionInstallResult> {
    ensure_collection_task_active(&state)?;
    if get_game_status(state.clone())?
        .clients
        .iter()
        .any(|client| client.client == LocalClient::Stable && client.running)
    {
        return Err(CommandError::new(
            "GAME_RUNNING",
            "请关闭 osu!stable 后再准备缺失谱面并写回收藏夹",
        ));
    }
    let source = state.local_analysis.source_status(LocalClient::Stable)?;
    if !source.valid || source.install_root.is_none() {
        return Err(CommandError::new(
            "COLLECTION_SOURCE_UNAVAILABLE",
            "未配置有效的 osu!stable 目录",
        ));
    }

    let mut installed_sets = 0usize;
    let mut downloaded = HashMap::<i32, DownloadedBeatmap>::new();
    let archive_total = archive_paths.len();
    if archive_total > MAX_INSTALL_ARCHIVES {
        return Err(CommandError::new(
            "COLLECTION_ARCHIVE_LIMIT",
            "单次最多处理 500 个曲包",
        ));
    }
    let mut task_expanded_size = 0u64;
    emit_collection_progress(
        &app,
        "installing",
        0,
        archive_total,
        format!("正在读取 {archive_total} 个曲包并计算 MD5"),
    );
    for value in archive_paths {
        ensure_collection_task_active(&state)?;
        let archive_path = PathBuf::from(value);
        if !archive_path.is_file()
            || !archive_path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("osz"))
        {
            continue;
        }
        let compressed_size = fs::metadata(&archive_path)?.len();
        if compressed_size > MAX_ARCHIVE_COMPRESSED_BYTES {
            return Err(CommandError::new(
                "COLLECTION_ARCHIVE_TOO_LARGE",
                "单个曲包压缩体积不得超过 512 MB",
            ));
        }
        let archive_file = fs::File::open(&archive_path)?;
        let mut archive = zip::ZipArchive::new(BufReader::new(archive_file))
            .map_err(|error| CommandError::new("INVALID_ARCHIVE", error.to_string()))?;
        if archive.len() > MAX_ARCHIVE_FILES {
            return Err(CommandError::new(
                "INVALID_ARCHIVE",
                "曲包内文件数量超出限制",
            ));
        }
        let mut archive_maps = Vec::<(i32, DownloadedBeatmap)>::new();
        for index in 0..archive.len() {
            ensure_collection_task_active(&state)?;
            let mut file = archive
                .by_index(index)
                .map_err(|error| CommandError::new("INVALID_ARCHIVE", error.to_string()))?;
            task_expanded_size = task_expanded_size.saturating_add(file.size());
            if task_expanded_size > MAX_INSTALL_EXPANDED_BYTES {
                return Err(CommandError::new(
                    "INVALID_ARCHIVE",
                    "本次任务的累计展开体积超过 1 GB",
                ));
            }
            let compressed = file.compressed_size();
            if file.size() > 0
                && (compressed == 0
                    || file.size() > compressed.saturating_mul(MAX_COMPRESSION_RATIO))
            {
                return Err(CommandError::new(
                    "INVALID_ARCHIVE",
                    "曲包包含压缩比异常的文件",
                ));
            }
            if !file.name().to_ascii_lowercase().ends_with(".osu") {
                continue;
            }
            if file.size() > MAX_OSU_FILE_BYTES {
                return Err(CommandError::new(
                    "INVALID_ARCHIVE",
                    "单个 .osu 文件不得超过 16 MB",
                ));
            }
            let mut map_bytes = Vec::with_capacity(file.size() as usize);
            (&mut file)
                .take(MAX_OSU_FILE_BYTES + 1)
                .read_to_end(&mut map_bytes)?;
            if map_bytes.len() as u64 > MAX_OSU_FILE_BYTES {
                return Err(CommandError::new(
                    "INVALID_ARCHIVE",
                    "单个 .osu 文件不得超过 16 MB",
                ));
            }
            if let Some(map) = parse_downloaded_beatmap(&map_bytes) {
                archive_maps.push(map);
            }
        }
        downloaded.extend(archive_maps);
        installed_sets += 1;
        emit_collection_progress(
            &app,
            "installing",
            installed_sets,
            archive_total,
            format!("已读取 {installed_sets}/{archive_total} 个曲包"),
        );
    }

    let selected = folder_ids.into_iter().collect::<HashSet<_>>();
    let cache_scan_at = state
        .local_analysis
        .summary(LocalClient::Stable)?
        .map(|summary| summary.scanned_at);
    ensure_collection_task_active(&state)?;
    state.collections.update(|file| {
        let mut resolved_entries = 0usize;
        let mut unresolved_entries = 0usize;
        for folder in &mut file.folders {
            if !selected.contains(&folder.id) {
                continue;
            }
            let mut changed = false;
            for entry in &mut folder.entries {
                if entry.resolved {
                    continue;
                }
                let Some(map) = entry.beatmap_id.and_then(|id| downloaded.get(&id)) else {
                    unresolved_entries += 1;
                    continue;
                };
                entry.beatmapset_id = map.beatmapset_id.or(entry.beatmapset_id);
                entry.checksum = Some(map.checksum.clone());
                entry.ruleset = map.ruleset.clone().or(entry.ruleset.clone());
                entry.difficulty_name = map.difficulty_name.clone();
                entry.title = map.title.clone();
                entry.artist = map.artist.clone();
                entry.creator = map.creator.clone();
                entry.resolved = true;
                resolved_entries += 1;
                changed = true;
            }
            if changed {
                touch(folder);
            }
        }
        for map in downloaded.values() {
            file.local_presence_cache.insert(
                map.checksum.clone(),
                LocalPresenceCacheEntry {
                    present: true,
                    scan_at: cache_scan_at.clone(),
                },
            );
        }
        Ok(CollectionInstallResult {
            installed_sets,
            resolved_entries,
            unresolved_entries,
        })
    })
}

#[tauri::command]
pub async fn open_collection_downloads(
    archive_paths: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<CollectionOpenResult> {
    ensure_collection_task_active(&state)?;
    let total = archive_paths.len();
    let mut opened = 0usize;
    let mut failures = Vec::new();
    emit_collection_progress(&app, "opening", 0, total, "正在调用 osu! 导入曲包");
    for value in archive_paths {
        ensure_collection_task_active(&state)?;
        let path = PathBuf::from(&value);
        let valid = path.is_file()
            && path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("osz"));
        if !valid {
            failures.push(format!("曲包文件不存在：{value}"));
        } else if let Err(error) = app.opener().open_path(path.to_string_lossy(), None::<&str>) {
            failures.push(format!("无法打开 {}：{error}", path.display()));
        } else {
            opened += 1;
        }
        emit_collection_progress(
            &app,
            "opening",
            opened + failures.len(),
            total,
            format!(
                "已交给游戏处理 {}/{} 个曲包",
                opened + failures.len(),
                total
            ),
        );
        tokio::time::sleep(Duration::from_millis(180)).await;
    }
    Ok(CollectionOpenResult {
        opened,
        failed: failures.len(),
        failures,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_db_round_trip_unicode() {
        let db = StableDb {
            version: 20200101,
            folders: vec![StableCollection {
                name: "测试合集".into(),
                checksums: vec!["abc".into()],
            }],
        };
        assert_eq!(
            parse_stable_db(&encode_stable_db(&db).unwrap())
                .unwrap()
                .folders[0]
                .name,
            "测试合集"
        );
    }
    #[test]
    fn stable_refresh_preserves_known_entry_when_local_index_is_stale() {
        let previous = CollectionEntry {
            id: "entry-1".into(),
            beatmap_id: Some(123),
            beatmapset_id: Some(456),
            checksum: Some("ABCDEF".into()),
            ruleset: Some("osu".into()),
            difficulty_name: "Insane".into(),
            title: "Known song".into(),
            artist: "Known artist".into(),
            creator: "Known mapper".into(),
            resolved: true,
        };

        let refreshed = stable_collection_entry("abcdef".into(), None, Some(&previous));

        assert_eq!(refreshed.id, previous.id);
        assert_eq!(refreshed.title, previous.title);
        assert_eq!(refreshed.checksum.as_deref(), Some("abcdef"));
        assert!(refreshed.resolved);
    }
    #[test]
    fn share_round_trip() {
        let payload = SharePayload {
            version: 1,
            name: "A".into(),
            creator: "B".into(),
            created_at: "x".into(),
            exported_at: "y".into(),
            entries: Vec::new(),
        };
        assert_eq!(
            decode_share(&encode_share(&payload).unwrap()).unwrap().name,
            "A"
        );
    }
    #[test]
    fn compact_share_preserves_online_difficulty_ids() {
        let entry = CollectionEntry {
            id: "local".into(),
            beatmap_id: Some(1_234_567),
            beatmapset_id: Some(765_432),
            checksum: None,
            ruleset: Some("osu".into()),
            difficulty_name: "Ignored in compact form".into(),
            title: "Large repeated display data is omitted".into(),
            artist: "Artist".into(),
            creator: "Mapper".into(),
            resolved: true,
        };
        let payload = SharePayload {
            version: 1,
            name: "Massive list".into(),
            creator: "OPP".into(),
            created_at: "x".into(),
            exported_at: "y".into(),
            entries: vec![entry],
        };
        let decoded = decode_share(&encode_share(&payload).unwrap()).unwrap();
        assert_eq!(decoded.entries[0].beatmap_id, Some(1_234_567));
        assert_eq!(decoded.entries[0].beatmapset_id, Some(765_432));
    }

    #[test]
    fn downloaded_beatmap_metadata_supplies_collection_checksum() {
        let bytes = br#"osu file format v14

[General]
Mode:3

[Metadata]
Title:Test Song
TitleUnicode:Unicode Title
Artist:Test Artist
Creator:Mapper
Version:Another
BeatmapID:456
BeatmapSetID:123
"#;
        let (beatmap_id, parsed) = parse_downloaded_beatmap(bytes).unwrap();
        assert_eq!(beatmap_id, 456);
        assert_eq!(parsed.beatmapset_id, Some(123));
        assert_eq!(parsed.ruleset.as_deref(), Some("mania"));
        assert_eq!(parsed.title, "Unicode Title");
        assert_eq!(parsed.difficulty_name, "Another");
        assert_eq!(parsed.checksum, format!("{:x}", Md5::digest(bytes)));
    }

    #[test]
    fn online_checksum_does_not_claim_the_beatmap_is_local() {
        let online = candidate_to_entry(CollectionCandidate {
            beatmap_id: Some(5775199),
            beatmapset_id: Some(2588665),
            checksum: Some("05b5b08930762a1952f37db991e16c62".into()),
            ruleset: Some("osu".into()),
            difficulty_name: "test".into(),
            title: "tree".into(),
            artist: "artist".into(),
            creator: "mapper".into(),
            local_client: None,
            local_resource_id: None,
        });
        assert!(!online.resolved);
    }

    #[test]
    fn local_presence_cache_expires_after_a_new_scan() {
        let mut cache = HashMap::new();
        cache.insert(
            "abc".into(),
            LocalPresenceCacheEntry {
                present: true,
                scan_at: Some("scan-1".into()),
            },
        );
        assert_eq!(
            cached_local_presence(&cache, "abc", &Some("scan-1".into())),
            Some(true)
        );
        assert_eq!(
            cached_local_presence(&cache, "abc", &Some("scan-2".into())),
            None
        );
    }

    #[test]
    fn collections_are_migrated_to_atomic_folder_shards() {
        let directory = tempfile::tempdir().expect("app data");
        let service = CollectionService::new(directory.path()).expect("service");
        let folder = service
            .create("Large library", "tester")
            .expect("create folder");
        let second = service.create("Second", "tester").expect("second folder");
        let metadata =
            fs::read_to_string(directory.path().join("collections.json")).expect("metadata");
        assert!(!metadata.contains("Large library"));
        assert_eq!(
            fs::read_dir(directory.path().join("collections-data"))
                .expect("shards")
                .count(),
            2
        );

        let reloaded = CollectionService::new(directory.path()).expect("reload");
        let snapshot = reloaded.snapshot(Vec::new()).expect("snapshot");
        assert_eq!(snapshot.folders, vec![folder, second]);
    }
}
