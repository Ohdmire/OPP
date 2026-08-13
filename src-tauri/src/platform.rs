//! 平台抽象层：把所有操作系统差异（OS 标识、注册表访问、各平台默认路径、
//! 能力表）集中收口于此。业务模块面向这里的函数与 [`Capabilities`]，不再
//! 各自散写 `#[cfg(...)]` 判断。

use std::env;
use std::fs;
use std::io::{self, BufRead};
use std::path::{Path, PathBuf};

use serde::Serialize;

/// 当前操作系统（编译期常量）。目前仅适配 `"windows"` 与 `"linux"`。
pub fn current_os() -> &'static str {
    env::consts::OS
}

/// 用户主目录。
pub fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// 用户数据目录。Windows 为 `%LOCALAPPDATA%`；类 Unix 为 `XDG_DATA_HOME`，回退
/// 到 `~/.local/share`。
pub fn data_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        env::var_os("LOCALAPPDATA").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| home_dir().map(|home| home.join(".local").join("share")))
    }
}

/// 默认下载目录（`~/Downloads`）。
pub fn default_download_dir() -> Option<PathBuf> {
    home_dir().map(|home| home.join("Downloads"))
}

/// osu!stable 自动检测候选目录
pub fn stable_install_candidates() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let mut candidates = Vec::new();
        if let Some(install) = registry_install(|name| name.eq_ignore_ascii_case("osu!")) {
            candidates.push(install);
        }
        if let Some(local) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            candidates.push(local.join("osu!"));
        }
        candidates
    }
    #[cfg(not(windows))]
    {
        data_dir()
            .into_iter()
            .map(|data| data.join("osu-wine"))
            .collect()
    }
}

/// osu!lazer 安装候选目录
pub fn lazer_install_candidates() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let mut candidates = Vec::new();
        if let Some(install) = registry_install(|name| {
            let name = name.to_ascii_lowercase();
            name.contains("osu!") && (name.contains("lazer") || name == "osu!")
        }) {
            candidates.push(install);
        }
        if let Some(local) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            for name in ["osu", "osu!", "osulazer"] {
                candidates.push(local.join(name));
            }
        }
        candidates
    }
    #[cfg(not(windows))]
    {
        data_dir()
            .into_iter()
            .map(|data| data.join("osu"))
            .collect()
    }
}

/// osu!lazer 数据根（含 `client.realm` 与 `storage.ini`）。Windows 为
/// `%APPDATA%/osu`，类 Unix 为 `~/.local/share/osu`。
pub fn lazer_data_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|appdata| appdata.join("osu"))
    }
    #[cfg(not(windows))]
    {
        data_dir().map(|data| data.join("osu"))
    }
}

/// 读取 lazer `storage.ini` 中的 `FullPath`（用户自定义的数据目录）。
fn read_storage_ini_fullpath(storage_ini: &Path) -> Option<PathBuf> {
    let reader = io::BufReader::new(fs::File::open(storage_ini).ok()?);
    for line in reader.lines().flatten() {
        if let Some(value) = line
            .strip_prefix("FullPath")
            .and_then(|rest| rest.split('=').nth(1))
        {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(PathBuf::from(trimmed));
            }
        }
    }
    None
}

/// osu!lazer 的文件存储根：优先取 `storage.ini` 的 `FullPath`，否则回退到数据根。
pub fn lazer_files_root() -> Option<PathBuf> {
    let data_root = lazer_data_root()?;
    read_storage_ini_fullpath(&data_root.join("storage.ini")).or(Some(data_root))
}

/// Linux 上启动/识别 osu! 客户端用的系统命令名（stable → `osu-wine`，lazer →
/// `osu-lazer`）。Windows 返回 `None`（由调用方使用安装目录内的可执行文件）。
pub fn game_command(client: &str) -> Option<&'static str> {
    #[cfg(not(windows))]
    {
        match client {
            "stable" => Some("osu-wine"),
            "lazer" => Some("osu-lazer"),
            _ => None,
        }
    }
    #[cfg(windows)]
    {
        let _ = client;
        None
    }
}

/// Linux 上所有受支持的游戏命令名，用于进程扫描；Windows 返回空切片。
pub fn game_commands() -> &'static [&'static str] {
    #[cfg(not(windows))]
    {
        &["osu-wine", "osu-lazer"]
    }
    #[cfg(windows)]
    {
        &[]
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Capabilities {
    /// 当前操作系统。
    pub os: &'static str,
    /// 显示器伽马调节（依赖 Windows GDI）。
    pub display_gamma: bool,
    /// `.osz` / `.osk` 文件关联（依赖 Windows 注册表）。
    pub file_association: bool,
}

pub fn capabilities() -> Capabilities {
    Capabilities {
        os: current_os(),
        display_gamma: cfg!(windows),
        file_association: cfg!(windows),
    }
}

#[tauri::command]
pub fn get_capabilities() -> Capabilities {
    capabilities()
}

// ---- Windows 注册表探测 ------

#[cfg(windows)]
fn registry_install(matches_name: impl Fn(&str) -> bool) -> Option<PathBuf> {
    use winreg::{
        RegKey,
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    };

    const KEYS: [&str; 2] = [
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let hive = RegKey::predef(hive);
        for key_name in KEYS {
            let Ok(uninstall) = hive.open_subkey(key_name) else {
                continue;
            };
            for subkey_name in uninstall.enum_keys().flatten() {
                let Ok(subkey) = uninstall.open_subkey(subkey_name) else {
                    continue;
                };
                let Ok(display_name) = subkey.get_value::<String, _>("DisplayName") else {
                    continue;
                };
                if !matches_name(&display_name) {
                    continue;
                }
                if let Ok(path) = subkey.get_value::<String, _>("InstallLocation")
                    && !path.trim().is_empty()
                {
                    return Some(PathBuf::from(path.trim().trim_matches('"')));
                }
            }
        }
    }
    None
}
