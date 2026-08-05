use netease_cloud_music::{NeteaseError, search_and_play};

use crate::error::{CommandError, CommandResult};

fn command_error(error: NeteaseError) -> CommandError {
    match error {
        NeteaseError::EmptyQuery => CommandError::new(
            "NETEASE_EMPTY_QUERY",
            "Song title and artist cannot both be empty.",
        ),
        NeteaseError::QueryTooLong => CommandError::new(
            "NETEASE_QUERY_TOO_LONG",
            "The NetEase search query is too long.",
        ),
        NeteaseError::UnsupportedPlatform => CommandError::new(
            "NETEASE_UNSUPPORTED_PLATFORM",
            "NetEase Cloud Music playback is only supported on Windows.",
        ),
        NeteaseError::SongNotFound => CommandError::new(
            "NETEASE_SONG_NOT_FOUND",
            "No matching song was found on NetEase Cloud Music.",
        ),
        NeteaseError::SearchRequest(error) => CommandError::new(
            "NETEASE_SEARCH_FAILED",
            format!("Could not search NetEase Cloud Music: {error}"),
        ),
        NeteaseError::ClientNotAvailable => CommandError::new(
            "NETEASE_CLIENT_UNAVAILABLE",
            "NetEase Cloud Music is not installed or its URL protocol is unavailable.",
        ),
        NeteaseError::ShellExecuteFailed(code) => CommandError::new(
            "NETEASE_OPEN_FAILED",
            format!("Windows could not send the NetEase playback command (error {code})."),
        ),
    }
}

/// Resolves a song then opens its NetEase song-detail deep link with autoplay enabled.
/// The standalone launcher uses ShellExecuteW directly, so no command prompt is shown.
#[tauri::command]
pub async fn open_netease_music_search(artist: String, title: String) -> CommandResult<()> {
    search_and_play(&artist, &title)
        .await
        .map_err(command_error)
}
