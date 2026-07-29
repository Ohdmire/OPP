import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Download, Headphones, Pause } from "lucide-react";

import { Badge, Button, Card } from "../../shared/components/ui";
import { desktopApi, isTauri } from "../../shared/lib/tauri";
import type { SimilarityResult } from "../../shared/types/osu";

function durationLabel(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function osuTone(value: number, scale = 10) {
  const normalized = value / scale;
  if (normalized <= 0.125) return "metric-tone-0";
  if (normalized <= 0.2) return "metric-tone-1";
  if (normalized <= 0.25) return "metric-tone-2";
  if (normalized <= 0.35) return "metric-tone-3";
  if (normalized <= 0.4) return "metric-tone-4";
  if (normalized <= 0.5) return "metric-tone-5";
  if (normalized <= 0.65) return "metric-tone-6";
  return "metric-tone-7";
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-black/[0.12] px-2.5 py-2">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <strong className={`metric-value ${tone} mt-0.5 block text-sm`}>{value}</strong>
    </div>
  );
}

function readStars(value: Record<string, unknown>) {
  const rating = value.difficulty_rating;
  return typeof rating === "number" && Number.isFinite(rating) ? rating : null;
}

export function SimilarityResultCard({
  result,
  rank,
  selected,
  onSelect,
  onOpen,
  onDownload,
  onPreview,
  previewLoading,
  playing,
  downloading,
  downloadDisabled,
}: {
  result: SimilarityResult;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onPreview: () => void;
  previewLoading: boolean;
  playing: boolean;
  downloading: boolean;
  downloadDisabled: boolean;
}) {
  const stars = useQuery({
    queryKey: ["similarity-result-stars", result.beatmap_id],
    queryFn: async () => readStars(await desktopApi.getOnlineBeatmap(result.beatmap_id)),
    enabled: isTauri(),
    staleTime: Infinity,
    retry: 1,
  }).data;

  return (
    <Card
      className={`cursor-pointer p-4 transition ${
        selected
          ? "border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)]"
          : "hover:border-white/[0.16] hover:bg-white/[0.035]"
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 font-mono text-sm font-bold text-slate-300">
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={rank <= 3 ? "cyan" : "neutral"}>难度距离 {result.difficulty_distance.toFixed(4)}</Badge>
            <span className="truncate text-xs text-slate-500">#{result.beatmap_id}</span>
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold text-white">{result.artist} - {result.title}</h3>
          <p className="mt-1 truncate text-xs text-slate-400">[{result.version}] · mapped by {result.creator}</p>

          <div className="mt-3 grid grid-cols-5 gap-2">
            <Metric label="Star" tone={stars == null ? "metric-tone-muted" : osuTone(stars, 10)} value={stars == null ? "—" : `${stars.toFixed(2)}★`} />
            <Metric label="AR" tone={osuTone(result.base.ar)} value={result.base.ar.toFixed(1)} />
            <Metric label="CS" tone={osuTone(result.base.cs)} value={result.base.cs.toFixed(1)} />
            <Metric label="OD" tone={osuTone(result.base.od)} value={result.base.od.toFixed(1)} />
            <Metric label="HP" tone={osuTone(result.base.hp)} value={result.base.hp.toFixed(1)} />
            <Metric label="BPM" tone={osuTone(result.base.bpm, 300)} value={Math.round(result.base.bpm).toString()} />
            <Metric label="长度" tone={osuTone(result.base.length_seconds, 360)} value={durationLabel(result.base.length_seconds)} />
            <Metric label="密度" tone={osuTone(result.base.object_density)} value={result.base.object_density.toFixed(2)} />
            <Metric label="物件" tone={osuTone(result.base.object_count, 1600)} value={Math.round(result.base.object_count).toString()} />
            <Metric label="圆 / 滑" tone={osuTone(result.base.slider_ratio, 1)} value={`${Math.round(result.base.circle_ratio * 100)} / ${Math.round(result.base.slider_ratio * 100)}%`} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button aria-label={playing ? "暂停试听" : "试听"} loading={previewLoading} onClick={(event) => { event.stopPropagation(); onPreview(); }} size="icon" variant={playing ? "primary" : "ghost"}>
            {playing ? <Pause className="size-4" /> : <Headphones className="size-4" />}
          </Button>
          <Button aria-label={`快捷下载 ${result.artist} - ${result.title}`} disabled={downloadDisabled} loading={downloading} onClick={(event) => { event.stopPropagation(); onDownload(); }} size="icon" variant="ghost">
            <Download className="size-4" />
          </Button>
          <Button aria-label="在在线谱面中查看" onClick={(event) => { event.stopPropagation(); onOpen(); }} size="icon" variant="ghost">
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
