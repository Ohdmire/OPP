import { useMutation, useQuery } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";
import type { SimilarityQueryRequest } from "../../shared/types/osu";

export const similarityIndexStatusKey = ["similarity-index-status"] as const;

export function useSimilarityIndexStatus() {
  return useQuery({
    queryKey: similarityIndexStatusKey,
    queryFn: desktopApi.getSimilarityIndexStatus,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSimilarityQuery() {
  return useMutation({
    mutationFn: (request: SimilarityQueryRequest) =>
      desktopApi.querySimilarBeatmaps(request),
  });
}
