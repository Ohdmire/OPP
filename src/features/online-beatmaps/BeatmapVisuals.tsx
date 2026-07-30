import { Apple, CircleDot, Drum, Grid3X3 } from "lucide-react";
export { DifficultyIcon } from "../../shared/components/DifficultyIcon";
import type { Ruleset } from "../../shared/types/osu";

const visuals: Record<Ruleset, { label: string; className: string; Icon: typeof CircleDot }> = {
  osu: { label: "osu!", className: "text-pink-200 bg-pink-300/10 border-pink-300/25", Icon: CircleDot },
  taiko: { label: "taiko", className: "text-orange-200 bg-orange-300/10 border-orange-300/25", Icon: Drum },
  fruits: { label: "catch", className: "text-emerald-200 bg-emerald-300/10 border-emerald-300/25", Icon: Apple },
  mania: { label: "mania", className: "text-violet-200 bg-violet-300/10 border-violet-300/25", Icon: Grid3X3 },
};

// Shared mod metadata is intentionally exported alongside the icon components.
// eslint-disable-next-line react-refresh/only-export-components
export const modeMods: Record<Ruleset, string[]> = {
  osu: ["HD", "HR", "DT", "NC", "FL", "EZ", "HT", "NF", "SD", "SO"],
  taiko: ["HD", "HR", "DT", "NC", "FL", "EZ", "HT", "NF", "SD", "SO"],
  fruits: ["HD", "HR", "DT", "NC", "FL", "EZ", "HT", "NF", "SD", "SO"],
  mania: ["HD", "HR", "DT", "NC", "FL", "EZ", "HT", "NF", "SD", "SO", "FI", "MR", "RD"],
};

export function ModeIcon({ mode, showLabel = false }: { mode: Ruleset; showLabel?: boolean }) {
  const visual = visuals[mode] ?? visuals.osu;
  const Icon = visual.Icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${visual.className}`} title={visual.label}><Icon className="size-4" />{showLabel ? visual.label : null}</span>;
}

export function ModIcon({ mod, active = false, onClick }: { mod: string; active?: boolean; onClick?: () => void }) {
  const content = <span className={`inline-flex size-9 items-center justify-center rounded-lg border font-mono text-[11px] font-bold transition ${active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100 shadow-[0_0_14px_rgba(103,232,249,.16)]" : "border-white/[0.1] bg-white/[0.025] text-slate-400 hover:border-white/25 hover:text-slate-200"}`} title={`${mod} Mod`}>{mod}</span>;
  return onClick ? <button aria-label={`${mod} Mod`} onClick={onClick} type="button">{content}</button> : content;
}
