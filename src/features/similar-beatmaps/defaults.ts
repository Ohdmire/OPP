import type {
  DifficultyFeatureVector,
  SimilarityBaseWeights,
  SimilarityFilters,
  SimilarityQueryRequest,
  SimilaritySource,
} from "../../shared/types/osu";

export const defaultDifficultyWeights: DifficultyFeatureVector = {
  aim: 1,
  speed: 1,
  reading: 1,
  flashlight: 1,
  overlap: 1,
};

export const defaultBaseWeights: SimilarityBaseWeights = {
  bpm: 0.15,
  ar: 0.15,
  length_seconds: 0.1,
  object_density: 0.25,
  circle_ratio: 0.15,
  slider_ratio: 0.2,
};

export const defaultSimilarityFilters: SimilarityFilters = {
  min_ar: null,
  max_ar: null,
  min_bpm: null,
  max_bpm: null,
};

export function createSimilarityRequest(
  source: SimilaritySource,
): SimilarityQueryRequest {
  return {
    source,
    difficulty_weights: { ...defaultDifficultyWeights },
    base_weights: { ...defaultBaseWeights },
    filters: { ...defaultSimilarityFilters },
    result_limit: 20,
  };
}
