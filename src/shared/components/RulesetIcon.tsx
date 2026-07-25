import { Apple, CircleDot, Drum, Grid3X3 } from "lucide-react";
import type { Ruleset } from "../types/osu";

const icons = { osu: CircleDot, taiko: Drum, fruits: Apple, mania: Grid3X3 } satisfies Record<Ruleset, typeof CircleDot>;

export function RulesetIcon({ mode, className = "size-4" }: { mode: Ruleset; className?: string }) {
  const Icon = icons[mode];
  return <Icon aria-hidden="true" className={className} />;
}
