use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn is_danser_executable(path: &Path) -> bool {
    path.is_file()
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("danser-cli.exe"))
}

fn path_command(name: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe").arg(name).output().ok()?;
    output.status.success().then(|| {
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(PathBuf::from)
    })?
}

pub(super) fn find_danser(saved: Option<&str>) -> Option<PathBuf> {
    saved
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| is_danser_executable(path))
}

pub(super) fn list_profiles_for(executable: &Path) -> Vec<String> {
    let Some(root) = executable.parent() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(root.join("settings")) else {
        return Vec::new();
    };
    let mut profiles: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_json = path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("json"));
            if !is_json
                || serde_json::from_slice::<serde_json::Value>(&fs::read(&path).ok()?).is_err()
            {
                return None;
            }
            path.file_stem()?.to_str().map(str::to_string)
        })
        .collect();
    profiles.sort_by_key(|value| value.to_ascii_lowercase());
    profiles
}

pub(super) fn ffmpeg_available(executable: &Path) -> bool {
    executable.parent().is_some_and(|root| {
        root.join("ffmpeg.exe").is_file() || root.join("ffmpeg").join("ffmpeg.exe").is_file()
    }) || path_command("ffmpeg.exe").is_some()
}
