import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AppSettings,
  AuthStatus,
  BeatmapDownloadProgress,
  BeatmapDownloadRequest,
  BeatmapDownloadResult,
  BeatmapCalculationRequest,
  BeatmapCalculationResult,
  BeatmapSourceStatus,
  Cached,
  CollectedBeatmapsets,
  CommandError,
  DisconnectResult,
  BeatmapQuery,
  LocalBeatmapDetail,
  LocalBeatmapSetSummary,
  LocalBeatmapSummary,
  LocalLibrarySummary,
  LocalScanProgress,
  LocalSkinAssetPayload,
  LocalSkinDetail,
  LocalSkinPreview,
  LocalSkinSummary,
  GameMediaItem,
  GameReplayPayload,
  GameSessionSummary,
  GameScreenshotPayload,
  DefaultFileClients,
  LocalSourceStatus,
  OAuthResult,
  OnlineBeatmapSearchQuery,
  OnlineBeatmapSearchResponse,
  OnlineBeatmapset,
  OsuClient,
  OwnProfile,
  Page,
  PendingOAuth,
  Ruleset,
  Score,
  SkinQuery,
} from "../types/osu";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

function normalizeError(error: unknown): CommandError {
  if (typeof error === "object" && error && "code" in error && "message" in error) {
    return error as CommandError;
  }
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error);
      if (parsed?.code && parsed?.message) return parsed;
    } catch {
      return { code: "UNKNOWN_ERROR", message: error };
    }
    return { code: "UNKNOWN_ERROR", message: error };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "发生未知错误",
  };
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw {
      code: "TAURI_REQUIRED",
      message: "请通过 OPP 桌面应用运行此功能",
    } satisfies CommandError;
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

export const desktopApi = {
  getAuthStatus: () => call<AuthStatus>("get_auth_status"),
  saveOAuthCredentials: (clientId: string, clientSecret: string) =>
    call<{ client_id: string; callback_url: string }>(
      "save_oauth_credentials",
      { clientId, clientSecret },
    ),
  beginOAuthLogin: () => call<PendingOAuth>("begin_oauth_login"),
  cancelOAuthLogin: () => call<void>("cancel_oauth_login"),
  disconnectOsu: (revoke = true) =>
    call<DisconnectResult>("disconnect_osu", { revoke }),
  getOwnProfile: (ruleset: Ruleset, forceRefresh = false) =>
    call<Cached<OwnProfile>>("get_own_profile", {
      ruleset,
      forceRefresh,
    }),
  getBestScores: (ruleset: Ruleset, forceRefresh = false) =>
    call<Cached<Score[]>>("get_best_scores", {
      ruleset,
      forceRefresh,
    }),
  searchOnlineBeatmapsets: (query: OnlineBeatmapSearchQuery) =>
    call<OnlineBeatmapSearchResponse>("search_online_beatmapsets", { query }),
  collectOnlineBeatmapsets: (
    query: OnlineBeatmapSearchQuery,
    limit: number,
  ) =>
    call<CollectedBeatmapsets>("collect_online_beatmapsets", { query, limit }),
  getOnlineBeatmapset: (beatmapsetId: number) =>
    call<OnlineBeatmapset>("get_online_beatmapset", { beatmapsetId }),
  getOnlineBeatmap: (beatmapId: number) =>
    call<Record<string, unknown>>("get_online_beatmap", { beatmapId }),
  getOnlineBeatmapProviderStatus: () =>
    call<BeatmapSourceStatus[]>("get_online_beatmap_provider_status"),
  calculateBeatmapPp: (request: BeatmapCalculationRequest) =>
    call<BeatmapCalculationResult>("calculate_beatmap_pp", { request }),
  downloadOnlineBeatmapsets: (request: BeatmapDownloadRequest) =>
    call<BeatmapDownloadResult>("download_online_beatmapsets", { request }),
  cancelOnlineBeatmapDownload: () =>
    call<void>("cancel_online_beatmap_download"),
  clearProfileCache: () => call<void>("clear_profile_cache"),
  getSettings: () => call<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    call<AppSettings>("update_settings", { settings }),
  startGameSession: (ruleset: Ruleset, client: OsuClient) =>
    call<GameSessionSummary>("start_game_session", { ruleset, client }),
  getGameSessionStatus: () =>
    call<GameSessionSummary | null>("get_game_session_status"),
  listGameMedia: (client: OsuClient) => call<GameMediaItem[]>("list_game_media", { client }),
  readGameReplay: (client: OsuClient, path: string) =>
    call<GameReplayPayload>("read_game_replay", { client, path }),
  readGameScreenshot: (client: OsuClient, path: string) =>
    call<GameScreenshotPayload>("read_game_screenshot", { client, path }),
  openMediaInExplorer: (client: OsuClient, path: string) =>
    call<void>("open_media_in_explorer", { client, path }),
  openLocalResourceInExplorer: (client: OsuClient, logicalPath: string) =>
    call<void>("open_local_resource_in_explorer", { client, logicalPath }),
  getDefaultFileClients: () => call<DefaultFileClients>("get_default_file_clients"),
  setDefaultFileClient: (kind: "beatmap" | "skin", client: OsuClient) =>
    call<void>("set_default_file_client", { kind, client }),
  getLocalSources: () =>
    call<LocalSourceStatus[]>("get_local_sources"),
  setLocalSource: (client: OsuClient, path: string) =>
    call<LocalSourceStatus>("set_local_source", { client, path }),
  resetLocalSource: (client: OsuClient) =>
    call<LocalSourceStatus>("reset_local_source", { client }),
  getLocalSummary: (client: OsuClient) =>
    call<LocalLibrarySummary | null>("get_local_summary", { client }),
  scanLocalSource: (client: OsuClient, force = false) =>
    call<LocalLibrarySummary>("scan_local_source", { client, force }),
  cancelLocalScan: (client: OsuClient) =>
    call<void>("cancel_local_scan", { client }),
  queryLocalBeatmaps: (query: BeatmapQuery) =>
    call<Page<LocalBeatmapSummary>>("query_local_beatmaps", { query }),
  queryLocalBeatmapSets: (query: BeatmapQuery) =>
    call<Page<LocalBeatmapSetSummary>>("query_local_beatmap_sets", { query }),
  getLocalBeatmapDetail: (client: OsuClient, resourceId: string) =>
    call<LocalBeatmapDetail>("get_local_beatmap_detail", {
      client,
      resourceId,
    }),
  getLocalBeatmapBackground: (client: OsuClient, resourceId: string) =>
    call<string | null>("get_local_beatmap_background", {
      client,
      resourceId,
    }),
  queryLocalSkins: (query: SkinQuery) =>
    call<Page<LocalSkinSummary>>("query_local_skins", { query }),
  getLocalSkinDetail: (client: OsuClient, resourceId: string) =>
    call<LocalSkinDetail>("get_local_skin_detail", { client, resourceId }),
  getLocalSkinPreview: (client: OsuClient, resourceId: string) =>
    call<LocalSkinPreview>("get_local_skin_preview", { client, resourceId }),
  getLocalSkinAsset: (
    client: OsuClient,
    skinResourceId: string,
    assetResourceId: string,
  ) =>
    call<LocalSkinAssetPayload>("get_local_skin_asset", {
      client,
      skinResourceId,
      assetResourceId,
    }),
  chooseLocalDirectory: async (defaultPath?: string | null) => {
    if (!isTauri()) {
      throw {
        code: "TAURI_REQUIRED",
        message: "目录选择器仅在 OPP 桌面应用中可用",
      } satisfies CommandError;
    }
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: defaultPath ?? undefined,
      title: "选择 osu! 本地目录",
    });
    return typeof selected === "string" ? selected : null;
  },
  chooseBeatmapDownloadDirectory: async (defaultPath?: string | null) => {
    if (!isTauri()) {
      throw {
        code: "TAURI_REQUIRED",
        message: "目录选择器仅可在 OPP 桌面应用中使用",
      } satisfies CommandError;
    }
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: defaultPath ?? undefined,
      title: "选择谱面下载目录",
    });
    return typeof selected === "string" ? selected : null;
  },
  openExternal: async (url: string) => {
    if (isTauri()) await openUrl(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  },
  onOAuthResult: async (
    handler: (result: OAuthResult) => void,
  ): Promise<UnlistenFn> => {
    if (!isTauri()) return () => undefined;
    return listen<OAuthResult>("oauth-result", (event) => handler(event.payload));
  },
  onLocalScanProgress: async (
    handler: (progress: LocalScanProgress) => void,
  ): Promise<UnlistenFn> => {
    if (!isTauri()) return () => undefined;
    return listen<LocalScanProgress>("local-scan-progress", (event) =>
      handler(event.payload),
    );
  },
  onBeatmapDownloadProgress: async (
    handler: (progress: BeatmapDownloadProgress) => void,
  ): Promise<UnlistenFn> => {
    if (!isTauri()) return () => undefined;
    return listen<BeatmapDownloadProgress>(
      "beatmap-download-progress",
      (event) => handler(event.payload),
    );
  },
};
