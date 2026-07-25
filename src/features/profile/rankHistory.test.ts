import { describe, expect, it } from "vitest";
import { buildRankHistory, calculateRankTrend } from "./rankHistory";

describe("rank history", () => {
  it("treats a smaller rank number as moving up", () => {
    expect(calculateRankTrend([120, 100, 80])).toEqual({
      direction: "up",
      amount: 40,
      current: 80,
    });
  });

  it("treats a larger rank number as moving down", () => {
    expect(calculateRankTrend([80, 100])).toEqual({
      direction: "down",
      amount: 20,
      current: 100,
    });
  });

  it("filters unavailable ranks without reversing chronology", () => {
    expect(buildRankHistory([120, 0, 80])).toEqual([
      { label: "2 天前", rank: 120 },
      { label: "今天", rank: 80 },
    ]);
  });
});
