use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
use md5::Md5;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use uuid::Uuid;

use crate::{
    error::{CommandError, CommandResult},
    game_session::get_game_status,
    local_analysis::LocalClient,
    state::AppState,
};

const SHARE_PREFIX: &str = "OPPC2";
const LEGACY_SHARE_PREFIX: &str = "OPPC1";
const MAX_SHARE_BYTES: usize = 8 * 1024 * 1024;

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CollectionFile {
    #[serde(default)]
    folders: Vec<CollectionFolder>,
    #[serde(default)]
    stable_fingerprint: Option<String>,
    #[serde(default)]
    stable_version: Option<i32>,
    #[serde(default)]
    refreshed_at: Option<String>,
}

pub struct CollectionService {
    path: PathBuf,
    value: Mutex<CollectionFile>,
}

impl CollectionService {
    pub fn new(app_data_dir: &Path) -> CommandResult<Self> {
        fs::create_dir_all(app_data_dir)?;
        let path = app_data_dir.join("collections.json");
        let value = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Ok(Self {
            path,
            value: Mutex::new(value),
        })
    }

    fn update<R>(
        &self,
        action: impl FnOnce(&mut CollectionFile) -> CommandResult<R>,
    ) -> CommandResult<R> {
        let mut file = self
            .value
            .lock()
            .map_err(|_| CommandError::new("COLLECTION_STATE_ERROR", "收藏夹状态不可用"))?;
        let result = action(&mut file)?;
        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, serde_json::to_vec_pretty(&*file)?)?;
        atomic_replace(&temporary, &self.path)?;
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
        resolved: true,
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

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> CommandResult<CollectionSnapshot> {
    state.collections.snapshot(source_statuses(&state))
}

fn refresh_stable_collections(
    path: PathBuf,
    collections: std::sync::Arc<CollectionService>,
    local_analysis: std::sync::Arc<crate::local_analysis::LocalAnalysisService>,
) -> CommandResult<()> {
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
            let entries = item
                .checksums
                .into_iter()
                .map(|checksum| {
                    let local = resolved.get(&checksum.to_ascii_lowercase());
                    CollectionEntry {
                        id: Uuid::new_v4().to_string(),
                        checksum: Some(checksum),
                        beatmap_id: local.and_then(|map| map.beatmap_id),
                        beatmapset_id: local.and_then(|map| map.beatmap_set_id),
                        ruleset: local.map(|map| map.ruleset.to_string()),
                        difficulty_name: local
                            .map(|map| map.difficulty_name.clone())
                            .unwrap_or_else(|| "未解析难度".into()),
                        title: local
                            .map(|map| map.title_unicode.clone())
                            .unwrap_or_else(|| "未解析谱面".into()),
                        artist: local
                            .map(|map| map.artist_unicode.clone())
                            .unwrap_or_default(),
                        creator: local.map(|map| map.creator.clone()).unwrap_or_default(),
                        resolved: local.is_some(),
                    }
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

#[tauri::command]
pub fn create_collection(
    name: String,
    creator: String,
    state: State<'_, AppState>,
) -> CommandResult<CollectionFolder> {
    state.collections.create(&name, &creator)
}
#[tauri::command]
pub fn rename_collection(
    folder_id: String,
    name: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.collections.rename(&folder_id, &name)
}
#[tauri::command]
pub fn delete_collection(folder_id: String, state: State<'_, AppState>) -> CommandResult<()> {
    state.collections.delete(&folder_id)
}
#[tauri::command]
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
#[tauri::command]
pub fn remove_collection_entry(
    folder_id: String,
    entry_id: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.collections.remove_entry(&folder_id, &entry_id)
}

#[tauri::command]
pub fn write_stable_collections(
    state: State<'_, AppState>,
) -> CommandResult<CollectionWriteResult> {
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
    let entries = payload
        .entries
        .into_iter()
        .map(|mut entry| {
            entry.resolved = entry.checksum.as_deref().is_some_and(|checksum| {
                [LocalClient::Stable, LocalClient::Lazer]
                    .into_iter()
                    .any(|client| {
                        state
                            .local_analysis
                            .find_beatmap_by_md5(client, checksum)
                            .ok()
                            .flatten()
                            .is_some()
                    })
            });
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

#[tauri::command]
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

#[tauri::command]
pub fn preview_collection_share(
    code: String,
    state: State<'_, AppState>,
) -> CommandResult<CollectionSharePreview> {
    Ok(preview_payload(decode_share(&code)?, &state))
}

#[tauri::command]
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
pub fn get_collection_download_items(
    folder_id: String,
    state: State<'_, AppState>,
) -> CommandResult<Vec<CollectionDownloadItem>> {
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
    let mut seen = HashSet::new();
    Ok(folder
        .entries
        .iter()
        .filter_map(|entry| {
            entry
                .beatmapset_id
                // Entries with a checksum are already local. Online entries and
                // compact share-code entries deliberately have no checksum yet.
                .filter(|_| entry.checksum.as_deref().is_none_or(str::is_empty))
                .filter(|id| seen.insert(*id))
                .map(|beatmapset_id| CollectionDownloadItem {
                    beatmapset_id,
                    artist: entry.artist.clone(),
                    title: entry.title.clone(),
                })
        })
        .collect())
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
}
