use std::path::Path;

use super::models::BeatmapDownloadItem;
use super::tools::sanitize_filename;

use crate::{
    error::{CommandError, CommandResult},
    state::AppState,
};

pub fn download_file_name(item: &BeatmapDownloadItem, suggested: Option<&str>) -> String {
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

/// Downloads a beatmapset through the selected mirror, then tries the other registered mirrors.
/// Hinai itself implements a multi-source cascade; the remaining attempts are an additional OPP
/// fallback if that public endpoint is unavailable.
pub async fn download_with_adapters(
    state: &AppState,
    beatmapset_id: u64,
    provider: &str,
) -> CommandResult<super::providers::ProviderBytes> {
    let adapters = match provider {
        "hinai" => ["hinai", "catboy", "nerinyan"],
        "catboy" => ["catboy", "hinai", "nerinyan"],
        "nerinyan" => ["nerinyan", "hinai", "catboy"],
        _ => {
            return Err(CommandError::new(
                "DOWNLOAD_ADAPTER_DISABLED",
                "No download mirror is selected.",
            ));
        }
    };

    let mut failures = Vec::new();
    for adapter in adapters {
        match download_from_provider(state, beatmapset_id, adapter).await {
            Ok(download) => return Ok(download),
            Err(error) => failures.push(format!("{adapter}: {}", error.message)),
        }
    }
    Err(CommandError::new(
        "BEATMAP_DOWNLOAD_FAILED",
        failures.join("; "),
    ))
}

async fn download_from_provider(
    state: &AppState,
    beatmapset_id: u64,
    provider: &str,
) -> CommandResult<super::providers::ProviderBytes> {
    match provider {
        "hinai" => state.providers.hinai_osz(beatmapset_id).await,
        "catboy" => state.providers.catboy_osz(beatmapset_id).await,
        "nerinyan" => state.providers.nerinyan_osz(beatmapset_id).await,
        _ => unreachable!("download adapter list only contains registered providers"),
    }
}

#[cfg(test)]
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
