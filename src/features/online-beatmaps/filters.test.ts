import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  createDefaultSearchQuery,
  normalizePreviewUrl,
  parseOptionalNumber,
  starRange,
} from "./filters";

describe("online beatmap filters", () => {
  it("counts filters that differ from the ranked defaults", () => {
    const query = createDefaultSearchQuery("osu");
    expect(activeFilterCount(query)).toBe(0);
    query.mapper = "Sotarks";
    query.ranked_from = "2025-01-01";
    query.stars_min = 5;
    expect(activeFilterCount(query)).toBe(3);
  });

  it("uses newest rank date as the default sort", () => {
    expect(createDefaultSearchQuery("osu").sort).toBe("ranked_desc");
  });

  it("normalizes official protocol-relative previews", () => {
    expect(normalizePreviewUrl("//b.ppy.sh/preview/1.mp3")).toBe(
      "https://b.ppy.sh/preview/1.mp3",
    );
    expect(parseOptionalNumber("")).toBeNull();
    expect(parseOptionalNumber("4.25")).toBe(4.25);
  });

  it("formats the difficulty spread", () => {
    expect(
      starRange([
        {
          id: 1,
          beatmapset_id: 1,
          difficulty_rating: 6.2,
          mode: "osu",
          status: "ranked",
          total_length: 120,
          version: "Insane",
        },
        {
          id: 2,
          beatmapset_id: 1,
          difficulty_rating: 3.4,
          mode: "osu",
          status: "ranked",
          total_length: 120,
          version: "Hard",
        },
      ]),
    ).toBe("3.40–6.20★");
  });
});
