use osu_difficulty_runtime::{
    QueryOptions, QueryResult as RuntimeQueryResult, QueryTarget as RuntimeQueryTarget,
    RuntimeError, RuntimeErrorKind,
};

use crate::{
    error::{CommandError, CommandResult},
    similarity::models::{
        SimilarityBeatmap, SimilarityQueryRequest, SimilarityQueryResponse, SimilarityResult,
        SimilarityTarget,
    },
};

pub fn options_from_request(request: &SimilarityQueryRequest) -> CommandResult<QueryOptions> {
    if !(5..=50).contains(&request.result_limit) {
        return Err(CommandError::new(
            "INVALID_RESULT_LIMIT",
            "结果数量必须在 5 到 50 之间",
        ));
    }
    validate_range(
        request.filters.min_ar,
        request.filters.max_ar,
        0.0,
        11.0,
        "AR",
    )?;
    validate_range(
        request.filters.min_bpm,
        request.filters.max_bpm,
        0.0,
        1000.0,
        "BPM",
    )?;
    validate_range(
        request.filters.min_length_seconds,
        request.filters.max_length_seconds,
        0.0,
        7200.0,
        "length",
    )?;
    validate_range(
        request.filters.min_object_density,
        request.filters.max_object_density,
        0.0,
        100.0,
        "object density",
    )?;
    validate_range(
        request.filters.min_circle_ratio,
        request.filters.max_circle_ratio,
        0.0,
        1.0,
        "circle ratio",
    )?;
    validate_range(
        request.filters.min_slider_ratio,
        request.filters.max_slider_ratio,
        0.0,
        1.0,
        "slider ratio",
    )?;
    let difficulty = request.difficulty_weights;
    let weights = [
        difficulty.aim,
        difficulty.speed,
        difficulty.reading,
        difficulty.flashlight,
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
        difficulty_weights: request.difficulty_weights,
        base_weights: request.base_weights,
        filters: request.filters.clone(),
        result_limit: request.result_limit,
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
    use osu_difficulty_runtime::{BaseFeatureWeights, DifficultyWeights, QueryFilters};

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
            flashlight: 0.0,
            overlap: 0.0,
        };
        assert!(options_from_request(&request).is_err());
    }
}
