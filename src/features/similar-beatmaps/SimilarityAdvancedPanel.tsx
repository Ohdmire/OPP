import { RotateCcw } from "lucide-react";

import { Button, Card } from "../../shared/components/ui";
import type { DifficultyFeatureVector, SimilarityQueryRequest } from "../../shared/types/osu";
import { defaultBaseWeights, defaultDifficultyWeights } from "./defaults";

const difficultyControls: Array<{ key: keyof DifficultyFeatureVector; label: string }> = [
  { key: "aim", label: "Aim" },
  { key: "speed", label: "Speed" },
  { key: "reading", label: "Reading" },
  { key: "slider", label: "Slider" },
  { key: "overlap", label: "Overlap" },
];

function WeightControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5">
      <span className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-[var(--theme-primary-light)]">{value.toFixed(2)}</span>
      </span>
      <input
        className="mt-2 w-full accent-[var(--theme-primary)]"
        max="2"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        step="0.05"
        type="range"
        value={value}
      />
    </label>
  );
}

export function SimilarityAdvancedPanel({ request, onChange }: { request: SimilarityQueryRequest; onChange: (request: SimilarityQueryRequest) => void }) {
  return (
    <Card className="mt-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">高级相似度参数</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">调整五维难度在相似度排序中的影响；基础参数筛选已独立到上方候选面板。</p>
        </div>
        <Button
          onClick={() => onChange({ ...request, difficulty_weights: { ...defaultDifficultyWeights }, base_weights: { ...defaultBaseWeights }, result_limit: 20 })}
          size="sm"
          variant="ghost"
        >
          <RotateCcw className="size-3.5" />恢复默认
        </Button>
      </div>
      <section className="mt-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">五维难度权重</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {difficultyControls.map(({ key, label }) => (
            <WeightControl
              key={key}
              label={label}
              onChange={(value) => onChange({ ...request, difficulty_weights: { ...request.difficulty_weights, [key]: value } })}
              value={request.difficulty_weights[key]}
            />
          ))}
        </div>
      </section>
      <label className="mt-5 block max-w-48 text-xs text-slate-400">
        结果数量
        <select
          className="mt-1.5 w-full rounded-lg border border-white/[0.09] bg-[#0b101b] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[var(--theme-primary-soft)]"
          onChange={(event) => onChange({ ...request, result_limit: Number(event.target.value) })}
          value={request.result_limit}
        >
          {[5, 10, 20, 30, 50].map((value) => <option key={value} value={value}>{value} 条</option>)}
        </select>
      </label>
    </Card>
  );
}
