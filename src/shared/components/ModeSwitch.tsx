import type { Ruleset } from "../types/osu";
import { rulesetLabels } from "../lib/format";
import { cn } from "../lib/cn";
import { RulesetIcon } from "./RulesetIcon";

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
      className="inline-flex rounded-lg border border-white/[0.09] bg-black/15 p-0.5"
      role="tablist"
    >
      {modes.map((mode) => (
        <button
          aria-selected={value === mode}
          className={cn(
            "relative inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]",
            compact && "min-h-8 px-2.5 py-1 text-[10px]",
            value === mode &&
              "selected-mask text-[var(--theme-primary)]",
          )}
          key={mode}
          onClick={() => onChange(mode)}
          role="tab"
          type="button"
        >
          <RulesetIcon mode={mode} className="size-4" />
          <span>{rulesetLabels[mode]}</span>
        </button>
      ))}
    </div>
  );
}
