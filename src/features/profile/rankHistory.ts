export interface RankHistoryPoint {
  label: string;
  rank: number;
}

export interface RankTrend {
  direction: "up" | "down" | "flat";
  amount: number;
  current: number | null;
}

function validRanks(ranks: readonly number[]) {
  return ranks.filter((rank) => Number.isFinite(rank) && rank > 0);
}

export function buildRankHistory(ranks: readonly number[]): RankHistoryPoint[] {
  return ranks.flatMap((rank, index, source) => {
    if (!Number.isFinite(rank) || rank <= 0) return [];
    const daysAgo = source.length - index - 1;
    return [{
      label: daysAgo === 0 ? "今天" : `${daysAgo} 天前`,
      rank,
    }];
  });
}

export function calculateRankTrend(ranks: readonly number[]): RankTrend {
  const valid = validRanks(ranks);
  const first = valid[0];
  const current = valid.length ? valid[valid.length - 1] : null;

  if (first === undefined || current === null) {
    return { direction: "flat", amount: 0, current };
  }

  // 排名数字越小越靠前：100 -> 80 是上升 20 名。
  const improvement = first - current;
  return {
    direction: improvement > 0 ? "up" : improvement < 0 ? "down" : "flat",
    amount: Math.abs(improvement),
    current,
  };
}
