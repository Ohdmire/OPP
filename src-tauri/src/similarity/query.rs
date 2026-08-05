use std::collections::{HashMap, HashSet};

use osu_difficulty_runtime::{
    BaseFeatureWeights, DifficultyWeights, QueryFilters, QueryOptions,
    QueryResult as RuntimeQueryResult, QueryTarget as RuntimeQueryTarget, RuntimeError,
    RuntimeErrorKind,
};

use crate::{
    error::{CommandError, CommandResult},
    similarity::models::{
        SimilarityBeatmap, SimilarityQueryRequest, SimilarityQueryResponse,
        SimilarityRecommendationKind, SimilarityRecommendationRequest,
        SimilarityRecommendationResponse, SimilarityRecommendationResult, SimilarityResult,
        SimilarityTarget,
    },
};

pub fn options_from_request(request: &SimilarityQueryRequest) -> CommandResult<QueryOptions> {
    options_from_parts(
        request.difficulty_weights,
        request.base_weights,
        &request.filters,
        request.result_limit,
    )
}

pub fn options_from_recommendation_request(
    request: &SimilarityRecommendationRequest,
) -> CommandResult<QueryOptions> {
    options_from_parts(
        request.difficulty_weights,
        request.base_weights,
        &request.filters,
        request.result_limit,
    )
}

fn options_from_parts(
    difficulty_weights: DifficultyWeights,
    base_weights: BaseFeatureWeights,
    filters: &QueryFilters,
    result_limit: usize,
) -> CommandResult<QueryOptions> {
    if !(5..=50).contains(&result_limit) {
        return Err(CommandError::new(
            "INVALID_RESULT_LIMIT",
            "结果数量必须在 5 到 50 之间",
        ));
    }
    validate_range(filters.min_ar, filters.max_ar, 0.0, 11.0, "AR")?;
    validate_range(filters.min_bpm, filters.max_bpm, 0.0, 1000.0, "BPM")?;
    validate_range(
        filters.min_length_seconds,
        filters.max_length_seconds,
        0.0,
        7200.0,
        "length",
    )?;
    validate_range(
        filters.min_object_density,
        filters.max_object_density,
        0.0,
        100.0,
        "object density",
    )?;
    validate_range(
        filters.min_circle_ratio,
        filters.max_circle_ratio,
        0.0,
        1.0,
        "circle ratio",
    )?;
    validate_range(
        filters.min_slider_ratio,
        filters.max_slider_ratio,
        0.0,
        1.0,
        "slider ratio",
    )?;
    let difficulty = difficulty_weights;
    let weights = [
        difficulty.aim,
        difficulty.speed,
        difficulty.reading,
        difficulty.slider,
        difficulty.overlap,
    ];
    if weights
        .iter()
        .any(|weight| !weight.is_finite() || !(0.0..=2.0).contains(weight))
        || weights.iter().all(|weight| *weight == 0.0)
    {
        return Err(CommandError::new(
            "INVALID_SIMILARITY_WEIGHTS",
            "权重必须在 0 到 2 之间，且不能全部为 0",
        ));
    }
    Ok(QueryOptions {
        difficulty_weights,
        base_weights,
        filters: filters.clone(),
        result_limit,
    })
}

fn validate_range(
    minimum: Option<f32>,
    maximum: Option<f32>,
    lower: f32,
    upper: f32,
    label: &str,
) -> CommandResult<()> {
    if minimum.is_some_and(|value| !value.is_finite() || value < lower || value > upper)
        || maximum.is_some_and(|value| !value.is_finite() || value < lower || value > upper)
        || minimum.zip(maximum).is_some_and(|(min, max)| min > max)
    {
        return Err(CommandError::new(
            "INVALID_SIMILARITY_FILTER",
            format!("{label} 范围无效"),
        ));
    }
    Ok(())
}

pub fn response_from_runtime(
    target: RuntimeQueryTarget,
    results: Vec<RuntimeQueryResult>,
    source: &str,
) -> SimilarityQueryResponse {
    SimilarityQueryResponse {
        target: SimilarityTarget {
            analyzer_version: target.record.analyzer_version,
            normalization_version: target.record.normalization_version,
            source: source.into(),
            beatmap: beatmap_from_parts(target.metadata, target.record),
        },
        results: results
            .into_iter()
            .map(|result| SimilarityResult {
                beatmap: beatmap_from_parts(result.metadata, result.record),
                final_distance: result.final_distance,
                difficulty_distance: result.difficulty_distance,
                base_distance: result.base_distance,
            })
            .collect(),
    }
}

pub fn recommendation_response_from_runtime(
    kind: SimilarityRecommendationKind,
    batches: Vec<(RuntimeQueryTarget, Vec<RuntimeQueryResult>)>,
    skipped_seed_count: usize,
    result_limit: usize,
) -> SimilarityRecommendationResponse {
    let seed_count = batches.len();
    let seed_ids = batches
        .iter()
        .map(|(target, _)| target.record.beatmap_id)
        .collect::<HashSet<_>>();
    let seed_sets = batches
        .iter()
        .map(|(target, _)| target.record.beatmapset_id)
        .filter(|beatmapset_id| *beatmapset_id != 0)
        .collect::<HashSet<_>>();
    let mut nearest_by_set = HashMap::<u64, SimilarityRecommendationResult>::new();

    for (target, results) in batches {
        let recommended_by = beatmap_from_parts(target.metadata, target.record);
        for result in results {
            if seed_ids.contains(&result.record.beatmap_id)
                || (result.record.beatmapset_id != 0
                    && seed_sets.contains(&result.record.beatmapset_id))
            {
                continue;
            }
            let beatmapset_id = result.record.beatmapset_id;
            let recommendation = SimilarityRecommendationResult {
                result: SimilarityResult {
                    beatmap: beatmap_from_parts(result.metadata, result.record),
                    final_distance: result.final_distance,
                    difficulty_distance: result.difficulty_distance,
                    base_distance: result.base_distance,
                },
                recommended_by: recommended_by.clone(),
            };
            let should_replace = nearest_by_set.get(&beatmapset_id).is_none_or(|current| {
                recommendation
                    .result
                    .final_distance
                    .total_cmp(&current.result.final_distance)
                    .then_with(|| {
                        recommendation
                            .result
                            .beatmap
                            .beatmap_id
                            .cmp(&current.result.beatmap.beatmap_id)
                    })
                    .is_lt()
            });
            if should_replace {
                nearest_by_set.insert(beatmapset_id, recommendation);
            }
        }
    }

    let mut results = nearest_by_set.into_values().collect::<Vec<_>>();
    results.sort_by(|left, right| {
        left.result
            .final_distance
            .total_cmp(&right.result.final_distance)
            .then_with(|| {
                left.result
                    .beatmap
                    .beatmap_id
                    .cmp(&right.result.beatmap.beatmap_id)
            })
    });
    results.truncate(result_limit);

    SimilarityRecommendationResponse {
        kind,
        seed_count,
        skipped_seed_count,
        results,
    }
}

fn beatmap_from_parts(
    metadata: osu_difficulty_runtime::BeatmapMetadata,
    record: osu_difficulty_runtime::BeatmapFeatureRecord,
) -> SimilarityBeatmap {
    SimilarityBeatmap {
        beatmap_id: metadata.beatmap_id,
        beatmapset_id: metadata.beatmapset_id,
        artist: metadata.artist,
        title: metadata.title,
        version: metadata.version,
        creator: metadata.creator,
        online_url: metadata.online_url,
        difficulty: record.difficulty,
        base: record.base,
    }
}

pub fn map_runtime_error(error: RuntimeError) -> CommandError {
    match error.kind() {
        RuntimeErrorKind::Invalid => {
            CommandError::new("SIMILARITY_INDEX_INVALID", "本地相似谱面索引损坏或无法读取")
        }
        RuntimeErrorKind::Incompatible => CommandError::new(
            "SIMILARITY_INDEX_INCOMPATIBLE",
            "本地相似谱面索引版本与当前 OPP 不兼容",
        ),
        RuntimeErrorKind::UnknownBeatmap => {
            CommandError::new("BEATMAP_NOT_INDEXED", "目标谱面不在本地索引中")
        }
        RuntimeErrorKind::Analysis => {
            CommandError::new("BEATMAP_ANALYSIS_FAILED", error.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use osu_difficulty_runtime::{
        BaseFeatureWeights, BeatmapFeatureRecord, BeatmapMetadata, DifficultyWeights, QueryFilters,
    };

    use super::*;
    use crate::similarity::models::SimilaritySource;

    fn request() -> SimilarityQueryRequest {
        SimilarityQueryRequest {
            source: SimilaritySource::BeatmapId { value: "1".into() },
            difficulty_weights: DifficultyWeights::default(),
            base_weights: BaseFeatureWeights::default(),
            filters: QueryFilters::default(),
            result_limit: 20,
        }
    }

    #[test]
    fn rejects_inverted_filters() {
        let mut request = request();
        request.filters.min_ar = Some(10.0);
        request.filters.max_ar = Some(8.0);
        assert!(options_from_request(&request).is_err());
    }

    #[test]
    fn rejects_zero_difficulty_weights() {
        let mut request = request();
        request.difficulty_weights = DifficultyWeights {
            aim: 0.0,
            speed: 0.0,
            reading: 0.0,
            slider: 0.0,
            overlap: 0.0,
        };
        assert!(options_from_request(&request).is_err());
    }

    fn target(id: u64, set: u64) -> RuntimeQueryTarget {
        RuntimeQueryTarget {
            metadata: metadata(id, set),
            record: record(id, set),
        }
    }

    fn result(id: u64, set: u64, distance: f32) -> RuntimeQueryResult {
        RuntimeQueryResult {
            metadata: metadata(id, set),
            record: record(id, set),
            final_distance: distance,
            difficulty_distance: distance,
            base_distance: 0.0,
        }
    }

    fn metadata(id: u64, set: u64) -> BeatmapMetadata {
        BeatmapMetadata {
            beatmap_id: id,
            beatmapset_id: set,
            checksum: format!("checksum-{id}"),
            artist: format!("Artist {id}"),
            title: format!("Title {id}"),
            version: "Insane".into(),
            creator: "Mapper".into(),
            online_url: format!("https://osu.ppy.sh/beatmaps/{id}"),
        }
    }

    fn record(id: u64, set: u64) -> BeatmapFeatureRecord {
        BeatmapFeatureRecord {
            beatmap_id: id,
            beatmapset_id: set,
            ..BeatmapFeatureRecord::default()
        }
    }

    #[test]
    fn recommendation_keeps_the_nearest_source_and_excludes_all_seed_sets() {
        let response = recommendation_response_from_runtime(
            SimilarityRecommendationKind::Recent,
            vec![
                (
                    target(1, 10),
                    vec![
                        result(100, 100, 0.4),
                        result(101, 101, 0.2),
                        result(2, 20, 0.1),
                    ],
                ),
                (
                    target(2, 20),
                    vec![result(102, 100, 0.1), result(1, 10, 0.05)],
                ),
            ],
            3,
            20,
        );

        assert_eq!(response.seed_count, 2);
        assert_eq!(response.skipped_seed_count, 3);
        assert_eq!(response.results.len(), 2);
        assert_eq!(response.results[0].result.beatmap.beatmap_id, 102);
        assert_eq!(response.results[0].recommended_by.beatmap_id, 2);
        assert_eq!(response.results[1].result.beatmap.beatmap_id, 101);
    }
}
