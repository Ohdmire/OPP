mod account;
mod error;
mod game_session;
mod local_analysis;
mod models;
mod online_beatmaps;
mod osu_api;
mod pp_calc;
mod replay_render;
mod state;
mod storage;
mod tools;

use account::{
    begin_oauth_login, cancel_oauth_login, clear_profile_cache, disconnect_osu,
    export_replay_video, get_auth_status, get_best_scores, get_own_profile, get_settings,
    save_oauth_credentials, update_settings,
};
use game_session::{
    get_game_session_status, inspect_game_replay, list_game_media, open_media_in_explorer,
    read_game_replay, read_game_screenshot, start_game_session,
};
use local_analysis::{
    cancel_local_scan, get_local_beatmap_background, get_local_beatmap_detail,
    get_local_skin_asset, get_local_skin_detail, get_local_skin_preview, get_local_sources,
    get_local_summary, query_local_beatmap_sets, query_local_beatmaps, query_local_skins,
    reset_local_source, scan_local_source, set_local_source,
};
use online_beatmaps::{
    cancel_online_beatmap_download, collect_online_beatmapsets, download_online_beatmapsets,
    get_online_beatmap, get_online_beatmap_provider_status, get_online_beatmapset,
    search_online_beatmapsets,
};
use pp_calc::calculate_beatmap_pp;
use replay_render::submit_replay_render;
use state::AppState;
use tauri::Manager;
use tools::{get_default_file_clients, open_local_resource_in_explorer, set_default_file_client};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(AppState::new(&app_data_dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_auth_status,
            save_oauth_credentials,
            begin_oauth_login,
            cancel_oauth_login,
            disconnect_osu,
            get_own_profile,
            get_best_scores,
            search_online_beatmapsets,
            collect_online_beatmapsets,
            get_online_beatmapset,
            get_online_beatmap,
            get_online_beatmap_provider_status,
            calculate_beatmap_pp,
            submit_replay_render,
            start_game_session,
            get_game_session_status,
            list_game_media,
            read_game_replay,
            inspect_game_replay,
            read_game_screenshot,
            open_media_in_explorer,
            download_online_beatmapsets,
            cancel_online_beatmap_download,
            clear_profile_cache,
            get_settings,
            update_settings,
            export_replay_video,
            get_local_sources,
            set_local_source,
            reset_local_source,
            get_local_summary,
            scan_local_source,
            cancel_local_scan,
            query_local_beatmaps,
            query_local_beatmap_sets,
            get_local_beatmap_detail,
            get_local_beatmap_background,
            query_local_skins,
            get_local_skin_detail,
            get_local_skin_preview,
            get_local_skin_asset,
            open_local_resource_in_explorer,
            get_default_file_clients,
            set_default_file_client,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run OPP");
}
