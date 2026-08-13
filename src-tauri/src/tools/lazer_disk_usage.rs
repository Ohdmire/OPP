//! osu!lazer 数据目录占用统计：区分含硬链接的总大小与排除硬链接后的实际占用。

use std::path::Path;

use rayon::prelude::*;
use serde::Serialize;
use walkdir::WalkDir;

use crate::{
    error::{CommandError, CommandResult},
    platform,
};

#[derive(Debug, Clone, Serialize)]
pub struct LazerDiskUsage {
    pub path: String,
    pub total_size: u64,
    pub unique_size: u64,
    pub file_count: u64,
}

#[tauri::command]
pub async fn get_lazer_disk_usage() -> CommandResult<LazerDiskUsage> {
    let root = platform::lazer_files_root()
        .ok_or_else(|| CommandError::new("LAZER_NOT_FOUND", "未找到 osu!lazer 数据目录"))?;
    let path = root.display().to_string();
    let (total_size, unique_size, file_count) =
        tokio::task::spawn_blocking(move || compute_size(&root))
            .await
            .map_err(|join| CommandError::new("LAZER_SCAN_FAILED", join.to_string()))?;
    Ok(LazerDiskUsage {
        path,
        total_size,
        unique_size,
        file_count,
    })
}

fn compute_size(root: &Path) -> (u64, u64, u64) {
    let files: Vec<(Option<(u64, u64)>, u64)> = WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .collect::<Vec<_>>()
        .par_iter()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let size = std::fs::metadata(path).ok()?.len();
            Some((file_identity(path), size))
        })
        .collect();
    let total_size: u64 = files.iter().map(|(_, size)| size).sum();
    let file_count = files.len() as u64;
    let mut seen = std::collections::HashSet::new();
    let mut unique_size: u64 = 0;
    for (identity, size) in &files {
        // 同一文件的多个硬链接入口只在实际占用里计一次。
        if identity.map_or(true, |id| seen.insert(id)) {
            unique_size += size;
        }
    }
    (total_size, unique_size, file_count)
}

/// 文件唯一标识，用于硬链接去重。Windows 用卷序列号 + 文件索引；类 Unix 用
/// 设备号 + inode。无法获取时返回 None（按普通文件计入实际占用）。
#[cfg(windows)]
fn file_identity(path: &Path) -> Option<(u64, u64)> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_READ,
        FILE_SHARE_WRITE, GetFileInformationByHandle, OPEN_EXISTING,
    };

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    unsafe {
        let handle = CreateFileW(
            wide.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            0,
        );
        if handle == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut info: BY_HANDLE_FILE_INFORMATION = std::mem::zeroed();
        let ok = GetFileInformationByHandle(handle, &mut info);
        CloseHandle(handle);
        if ok == 0 {
            return None;
        }
        let volume = info.dwVolumeSerialNumber as u64;
        let index = ((info.nFileIndexHigh as u64) << 32) | (info.nFileIndexLow as u64);
        Some((volume, index))
    }
}

#[cfg(not(windows))]
fn file_identity(path: &Path) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    let metadata = std::fs::metadata(path).ok()?;
    Some((metadata.dev(), metadata.ino()))
}
