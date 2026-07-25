import type {
  OwnProfile,
  Ruleset,
  UserStatistics,
} from "../../shared/types/osu";

/**
 * `/me/{mode}` already returns the requested mode in the top-level
 * `statistics` object. `statistics_rulesets` is useful as a fallback but its
 * entries currently omit fields such as `country_rank`.
 */
export function selectedStatistics(
  profile: OwnProfile | undefined,
  ruleset: Ruleset,
): UserStatistics {
  return (
    profile?.statistics ??
    profile?.statistics_rulesets?.[ruleset] ??
    {}
  );
}
