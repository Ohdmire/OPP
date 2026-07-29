use std::sync::Arc;

use tauri::State;

use crate::{
    error::{CommandError, CommandResult},
    similarity::{
        models::{
            SimilarityIndexStatus, SimilarityQueryRequest, SimilarityQueryResponse,
            SimilaritySource,
        },
        query::{map_runtime_error, options_from_request, response_from_runtime},
        source::{fetch_online_osu, parse_beatmap_id, read_local_osu},
    },
    state::AppState,
};

#[tauri::command]
pub async fn get_similarity_index_status(
    state: State<'_, AppState>,
) -> CommandResult<SimilarityIndexStatus> {
    let directory = configured_directory(&state)?;
    state.similarity.clear();
    inspect(state.similarity.clone(), directory).await
}

#[tauri::command]
pub async fn configure_similarity_index(
    directory: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<SimilarityIndexStatus> {
    let directory = directory
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    state
        .store
        .update(|persisted| persisted.settings.similarity_index_directory = directory.clone())?;
    state.similarity.clear();
    inspect(state.similarity.clone(), directory).await
}

#[tauri::command]
pub async fn query_similar_beatmaps(
    request: SimilarityQueryRequest,
    state: State<'_, AppState>,
) -> CommandResult<SimilarityQueryResponse> {
    let directory = configured_directory(&state)?.ok_or_else(|| {
        CommandError::new(
            "SIMILARITY_INDEX_NOT_CONFIGURED",
            "请先选择本地相似谱面索引目录",
        )
    })?;
    let runtime = state.similarity.clone();
    let dataset_directory = directory.clone();
    let dataset = tauri::async_runtime::spawn_blocking(move || {
        runtime
            .dataset(&dataset_directory)
            .map_err(map_runtime_error)
    })
    .await
    .map_err(|_| CommandError::new("SIMILARITY_RUNTIME_ERROR", "相似谱面运行时意外停止"))??;
    let options = options_from_request(&request)?;

    let (indexed_id, bytes, source_label) = match &request.source {
        SimilaritySource::BeatmapId { value } => {
            let beatmap_id = parse_beatmap_id(value)?;
            if dataset.contains(beatmap_id) {
                (Some(beatmap_id), None, "index")
            } else {
                let bytes = fetch_online_osu(&state.providers, beatmap_id).await?;
                (None, Some(bytes), "online")
            }
        }
        SimilaritySource::LocalFile { path } => {
            let path = path.clone();
            let bytes = tauri::async_runtime::spawn_blocking(move || read_local_osu(&path))
                .await
                .map_err(|_| {
                    CommandError::new("BEATMAP_READ_FAILED", "谱面文件读取任务意外停止")
                })??;
            (None, Some(bytes), "local_file")
        }
    };

    tauri::async_runtime::spawn_blocking(move || {
        let target = if let Some(beatmap_id) = indexed_id {
            dataset.target_for_id(beatmap_id)
        } else {
            dataset.analyze_target(bytes.as_deref().unwrap_or_default())
        }
        .map_err(map_runtime_error)?;
        let results = dataset
            .query(&target, &options)
            .map_err(map_runtime_error)?;
        Ok(response_from_runtime(target, results, source_label))
    })
    .await
    .map_err(|_| CommandError::new("SIMILARITY_RUNTIME_ERROR", "相似谱面查询任务意外停止"))?
}

async fn inspect(
    runtime: Arc<crate::similarity::dataset::SimilarityRuntime>,
    directory: Option<String>,
) -> CommandResult<SimilarityIndexStatus> {
    tauri::async_runtime::spawn_blocking(move || runtime.inspect(directory.as_deref()))
        .await
        .map_err(|_| CommandError::new("SIMILARITY_RUNTIME_ERROR", "本地索引校验任务意外停止"))
}

fn configured_directory(state: &AppState) -> CommandResult<Option<String>> {
    Ok(state.store.snapshot()?.settings.similarity_index_directory)
}
