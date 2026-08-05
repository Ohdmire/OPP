import { Card } from "../../shared/components/ui";
import type { DifficultyFeatureVector, SimilarityDynamicWeightProfile } from "../../shared/types/osu";

const dimensions: Array<[keyof DifficultyFeatureVector, string]> = [
  ["aim", "Aim"],
  ["speed", "Speed"],
  ["reading", "Reading"],
  ["slider", "Slider"],
  ["overlap", "Overlap"],
];

function dominantDynamicFeature(profile: SimilarityDynamicWeightProfile | null | undefined) {
  if (!profile) return null;
  return dimensions.reduce((best, current) => profile.weights[current[0]] > profile.weights[best[0]] ? current : best)[1];
}

function sectionLabel(section: number) {
  return (section / 10).toFixed(1);
}

export function DynamicWeightProfileCard({ profile, compact = false }: { profile: SimilarityDynamicWeightProfile; compact?: boolean }) {
  const dominant = dominantDynamicFeature(profile);
  return (
    <Card className={compact ? "mt-4 p-4" : "mb-5 p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">动态权重档案</span>
          <p className="mt-1 text-sm text-slate-200">主导特征：<strong className="text-white">{dominant}</strong></p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>目标 {profile.target_star_rating.toFixed(2)}★ · 候选 {sectionLabel(profile.candidate_min_section)}～{sectionLabel(profile.candidate_max_section)}★ 桶</p>
          <p className="mt-1">统计 {sectionLabel(profile.stats_min_section)}～{sectionLabel(profile.stats_max_section)}★ 桶 · {profile.sample_count.toLocaleString()} 张</p>
        </div>
      </div>
      {profile.fallback_reason ? <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">已回退到手动权重：{profile.fallback_reason}</p> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[500px] text-left text-xs">
          <thead className="text-slate-500"><tr><th className="pb-2">维度</th><th className="pb-2">区间平均</th><th className="pb-2">目标差值</th><th className="pb-2">标准化偏差</th><th className="pb-2">最终权重</th></tr></thead>
          <tbody>
            {dimensions.map(([key, label]) => <tr className="border-t border-white/[0.055]" key={key}><td className="py-2 text-slate-300">{label}</td><td className="font-mono text-slate-400">{profile.mean[key].toFixed(3)}</td><td className="font-mono text-slate-300">{profile.delta[key] >= 0 ? "+" : ""}{profile.delta[key].toFixed(3)}</td><td className="font-mono text-slate-300">{profile.z_score[key].toFixed(2)}</td><td className="font-mono font-semibold text-[var(--theme-primary-light)]">{profile.weights[key].toFixed(2)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
