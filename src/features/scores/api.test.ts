import { describe, expect, it } from "vitest";
import { scoresQueryKey } from "./api";

describe("scoresQueryKey", () => {
  it("keeps score type and pagination range isolated in the cache", () => {
    expect(scoresQueryKey("osu", "best", 0, 100)).toEqual([
      "scores", "osu", "best", 0, 100,
    ]);
    expect(scoresQueryKey("osu", "best", 100, 100)).not.toEqual(
      scoresQueryKey("osu", "best", 0, 100),
    );
    expect(scoresQueryKey("osu", "pinned", 0, 100)).not.toEqual(
      scoresQueryKey("osu", "best", 0, 100),
    );
  });
});
