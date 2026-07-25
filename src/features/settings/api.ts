import { useQuery } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";

export const settingsQueryKey = ["settings"] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: desktopApi.getSettings,
    staleTime: Infinity,
    retry: false,
  });
}
