import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";
import type { OnlineBeatmapSearchQuery } from "../../shared/types/osu";

export const onlineBeatmapsKey = (query: OnlineBeatmapSearchQuery) =>
  ["online-beatmaps", query] as const;

export function useOnlineBeatmapsets(
  query: OnlineBeatmapSearchQuery,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: onlineBeatmapsKey(query),
    queryFn: ({ pageParam }) =>
      desktopApi.searchOnlineBeatmapsets({
        ...query,
        cursor_string: pageParam,
      }),
    enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.cursor_string || undefined,
    retry: false,
  });
}

export function useOnlineBeatmapsetDetail(beatmapsetId: number | null) {
  return useQuery({
    queryKey: ["online-beatmapset", beatmapsetId],
    queryFn: () => desktopApi.getOnlineBeatmapset(beatmapsetId!),
    enabled: beatmapsetId !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useOnlineBeatmapProviderStatus() {
  return useQuery({
    queryKey: ["online-beatmap-providers"],
    queryFn: () => desktopApi.getOnlineBeatmapProviderStatus(),
    staleTime: 60_000,
    retry: false,
  });
}
