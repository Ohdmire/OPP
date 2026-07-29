import type { OsuClient } from "../../shared/types/osu";

export type SimilarityLaunch =
  | { kind: "beatmap_id"; beatmapId: string }
  | { kind: "local_resource"; client: OsuClient; resourceId: string };

export function similarityRouteForBeatmap(beatmapId: number) {
  return `/online/similar?source=beatmap_id&value=${encodeURIComponent(String(beatmapId))}`;
}

export function similarityRouteForLocalResource(
  client: OsuClient,
  resourceId: string,
) {
  const params = new URLSearchParams({
    source: "local_resource",
    client,
    resource: resourceId,
  });
  return `/online/similar?${params}`;
}

export function parseSimilarityLaunch(searchParams: URLSearchParams): SimilarityLaunch | null {
  const source = searchParams.get("source");
  if (source === "beatmap_id") {
    const beatmapId = searchParams.get("value")?.trim();
    return beatmapId && /^\d+$/.test(beatmapId) ? { kind: "beatmap_id", beatmapId } : null;
  }
  if (source === "local_resource") {
    const client = searchParams.get("client");
    const resourceId = searchParams.get("resource")?.trim();
    return (client === "stable" || client === "lazer") && resourceId
      ? { kind: "local_resource", client, resourceId }
      : null;
  }
  return null;
}
