import { useQuery, useQueryClient } from "@tanstack/react-query";
import { desktopApi } from "../../shared/lib/tauri";

export const collectionsQueryKey = ["collections"] as const;

export function useCollections() {
  return useQuery({ queryKey: collectionsQueryKey, queryFn: () => desktopApi.listCollections(), staleTime: 15_000 });
}

export function useRefreshCollections() {
  const queryClient = useQueryClient();
  return async (client: "stable" | "lazer") => {
    const snapshot = await desktopApi.refreshCollections(client);
    queryClient.setQueryData(collectionsQueryKey, snapshot);
    return snapshot;
  };
}

export function invalidateCollections(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: collectionsQueryKey });
}
