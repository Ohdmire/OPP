mod account;
mod error;
mod game_session;
mod local_analysis;
mod models;
mod online_beatmaps;
mod osu_api;
mod pp_calc;
mod replay_render;
mod similarity;
mod state;
mod storage;
mod tools;
mod tosu;

use account::{
    begin_oauth_login, cancel_oauth_login, clear_profile_cache, disconnect_osu,
    export_replay_video, get_auth_status, get_best_scores, get_own_profile, get_settings,
    save_oauth_credentials, update_settings,
};
use game_session::{
    get_game_session_status, get_game_status, inspect_game_replay, list_game_media,
    open_media_in_explorer, read_game_replay, read_game_screenshot, start_detected_game_session,
    start_game_monitor, start_game_session,
};
use local_analysis::{
    cancel_local_scan, get_local_beatmap_background, get_local_beatmap_detail,
    get_local_beatmap_path, get_local_skin_asset, get_local_skin_detail, get_local_skin_preview,
    get_local_sources, get_local_summary, query_local_beatmap_sets, query_local_beatmaps,
    query_local_skins, replace_local_skin_asset, reset_local_source, scan_local_source,
    set_local_source,
};
use online_beatmaps::{
    cancel_online_beatmap_download, collect_online_beatmapsets, download_online_beatmapsets,
    get_online_beatmap, get_online_beatmap_provider_status, get_online_beatmapset,
    search_online_beatmapsets,
};
use pp_calc::calculate_beatmap_pp;
use replay_render::submit_replay_render;
use similarity::{configure_similarity_index, get_similarity_index_status, query_similar_beatmaps};
use state::AppState;
use tauri::{
    Manager,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tools::{
    convert_mania_beatmaps, get_default_file_clients, open_local_resource_in_explorer,
    set_default_file_client,
};
use tosu::{
    get_tosu_logs, get_tosu_status, set_tosu_executable, set_tosu_lyrics_executable, start_tosu,
    stop_tosu,
};

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(AppState::new(&app_data_dir)?);
            let state = app.state::<AppState>();
            start_game_monitor(
                state.local_analysis.clone(),
                state.game_monitor.clone(),
                app.handle().clone(),
            );
            let icon = app
                .default_window_icon()
                .expect("application bundle must include an icon")
                .clone();
            TrayIconBuilder::with_id("opp-tray")
                .icon(icon)
                .tooltip("OPP")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                        && let Some(window) = tray.app_handle().get_webview_window("main")
                    {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })
                .build(app)?;
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
            get_similarity_index_status,
            configure_similarity_index,
            query_similar_beatmaps,
            start_game_session,
            start_detected_game_session,
            get_game_status,
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
            get_local_beatmap_path,
            get_local_beatmap_background,
            query_local_skins,
            get_local_skin_detail,
            get_local_skin_preview,
            get_local_skin_asset,
            replace_local_skin_asset,
            open_local_resource_in_explorer,
            get_default_file_clients,
            set_default_file_client,
            convert_mania_beatmaps,
            get_tosu_status,
            get_tosu_logs,
            set_tosu_executable,
            set_tosu_lyrics_executable,
            start_tosu,
            stop_tosu,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run OPP");
}
