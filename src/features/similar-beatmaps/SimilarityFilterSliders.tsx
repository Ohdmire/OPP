import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button, Card } from "../../shared/components/ui";
import type { SimilarityFilters, SimilarityQueryRequest } from "../../shared/types/osu";
import { defaultSimilarityFilters } from "./defaults";

interface FilterControl {
  label: string;
  minKey: keyof SimilarityFilters;
  maxKey: keyof SimilarityFilters;
  floor: number;
  ceiling: number;
  step: number;
  format?: (value: number) => string;
}

const controls: FilterControl[] = [
  { label: "AR", minKey: "min_ar", maxKey: "max_ar", floor: 0, ceiling: 11, step: 0.1, format: (value) => value.toFixed(1) },
  { label: "BPM", minKey: "min_bpm", maxKey: "max_bpm", floor: 0, ceiling: 400, step: 1, format: (value) => Math.round(value).toString() },
  { label: "长度", minKey: "min_length_seconds", maxKey: "max_length_seconds", floor: 0, ceiling: 900, step: 5, format: (value) => `${Math.round(value / 60)} 分` },
  { label: "物件密度", minKey: "min_object_density", maxKey: "max_object_density", floor: 0, ceiling: 20, step: 0.1, format: (value) => value.toFixed(1) },
  { label: "圆圈比例", minKey: "min_circle_ratio", maxKey: "max_circle_ratio", floor: 0, ceiling: 1, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { label: "滑条比例", minKey: "min_slider_ratio", maxKey: "max_slider_ratio", floor: 0, ceiling: 1, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
];

function RangeFilter({
  control,
  filters,
  onChange,
}: {
  control: FilterControl;
  filters: SimilarityFilters;
  onChange: (filters: SimilarityFilters) => void;
}) {
  const currentMin = filters[control.minKey] ?? control.floor;
  const currentMax = filters[control.maxKey] ?? control.ceiling;
  const format = control.format ?? ((value: number) => String(value));

  const setMinimum = (value: number) => {
    const minimum = Math.min(value, currentMax);
    onChange({ ...filters, [control.minKey]: minimum === control.floor ? null : minimum });
  };
  const setMaximum = (value: number) => {
    const maximum = Math.max(value, currentMin);
    onChange({ ...filters, [control.maxKey]: maximum === control.ceiling ? null : maximum });
  };

  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/[0.08] px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-slate-200">{control.label}</h3>
        <output className="font-mono text-[11px] text-[var(--theme-primary-light)]">
          {format(currentMin)} — {format(currentMax)}
        </output>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="w-6">最低</span>
          <input
            aria-label={`${control.label} 最低`}
            className="h-1.5 flex-1 accent-[var(--theme-primary)]"
            max={currentMax}
            min={control.floor}
            onChange={(event) => setMinimum(Number(event.target.value))}
            step={control.step}
            type="range"
            value={currentMin}
          />
        </label>
        <label className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="w-6">最高</span>
          <input
            aria-label={`${control.label} 最高`}
            className="h-1.5 flex-1 accent-[var(--theme-primary)]"
            max={control.ceiling}
            min={currentMin}
            onChange={(event) => setMaximum(Number(event.target.value))}
            step={control.step}
            type="range"
            value={currentMax}
          />
        </label>
      </div>
    </section>
  );
}

export function SimilarityFilterSliders({
  request,
  onChange,
}: {
  request: SimilarityQueryRequest;
  onChange: (request: SimilarityQueryRequest) => void;
}) {
  const activeCount = Object.entries(request.filters).filter(
    ([key, value]) => value !== defaultSimilarityFilters[key as keyof SimilarityFilters],
  ).length;

  return (
    <Card className="mb-5 overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] bg-[var(--theme-primary-muted)] px-5 py-4">
        <div className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--theme-primary-soft)] text-[var(--theme-primary-light)]">
            <SlidersHorizontal className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">候选谱面筛选</h2>
            <p className="mt-1 text-xs text-slate-400">拖动范围滑条细化已召回的候选；不会改变五维难度的相似度排序。</p>
          </div>
        </div>
        <Button disabled={activeCount === 0} onClick={() => onChange({ ...request, filters: { ...defaultSimilarityFilters } })} size="sm" variant="ghost">
          <RotateCcw className="size-3.5" />清除筛选{activeCount ? ` (${activeCount})` : ""}
        </Button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {controls.map((control) => (
          <RangeFilter
            control={control}
            filters={request.filters}
            key={control.label}
            onChange={(filters) => onChange({ ...request, filters })}
          />
        ))}
      </div>
    </Card>
  );
}
