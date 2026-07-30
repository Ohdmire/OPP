import { CircleDot, Clock3, Gauge, Layers3, Sparkles, Zap, type LucideIcon } from "lucide-react";
import type { Ruleset } from "../types/osu";
import { RulesetIcon } from "./RulesetIcon";
import { DifficultyIcon } from "./DifficultyIcon";

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

export function DifficultyBadge({ stars, mode, label }: { stars: number | null; mode: Ruleset; label?: string }) {
  return <span className="inline-flex items-center gap-1" title={label}><DifficultyIcon mode={mode} stars={stars} />{label ? <span className="max-w-28 truncate font-sans text-[11px] font-medium text-slate-300">{label}</span> : null}</span>;
}

export function BeatmapDifficultyStrip({ difficulties, expanded = true }: { difficulties: BeatmapDifficultyVisual[]; expanded?: boolean }) {
  const groups = difficulties.reduce<Map<Ruleset, BeatmapDifficultyVisual[]>>((result, difficulty) => { const group = result.get(difficulty.mode) ?? []; group.push(difficulty); result.set(difficulty.mode, group); return result; }, new Map());
  return <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">{[...groups.entries()].map(([mode, items]) => <div className="flex min-w-0 items-center gap-1.5" key={mode}><span className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-400" title={mode}><RulesetIcon mode={mode} /></span>{(expanded ? items : items.slice(0, 1)).map((difficulty) => { const content = <DifficultyBadge label={difficulty.label} mode={difficulty.mode} stars={difficulty.stars} />; return difficulty.onClick ? <button className="rounded-lg outline-none transition hover:brightness-125 focus-visible:ring-2 focus-visible:ring-cyan-300/50" key={difficulty.id} onClick={difficulty.onClick} type="button">{content}</button> : <span key={difficulty.id}>{content}</span>; })}</div>)}</div>;
}

export function BeatmapInfoBar({ metrics }: { metrics: BeatmapInfoMetric[] }) {
  const fallbackIcons = [Sparkles, Zap, Clock3, CircleDot, Gauge, Layers3];
  return <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-white/10 bg-black/25 px-5 py-4 backdrop-blur-md sm:grid-cols-3">{metrics.slice(0, 6).map((metric, index) => { const Icon = metric.icon ?? fallbackIcons[index]; return <div className="flex items-center gap-2" key={`${metric.label}-${index}`}><Icon className="size-4 shrink-0 text-slate-500" /><div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-slate-600">{metric.label}</p><p className="mt-0.5 truncate font-mono text-sm font-semibold text-slate-200">{metric.value}</p></div></div>; })}</div>;
}
