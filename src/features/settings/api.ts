import { useQuery } from "@tanstack/react-query";
import { desktopApi, isTauri } from "../../shared/lib/tauri";

export const settingsQueryKey = ["settings"] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => isTauri() ? desktopApi.getSettings() : Promise.resolve({
      reduce_motion: false,
      similarity_index_directory: null,
      beatmap_download_directory: null,
      replay_export_directory: null,
      tosu_executable_path: null,
      tosu_api_base_url: "http://127.0.0.1:24050",
      launch_tosu_with_game: false,
      tosu_lyrics_executable_path: null,
      launch_tosu_lyrics_with_tosu: true,
      theme_primary: "cyan" as const,
      theme_secondary: "pink" as const,
      theme_mode: "dark" as const,
      launch_tosu_on_game_detect: false,
      game_session_analysis_on_detect: true,
    }),
    staleTime: Infinity,
    retry: false,
  });
}
