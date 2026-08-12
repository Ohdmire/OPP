import type { SimilarityRecommendationResult } from "../../shared/types/osu";

const STORAGE_KEY = "opp.similarity-recommendation-history.v1";

export interface RecommendationHistoryEntry {
  displayed_at: string;
  result: SimilarityRecommendationResult;
}

interface StoredRecommendationHistory {
  day: string;
  entries: RecommendationHistoryEntry[];
}

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredHistory(): StoredRecommendationHistory {
  const empty = { day: localDay(), entries: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StoredRecommendationHistory> | null;
    if (parsed?.day !== empty.day || !Array.isArray(parsed.entries)) return empty;
    return { day: parsed.day, entries: parsed.entries };
  } catch {
    return empty;
  }
}

export function getTodayRecommendationHistory() {
  return readStoredHistory().entries;
}

export function getTodayRecommendedBeatmapIds() {
  return new Set(getTodayRecommendationHistory().map((entry) => entry.result.beatmap_id));
}

export function recordDisplayedRecommendationBatch(results: SimilarityRecommendationResult[]) {
  if (results.length !== 5) return getTodayRecommendationHistory();

  const history = readStoredHistory();
  const knownIds = new Set(history.entries.map((entry) => entry.result.beatmap_id));
  const displayedAt = new Date().toISOString();
  for (const result of results) {
    if (knownIds.has(result.beatmap_id)) continue;
    history.entries.push({ displayed_at: displayedAt, result });
    knownIds.add(result.beatmap_id);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage failures must not prevent recommendations from being displayed.
  }
  return history.entries;
}
