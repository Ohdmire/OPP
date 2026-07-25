import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Ruleset } from "../../shared/types/osu";
import { desktopApi } from "../../shared/lib/tauri";

export const scoresQueryKey = (ruleset: Ruleset) =>
  ["best-scores", ruleset] as const;

export function useBestScores(ruleset: Ruleset, enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: scoresQueryKey(ruleset),
    queryFn: () => desktopApi.getBestScores(ruleset),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const refresh = async () => {
    const refreshed = await desktopApi.getBestScores(ruleset, true);
    queryClient.setQueryData(scoresQueryKey(ruleset), refreshed);
    return refreshed;
  };

  return { ...query, refresh };
}
