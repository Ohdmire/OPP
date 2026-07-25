use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    path::Path,
};

use chardetng::EncodingDetector;
use chrono::Utc;
use rosu_map::section::{general::GameMode, hit_objects::HitObjectKind};
use rosu_pp::{Difficulty, any::Strains};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::models::Ruleset;

use super::models::{
    Completeness, HitObjectCounts, LocalBeatmapDetail, LocalBeatmapSummary,
    LocalCalculationVersion, LocalClient, LocalResourceRef, LocalSkinDetail, LocalSkinSummary,
    SkinConfigEntry, SkinConfigSection, SkinInventory, StrainAnalysis, StrainSeries,
};

pub const DIFFICULTY_ALGORITHM: &str =
    "rosu-pp 4.0.1 (2026-04-12) / ppy-osu@28c846b (2025-10-13) / NoMod + max SS pp";

pub fn calculation_version() -> LocalCalculationVersion {
    LocalCalculationVersion {
        engine: "rosu-pp".into(),
        engine_version: "4.0.1".into(),
        engine_released_at: "2026-04-12".into(),
        upstream_repository: "ppy/osu".into(),
        upstream_revision: "28c846b4d9366484792e27f4729cd1afa2cdeb66".into(),
        upstream_date: "2025-10-13".into(),
        ruleset_versions: BTreeMap::from([
            ("osu".into(), 20_250_306),
            ("taiko".into(), 20_250_306),
            ("fruits".into(), 20_250_306),
            ("mania".into(), 20_241_007),
        ]),
        modifiers: "NoMod".into(),
        performance_assumption: "满分 / 最大连击 / 0 miss".into(),
    }
}

pub struct ParsedBeatmap {
    pub summary: LocalBeatmapSummary,
    pub detail: LocalBeatmapDetail,
    pub warning: Option<String>,
}

pub fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn short_hash(value: &str) -> String {
    let digest = sha256(value.as_bytes());
    digest[..16].to_string()
}

pub fn decode_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xff, 0xfe])
        || (bytes.len() >= 4
            && bytes.len().is_multiple_of(2)
            && bytes
                .iter()
                .skip(1)
                .step_by(2)
                .filter(|byte| **byte == 0)
                .count()
                > bytes.len() / 8)
    {
        let (decoded, _, _) = encoding_rs::UTF_16LE.decode(bytes);
        return decoded.trim_start_matches('\u{feff}').to_string();
    }
    if bytes.starts_with(&[0xfe, 0xff])
        || (bytes.len() >= 4
            && bytes.len().is_multiple_of(2)
            && bytes.iter().step_by(2).filter(|byte| **byte == 0).count() > bytes.len() / 8)
    {
        let (decoded, _, _) = encoding_rs::UTF_16BE.decode(bytes);
        return decoded.trim_start_matches('\u{feff}').to_string();
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.trim_start_matches('\u{feff}').to_string();
    }

    let mut detector = EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, true);
    let (decoded, _, _) = encoding.decode(bytes);
    decoded.trim_start_matches('\u{feff}').to_string()
}

pub fn looks_like_beatmap(bytes: &[u8]) -> bool {
    let prefix_len = bytes.len().min(64);
    decode_text(&bytes[..prefix_len])
        .trim_start()
        .starts_with("osu file format v")
}

pub fn looks_like_skin_config(bytes: &[u8]) -> bool {
    let text = decode_text(bytes);
    let mut has_general = false;
    let mut has_name = false;
    let mut has_author = false;

    for line in text.lines().map(str::trim) {
        if line.eq_ignore_ascii_case("[general]") {
            has_general = true;
        } else if let Some((key, _)) = line.split_once(':') {
            has_name |= key.trim().eq_ignore_ascii_case("name");
            has_author |= key.trim().eq_ignore_ascii_case("author");
        }
    }

    has_general && has_name && has_author
}

fn ruleset(mode: GameMode) -> Ruleset {
    match mode {
        GameMode::Osu => Ruleset::Osu,
        GameMode::Taiko => Ruleset::Taiko,
        GameMode::Catch => Ruleset::Fruits,
        GameMode::Mania => Ruleset::Mania,
    }
}

fn count_hit_objects(map: &rosu_map::Beatmap) -> HitObjectCounts {
    let mut counts = HitObjectCounts::default();

    for object in &map.hit_objects {
        match object.kind {
            HitObjectKind::Circle(_) => counts.circles += 1,
            HitObjectKind::Slider(_) => counts.sliders += 1,
            HitObjectKind::Spinner(_) => counts.spinners += 1,
            HitObjectKind::Hold(_) => counts.holds += 1,
        }
    }

    counts.total = map.hit_objects.len();
    counts
}

fn peak_nps(map: &rosu_map::Beatmap) -> f64 {
    let mut window = VecDeque::new();
    let mut peak = 0usize;

    for object in &map.hit_objects {
        window.push_back(object.start_time);
        while window
            .front()
            .is_some_and(|start| object.start_time - start > 1_000.0)
        {
            window.pop_front();
        }
        peak = peak.max(window.len());
    }

    peak as f64
}

fn set_key(client: LocalClient, map: &rosu_map::Beatmap, logical_path: &str) -> (String, bool) {
    if map.beatmap_set_id > 0 {
        return (format!("online:{}", map.beatmap_set_id), false);
    }

    if client == LocalClient::Stable {
        let parent = Path::new(logical_path)
            .parent()
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| logical_path.to_string());
        return (format!("folder:{parent}"), false);
    }

    let inferred = format!(
        "{}\u{1f}{}\u{1f}{}",
        map.artist.to_lowercase(),
        map.title.to_lowercase(),
        map.creator.to_lowercase()
    );
    (format!("inferred:{}", short_hash(&inferred)), true)
}

pub fn parse_beatmap(
    client: LocalClient,
    bytes: &[u8],
    logical_path: &str,
    modified_at: Option<String>,
    known_hash: Option<&str>,
) -> Result<ParsedBeatmap, String> {
    if !looks_like_beatmap(bytes) {
        return Err("文件缺少有效的 osu file format 头".into());
    }
    let mut map = rosu_map::Beatmap::from_bytes(bytes)
        .map_err(|error| format!("无法解析 .osu 文件：{error}"))?;
    if map.hit_objects.is_empty() {
        return Err("谱面没有可识别的 HitObject".into());
    }
    let content_hash = known_hash
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| sha256(bytes));
    let path_component = short_hash(logical_path);
    let resource_id = match client {
        LocalClient::Stable => {
            format!("stable:beatmap:{content_hash}:{path_component}")
        }
        LocalClient::Lazer => format!("lazer:beatmap:{content_hash}"),
    };
    let resource = LocalResourceRef {
        resource_id,
        client,
        content_hash,
        logical_path: Some(logical_path.to_string()),
    };

    let first_time = map
        .hit_objects
        .first()
        .map_or(0.0, |object| object.start_time);
    let last_time = map.hit_objects.last_mut().map_or(
        first_time,
        rosu_map::section::hit_objects::HitObject::end_time,
    );
    let length_ms = (last_time - first_time).max(0.0);
    let break_duration_ms = map
        .breaks
        .iter()
        .map(|period| period.duration())
        .sum::<f64>();
    let active_length_ms = (length_ms - break_duration_ms).max(0.0);
    let hit_objects = count_hit_objects(&map);
    let average_nps = if active_length_ms > 0.0 {
        hit_objects.total as f64 / (active_length_ms / 1_000.0)
    } else {
        0.0
    };
    let peak_nps = peak_nps(&map);

    let mut warning = None;
    let mut stars = None;
    let mut max_pp = None;
    let mut max_combo = None;
    let mut bpm = 0.0;
    let mut analysis_status = "ready".to_string();

    match rosu_pp::Beatmap::from_bytes(bytes) {
        Ok(pp_map) => {
            bpm = pp_map.bpm();
            match Difficulty::new().checked_calculate(&pp_map) {
                Ok(attributes) => {
                    stars = Some(attributes.stars());
                    max_combo = Some(attributes.max_combo());
                    max_pp = Some(attributes.performance().calculate().pp());
                }
                Err(error) => {
                    analysis_status = "skipped_suspicious".to_string();
                    warning = Some(format!("谱面被安全检查跳过难度计算：{error:?}"));
                }
            }
        }
        Err(error) => {
            analysis_status = "difficulty_failed".to_string();
            warning = Some(format!("谱面结构已读取，但难度计算解析失败：{error}"));
        }
    }

    let (set_key, set_grouping_inferred) = set_key(client, &map, logical_path);
    let summary = LocalBeatmapSummary {
        resource,
        set_key,
        set_grouping_inferred,
        beatmap_id: (map.beatmap_id > 0).then_some(map.beatmap_id),
        beatmap_set_id: (map.beatmap_set_id > 0).then_some(map.beatmap_set_id),
        title: map.title.clone(),
        title_unicode: map.title_unicode.clone(),
        artist: map.artist.clone(),
        artist_unicode: map.artist_unicode.clone(),
        creator: map.creator.clone(),
        difficulty_name: map.version.clone(),
        ruleset: ruleset(map.mode),
        format_version: map.format_version,
        stars,
        max_pp,
        max_combo,
        bpm,
        length_ms,
        object_count: hit_objects.total,
        cs: map.circle_size,
        ar: map.approach_rate,
        od: map.overall_difficulty,
        hp: map.hp_drain_rate,
        average_nps,
        peak_nps,
        modified_at,
        analysis_status,
    };
    let detail = LocalBeatmapDetail {
        summary: summary.clone(),
        source: map.source,
        tags: map.tags,
        background_file: map.background_file,
        audio_file: map.audio_file,
        cs: summary.cs,
        ar: summary.ar,
        od: summary.od,
        hp: summary.hp,
        slider_multiplier: map.slider_multiplier,
        slider_tick_rate: map.slider_tick_rate,
        hit_objects,
        break_count: map.breaks.len(),
        break_duration_ms,
        timing_point_count: map.control_points.timing_points.len(),
        active_length_ms,
        average_nps: summary.average_nps,
        peak_nps: summary.peak_nps,
        difficulty_algorithm: DIFFICULTY_ALGORITHM.to_string(),
        calculation: calculation_version(),
        calculated_at: Utc::now().to_rfc3339(),
        strains: None,
    };

    Ok(ParsedBeatmap {
        summary,
        detail,
        warning,
    })
}

pub fn calculate_strains(bytes: &[u8]) -> Result<StrainAnalysis, String> {
    let map = rosu_pp::Beatmap::from_bytes(bytes)
        .map_err(|error| format!("无法为谱面计算 strain：{error}"))?;
    let strains = Difficulty::new()
        .checked_strains(&map)
        .map_err(|error| format!("谱面被安全检查跳过 strain 计算：{error:?}"))?;
    let section_length_ms = strains.section_len();
    let series = match strains {
        Strains::Osu(strains) => vec![
            StrainSeries {
                key: "aim".into(),
                values: strains.aim,
            },
            StrainSeries {
                key: "speed".into(),
                values: strains.speed,
            },
            StrainSeries {
                key: "flashlight".into(),
                values: strains.flashlight,
            },
        ],
        Strains::Taiko(strains) => vec![
            StrainSeries {
                key: "color".into(),
                values: strains.color,
            },
            StrainSeries {
                key: "reading".into(),
                values: strains.reading,
            },
            StrainSeries {
                key: "rhythm".into(),
                values: strains.rhythm,
            },
            StrainSeries {
                key: "stamina".into(),
                values: strains.stamina,
            },
        ],
        Strains::Catch(strains) => vec![StrainSeries {
            key: "movement".into(),
            values: strains.movement,
        }],
        Strains::Mania(strains) => vec![StrainSeries {
            key: "strain".into(),
            values: strains.strains,
        }],
    };

    Ok(StrainAnalysis {
        section_length_ms,
        series,
    })
}

fn parse_color(value: &str) -> Option<Vec<u8>> {
    let components = value
        .split(',')
        .map(|component| component.trim().parse::<u8>())
        .collect::<Result<Vec<_>, _>>()
        .ok()?;

    (components.len() == 3 || components.len() == 4).then_some(components)
}

pub fn parse_skin_config(text: &str) -> Vec<SkinConfigSection> {
    let mut sections = Vec::<SkinConfigSection>::new();
    let mut current = SkinConfigSection {
        name: "Root".into(),
        entries: Vec::new(),
    };

    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with("//") || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            if !current.entries.is_empty() || current.name != "Root" {
                sections.push(current);
            }
            current = SkinConfigSection {
                name: line[1..line.len() - 1].trim().to_string(),
                entries: Vec::new(),
            };
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let value = value.trim().to_string();
            current.entries.push(SkinConfigEntry {
                key: key.trim().to_string(),
                color: parse_color(&value),
                value,
            });
        }
    }

    if !current.entries.is_empty() || current.name != "Root" {
        sections.push(current);
    }
    sections
}

fn config_value(sections: &[SkinConfigSection], key: &str) -> Option<String> {
    sections
        .iter()
        .flat_map(|section| &section.entries)
        .find(|entry| entry.key.eq_ignore_ascii_case(key))
        .map(|entry| entry.value.clone())
}

pub fn inventory_skin(path: &Path) -> Result<SkinInventory, String> {
    let mut file_count = 0usize;
    let mut total_bytes = 0u64;
    let mut by_extension = BTreeMap::<String, usize>::new();

    for entry in WalkDir::new(path).follow_links(false) {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        file_count += 1;
        total_bytes = total_bytes.saturating_add(metadata.len());
        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "(none)".into());
        *by_extension.entry(extension).or_default() += 1;
    }

    Ok(SkinInventory {
        file_count,
        total_bytes,
        by_extension,
    })
}

pub fn parse_skin(
    client: LocalClient,
    bytes: &[u8],
    logical_path: &str,
    modified_at: Option<String>,
    known_hash: Option<&str>,
    skin_root: Option<&Path>,
) -> Result<LocalSkinDetail, String> {
    let text = decode_text(bytes);
    let sections = parse_skin_config(&text);
    if sections.is_empty() {
        return Err("skin.ini 没有可识别的配置段".into());
    }

    let content_hash = known_hash
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| sha256(bytes));
    let resource_id = match client {
        LocalClient::Stable => format!("stable:skin:{content_hash}:{}", short_hash(logical_path)),
        LocalClient::Lazer => format!("lazer:skin:{content_hash}"),
    };
    let inventory = skin_root.map(inventory_skin).transpose()?;
    let completeness = if inventory.is_some() {
        Completeness::Complete
    } else {
        Completeness::Partial
    };
    let fallback_name = skin_root
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .unwrap_or("Legacy skin")
        .to_string();
    let summary = LocalSkinSummary {
        resource: LocalResourceRef {
            resource_id,
            client,
            content_hash,
            logical_path: Some(logical_path.to_string()),
        },
        completeness,
        name: config_value(&sections, "Name").unwrap_or(fallback_name),
        author: config_value(&sections, "Author").unwrap_or_else(|| "Unknown".into()),
        version: config_value(&sections, "Version").unwrap_or_else(|| "Unknown".into()),
        section_count: sections.len(),
        has_mania_config: sections
            .iter()
            .any(|section| section.name.eq_ignore_ascii_case("Mania")),
        resource_count: inventory.as_ref().map(|value| value.file_count),
        total_bytes: inventory.as_ref().map(|value| value.total_bytes),
        modified_at,
        accent_colors: sections
            .iter()
            .flat_map(|section| &section.entries)
            .filter_map(|entry| entry.color.clone())
            .take(8)
            .collect(),
    };

    Ok(LocalSkinDetail {
        summary,
        sections,
        inventory,
        notice: (client == LocalClient::Lazer).then(|| {
            "Lazer 未读取 client.realm；这里只展示可识别的 legacy skin 配置，无法确定完整资源归属。"
                .into()
        }),
    })
}

pub fn read_prefix(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;

    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.take(limit)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(mode: u8, hit_objects: &str) -> String {
        format!(
            r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: {mode}

[Metadata]
Title:Fixture
TitleUnicode:本地测试
Artist:Artist
ArtistUnicode:艺术家
Creator:OPP
Version:Test
BeatmapID:-1
BeatmapSetID:-1

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:6
ApproachRate:7
SliderMultiplier:1.4
SliderTickRate:1

[Events]
2,1800,2000

[TimingPoints]
0,500,4,2,0,100,1,0

[HitObjects]
{hit_objects}
"#
        )
    }

    #[test]
    fn detects_lazer_file_types_by_content() {
        assert!(looks_like_beatmap(b"osu file format v14\n[General]\n"));
        assert!(looks_like_skin_config(
            b"[General]\nName: Test\nAuthor: Mapper\n"
        ));
        assert!(!looks_like_skin_config(
            b"[General]\nAudioFilename: audio.mp3\n"
        ));
    }

    #[test]
    fn decodes_utf16_configuration_files() {
        let bytes = "BeatmapDirectory = CustomSongs\nLastVersion = b20260711.1"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();
        let mut with_bom = vec![0xff, 0xfe];
        with_bom.extend(bytes);
        assert!(decode_text(&with_bom).contains("LastVersion = b20260711.1"));
    }

    #[test]
    fn skin_parser_preserves_duplicate_keys_and_colors() {
        let parsed =
            parse_skin_config("[General]\nName: First\nName: Second\n[Colours]\nCombo1: 1, 2, 3\n");
        assert_eq!(parsed[0].entries.len(), 2);
        assert_eq!(parsed[1].entries[0].color, Some(vec![1, 2, 3]));
    }

    #[test]
    fn parses_unicode_objects_density_and_nomod_difficulty() {
        let source = fixture(
            0,
            "256,192,1000,1,0,0:0:0:0:\n\
             256,192,1500,2,0,B|300:192|350:192,1,140\n\
             256,192,2500,8,0,3000",
        );
        let parsed = parse_beatmap(
            LocalClient::Stable,
            source.as_bytes(),
            "Songs/Fixture/test.osu",
            None,
            None,
        )
        .expect("beatmap");
        assert_eq!(parsed.summary.title_unicode, "本地测试");
        assert_eq!(parsed.detail.hit_objects.circles, 1);
        assert_eq!(parsed.detail.hit_objects.sliders, 1);
        assert_eq!(parsed.detail.hit_objects.spinners, 1);
        assert_eq!(parsed.detail.break_count, 1);
        assert!(parsed.detail.average_nps > 0.0);
        assert!(parsed.detail.peak_nps >= 1.0);
        assert!(parsed.summary.stars.is_some());
        assert!(parsed.summary.max_pp.is_some_and(|pp| pp > 0.0));
        assert!(parsed.summary.max_combo.is_some());
        assert_eq!(parsed.detail.calculation.engine_version, "4.0.1");
        assert_eq!(
            parsed.detail.calculation.ruleset_versions["osu"],
            20_250_306
        );
        assert!(parsed.detail.calculated_at.contains('T'));
    }

    #[test]
    fn exposes_native_strain_series_for_all_rulesets() {
        let circles = (0..16)
            .map(|index| {
                format!(
                    "{},192,{},1,0,0:0:0:0:",
                    32 + (index % 8) * 56,
                    1_000 + index * 250
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let expected = [
            (0, Ruleset::Osu, vec!["aim", "speed", "flashlight"]),
            (
                1,
                Ruleset::Taiko,
                vec!["color", "reading", "rhythm", "stamina"],
            ),
            (2, Ruleset::Fruits, vec!["movement"]),
            (3, Ruleset::Mania, vec!["strain"]),
        ];

        for (mode, ruleset, expected_keys) in expected {
            let source = fixture(mode, &circles);
            let parsed = parse_beatmap(
                LocalClient::Stable,
                source.as_bytes(),
                "Songs/Fixture/test.osu",
                None,
                None,
            )
            .expect("beatmap");
            assert_eq!(parsed.summary.ruleset, ruleset);
            assert!(
                parsed.summary.max_pp.is_some_and(|pp| pp > 0.0),
                "{ruleset} should expose a positive NoMod full-combo pp value"
            );
            let strains = calculate_strains(source.as_bytes()).expect("strains");
            assert!(strains.section_length_ms > 0.0);
            assert_eq!(
                strains
                    .series
                    .iter()
                    .map(|series| series.key.as_str())
                    .collect::<Vec<_>>(),
                expected_keys
            );
        }
    }

    #[test]
    fn damaged_beatmap_is_rejected_without_panicking() {
        let result = parse_beatmap(
            LocalClient::Lazer,
            b"osu file format v14\n[HitObjects]\nnot-an-object",
            "hash",
            None,
            None,
        );
        assert!(result.is_err());
    }
}
