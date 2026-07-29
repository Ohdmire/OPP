import { RotateCcw } from "lucide-react";
import { Button, Card } from "../../shared/components/ui";
import type {
  DifficultyFeatureVector,
  SimilarityBaseWeights,
  SimilarityFilters,
  SimilarityQueryRequest,
} from "../../shared/types/osu";
import {
  defaultBaseWeights,
  defaultDifficultyWeights,
  defaultSimilarityFilters,
} from "./defaults";

const difficultyControls: Array<{
  key: keyof DifficultyFeatureVector;
  label: string;
}> = [
  { key: "aim", label: "Aim" },
  { key: "speed", label: "Speed" },
  { key: "reading", label: "Reading" },
  { key: "flashlight", label: "Flashlight" },
  { key: "overlap", label: "Overlap" },
];

const baseControls: Array<{
  key: keyof SimilarityBaseWeights;
  label: string;
}> = [
  { key: "bpm", label: "BPM" },
  { key: "ar", label: "AR" },
  { key: "length_seconds", label: "长度" },
  { key: "object_density", label: "物件密度" },
  { key: "circle_ratio", label: "圆圈比例" },
  { key: "slider_ratio", label: "滑条比例" },
];

function WeightControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5">
      <span className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-[var(--theme-primary-light)]">
          {value.toFixed(2)}
        </span>
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

function OptionalNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        className="mt-1.5 w-full rounded-lg border border-white/[0.09] bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-[var(--theme-primary-soft)]"
        max={max}
        min={min}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        placeholder="不限"
        step={label.includes("AR") ? "0.1" : "1"}
        type="number"
        value={value ?? ""}
      />
    </label>
  );
}

export function SimilarityAdvancedPanel({
  request,
  onChange,
}: {
  request: SimilarityQueryRequest;
  onChange: (request: SimilarityQueryRequest) => void;
}) {
  const updateFilter = (
    key: keyof SimilarityFilters,
    value: number | null,
  ) => onChange({ ...request, filters: { ...request.filters, [key]: value } });

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">高级相似度参数</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            HNSW 先选取候选，再使用这些权重与过滤条件精排。
          </p>
        </div>
        <Button
          onClick={() =>
            onChange({
              ...request,
              difficulty_weights: { ...defaultDifficultyWeights },
              base_weights: { ...defaultBaseWeights },
              filters: { ...defaultSimilarityFilters },
              result_limit: 20,
            })
          }
          size="sm"
          variant="ghost"
        >
          <RotateCcw className="size-3.5" />
          恢复默认
        </Button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
            五维难度权重
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {difficultyControls.map(({ key, label }) => (
              <WeightControl
                key={key}
                label={label}
                onChange={(value) =>
                  onChange({
                    ...request,
                    difficulty_weights: {
                      ...request.difficulty_weights,
                      [key]: value,
                    },
                  })
                }
                value={request.difficulty_weights[key]}
              />
            ))}
          </div>
        </section>
        <section>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
            基础特征权重
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {baseControls.map(({ key, label }) => (
              <WeightControl
                key={key}
                label={label}
                onChange={(value) =>
                  onChange({
                    ...request,
                    base_weights: { ...request.base_weights, [key]: value },
                  })
                }
                value={request.base_weights[key]}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-3 border-t border-white/[0.07] pt-5 sm:grid-cols-5">
        <OptionalNumber
          label="最低 AR"
          max={11}
          min={0}
          onChange={(value) => updateFilter("min_ar", value)}
          value={request.filters.min_ar}
        />
        <OptionalNumber
          label="最高 AR"
          max={11}
          min={0}
          onChange={(value) => updateFilter("max_ar", value)}
          value={request.filters.max_ar}
        />
        <OptionalNumber
          label="最低 BPM"
          max={1000}
          min={0}
          onChange={(value) => updateFilter("min_bpm", value)}
          value={request.filters.min_bpm}
        />
        <OptionalNumber
          label="最高 BPM"
          max={1000}
          min={0}
          onChange={(value) => updateFilter("max_bpm", value)}
          value={request.filters.max_bpm}
        />
        <label className="block text-xs text-slate-400">
          结果数量
          <select
            className="mt-1.5 w-full rounded-lg border border-white/[0.09] bg-[#0b101b] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[var(--theme-primary-soft)]"
            onChange={(event) =>
              onChange({ ...request, result_limit: Number(event.target.value) })
            }
            value={request.result_limit}
          >
            {[5, 10, 20, 30, 50].map((value) => (
              <option key={value} value={value}>
                {value} 条
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}
