import { Button, Card } from "../../shared/components/ui";
import type {
  SimilarityDynamicWeightProfile,
  SimilarityBeatmap,
  SimilarityResult,
} from "../../shared/types/osu";
import { DynamicWeightProfileCard } from "./DynamicWeightProfile";
import { SimilarityRadar } from "./SimilarityRadar";

const difficultyDimensions = [
  ["aim", "Aim"],
  ["speed", "Speed"],
  ["reading", "Reading"],
  ["slider", "Slider"],
  ["overlap", "Overlap"],
] as const;

function Difference({ value, digits }: { value: number; digits: number }) {
  const tone = value === 0 ? "text-slate-500" : value > 0 ? "text-rose-300" : "text-emerald-300";
  return <small className={`ml-2 ${tone}`}>{value >= 0 ? "+" : ""}{value.toFixed(digits)}</small>;
}

export function SimilarityComparisonPanel({
  selected,
  target,
  recommendedBy,
  dynamicProfile,
  onOpen,
}: {
  selected: SimilarityResult;
  target: SimilarityBeatmap;
  recommendedBy: SimilarityBeatmap | null;
  dynamicProfile: SimilarityDynamicWeightProfile | null;
  onOpen: () => void;
}) {
  return (
    <aside className="sticky top-[120px] self-start">
      <Card className="similarity-comparison-panel min-h-[520px] resize-y overflow-hidden p-5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-primary)]">特征对比</span>
        <h2 className="mt-2 text-base font-semibold text-white">{selected.version}</h2>
        <p className="mt-1 truncate text-xs text-slate-400">{selected.artist} — {selected.title}</p>
        {recommendedBy ? <p className="mt-2 text-xs text-cyan-200">由 {recommendedBy.artist} - {recommendedBy.title} [{recommendedBy.version}] 推荐</p> : null}
        <SimilarityRadar target={target.difficulty} comparison={selected.difficulty} />
        {dynamicProfile ? <DynamicWeightProfileCard compact profile={dynamicProfile} /> : null}
        <div className="mb-4 space-y-1.5">
          {difficultyDimensions.map(([key, label]) => {
            const difference = selected.difficulty[key] - target.difficulty[key];
            return <div className="flex items-center justify-between border-b border-white/[0.055] py-1.5 text-xs last:border-b-0" key={key}>
              <span className="text-slate-400">{label}</span>
              <span className="font-mono text-slate-200">{selected.difficulty[key].toFixed(3)}<Difference digits={3} value={difference} /></span>
            </div>;
          })}
        </div>
        <div className="mb-4 space-y-1.5 border-t border-white/[0.07] pt-3">
          {(["ar", "cs", "od"] as const).map((key) => {
            const difference = selected.base[key] - target.base[key];
            return <div className="flex items-center justify-between border-b border-white/[0.055] py-1.5 text-xs last:border-b-0" key={key}>
              <span className="text-slate-400">{key.toUpperCase()}</span>
              <span className="font-mono text-slate-200">{target.base[key].toFixed(1)} → {selected.base[key].toFixed(1)}<Difference digits={1} value={difference} /></span>
            </div>;
          })}
        </div>
        <Button className="w-full" variant="primary" type="button" onClick={onOpen}>在在线谱面中查看</Button>
      </Card>
    </aside>
  );
}
