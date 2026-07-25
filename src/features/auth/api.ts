import { useQuery } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";

export const authQueryKey = ["auth-status"] as const;

export function useAuthStatus() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: desktopApi.getAuthStatus,
    retry: false,
    staleTime: 15_000,
  });
}
