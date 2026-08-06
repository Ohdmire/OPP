import type { DifficultyFeatureVector, SimilarityDynamicWeightProfile } from "../../shared/types/osu";

const dimensions: Array<[keyof DifficultyFeatureVector, string]> = [
  ["aim", "Aim"], ["speed", "Speed"], ["reading", "Reading"], ["slider", "Slider"], ["overlap", "Overlap"],
];
const parameters = [["ar", "AR"], ["cs", "CS"], ["od", "OD"]] as const;
const sectionLabel = (section: number) => (section / 10).toFixed(1);

export function DynamicWeightProfileCard({ profile }: { profile: SimilarityDynamicWeightProfile; compact?: boolean }) {
  return (
    <section className="mt-4 border-t border-white/[0.07] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">动态权重档案</span><p className="mt-1 text-xs text-slate-500">AR、CS、OD 分别统计，共享一组最终权重。</p></div>
        <div className="text-right text-[11px] text-slate-500"><p>目标 {profile.target_star_rating.toFixed(2)}★ · 候选 {sectionLabel(profile.candidate_min_section)}–{sectionLabel(profile.candidate_max_section)}★</p><p>统计范围 {sectionLabel(profile.stats_min_section)}–{sectionLabel(profile.stats_max_section)}★ · {profile.sample_count.toLocaleString()} 张</p></div>
      </div>
      {profile.fallback_reason ? <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">已回退默认权重：{profile.fallback_reason}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[440px] text-left text-xs">
          <thead className="text-slate-500"><tr><th className="pb-2">维度</th><th className="pb-2">平均</th><th className="pb-2">目标差值</th><th className="pb-2">Z</th><th className="pb-2">权重</th></tr></thead>
          <tbody>
            {dimensions.map(([key, label]) => <tr className="border-t border-white/[0.055]" key={key}><td className="py-2 text-slate-300">{label}</td><td className="font-mono text-slate-400">{profile.mean[key].toFixed(3)}</td><td className="font-mono text-slate-300">{profile.delta[key] >= 0 ? "+" : ""}{profile.delta[key].toFixed(3)}</td><td className="font-mono text-slate-300">{profile.z_score[key].toFixed(2)}</td><td className="font-mono font-semibold text-[var(--theme-primary-light)]">{profile.weights[key].toFixed(2)}</td></tr>)}
            {parameters.map(([key, label], index) => <tr className="border-t border-white/[0.055]" key={key}><td className="py-2 text-slate-300">{label}</td><td className="font-mono text-slate-400">{profile.parameter_mean[key].toFixed(2)}</td><td className="font-mono text-slate-300">{profile.parameter_delta[key] >= 0 ? "+" : ""}{profile.parameter_delta[key].toFixed(2)}</td><td className="font-mono text-slate-300">{profile.parameter_z_score[key].toFixed(2)}</td>{index === 0 ? <td className="font-mono font-semibold text-violet-200" rowSpan={3}>{profile.parameter_weight.toFixed(2)}<span className="ml-1 text-[10px] font-normal text-slate-500">共享</span></td> : null}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">参数组综合偏差 Z = {profile.parameter_group_z_score.toFixed(2)}</p>
    </section>
  );
}
