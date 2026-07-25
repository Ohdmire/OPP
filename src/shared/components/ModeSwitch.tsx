import type { Ruleset } from "../types/osu";
import { rulesetLabels } from "../lib/format";
import { cn } from "../lib/cn";

const modes: Ruleset[] = ["osu", "taiko", "fruits", "mania"];

export function ModeSwitch({
  value,
  onChange,
  compact = false,
}: {
  value: Ruleset;
  onChange: (mode: Ruleset) => void;
  compact?: boolean;
}) {
  return (
    <div
      aria-label="游戏模式"
      className="inline-flex rounded-xl border border-white/[0.08] bg-black/20 p-1"
      role="tablist"
    >
      {modes.map((mode) => (
        <button
          aria-selected={value === mode}
          className={cn(
            "relative rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/50",
            compact && "px-2.5 py-1.5 text-[11px]",
            value === mode &&
              "bg-white/[0.09] text-white shadow-[0_6px_22px_rgba(0,0,0,.25)]",
          )}
          key={mode}
          onClick={() => onChange(mode)}
          role="tab"
          type="button"
        >
          {rulesetLabels[mode]}
        </button>
      ))}
    </div>
  );
}
