import { Check, Download, Headphones, Info, Pause } from "lucide-react";
import { Badge, Button, Card } from "../../shared/components/ui";
import { BeatmapDifficultyStrip, BeatmapInfoBar } from "../../shared/components/BeatmapSetVisuals";
import { fullNumber } from "../../shared/lib/format";
import type { OnlineBeatmapset } from "../../shared/types/osu";
import { durationLabel, normalizePreviewUrl } from "./filters";

function dateLabel(value?: string | null) {
  if (!value) return "未定";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function statusTone(status: string): "success" | "pink" | "cyan" | "warning" {
  if (status === "ranked" || status === "approved") return "success";
  if (status === "loved") return "pink";
  if (status === "qualified") return "cyan";
  return "warning";
}

export function BeatmapsetCard({ beatmapset, playing, selected, onOpen, onPreview, onSelect }: { beatmapset: OnlineBeatmapset; playing: boolean; selected: boolean; onOpen: () => void; onPreview: () => void; onSelect: () => void }) {
  const preview = normalizePreviewUrl(beatmapset.preview_url);
  const beatmaps = beatmapset.beatmaps ?? [];
  const longest = Math.max(0, ...beatmaps.map((beatmap) => beatmap.total_length ?? 0));
  const minStars = beatmaps.length ? Math.min(...beatmaps.map((beatmap) => beatmap.difficulty_rating)) : 0;
  const maxStars = beatmaps.length ? Math.max(...beatmaps.map((beatmap) => beatmap.difficulty_rating)) : 0;
  const objects = beatmaps.reduce((sum, beatmap) => sum + (beatmap.count_circles ?? 0) + (beatmap.count_sliders ?? 0) + (beatmap.count_spinners ?? 0), 0);
  const disabled = beatmapset.availability?.download_disabled === true;
  return <Card className={`group cursor-pointer overflow-hidden transition ${selected ? "border-cyan-300/30 bg-cyan-300/[0.045] shadow-[0_14px_44px_rgba(92,225,230,.08)]" : "hover:border-white/[0.13] hover:bg-[#121a28]"}`} onClick={onOpen} role="button" tabIndex={0}>
    <div className="flex min-h-[150px]">
      <button aria-label={selected ? "从下载队列移除" : "加入下载队列"} className="relative w-40 shrink-0 overflow-hidden bg-[#090d17] text-left" disabled={disabled} onClick={(event) => { event.stopPropagation(); onSelect(); }} type="button">
        {beatmapset.covers?.card ? <img alt="" className="absolute inset-0 size-full object-cover opacity-65 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-80" src={beatmapset.covers.card} /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#101622]" />
        <div className={`absolute left-3 top-3 grid size-8 place-items-center rounded-lg border backdrop-blur ${selected ? "border-cyan-200/50 bg-cyan-300/80 text-[#071017]" : "border-white/20 bg-black/45 text-white"}`}>{selected ? <Check className="size-4" /> : <Download className="size-4" />}</div>
        {disabled ? <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-rose-200 backdrop-blur">禁止下载</span> : null}
      </button>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(beatmapset.status)}>{beatmapset.status.toUpperCase()}</Badge>{beatmapset.nsfw ? <Badge tone="warning">NSFW</Badge> : null}{beatmapset.video ? <Badge>VIDEO</Badge> : null}</div><button className="mt-2 block max-w-full text-left outline-none" onClick={(event) => { event.stopPropagation(); onOpen(); }} type="button"><h3 className="truncate text-base font-semibold text-white transition hover:text-cyan-100">{beatmapset.title}</h3><p className="mt-0.5 truncate text-sm text-slate-500">{beatmapset.artist}</p></button></div><div className="flex shrink-0 gap-1"><Button aria-label={playing ? "暂停试听" : "试听"} disabled={!preview} onClick={(event) => { event.stopPropagation(); onPreview(); }} size="icon" variant={playing ? "primary" : "ghost"}>{playing ? <Pause className="size-4" /> : <Headphones className="size-4" />}</Button><Button aria-label="预览详情" onClick={(event) => { event.stopPropagation(); onOpen(); }} size="icon" variant="ghost"><Info className="size-4" /></Button></div></div>
        <div className="mt-3 text-sm text-slate-500">Mapper <strong className="font-medium text-slate-300">{beatmapset.creator}</strong><span className="mx-2 text-slate-700">·</span>{dateLabel(beatmapset.ranked_date)}</div>
        <div className="mt-4"><BeatmapInfoBar metrics={[{ label: "Star range", value: `${minStars.toFixed(2)}–${maxStars.toFixed(2)}★` }, { label: "BPM", value: String(Math.round(beatmapset.bpm ?? 0)) }, { label: "Length", value: durationLabel(longest) }, { label: "Objects", value: fullNumber(objects) }, { label: "Play count", value: fullNumber(beatmapset.play_count ?? 0) }, { label: "Difficulties", value: String(beatmaps.length) }]} /></div>
      </div>
    </div>
    <div className="border-t border-white/[0.055] bg-black/10 px-4 py-3"><BeatmapDifficultyStrip difficulties={beatmaps.map((beatmap) => ({ id: beatmap.id, mode: beatmap.mode, stars: beatmap.difficulty_rating, label: beatmap.version, onClick: onOpen }))} /></div>
  </Card>;
}
