import { CircleDot, Clock3, Gauge, Layers3, Sparkles, Zap, type LucideIcon } from "lucide-react";
import type { Ruleset } from "../types/osu";
import { RulesetIcon } from "./RulesetIcon";

export interface BeatmapDifficultyVisual {
  id: string | number;
  mode: Ruleset;
  stars: number | null;
  label?: string;
  onClick?: () => void;
}

export interface BeatmapInfoMetric {
  label: string;
  value: string;
  icon?: LucideIcon;
}

function difficultyTone(stars: number | null) {
  if (stars === null) return "text-slate-300 border-slate-300/25 bg-slate-300/10";
  if (stars < 2) return "text-slate-300 border-slate-300/25 bg-slate-300/10";
  if (stars < 3) return "text-sky-200 border-sky-300/25 bg-sky-300/10";
  if (stars < 4) return "text-cyan-200 border-cyan-300/25 bg-cyan-300/10";
  if (stars < 5) return "text-emerald-200 border-emerald-300/25 bg-emerald-300/10";
  if (stars < 6) return "text-yellow-200 border-yellow-300/25 bg-yellow-300/10";
  if (stars < 7) return "text-orange-200 border-orange-300/25 bg-orange-300/10";
  return "text-red-200 border-red-300/25 bg-red-300/10";
}

export function DifficultyBadge({ stars, label }: { stars: number | null; label?: string }) {
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 font-mono text-xs font-semibold ${difficultyTone(stars)}`} title={label}>{stars === null ? "—" : stars.toFixed(2)}<span className="text-[10px] opacity-70">★</span>{label ? <span className="max-w-28 truncate font-sans text-[11px] font-medium opacity-80">{label}</span> : null}</span>;
}

export function BeatmapDifficultyStrip({ difficulties, expanded = true }: { difficulties: BeatmapDifficultyVisual[]; expanded?: boolean }) {
  const groups = difficulties.reduce<Map<Ruleset, BeatmapDifficultyVisual[]>>((result, difficulty) => { const group = result.get(difficulty.mode) ?? []; group.push(difficulty); result.set(difficulty.mode, group); return result; }, new Map());
  return <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">{[...groups.entries()].map(([mode, items]) => <div className="flex min-w-0 items-center gap-1.5" key={mode}><span className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-400" title={mode}><RulesetIcon mode={mode} /></span>{(expanded ? items : items.slice(0, 1)).map((difficulty) => { const content = <DifficultyBadge label={difficulty.label} stars={difficulty.stars} />; return difficulty.onClick ? <button className="rounded-lg outline-none transition hover:brightness-125 focus-visible:ring-2 focus-visible:ring-cyan-300/50" key={difficulty.id} onClick={difficulty.onClick} type="button">{content}</button> : <span key={difficulty.id}>{content}</span>; })}</div>)}</div>;
}

export function BeatmapInfoBar({ metrics }: { metrics: BeatmapInfoMetric[] }) {
  const fallbackIcons = [Sparkles, Zap, Clock3, CircleDot, Gauge, Layers3];
  return <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-white/10 bg-black/25 px-5 py-4 backdrop-blur-md sm:grid-cols-3">{metrics.slice(0, 6).map((metric, index) => { const Icon = metric.icon ?? fallbackIcons[index]; return <div className="flex items-center gap-2" key={`${metric.label}-${index}`}><Icon className="size-4 shrink-0 text-slate-500" /><div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-slate-600">{metric.label}</p><p className="mt-0.5 truncate font-mono text-sm font-semibold text-slate-200">{metric.value}</p></div></div>; })}</div>;
}
