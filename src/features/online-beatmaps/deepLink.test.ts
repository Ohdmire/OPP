import { describe, expect, it } from "vitest";

import { parseOnlineBeatmapDeepLink } from "./deepLink";

describe("parseOnlineBeatmapDeepLink", () => {
  it("accepts a beatmapset and selected difficulty", () => {
    expect(
      parseOnlineBeatmapDeepLink(
        new URLSearchParams("beatmapset=123&beatmap=456"),
      ),
    ).toEqual({ beatmapsetId: 123, beatmapId: 456 });
  });

  it("rejects missing, negative and non-numeric identifiers", () => {
    expect(
      parseOnlineBeatmapDeepLink(
        new URLSearchParams("beatmapset=-1&beatmap=not-a-number"),
      ),
    ).toEqual({ beatmapsetId: null, beatmapId: null });
  });
});
