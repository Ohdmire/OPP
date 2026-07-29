import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare2, ChevronDown, DownloadCloud, Music2, SearchX, Volume2 } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMode } from "../../app/ModeContext";
import { ErrorPanel } from "../../shared/components/ErrorPanel";
import { PageHeader } from "../../shared/components/PageHeader";
import { Badge, Button, EmptyState, Skeleton } from "../../shared/components/ui";
import type { OnlineBeatmapSearchQuery, OnlineBeatmapset, Ruleset } from "../../shared/types/osu";
import { useOnlineBeatmapProviderStatus, useOnlineBeatmapsets } from "./api";
import { BeatmapDownloadPanel } from "./BeatmapDownloadPanel";
import { BeatmapsetCard } from "./BeatmapsetCard";
import { BeatmapsetDetailDialog } from "./BeatmapsetDetailDialog";
import { parseOnlineBeatmapDeepLink } from "./deepLink";
import { createDefaultSearchQuery, normalizePreviewUrl } from "./filters";
import { OnlineBeatmapFilters } from "./OnlineBeatmapFilters";
import { similarityRouteForBeatmap } from "../similar-beatmaps/navigation";

function uniqueBeatmapsets(items: OnlineBeatmapset[]) {
  const seen = new Set<number>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}

function OnlineBeatmapsClient({ ruleset }: { ruleset: Ruleset }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLink = parseOnlineBeatmapDeepLink(searchParams);
  const [draft, setDraft] = useState<OnlineBeatmapSearchQuery>(() => createDefaultSearchQuery(ruleset));
  const [activeQuery, setActiveQuery] = useState<OnlineBeatmapSearchQuery>(() => createDefaultSearchQuery(ruleset));
  const [queue, setQueue] = useState<Map<number, OnlineBeatmapset>>(() => new Map());
  const [manualDetailId, setManualDetailId] = useState<number | null>(null);
  const detailId = deepLink.beatmapsetId ?? manualDetailId;
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [previewVolume, setPreviewVolume] = useState(65);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const search = useOnlineBeatmapsets(activeQuery, true);
  const providers = useOnlineBeatmapProviderStatus();

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = previewVolume / 100; }, [previewVolume]);

  const items = useMemo(() => uniqueBeatmapsets(search.data?.pages.flatMap((page) => page.beatmapsets ?? []) ?? []), [search.data]);
  const searchSuggestions = useMemo(() => items.flatMap((item) => [
    { value: item.title, detail: "标题" },
    ...(item.title_unicode ? [{ value: item.title_unicode, detail: "标题" }] : []),
    { value: item.artist, detail: "艺术家" },
    { value: item.creator, detail: "Mapper" },
    ...(item.tags?.split(" ").filter(Boolean).map((tag) => ({ value: tag, detail: "标签" })) ?? []),
  ]), [items]);
  const availableTotal = search.data?.pages[0]?.total ?? null;
  const queueItems = useMemo(() => [...queue.values()], [queue]);
  const detailFallback = items.find((item) => item.id === detailId) ?? queue.get(detailId ?? -1) ?? null;

  const togglePreview = (beatmapset: OnlineBeatmapset) => {
    const source = normalizePreviewUrl(beatmapset.preview_url);
    if (!source) return;
    if (playingId === beatmapset.id && audioRef.current) {
      audioRef.current.pause(); audioRef.current = null; setPlayingId(null); return;
    }
    audioRef.current?.pause();
    const audio = new Audio(source);
    audio.volume = previewVolume / 100; audio.onended = () => setPlayingId(null); audio.onerror = () => setPlayingId(null);
    audioRef.current = audio; setPlayingId(beatmapset.id); audio.play().catch(() => { audioRef.current = null; setPlayingId(null); });
  };

  const toggleQueue = (beatmapset: OnlineBeatmapset) => setQueue((current) => {
    const next = new Map(current);
    if (next.has(beatmapset.id)) next.delete(beatmapset.id); else next.set(beatmapset.id, beatmapset);
    return next;
  });

  const reset = () => { const next = createDefaultSearchQuery(ruleset); setDraft(next); setActiveQuery(next); };
  const closeDetail = () => {
    setManualDetailId(null);
    const returnTo = location.state?.returnTo;
    if (typeof returnTo === "string" && returnTo.startsWith("/online/similar")) {
      navigate(returnTo);
      return;
    }
    if (searchParams.has("beatmapset") || searchParams.has("beatmap")) {
      const next = new URLSearchParams(searchParams);
      next.delete("beatmapset");
      next.delete("beatmap");
      setSearchParams(next, { replace: true });
    }
  };

  return <>
    <PageHeader
      actions={<div className="flex flex-wrap items-center justify-end gap-2"><Badge tone="cyan">官网筛选</Badge>{providers.data?.filter((provider) => provider.id !== "official").map((provider) => <Badge key={provider.id} tone={provider.online ? "success" : "warning"}>{provider.label} · {provider.online ? "在线" : "不可用"}</Badge>)}<Badge tone="pink"><DownloadCloud className="size-4" />批量下载</Badge></div>}
      description="从官网获取完整谱面信息，选择谱面后使用可选镜像适配器下载。"
      eyebrow="Online beatmaps"
      title="在线谱面"
    />

    <div className="mb-5 flex items-center justify-end gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm text-slate-300">
      <Volume2 className="size-4 text-cyan-200" />
      <label className="flex items-center gap-3">试听音量 <span className="w-8 text-right font-mono text-slate-200">{previewVolume}%</span><input aria-label="试听音量" className="w-36 accent-cyan-400" max="100" min="0" onChange={(event) => setPreviewVolume(Number(event.target.value))} type="range" value={previewVolume} /></label>
    </div>
    <div className="space-y-5">
      <OnlineBeatmapFilters loading={search.isFetching && !search.isFetchingNextPage} onChange={setDraft} onReset={reset} onSubmit={() => setActiveQuery({ ...draft, cursor_string: null })} query={draft} suggestions={searchSuggestions} />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5">
        <section className="min-w-0">
          <div className="mb-4 flex min-h-14 items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5">
            <div className="text-sm text-slate-400">已加载 <strong className="font-mono text-slate-100">{items.length}</strong>{availableTotal !== null ? <> / 共 <strong className="font-mono text-slate-100">{availableTotal}</strong></> : null}</div>
            <Button disabled={!items.length} onClick={() => setQueue((current) => { const next = new Map(current); items.forEach((item) => { if (!item.availability?.download_disabled) next.set(item.id, item); }); return next; })} size="sm" variant="ghost"><CheckSquare2 className="size-4" />将当前结果全部加入队列</Button>
          </div>
          {search.isLoading ? <div className="space-y-4">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-44" key={index} />)}</div> : search.error ? <ErrorPanel error={search.error} onRetry={() => search.refetch()} /> : !items.length ? <EmptyState action={<Button onClick={reset}><Music2 className="size-4" />查看近期 Ranked</Button>} description="请放宽筛选条件，或更换内容筛选标签。" icon={<SearchX className="size-5" />} title="没有找到匹配的谱面" /> : <>
            <div className="space-y-4">{items.map((beatmapset) => <BeatmapsetCard beatmapset={beatmapset} key={beatmapset.id} onOpen={() => setManualDetailId(beatmapset.id)} onPreview={() => togglePreview(beatmapset)} onSelect={() => toggleQueue(beatmapset)} playing={playingId === beatmapset.id} selected={queue.has(beatmapset.id)} />)}</div>
            {search.hasNextPage ? <Button className="mt-5 w-full" loading={search.isFetchingNextPage} onClick={() => search.fetchNextPage()}><ChevronDown className="size-4" />加载下一页</Button> : <p className="py-8 text-center text-sm text-slate-600">已到达搜索结果末尾</p>}
          </>}
        </section>
        <BeatmapDownloadPanel availableTotal={availableTotal} onClear={() => setQueue(new Map())} onRemove={(id) => setQueue((current) => { const next = new Map(current); next.delete(id); return next; })} onReplace={(items) => setQueue(new Map(items.map((item) => [item.id, item])))} query={activeQuery} queue={queueItems} />
      </div>
    </div>

    <BeatmapsetDetailDialog beatmapsetId={detailId} fallback={detailFallback} initialBeatmapId={deepLink.beatmapId} key={detailId ?? "closed"} onClose={closeDetail} onFindSimilar={(beatmapId) => navigate(similarityRouteForBeatmap(beatmapId))} onPreview={togglePreview} playing={detailId !== null && playingId === detailId} />
  </>;
}

export function OnlineBeatmapsPage() {
  const { ruleset } = useMode();
  return <OnlineBeatmapsClient key={ruleset} ruleset={ruleset} />;
}
