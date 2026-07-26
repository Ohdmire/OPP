//! Internal index data and persistence for local analysis.
//!
//! Keeping the on-disk schema here makes cache compatibility explicit and keeps
//! the service focused on orchestration rather than serialization details.

use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::error::CommandResult;

use super::super::{
    models::{
        LocalBeatmapDetail, LocalBeatmapSummary, LocalClient, LocalLibrarySummary,
        LocalSkinAssetSummary, LocalSkinDetail, ScanDiagnostic,
    },
    parser::DIFFICULTY_ALGORITHM,
};

/// Bump this only when a serialized [`LocalIndex`] can no longer be read safely.
pub(super) const INDEX_SCHEMA: u32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct FileStamp {
    pub(super) bytes: u64,
    pub(super) modified_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) enum IndexedData {
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
pub(super) struct IndexedEntry {
    pub(super) key: String,
    pub(super) physical_path: PathBuf,
    pub(super) stamp: FileStamp,
    pub(super) content_hash: Option<String>,
    pub(super) data: IndexedData,
    pub(super) diagnostics: Vec<ScanDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct LocalIndex {
    pub(super) schema: u32,
    pub(super) difficulty_algorithm: String,
    pub(super) source_root: String,
    pub(super) summary: LocalLibrarySummary,
    pub(super) diagnostics: Vec<ScanDiagnostic>,
    pub(super) entries: Vec<IndexedEntry>,
}

#[derive(Debug, Clone)]
pub(super) enum CandidateKind {
    Beatmap,
    Skin { root: PathBuf },
    Unknown,
}

#[derive(Debug, Clone)]
pub(super) struct Candidate {
    pub(super) key: String,
    pub(super) physical_path: PathBuf,
    pub(super) logical_path: String,
    pub(super) known_hash: Option<String>,
    pub(super) stamp: FileStamp,
    pub(super) kind: CandidateKind,
}

#[derive(Debug, Clone)]
pub(super) struct SkinAssetLocation {
    pub(super) skin_resource_id: String,
    pub(super) root: PathBuf,
    pub(super) summary: LocalSkinAssetSummary,
}

pub(super) fn stamp(metadata: &fs::Metadata) -> FileStamp {
    FileStamp {
        bytes: metadata.len(),
        modified_ms: metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_millis()),
    }
}

pub(super) fn directory_stamp(root: &Path) -> FileStamp {
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

pub(super) fn modified_iso(path: &Path) -> Option<String> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(modified).to_rfc3339())
}

pub(super) fn index_path(cache_dir: &Path, client: LocalClient) -> PathBuf {
    cache_dir.join(format!("{client}-index.json"))
}

/// Loads the primary cache first, then its last-known-good backup.
/// Incompatible or corrupted indexes are deliberately treated as cache misses.
pub(super) fn load_index(cache_dir: &Path, client: LocalClient) -> Option<LocalIndex> {
    let target = index_path(cache_dir, client);
    let backup = cache_dir.join(format!("{client}-index.json.bak"));
    [target, backup].into_iter().find_map(|path| {
        let bytes = fs::read(path).ok()?;
        let index: LocalIndex = serde_json::from_slice(&bytes).ok()?;
        (index.schema == INDEX_SCHEMA && index.difficulty_algorithm == DIFFICULTY_ALGORITHM)
            .then_some(index)
    })
}

/// Uses a replace-with-backup flow so an interrupted write keeps one valid cache.
pub(super) fn persist_index(
    cache_dir: &Path,
    client: LocalClient,
    index: &LocalIndex,
) -> CommandResult<()> {
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
