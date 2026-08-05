//! A small, UI-independent launcher for NetEase Cloud Music playback.
//!
//! NetEase song detail pages expose a numeric song ID. The desktop client accepts that ID
//! through its `orpheus://song/<id>/?autoplay=1` deep link. This crate resolves a song ID,
//! builds that detail-page deep link, and gives it to Windows Shell without spawning a
//! command prompt.

use serde::Deserialize;
use thiserror::Error;

const MAX_QUERY_LENGTH: usize = 512;
const SEARCH_ENDPOINT: &str = "https://music.163.com/api/search/get/web";

#[derive(Debug, Error)]
pub enum NeteaseError {
    #[error("the search query is empty")]
    EmptyQuery,
    #[error("the search query is too long")]
    QueryTooLong,
    #[error("NetEase Cloud Music playback is only supported on Windows")]
    UnsupportedPlatform,
    #[error("NetEase Cloud Music could not find a matching song")]
    SongNotFound,
    #[error("NetEase Cloud Music search request failed: {0}")]
    SearchRequest(#[from] reqwest::Error),
    #[error("Windows could not find the NetEase Cloud Music client")]
    ClientNotAvailable,
    #[error(
        "Windows could not send the playback command to NetEase Cloud Music (ShellExecute error {0})"
    )]
    ShellExecuteFailed(isize),
}

fn query_terms(artist: &str, title: &str) -> Result<String, NeteaseError> {
    let query = [artist.trim(), title.trim()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if query.is_empty() {
        return Err(NeteaseError::EmptyQuery);
    }
    if query.chars().count() > MAX_QUERY_LENGTH {
        return Err(NeteaseError::QueryTooLong);
    }
    Ok(query)
}

#[derive(Deserialize)]
struct SearchResponse {
    result: Option<SearchResult>,
}

#[derive(Deserialize)]
struct SearchResult {
    #[serde(default)]
    songs: Vec<SearchSong>,
}

#[derive(Deserialize)]
struct SearchSong {
    id: u64,
}

/// Builds the NetEase song-detail deep link and asks the client to start playback.
pub fn playback_url(song_id: u64) -> String {
    format!("orpheus://song/{song_id}/?autoplay=1")
}

async fn search_song_id(query: &str) -> Result<u64, NeteaseError> {
    let response = reqwest::Client::new()
        .get(SEARCH_ENDPOINT)
        .header("Referer", "https://music.163.com/")
        .query(&[
            ("s", query),
            ("type", "1"),
            ("offset", "0"),
            ("limit", "1"),
            ("total", "true"),
        ])
        .send()
        .await?
        .error_for_status()?
        .json::<SearchResponse>()
        .await?;

    response
        .result
        .and_then(|result| result.songs.into_iter().next())
        .map(|song| song.id)
        .ok_or(NeteaseError::SongNotFound)
}

/// Looks up the song and asks Windows Shell to open its autoplay detail link in the client.
pub async fn search_and_play(artist: &str, title: &str) -> Result<(), NeteaseError> {
    let query = query_terms(artist, title)?;
    let song_id = search_song_id(&query).await?;
    open_playback_command(song_id)
}

/// Sends the `orpheus://` song-detail link to the registered Windows client.
///
/// The Windows shell resolves the client directly. No shell process is launched, so this call
/// does not show a terminal window.
#[cfg(windows)]
fn open_playback_command(song_id: u64) -> Result<(), NeteaseError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;

    let url = playback_url(song_id);
    let wide_url = std::ffi::OsStr::new(&url)
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            std::ptr::null(),
            wide_url.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    } as isize;

    if result > 32 {
        Ok(())
    } else if result == 31 {
        Err(NeteaseError::ClientNotAvailable)
    } else {
        Err(NeteaseError::ShellExecuteFailed(result))
    }
}

#[cfg(not(windows))]
fn open_playback_command(_song_id: u64) -> Result<(), NeteaseError> {
    Err(NeteaseError::UnsupportedPlatform)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_song_detail_autoplay_deep_link() {
        assert_eq!(
            playback_url(2034742057),
            "orpheus://song/2034742057/?autoplay=1"
        );
    }

    #[test]
    fn rejects_blank_queries() {
        assert!(matches!(
            query_terms("  ", ""),
            Err(NeteaseError::EmptyQuery)
        ));
    }
}
