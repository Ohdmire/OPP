import { ArrowRight, Download, Gauge, Timer } from "lucide-react";
import { Badge, Button, Card } from "../../shared/components/ui";
import type { SimilarityResult } from "../../shared/types/osu";

function durationLabel(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function SimilarityResultCard({
  result,
  rank,
  selected,
  onSelect,
  onOpen,
  onDownload,
  downloading,
  downloadDisabled,
}: {
  result: SimilarityResult;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDownload: () => void;
  downloading: boolean;
  downloadDisabled: boolean;
}) {
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
            <Badge tone={rank <= 3 ? "cyan" : "neutral"}>
              距离 {result.final_distance.toFixed(4)}
            </Badge>
            <span className="truncate text-xs text-slate-500">
              #{result.beatmap_id}
            </span>
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold text-white">
            {result.artist} - {result.title}
          </h3>
          <p className="mt-1 truncate text-xs text-slate-400">
            [{result.version}] · mapped by {result.creator}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="size-3.5" />
              {Math.round(result.base.bpm)} BPM · AR {result.base.ar.toFixed(1)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Timer className="size-3.5" />
              {durationLabel(result.base.length_seconds)}
            </span>
            <span>
              难度 {result.difficulty_distance.toFixed(4)} · 基础{" "}
              {result.base_distance.toFixed(4)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label={`快捷下载 ${result.artist} - ${result.title}`}
            disabled={downloadDisabled}
            loading={downloading}
            onClick={(event) => {
              event.stopPropagation();
              onDownload();
            }}
            size="icon"
            variant="ghost"
          >
            <Download className="size-4" />
          </Button>
        <Button
          aria-label="在在线谱面中查看"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          size="icon"
          variant="ghost"
        >
          <ArrowRight className="size-4" />
        </Button>
        </div>
      </div>
    </Card>
  );
}
