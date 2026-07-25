import { describe, expect, it } from "vitest";
import type { OwnProfile } from "../../shared/types/osu";
import { selectedStatistics } from "./statistics";

describe("selectedStatistics", () => {
  it("keeps mode-specific country rank from the top-level API statistics", () => {
    const profile = {
      id: 1,
      username: "player",
      avatar_url: "",
      country_code: "CN",
      is_active: true,
      is_online: false,
      is_supporter: false,
      statistics: { global_rank: 100, country_rank: 12 },
      statistics_rulesets: {
        osu: { global_rank: 100 },
      },
    } satisfies OwnProfile;

    expect(selectedStatistics(profile, "osu").country_rank).toBe(12);
  });

  it("falls back to statistics_rulesets for responses without top-level stats", () => {
    const profile = {
      id: 1,
      username: "player",
      avatar_url: "",
      country_code: "CN",
      is_active: true,
      is_online: false,
      is_supporter: false,
      statistics_rulesets: {
        taiko: { global_rank: 42 },
      },
    } satisfies OwnProfile;

    expect(selectedStatistics(profile, "taiko").global_rank).toBe(42);
  });
});
