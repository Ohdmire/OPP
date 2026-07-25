export type Ruleset = "osu" | "taiko" | "fruits" | "mania";
export type OsuClient = "stable" | "lazer";
export type Completeness = "complete" | "partial";
export type CapabilityLevel = "full" | "partial" | "unavailable";

export interface Cached<T> {
  data: T;
  fetched_at: string;
  stale: boolean;
}

export interface CommandError {
  code: string;
  message: string;
  retry_after_seconds?: number;
}

export interface AuthStatus {
  credentials_configured: boolean;
  connected: boolean;
  client_id: string | null;
  callback_url: string;
  user_id: number | null;
  username: string | null;
}

export interface PendingOAuth {
  authorization_url: string;
  expires_at: string;
}

export interface OAuthResult {
  ok: boolean;
  code: string;
  message: string;
}

export interface AppSettings {
  reduce_motion: boolean;
}

export interface DisconnectResult {
  revoked: boolean;
  warning: string | null;
}

export interface UserLevel {
  current?: number;
  progress?: number;
}

export interface GradeCounts {
  ssh?: number;
  ss?: number;
  sh?: number;
  s?: number;
  a?: number;
}

export interface UserStatistics {
  count_100?: number;
  count_300?: number;
  count_50?: number;
  count_miss?: number;
  grade_counts?: GradeCounts;
  hit_accuracy?: number;
  is_ranked?: boolean;
  level?: UserLevel;
  maximum_combo?: number;
  play_count?: number;
  play_time?: number;
  pp?: number;
  global_rank?: number | null;
  country_rank?: number | null;
  ranked_score?: number;
  replays_watched_by_others?: number;
  total_hits?: number;
  total_score?: number;
  variants?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface UserCover {
  custom_url?: string | null;
  url?: string;
  id?: number | null;
}

export interface RankHistory {
  mode?: Ruleset;
  data?: number[];
}

export interface MonthlyCount {
  start_date?: string;
  count?: number;
}

export interface ProfilePage {
  html?: string;
  raw?: string;
}

export interface OwnProfile {
  id: number;
  username: string;
  avatar_url: string;
  avatar_data_url?: string | null;
  country_code: string;
  is_active: boolean;
  is_online: boolean;
  is_supporter: boolean;
  is_restricted?: boolean | null;
  last_visit?: string | null;
  playmode?: Ruleset | null;
  profile_colour?: string | null;
  default_group?: string | null;
  cover?: UserCover | null;
  cover_url?: string | null;
  country?: { code?: string; name?: string };
  statistics?: UserStatistics | null;
  statistics_rulesets?: Partial<Record<Ruleset, UserStatistics>> | null;
  rank_history?: RankHistory | null;
  monthly_playcounts?: MonthlyCount[] | null;
  replays_watched_counts?: MonthlyCount[] | null;
  badges?: Array<Record<string, any>> | null;
  groups?: Array<Record<string, any>> | null;
  user_achievements?: Array<Record<string, any>> | null;
  account_history?: Array<Record<string, any>> | null;
  page?: ProfilePage | null;
  join_date?: string;
  location?: string | null;
  interests?: string | null;
  occupation?: string | null;
  website?: string | null;
  discord?: string | null;
  twitter?: string | null;
  title?: string | null;
  previous_usernames?: string[];
  playstyle?: string[];
  post_count?: number;
  follower_count?: number;
  mapping_follower_count?: number;
  beatmap_playcounts_count?: number;
  favourite_beatmapset_count?: number;
  graveyard_beatmapset_count?: number;
  loved_beatmapset_count?: number;
  pending_beatmapset_count?: number;
  ranked_beatmapset_count?: number;
  guest_beatmapset_count?: number;
  nominated_beatmapset_count?: number;
  scores_best_count?: number;
  scores_first_count?: number;
  scores_recent_count?: number;
  kudosu?: { available?: number; total?: number };
  support_level?: number;
  rank_highest?: { rank?: number; updated_at?: string } | null;
  [key: string]: any;
}

export interface Beatmap {
  id?: number;
  beatmapset_id?: number;
  difficulty_rating?: number;
  mode?: Ruleset;
  status?: string;
  total_length?: number;
  hit_length?: number;
  version?: string;
  accuracy?: number;
  ar?: number;
  bpm?: number;
  cs?: number;
  drain?: number;
  passcount?: number;
  playcount?: number;
  url?: string;
  [key: string]: any;
}

export interface Beatmapset {
  id?: number;
  artist?: string;
  artist_unicode?: string;
  title?: string;
  title_unicode?: string;
  creator?: string;
  covers?: {
    cover?: string;
    card?: string;
    list?: string;
    slimcover?: string;
    [key: string]: string | undefined;
  };
  [key: string]: any;
}

export interface Score {
  id?: number | null;
  user_id: number;
  accuracy: number;
  pp?: number | null;
  rank: string;
  total_score?: number | null;
  legacy_total_score?: number | null;
  max_combo?: number | null;
  ended_at?: string | null;
  created_at?: string | null;
  has_replay?: boolean | null;
  mods: Array<string | { acronym?: string; settings?: Record<string, unknown> }>;
  statistics: Record<string, number>;
  maximum_statistics?: Record<string, number> | null;
  beatmap?: Beatmap | null;
  beatmapset?: Beatmapset | null;
  weight?: { percentage?: number; pp?: number } | null;
  [key: string]: any;
}

export interface LocalCapabilities {
  beatmaps: CapabilityLevel;
  difficulty: CapabilityLevel;
  skins: CapabilityLevel;
  skin_resources: CapabilityLevel;
  realm_index: boolean;
}

export interface LocalSourceStatus {
  client: OsuClient;
  mode: "auto" | "override";
  configured_path: string | null;
  install_root: string | null;
  data_root: string | null;
  version: string | null;
  valid: boolean;
  validation_errors: string[];
  capabilities: LocalCapabilities;
  last_scanned_at: string | null;
}

export interface LocalResourceRef {
  resource_id: string;
  client: OsuClient;
  content_hash: string;
  logical_path?: string | null;
}

export interface ScanDiagnostic {
  code: string;
  message: string;
  logical_path?: string | null;
  resource_id?: string | null;
}

export interface LocalLibrarySummary {
  client: OsuClient;
  completeness: Completeness;
  source_root: string;
  scanned_at: string;
  beatmap_count: number;
  beatmap_set_count: number;
  beatmap_set_count_inferred: boolean;
  skin_count: number;
  source_file_count: number;
  source_bytes: number;
  diagnostic_count: number;
  mode_counts: Partial<Record<Ruleset, number>>;
}

export interface HitObjectCounts {
  circles: number;
  sliders: number;
  spinners: number;
  holds: number;
  total: number;
}

export interface LocalBeatmapSummary {
  resource: LocalResourceRef;
  set_key: string;
  set_grouping_inferred: boolean;
  beatmap_id: number | null;
  beatmap_set_id: number | null;
  title: string;
  title_unicode: string;
  artist: string;
  artist_unicode: string;
  creator: string;
  difficulty_name: string;
  ruleset: Ruleset;
  format_version: number;
  stars: number | null;
  max_combo: number | null;
  bpm: number;
  length_ms: number;
  object_count: number;
  cs: number;
  ar: number;
  od: number;
  hp: number;
  average_nps: number;
  peak_nps: number;
  modified_at: string | null;
  analysis_status: string;
}

export interface StrainSeries {
  key: string;
  values: number[];
}

export interface StrainAnalysis {
  section_length_ms: number;
  series: StrainSeries[];
}

export interface LocalBeatmapDetail {
  summary: LocalBeatmapSummary;
  source: string;
  tags: string;
  background_file: string;
  audio_file: string;
  cs: number;
  ar: number;
  od: number;
  hp: number;
  slider_multiplier: number;
  slider_tick_rate: number;
  hit_objects: HitObjectCounts;
  break_count: number;
  break_duration_ms: number;
  timing_point_count: number;
  active_length_ms: number;
  average_nps: number;
  peak_nps: number;
  difficulty_algorithm: string;
  strains?: StrainAnalysis | null;
}

export interface LocalBeatmapSetSummary {
  set_key: string;
  completeness: Completeness;
  grouping_inferred: boolean;
  beatmap_set_id: number | null;
  title: string;
  title_unicode: string;
  artist: string;
  artist_unicode: string;
  creators: string[];
  min_stars: number | null;
  max_stars: number | null;
  bpm: number;
  length_ms: number;
  object_count: number;
  modified_at: string | null;
  background_resource_id: string | null;
  difficulties: LocalBeatmapSummary[];
}

export interface SkinConfigEntry {
  key: string;
  value: string;
  color?: number[] | null;
}

export interface SkinConfigSection {
  name: string;
  entries: SkinConfigEntry[];
}

export interface SkinInventory {
  file_count: number;
  total_bytes: number;
  by_extension: Record<string, number>;
}

export interface LocalSkinSummary {
  resource: LocalResourceRef;
  completeness: Completeness;
  name: string;
  author: string;
  version: string;
  section_count: number;
  has_mania_config: boolean;
  resource_count: number | null;
  total_bytes: number | null;
  modified_at: string | null;
  accent_colors: number[][];
}

export interface LocalSkinDetail {
  summary: LocalSkinSummary;
  sections: SkinConfigSection[];
  inventory: SkinInventory | null;
  notice: string | null;
}

export type SkinAssetKind = "image" | "audio";

export interface LocalSkinAssetSummary {
  resource_id: string;
  kind: SkinAssetKind;
  name: string;
  logical_path: string;
  extension: string;
  size: number;
  category: string;
}

export interface LocalSkinPreview {
  skin_resource_id: string;
  completeness: Completeness;
  images: LocalSkinAssetSummary[];
  sounds: LocalSkinAssetSummary[];
}

export interface LocalSkinAssetPayload {
  resource_id: string;
  kind: SkinAssetKind;
  mime_type: string;
  data_url: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export type BeatmapSort =
  | "title"
  | "artist"
  | "creator"
  | "stars"
  | "bpm"
  | "length"
  | "object_count"
  | "modified_at";

export interface BeatmapQuery {
  client: OsuClient;
  search: string;
  rulesets: Ruleset[];
  min_stars: number | null;
  max_stars: number | null;
  min_bpm: number | null;
  max_bpm: number | null;
  min_length_ms: number | null;
  max_length_ms: number | null;
  min_objects: number | null;
  max_objects: number | null;
  min_ar: number | null;
  max_ar: number | null;
  min_cs: number | null;
  max_cs: number | null;
  min_od: number | null;
  max_od: number | null;
  submitted: boolean | null;
  sort: BeatmapSort;
  direction: "asc" | "desc";
  offset: number;
  limit: number;
}

export type SkinSort = "name" | "author" | "size" | "modified_at";

export interface SkinQuery {
  client: OsuClient;
  search: string;
  sort: SkinSort;
  direction: "asc" | "desc";
  offset: number;
  limit: number;
}

export interface LocalScanProgress {
  client: OsuClient;
  phase:
    | "discovery"
    | "indexing"
    | "beatmaps"
    | "difficulty"
    | "skins"
    | "finalizing";
  processed: number;
  total: number;
  percent: number;
}
