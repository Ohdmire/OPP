use osu_difficulty_runtime::{
    BaseFeatures, DifficultyVector, DynamicWeightProfile, QueryFilters, WeightingMode,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SimilarityIndexState {
    Unconfigured,
    Missing,
    Invalid,
    Incompatible,
    Ready,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarityIndexStatus {
    pub state: SimilarityIndexState,
    pub directory: Option<String>,
    pub message: String,
    pub record_count: Option<usize>,
    pub analyzer_version: Option<u32>,
    pub normalization_version: Option<u32>,
    pub algorithm_id: Option<String>,
    pub data_cutoff_at: Option<i64>,
    pub supports_dynamic_weighting: bool,
}

impl SimilarityIndexStatus {
    pub fn unconfigured() -> Self {
        Self {
            state: SimilarityIndexState::Unconfigured,
            directory: None,
            message: "尚未配置本地相似谱面索引。".into(),
            record_count: None,
            analyzer_version: None,
            normalization_version: None,
            algorithm_id: None,
            data_cutoff_at: None,
            supports_dynamic_weighting: false,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SimilaritySource {
    BeatmapId { value: String },
    LocalFile { path: String },
}

#[derive(Debug, Clone, Deserialize)]
pub struct SimilarityQueryRequest {
    pub source: SimilaritySource,
    pub weighting: WeightingMode,
    #[serde(default)]
    pub filters: QueryFilters,
    pub result_limit: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarityBeatmap {
    pub beatmap_id: u64,
    pub beatmapset_id: u64,
    pub artist: String,
    pub title: String,
    pub version: String,
    pub creator: String,
    pub online_url: String,
    pub star_rating: Option<f32>,
    pub difficulty: DifficultyVector,
    pub base: BaseFeatures,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarityTarget {
    #[serde(flatten)]
    pub beatmap: SimilarityBeatmap,
    pub source: String,
    pub analyzer_version: u32,
    pub normalization_version: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarityResult {
    #[serde(flatten)]
    pub beatmap: SimilarityBeatmap,
    pub final_distance: f32,
    pub difficulty_distance: f32,
    pub base_distance: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarityQueryResponse {
    pub target: SimilarityTarget,
    pub results: Vec<SimilarityResult>,
    pub dynamic_profile: Option<DynamicWeightProfile>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SimilarityRecommendationKind {
    Recent,
    Best,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SimilarityRecommendationRequest {
    pub kind: SimilarityRecommendationKind,
    pub weighting: WeightingMode,
    #[serde(default)]
    pub filters: QueryFilters,
    pub result_limit: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarityRecommendationResult {
    #[serde(flatten)]
    pub result: SimilarityResult,
    pub recommended_by: SimilarityBeatmap,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilarityRecommendationResponse {
    pub kind: SimilarityRecommendationKind,
    pub seed_count: usize,
    pub skipped_seed_count: usize,
    pub results: Vec<SimilarityRecommendationResult>,
    pub dynamic_profiles: Vec<SimilaritySeedDynamicProfile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimilaritySeedDynamicProfile {
    pub seed_beatmap_id: u64,
    #[serde(flatten)]
    pub profile: DynamicWeightProfile,
}
