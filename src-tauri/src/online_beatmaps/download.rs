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

pub async fn download_with_adapters(
    state: &AppState,
    beatmapset_id: u64,
    provider: &str,
) -> CommandResult<super::providers::ProviderBytes> {
    let result = match provider {
        "nerinyan" => match state.providers.nerinyan_osz(beatmapset_id).await {
            Ok(download) => Ok(download),
            Err(first) => state
                .providers
                .catboy_osz(beatmapset_id)
                .await
                .map_err(|second| (first, second)),
        },
        "catboy" => match state.providers.catboy_osz(beatmapset_id).await {
            Ok(download) => Ok(download),
            Err(first) => state
                .providers
                .nerinyan_osz(beatmapset_id)
                .await
                .map_err(|second| (first, second)),
        },
        _ => {
            return Err(CommandError::new(
                "DOWNLOAD_ADAPTER_DISABLED",
                "未启用镜像下载适配器，请先选择 Catboy 或 Nerinyan",
            ));
        }
    };
    result.map_err(|(first, second)| {
        CommandError::new(
            "BEATMAP_DOWNLOAD_FAILED",
            format!(
                "{}: {}; {}: {}",
                provider,
                first.message,
                if provider == "catboy" {
                    "nerinyan"
                } else {
                    "catboy"
                },
                second.message
            ),
        )
    })
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
