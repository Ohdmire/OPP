import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";
import type {
  BeatmapQuery,
  OsuClient,
  SkinQuery,
} from "../../shared/types/osu";

export const localSourcesKey = ["local-sources"] as const;
export const localSummaryKey = (client: OsuClient) =>
  ["local-summary", client] as const;
export const localBeatmapsKey = (query: BeatmapQuery) =>
  ["local-beatmaps", query] as const;
export const localBeatmapSetsKey = (query: BeatmapQuery) =>
  ["local-beatmap-sets", query] as const;
export const localSkinsKey = (query: SkinQuery) =>
  ["local-skins", query] as const;

export function useLocalSources() {
  return useQuery({
    queryKey: localSourcesKey,
    queryFn: desktopApi.getLocalSources,
    staleTime: 30_000,
    retry: false,
  });
}

export function useLocalSummary(client: OsuClient) {
  return useQuery({
    queryKey: localSummaryKey(client),
    queryFn: () => desktopApi.getLocalSummary(client),
    retry: false,
  });
}

export function useLocalBeatmaps(query: BeatmapQuery, enabled: boolean) {
  return useQuery({
    queryKey: localBeatmapsKey(query),
    queryFn: () => desktopApi.queryLocalBeatmaps(query),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useLocalBeatmapSets(query: BeatmapQuery, enabled: boolean) {
  return useQuery({
    queryKey: localBeatmapSetsKey(query),
    queryFn: () => desktopApi.queryLocalBeatmapSets(query),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useLocalBeatmapBackground(
  client: OsuClient,
  resourceId: string | null,
) {
  return useQuery({
    queryKey: ["local-beatmap-background", client, resourceId],
    queryFn: () => desktopApi.getLocalBeatmapBackground(client, resourceId!),
    enabled: client === "stable" && Boolean(resourceId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function useLocalSkins(query: SkinQuery, enabled: boolean) {
  return useQuery({
    queryKey: localSkinsKey(query),
    queryFn: () => desktopApi.queryLocalSkins(query),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useLocalBeatmapDetail(
  client: OsuClient,
  resourceId: string | null,
) {
  return useQuery({
    queryKey: ["local-beatmap-detail", client, resourceId],
    queryFn: () => desktopApi.getLocalBeatmapDetail(client, resourceId!),
    enabled: Boolean(resourceId),
    retry: false,
  });
}

export function useLocalSkinDetail(
  client: OsuClient,
  resourceId: string | null,
) {
  return useQuery({
    queryKey: ["local-skin-detail", client, resourceId],
    queryFn: () => desktopApi.getLocalSkinDetail(client, resourceId!),
    enabled: Boolean(resourceId),
    retry: false,
  });
}

export function useLocalSkinPreview(
  client: OsuClient,
  resourceId: string | null,
) {
  return useQuery({
    queryKey: ["local-skin-preview", client, resourceId],
    queryFn: () => desktopApi.getLocalSkinPreview(client, resourceId!),
    enabled: Boolean(resourceId),
    retry: false,
  });
}

export function useLocalSkinAsset(
  client: OsuClient,
  skinResourceId: string | null,
  assetResourceId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      "local-skin-asset",
      client,
      skinResourceId,
      assetResourceId,
    ],
    queryFn: () =>
      desktopApi.getLocalSkinAsset(
        client,
        skinResourceId!,
        assetResourceId!,
      ),
    enabled:
      enabled && Boolean(skinResourceId) && Boolean(assetResourceId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
