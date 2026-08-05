use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    path::{Path, PathBuf},
};

use hnsw::{Hnsw, Searcher};
use memmap2::{Mmap, MmapOptions};
use rand_pcg::Pcg64;
use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use space::{Metric, Neighbor};
use thiserror::Error;

use crate::{
    ANALYZER_ALGORITHM_ID, ANALYZER_VERSION, Analyzer, AnalyzerConfig, BaseFeatures,
    BeatmapFeatureRecord, BeatmapMetadata, DatasetInfo, DifficultyVector, DifficultyWeights,
    OVERLAP_ALGORITHM_VERSION, QueryFilters, QueryOptions, QueryResult, QueryTarget,
    READING_ALGORITHM_VERSION, ROSU_PP_VERSION,
};

const FEATURE_HEADER_LEN: usize = 32;
const FEATURE_FORMAT_VERSION: u32 = 1;
// `hnsw::Hnsw::nearest` requires its destination buffer to be no larger than
// its `ef` search pool. The runtime caps `ef` at 128, so the candidate buffer
// must use that same cap or a large index will panic inside the dependency.
const CANDIDATE_LIMIT: usize = 128;

type Graph = Hnsw<WeightedL2, [f32; 5], Pcg64, 16, 32>;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
struct WeightedL2;

impl Metric<[f32; 5]> for WeightedL2 {
    type Unit = u64;

    fn distance(&self, left: &[f32; 5], right: &[f32; 5]) -> Self::Unit {
        left.iter()
            .zip(right)
            .map(|(left, right)| (*left as f64 - *right as f64).powi(2))
            .sum::<f64>()
            .to_bits()
    }
}

#[derive(Serialize, Deserialize)]
struct IndexFile {
    labels: Vec<u64>,
    graph: Graph,
    normalization_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NormalizerFile {
    version: u32,
    quantiles: [Vec<f32>; 5],
}

impl NormalizerFile {
    fn transform(&self, raw: DifficultyVector) -> DifficultyVector {
        let values = raw.as_array();
        let mut normalized = [0.0; 5];
        for (index, value) in values.into_iter().enumerate() {
            normalized[index] = rank(&self.quantiles[index], value);
        }
        DifficultyVector::from_array(normalized)
    }
}

fn rank(values: &[f32], value: f32) -> f32 {
    if values.len() <= 1 {
        return 0.0;
    }
    let index = values.partition_point(|candidate| *candidate <= value);
    (index.saturating_sub(1) as f32 / (values.len() - 1) as f32).clamp(0.0, 1.0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeErrorKind {
    Invalid,
    Incompatible,
    UnknownBeatmap,
    Analysis,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct RuntimeError {
    kind: RuntimeErrorKind,
    message: String,
}

impl RuntimeError {
    pub fn kind(&self) -> RuntimeErrorKind {
        self.kind
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self {
            kind: RuntimeErrorKind::Invalid,
            message: message.into(),
        }
    }

    fn incompatible(message: impl Into<String>) -> Self {
        Self {
            kind: RuntimeErrorKind::Incompatible,
            message: message.into(),
        }
    }

    fn unknown() -> Self {
        Self {
            kind: RuntimeErrorKind::UnknownBeatmap,
            message: "beatmap is not present in the configured index".into(),
        }
    }

    fn analysis(message: impl Into<String>) -> Self {
        Self {
            kind: RuntimeErrorKind::Analysis,
            message: message.into(),
        }
    }
}

pub struct Dataset {
    metadata_path: PathBuf,
    feature_map: Mmap,
    record_size: usize,
    offsets: HashMap<u64, usize>,
    main_index: IndexFile,
    delta_index: Option<IndexFile>,
    normalizer: NormalizerFile,
    analyzer: Analyzer,
    info: DatasetInfo,
}

impl Dataset {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, RuntimeError> {
        let root = root.as_ref();
        if !root.is_dir() {
            return Err(RuntimeError::invalid(
                "configured similarity index directory is unavailable",
            ));
        }

        let main_index = read_index(&root.join("indexes/difficulty-main.hnsw"))?;
        let normalization_version = main_index.normalization_version;
        if normalization_version == 0 {
            return Err(RuntimeError::incompatible(
                "the index declares an unsupported normalization version",
            ));
        }
        let delta_path = root.join("indexes/difficulty-delta.hnsw");
        let delta_index = if delta_path.exists() {
            let index = read_index(&delta_path)?;
            if index.normalization_version != normalization_version {
                return Err(RuntimeError::incompatible(
                    "main and delta indexes use different normalization versions",
                ));
            }
            Some(index)
        } else {
            None
        };

        let normalizer_path = root
            .join("normalizers")
            .join(format!("v{normalization_version}.bin"));
        let normalizer: NormalizerFile = bincode::deserialize_from(
            File::open(&normalizer_path)
                .map_err(|_| RuntimeError::invalid("normalizer file is missing"))?,
        )
        .map_err(|_| RuntimeError::invalid("normalizer file is invalid"))?;
        if normalizer.version != normalization_version {
            return Err(RuntimeError::incompatible(
                "normalizer version does not match the index",
            ));
        }

        let feature_path = root.join(format!("features-v{normalization_version}.bin"));
        let feature_file = File::open(&feature_path)
            .map_err(|_| RuntimeError::invalid("normalized feature file is missing"))?;
        // SAFETY: the dataset is documented and validated as immutable while OPP is using it.
        // OPP never writes to the selected directory, so the mapped file cannot be truncated by us.
        let feature_map = unsafe { MmapOptions::new().map(&feature_file) }
            .map_err(|_| RuntimeError::invalid("normalized feature file cannot be mapped"))?;
        validate_feature_header(&feature_map)?;
        let record_size = bincode::serialized_size(&BeatmapFeatureRecord::default())
            .map_err(|_| RuntimeError::invalid("feature record format is invalid"))?
            as usize;

        let metadata_path = root.join("metadata.sqlite");
        let connection = open_read_only(&metadata_path)?;
        validate_algorithm(&connection)?;
        let offsets = read_offsets(
            &connection,
            normalization_version,
            record_size,
            feature_map.len(),
        )?;
        if offsets.is_empty() {
            return Err(RuntimeError::invalid(
                "the configured index contains no normalized beatmaps",
            ));
        }
        if main_index
            .labels
            .iter()
            .chain(delta_index.iter().flat_map(|index| index.labels.iter()))
            .any(|beatmap_id| !offsets.contains_key(beatmap_id))
        {
            return Err(RuntimeError::invalid(
                "the HNSW index references missing feature records",
            ));
        }

        let info = DatasetInfo {
            record_count: offsets.len(),
            analyzer_version: ANALYZER_VERSION,
            normalization_version,
            algorithm_id: ANALYZER_ALGORITHM_ID.into(),
            data_cutoff_at: read_data_cutoff(&connection, normalization_version)?,
        };
        Ok(Self {
            metadata_path,
            feature_map,
            record_size,
            offsets,
            main_index,
            delta_index,
            normalizer,
            analyzer: Analyzer::new(AnalyzerConfig::default()),
            info,
        })
    }

    pub fn info(&self) -> &DatasetInfo {
        &self.info
    }

    pub fn contains(&self, beatmap_id: u64) -> bool {
        self.offsets.contains_key(&beatmap_id)
    }

    pub fn target_for_id(&self, beatmap_id: u64) -> Result<QueryTarget, RuntimeError> {
        Ok(QueryTarget {
            metadata: self.metadata_for(beatmap_id)?,
            record: self.record_for_id(beatmap_id)?,
        })
    }

    pub fn analyze_target(&self, bytes: &[u8]) -> Result<QueryTarget, RuntimeError> {
        let (metadata, raw) = self
            .analyzer
            .analyze_bytes(bytes)
            .map_err(|error| RuntimeError::analysis(error.to_string()))?;
        let record = BeatmapFeatureRecord {
            beatmap_id: raw.beatmap_id,
            beatmapset_id: raw.beatmapset_id,
            difficulty: self.normalizer.transform(raw.raw_difficulty),
            base: raw.base,
            overlap: raw.overlap,
            analyzer_version: raw.analyzer_version,
            normalization_version: self.normalizer.version,
            mod_profile: raw.mod_profile,
            flags: 0,
        };
        Ok(QueryTarget { metadata, record })
    }

    pub fn query(
        &self,
        target: &QueryTarget,
        options: &QueryOptions,
    ) -> Result<Vec<QueryResult>, RuntimeError> {
        validate_options(options)?;
        let mut ids = HashSet::new();
        for index in std::iter::once(&self.main_index).chain(self.delta_index.iter()) {
            ids.extend(candidates(index, target.record.difficulty.as_array()));
        }

        let mut scored = Vec::new();
        for beatmap_id in ids {
            if beatmap_id == target.record.beatmap_id {
                continue;
            }
            let candidate = self.record_for_id(beatmap_id)?;
            if target.record.beatmapset_id != 0
                && candidate.beatmapset_id == target.record.beatmapset_id
            {
                continue;
            }
            if !matches_filters(candidate.base, &options.filters) {
                continue;
            }
            let difficulty_distance = difficulty_distance(
                target.record.difficulty,
                candidate.difficulty,
                options.difficulty_weights,
            );
            scored.push((
                beatmap_id,
                candidate,
                difficulty_distance,
                difficulty_distance,
                0.0,
            ));
        }
        scored.sort_by(|left, right| {
            left.2
                .total_cmp(&right.2)
                .then_with(|| left.0.cmp(&right.0))
        });

        let mut seen_sets = HashSet::new();
        let mut results = Vec::with_capacity(options.result_limit);
        for (beatmap_id, record, final_distance, difficulty_distance, base_distance) in scored {
            if !seen_sets.insert(record.beatmapset_id) {
                continue;
            }
            results.push(QueryResult {
                metadata: self.metadata_for(beatmap_id)?,
                record,
                final_distance,
                difficulty_distance,
                base_distance,
            });
            if results.len() == options.result_limit {
                break;
            }
        }
        Ok(results)
    }

    fn record_for_id(&self, beatmap_id: u64) -> Result<BeatmapFeatureRecord, RuntimeError> {
        let offset = *self
            .offsets
            .get(&beatmap_id)
            .ok_or_else(RuntimeError::unknown)?;
        let end = offset
            .checked_add(self.record_size)
            .ok_or_else(|| RuntimeError::invalid("feature record offset overflow"))?;
        let bytes = self
            .feature_map
            .get(offset..end)
            .ok_or_else(|| RuntimeError::invalid("feature record is outside the data file"))?;
        bincode::deserialize(bytes)
            .map_err(|_| RuntimeError::invalid("feature record cannot be decoded"))
    }

    fn metadata_for(&self, beatmap_id: u64) -> Result<BeatmapMetadata, RuntimeError> {
        let connection = open_read_only(&self.metadata_path)?;
        connection
            .query_row(
                "SELECT beatmap_id,beatmapset_id,checksum,artist,title,version,creator,online_url \
                 FROM beatmaps WHERE beatmap_id=?1",
                [beatmap_id as i64],
                |row| {
                    Ok(BeatmapMetadata {
                        beatmap_id: row.get::<_, i64>(0)? as u64,
                        beatmapset_id: row.get::<_, i64>(1)? as u64,
                        checksum: row.get(2)?,
                        artist: row.get(3)?,
                        title: row.get(4)?,
                        version: row.get(5)?,
                        creator: row.get(6)?,
                        online_url: row.get(7)?,
                    })
                },
            )
            .map_err(|_| RuntimeError::invalid("beatmap metadata is missing"))
    }
}

fn read_index(path: &Path) -> Result<IndexFile, RuntimeError> {
    let bytes = fs::read(path).map_err(|_| RuntimeError::invalid("HNSW index file is missing"))?;
    let checksum_path = PathBuf::from(format!("{}.sha256", path.to_string_lossy()));
    let saved = fs::read_to_string(checksum_path)
        .map_err(|_| RuntimeError::invalid("HNSW checksum file is missing"))?;
    if saved.trim() != hex::encode(Sha256::digest(&bytes)) {
        return Err(RuntimeError::invalid("HNSW index checksum does not match"));
    }
    bincode::deserialize(&bytes).map_err(|_| RuntimeError::invalid("HNSW index cannot be decoded"))
}

fn validate_feature_header(bytes: &[u8]) -> Result<(), RuntimeError> {
    if bytes.len() < FEATURE_HEADER_LEN || &bytes[..7] != b"ODLNORM" {
        return Err(RuntimeError::invalid(
            "normalized feature file header is invalid",
        ));
    }
    let version = u32::from_le_bytes(
        bytes[8..12]
            .try_into()
            .map_err(|_| RuntimeError::invalid("feature format version is missing"))?,
    );
    if version != FEATURE_FORMAT_VERSION {
        return Err(RuntimeError::incompatible(
            "normalized feature format version is unsupported",
        ));
    }
    Ok(())
}

fn open_read_only(path: &Path) -> Result<Connection, RuntimeError> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| RuntimeError::invalid("metadata database is missing or invalid"))
}

fn validate_algorithm(connection: &Connection) -> Result<(), RuntimeError> {
    let versions = connection
        .query_row(
            "SELECT algorithm_id,rosu_pp_version,reading_version,overlap_version \
             FROM analysis_versions WHERE analyzer_version=?1",
            [ANALYZER_VERSION as i64],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|_| RuntimeError::incompatible("analyzer version is not supported"))?;
    if versions.0 != ANALYZER_ALGORITHM_ID
        || versions.1 != ROSU_PP_VERSION
        || versions.2 != READING_ALGORITHM_VERSION
        || versions.3 != OVERLAP_ALGORITHM_VERSION
    {
        return Err(RuntimeError::incompatible(
            "dataset algorithm snapshot does not match this runtime",
        ));
    }
    Ok(())
}

fn read_data_cutoff(
    connection: &Connection,
    normalization_version: u32,
) -> Result<Option<i64>, RuntimeError> {
    let columns = connection
        .prepare("PRAGMA table_info(beatmaps)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| RuntimeError::invalid("metadata schema cannot be read"))?;
    if !columns.iter().any(|column| column == "updated_at") {
        return Ok(None);
    }

    connection
        .query_row(
            "SELECT MAX(beatmaps.updated_at)
             FROM beatmaps
             INNER JOIN analyses ON analyses.beatmap_id = beatmaps.beatmap_id
             WHERE analyses.analyzer_version = ?1
               AND analyses.normalization_version = ?2
               AND analyses.status = 2",
            [ANALYZER_VERSION as i64, normalization_version as i64],
            |row| row.get(0),
        )
        .map_err(|_| RuntimeError::invalid("metadata cutoff cannot be read"))
}

fn read_offsets(
    connection: &Connection,
    normalization_version: u32,
    record_size: usize,
    feature_length: usize,
) -> Result<HashMap<u64, usize>, RuntimeError> {
    let mut statement = connection
        .prepare(
            "SELECT beatmap_id,normalized_offset FROM analyses \
             WHERE analyzer_version=?1 AND normalization_version=?2 AND status=2",
        )
        .map_err(|_| RuntimeError::invalid("analysis metadata cannot be read"))?;
    let rows = statement
        .query_map(
            params![ANALYZER_VERSION as i64, normalization_version as i64],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .map_err(|_| RuntimeError::invalid("analysis offsets cannot be read"))?;
    let mut offsets = HashMap::new();
    for row in rows {
        let (beatmap_id, offset) =
            row.map_err(|_| RuntimeError::invalid("analysis offset is invalid"))?;
        let offset = offset
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| RuntimeError::invalid("analysis offset is missing"))?;
        if offset < FEATURE_HEADER_LEN
            || offset
                .checked_add(record_size)
                .is_none_or(|end| end > feature_length)
        {
            return Err(RuntimeError::invalid(
                "analysis offset is outside the feature file",
            ));
        }
        offsets.insert(beatmap_id as u64, offset);
    }
    Ok(offsets)
}

fn candidates(index: &IndexFile, vector: [f32; 5]) -> Vec<u64> {
    if index.labels.is_empty() {
        return Vec::new();
    }
    let mut searcher = Searcher::new();
    let mut destination = vec![
        Neighbor {
            index: usize::MAX,
            distance: u64::MAX,
        };
        CANDIDATE_LIMIT.min(index.labels.len()).max(1)
    ];
    index
        .graph
        .nearest(&vector, CANDIDATE_LIMIT, &mut searcher, &mut destination)
        .iter()
        .filter_map(|neighbor| index.labels.get(neighbor.index).copied())
        .collect()
}

fn validate_options(options: &QueryOptions) -> Result<(), RuntimeError> {
    if !(1..=50).contains(&options.result_limit) {
        return Err(RuntimeError::analysis(
            "result limit must be between 1 and 50",
        ));
    }
    let difficulty = options.difficulty_weights;
    let weights = [
        difficulty.aim,
        difficulty.speed,
        difficulty.reading,
        difficulty.slider,
        difficulty.overlap,
    ];
    if weights
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
        || weights.iter().all(|value| *value == 0.0)
    {
        return Err(RuntimeError::analysis(
            "similarity weights must be finite, non-negative and not all zero",
        ));
    }
    Ok(())
}

fn matches_filters(base: BaseFeatures, filters: &QueryFilters) -> bool {
    filters.min_ar.is_none_or(|value| base.ar >= value)
        && filters.max_ar.is_none_or(|value| base.ar <= value)
        && filters.min_bpm.is_none_or(|value| base.bpm >= value)
        && filters.max_bpm.is_none_or(|value| base.bpm <= value)
        && filters
            .min_length_seconds
            .is_none_or(|value| base.length_seconds >= value)
        && filters
            .max_length_seconds
            .is_none_or(|value| base.length_seconds <= value)
        && filters
            .min_object_density
            .is_none_or(|value| base.object_density >= value)
        && filters
            .max_object_density
            .is_none_or(|value| base.object_density <= value)
        && filters
            .min_circle_ratio
            .is_none_or(|value| base.circle_ratio >= value)
        && filters
            .max_circle_ratio
            .is_none_or(|value| base.circle_ratio <= value)
        && filters
            .min_slider_ratio
            .is_none_or(|value| base.slider_ratio >= value)
        && filters
            .max_slider_ratio
            .is_none_or(|value| base.slider_ratio <= value)
}

fn difficulty_distance(
    left: DifficultyVector,
    right: DifficultyVector,
    weights: DifficultyWeights,
) -> f32 {
    let weights = [
        weights.aim,
        weights.speed,
        weights.reading,
        weights.slider,
        weights.overlap,
    ];
    left.as_array()
        .iter()
        .zip(right.as_array())
        .zip(weights)
        .map(|((left, right), weight)| weight * (left - right).powi(2))
        .sum::<f32>()
        .sqrt()
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use hnsw::Params;
    use tempfile::TempDir;

    use super::*;

    fn record(id: u64, set: u64, difficulty: [f32; 5], bpm: f32) -> BeatmapFeatureRecord {
        BeatmapFeatureRecord {
            beatmap_id: id,
            beatmapset_id: set,
            difficulty: DifficultyVector::from_array(difficulty),
            base: BaseFeatures {
                bpm,
                ar: 9.0,
                length_seconds: 120.0,
                object_density: 4.0,
                circle_ratio: 0.6,
                slider_ratio: 0.4,
                ..BaseFeatures::default()
            },
            analyzer_version: ANALYZER_VERSION,
            normalization_version: 1,
            ..BeatmapFeatureRecord::default()
        }
    }

    fn create_dataset() -> TempDir {
        let directory = tempfile::tempdir().expect("temp directory");
        fs::create_dir_all(directory.path().join("indexes")).expect("index dir");
        fs::create_dir_all(directory.path().join("normalizers")).expect("normalizer dir");

        let records = [
            record(10, 1, [0.1; 5], 180.0),
            record(20, 2, [0.11; 5], 181.0),
            record(21, 2, [0.12; 5], 182.0),
            record(30, 3, [0.8; 5], 240.0),
        ];
        let mut features =
            File::create(directory.path().join("features-v1.bin")).expect("feature file");
        let mut header = [0_u8; FEATURE_HEADER_LEN];
        header[..7].copy_from_slice(b"ODLNORM");
        header[8..12].copy_from_slice(&FEATURE_FORMAT_VERSION.to_le_bytes());
        features.write_all(&header).expect("feature header");
        let record_size =
            bincode::serialized_size(&BeatmapFeatureRecord::default()).expect("record size");
        for value in records {
            bincode::serialize_into(&mut features, &value).expect("feature record");
        }
        features.flush().expect("flush feature file");

        let normalizer = NormalizerFile {
            version: 1,
            quantiles: std::array::from_fn(|_| vec![0.0, 1.0]),
        };
        bincode::serialize_into(
            File::create(directory.path().join("normalizers/v1.bin")).expect("normalizer"),
            &normalizer,
        )
        .expect("write normalizer");

        let connection =
            Connection::open(directory.path().join("metadata.sqlite")).expect("metadata");
        connection
            .execute_batch(
                "CREATE TABLE beatmaps (
                    beatmap_id INTEGER PRIMARY KEY, beatmapset_id INTEGER NOT NULL,
                    checksum TEXT NOT NULL, artist TEXT NOT NULL, title TEXT NOT NULL,
                    version TEXT NOT NULL, creator TEXT NOT NULL, online_url TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                 );
                 CREATE TABLE analyses (
                    beatmap_id INTEGER NOT NULL, analyzer_version INTEGER NOT NULL,
                    normalization_version INTEGER NOT NULL, normalized_offset INTEGER,
                    status INTEGER NOT NULL
                 );
                 CREATE TABLE analysis_versions (
                    analyzer_version INTEGER PRIMARY KEY, algorithm_id TEXT NOT NULL,
                    rosu_pp_version TEXT NOT NULL, reading_version TEXT NOT NULL,
                    overlap_version TEXT NOT NULL
                 );",
            )
            .expect("schema");
        connection
            .execute(
                "INSERT INTO analysis_versions VALUES (?1,?2,?3,?4,?5)",
                params![
                    ANALYZER_VERSION,
                    ANALYZER_ALGORITHM_ID,
                    ROSU_PP_VERSION,
                    READING_ALGORITHM_VERSION,
                    OVERLAP_ALGORITHM_VERSION
                ],
            )
            .expect("algorithm");
        for (index, value) in records.iter().enumerate() {
            connection
                .execute(
                    "INSERT INTO beatmaps VALUES (?1,?2,'checksum','artist',?3,'difficulty','mapper',?4,?5)",
                    params![
                        value.beatmap_id as i64,
                        value.beatmapset_id as i64,
                        format!("map {}", value.beatmap_id),
                        format!("https://osu.ppy.sh/b/{}", value.beatmap_id),
                        1_700_000_000_i64 + index as i64,
                    ],
                )
                .expect("metadata row");
            connection
                .execute(
                    "INSERT INTO analyses VALUES (?1,?2,1,?3,2)",
                    params![
                        value.beatmap_id as i64,
                        ANALYZER_VERSION,
                        FEATURE_HEADER_LEN as i64 + index as i64 * record_size as i64
                    ],
                )
                .expect("analysis row");
        }
        drop(connection);

        let mut graph = Graph::new_params(WeightedL2, Params::new().ef_construction(200));
        let mut searcher = Searcher::new();
        let mut labels = Vec::new();
        for value in records {
            graph.insert(value.difficulty.as_array(), &mut searcher);
            labels.push(value.beatmap_id);
        }
        write_test_index(
            directory.path().join("indexes/difficulty-main.hnsw"),
            &IndexFile {
                labels,
                graph,
                normalization_version: 1,
            },
        );
        let delta = IndexFile {
            labels: Vec::new(),
            graph: Graph::new_params(WeightedL2, Params::new().ef_construction(200)),
            normalization_version: 1,
        };
        write_test_index(
            directory.path().join("indexes/difficulty-delta.hnsw"),
            &delta,
        );
        directory
    }

    fn write_test_index(path: PathBuf, index: &IndexFile) {
        let bytes = bincode::serialize(index).expect("serialize index");
        fs::write(&path, &bytes).expect("write index");
        fs::write(
            format!("{}.sha256", path.to_string_lossy()),
            hex::encode(Sha256::digest(&bytes)),
        )
        .expect("write checksum");
    }

    #[test]
    fn opens_and_queries_without_duplicate_sets() {
        let directory = create_dataset();
        let dataset = Dataset::open(directory.path()).expect("open dataset");
        assert_eq!(dataset.info().record_count, 4);
        assert_eq!(dataset.info().data_cutoff_at, Some(1_700_000_003));
        let target = dataset.target_for_id(10).expect("target");
        let results = dataset
            .query(&target, &QueryOptions::default())
            .expect("query");
        assert_eq!(
            results
                .iter()
                .map(|result| result.metadata.beatmap_id)
                .collect::<Vec<_>>(),
            vec![20, 30]
        );
        assert!(results.iter().all(|result| {
            result.final_distance == result.difficulty_distance && result.base_distance == 0.0
        }));
        assert!(!directory.path().join("metadata.sqlite-wal").exists());
        assert!(!directory.path().join("metadata.sqlite-shm").exists());
    }

    #[test]
    fn rejects_a_tampered_index() {
        let directory = create_dataset();
        fs::write(
            directory.path().join("indexes/difficulty-main.hnsw.sha256"),
            "bad",
        )
        .expect("tamper checksum");
        let error = match Dataset::open(directory.path()) {
            Ok(_) => panic!("tampered dataset should be rejected"),
            Err(error) => error,
        };
        assert_eq!(error.kind(), RuntimeErrorKind::Invalid);
    }

    #[test]
    fn rejects_an_incompatible_algorithm_snapshot() {
        let directory = create_dataset();
        let connection =
            Connection::open(directory.path().join("metadata.sqlite")).expect("metadata");
        connection
            .execute(
                "UPDATE analysis_versions SET algorithm_id='unsupported'",
                [],
            )
            .expect("change algorithm");
        drop(connection);

        let error = match Dataset::open(directory.path()) {
            Ok(_) => panic!("incompatible dataset should be rejected"),
            Err(error) => error,
        };
        assert_eq!(error.kind(), RuntimeErrorKind::Incompatible);
    }

    #[test]
    fn analyzes_an_unindexed_standard_map() {
        let directory = create_dataset();
        let dataset = Dataset::open(directory.path()).expect("open dataset");
        let bytes = b"osu file format v14\n\n[General]\nMode:0\n\n[Metadata]\nTitle:Local\nArtist:Test\nCreator:Mapper\nVersion:Hard\nBeatmapID:999\nBeatmapSetID:999\n\n[Difficulty]\nHPDrainRate:5\nCircleSize:4\nOverallDifficulty:7\nApproachRate:9\n\n[TimingPoints]\n0,500,4,2,0,100,1,0\n\n[HitObjects]\n64,64,0,1,0,0:0:0:0:\n448,320,500,1,0,0:0:0:0:\n64,64,1000,1,0,0:0:0:0:\n";
        let target = dataset.analyze_target(bytes).expect("analyze target");
        assert_eq!(target.metadata.beatmap_id, 999);
        assert_eq!(target.record.normalization_version, 1);
    }
}
