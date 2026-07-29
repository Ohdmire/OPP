export function parseOnlineBeatmapDeepLink(searchParams: URLSearchParams) {
  const parsePositiveInteger = (name: string) => {
    const raw = searchParams.get(name);
    if (!raw || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };

  return {
    beatmapsetId: parsePositiveInteger("beatmapset"),
    beatmapId: parsePositiveInteger("beatmap"),
  };
}
