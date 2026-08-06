import { useMutation, useQuery } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";
import type {
  SimilarityQueryRequest,
  SimilarityRecommendationRequest,
} from "../../shared/types/osu";

export const similarityIndexStatusKey = ["similarity-index-status"] as const;

export function similarityRecommendationKey(request: SimilarityRecommendationRequest) {
  return ["similarity-recommendation", request] as const;
}

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

export function useSimilarityRecommendation() {
  return useMutation({
    mutationFn: (request: SimilarityRecommendationRequest) =>
      desktopApi.recommendSimilarBeatmaps(request),
  });
}
