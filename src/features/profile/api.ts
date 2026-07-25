import { useQuery, useQueryClient } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";
import type { Ruleset } from "../../shared/types/osu";

export const profileQueryKey = (ruleset: Ruleset) =>
  ["own-profile", ruleset] as const;

export function useOwnProfile(ruleset: Ruleset) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: profileQueryKey(ruleset),
    queryFn: () => desktopApi.getOwnProfile(ruleset),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const refresh = async () => {
    const refreshed = await desktopApi.getOwnProfile(ruleset, true);
    queryClient.setQueryData(profileQueryKey(ruleset), refreshed);
    return refreshed;
  };

  return { ...query, refresh };
}
