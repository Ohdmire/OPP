use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    error::{CommandError, CommandResult},
    state::AppState,
};

#[derive(Debug, Clone, Deserialize)]
pub struct BeatmapCalculationRequest {
    pub beatmap_id: u64,
    #[serde(default)]
    pub mods: Vec<String>,
    pub accuracy: Option<f64>,
    pub misses: Option<u32>,
    pub combo: Option<u32>,
    pub n300: Option<u32>,
    pub n100: Option<u32>,
    pub n50: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BeatmapCalculationResult {
    pub beatmap_id: u64,
    pub mods: Vec<String>,
    pub mode: String,
    pub stars: f64,
    pub pp: f64,
    pub max_pp: f64,
    pub max_combo: u32,
    pub calculation_engine: String,
    pub calculated_at: String,
    pub source: String,
}

#[tauri::command]
pub async fn calculate_beatmap_pp(
    request: BeatmapCalculationRequest,
    state: State<'_, AppState>,
) -> CommandResult<BeatmapCalculationResult> {
    let download = match state.providers.catboy_osu(request.beatmap_id).await {
        Ok(download) => download,
        Err(catboy) => state.providers.nerinyan_osu(request.beatmap_id).await.map_err(|nerinyan| {
            CommandError::new(
                "BEATMAP_CALCULATION_SOURCE_FAILED",
                format!("Catboy: {}; Nerinyan: {}", catboy.message, nerinyan.message),
            )
        })?,
    };
    let bytes = download.bytes;
    let started = Instant::now();
    let map = rosu_pp::Beatmap::from_bytes(&bytes)
        .map_err(|error| CommandError::new("BEATMAP_PARSE_FAILED", error.to_string()))?;
    let bits = mod_bits(&request.mods)?;
    let difficulty = rosu_pp::Difficulty::new().mods(bits).calculate(&map);
    let max_pp = difficulty.clone().performance().calculate().pp();
    let mut performance = difficulty.performance().mods(bits);
    if let Some(value) = request.accuracy { performance = performance.accuracy(value.clamp(0.0, 100.0)); }
    if let Some(value) = request.misses { performance = performance.misses(value); }
    if let Some(value) = request.combo { performance = performance.combo(value); }
    if let Some(value) = request.n300 { performance = performance.n300(value); }
    if let Some(value) = request.n100 { performance = performance.n100(value); }
    if let Some(value) = request.n50 { performance = performance.n50(value); }
    let attributes = performance.calculate();
    let mode = format!("{:?}", map.mode).to_lowercase();
    let _elapsed = started.elapsed();
    Ok(BeatmapCalculationResult {
        beatmap_id: request.beatmap_id,
        mods: request.mods,
        mode,
        stars: attributes.stars(),
        pp: attributes.pp(),
        max_pp,
        max_combo: attributes.max_combo(),
        calculation_engine: "rosu-pp 4.0.1 / ppy-osu rulesets".into(),
        calculated_at: chrono::Utc::now().to_rfc3339(),
        source: download.source,
    })
}

fn mod_bits(mods: &[String]) -> CommandResult<u32> {
    let mut bits = 0;
    for value in mods {
        let acronym = value.trim().to_ascii_uppercase();
        let bit = match acronym.as_str() {
            "NM" | "NOMOD" => 0,
            "NF" => 1,
            "EZ" => 2,
            "TD" => 4,
            "HD" => 8,
            "HR" => 16,
            "SD" => 32,
            "DT" => 64,
            "RX" => 128,
            "HT" => 256,
            "NC" => 512,
            "FL" => 1024,
            "SO" => 4096,
            _ => return Err(CommandError::new("INVALID_MOD", format!("不支持的 Mod：{value}"))),
        };
        bits |= bit;
    }
    Ok(bits)
}

#[cfg(test)]
mod tests {
    use super::mod_bits;

    #[test]
    fn parses_common_mods() {
        assert_eq!(mod_bits(&["HD".into(), "DT".into()]).unwrap(), 72);
        assert_eq!(mod_bits(&["NM".into()]).unwrap(), 0);
    }

    #[test]
    fn rejects_unknown_mods() {
        assert!(mod_bits(&["UNKNOWN".into()]).is_err());
    }
}
