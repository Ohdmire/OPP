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
  slider: 1,
  overlap: 1,
};

export const defaultBaseWeights: SimilarityBaseWeights = {
  bpm: 0,
  ar: 0,
  length_seconds: 0,
  object_density: 0,
  circle_ratio: 0,
  slider_ratio: 0,
};

export const defaultSimilarityFilters: SimilarityFilters = {
  min_star: null,
  max_star: null,
  min_ar: null,
  max_ar: null,
  min_cs: null,
  max_cs: null,
  min_od: null,
  max_od: null,
  min_bpm: null,
  max_bpm: null,
  min_length_seconds: null,
  max_length_seconds: null,
  min_object_density: null,
  max_object_density: null,
  min_circle_ratio: null,
  max_circle_ratio: null,
  min_slider_ratio: null,
  max_slider_ratio: null,
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
