export function beatmapPreviewRoute(beatmapId: number | null) {
  return beatmapId && beatmapId > 0 ? `/tools?preview_bid=${beatmapId}` : null;
}
