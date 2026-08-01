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
  { label: "星数", minKey: "min_star", maxKey: "max_star", floor: 0, ceiling: 10, step: 0.1, format: (value) => value.toFixed(1) },
  { label: "AR", minKey: "min_ar", maxKey: "max_ar", floor: 0, ceiling: 11, step: 0.1, format: (value) => value.toFixed(1) },
  { label: "CS", minKey: "min_cs", maxKey: "max_cs", floor: 0, ceiling: 10, step: 0.1, format: (value) => value.toFixed(1) },
  { label: "长度", minKey: "min_length_seconds", maxKey: "max_length_seconds", floor: 0, ceiling: 900, step: 5, format: (value) => `${Math.round(value / 60)} 分` },
  { label: "BPM", minKey: "min_bpm", maxKey: "max_bpm", floor: 0, ceiling: 400, step: 1, format: (value) => Math.round(value).toString() },
  { label: "OD", minKey: "min_od", maxKey: "max_od", floor: 0, ceiling: 11, step: 0.1, format: (value) => value.toFixed(1) },
];

function RangeFilter({ control, filters, onChange }: { control: FilterControl; filters: SimilarityFilters; onChange: (filters: SimilarityFilters) => void }) {
  const currentMin = filters[control.minKey] ?? control.floor;
  const currentMax = filters[control.maxKey] ?? control.ceiling;
  const format = control.format ?? ((value: number) => String(value));
  const minimumPosition = ((currentMin - control.floor) / (control.ceiling - control.floor)) * 100;
  const maximumPosition = ((currentMax - control.floor) / (control.ceiling - control.floor)) * 100;

  const setMinimum = (value: number) => {
    const minimum = Math.min(value, currentMax);
    onChange({ ...filters, [control.minKey]: minimum === control.floor ? null : minimum });
  };
  const setMaximum = (value: number) => {
    const maximum = Math.max(value, currentMin);
    onChange({ ...filters, [control.maxKey]: maximum === control.ceiling ? null : maximum });
  };
  const setTypedValue = (bound: "min" | "max", rawValue: string) => {
    const key = bound === "min" ? control.minKey : control.maxKey;
    if (rawValue.trim() === "") {
      onChange({ ...filters, [key]: null });
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const clamped = Math.max(control.floor, Math.min(control.ceiling, value));
    if (bound === "min") setMinimum(clamped);
    else setMaximum(clamped);
  };

  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/[0.08] px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-slate-200">{control.label}</h3>
        <output className="font-mono text-[11px] text-[var(--theme-primary-light)]">{format(currentMin)} — {format(currentMax)}</output>
      </div>
      <div className="flex items-center gap-2">
        <input aria-label={`${control.label} minimum input`} className="opp-filter-number" max={currentMax} min={control.floor} onChange={(event) => setTypedValue("min", event.target.value)} step={control.step} type="number" value={filters[control.minKey] ?? ""} />
        <div className="opp-dual-range">
          <div className="opp-dual-range__track" />
          <div className="opp-dual-range__selection" style={{ left: `${minimumPosition}%`, right: `${100 - maximumPosition}%` }} />
          <input aria-label={`${control.label} 最低`} className="opp-dual-range__input" max={control.ceiling} min={control.floor} onChange={(event) => setMinimum(Number(event.target.value))} step={control.step} type="range" value={currentMin} />
          <input aria-label={`${control.label} 最高`} className="opp-dual-range__input" max={control.ceiling} min={control.floor} onChange={(event) => setMaximum(Number(event.target.value))} step={control.step} type="range" value={currentMax} />
        </div>
        <input aria-label={`${control.label} maximum input`} className="opp-filter-number" max={control.ceiling} min={currentMin} onChange={(event) => setTypedValue("max", event.target.value)} step={control.step} type="number" value={filters[control.maxKey] ?? ""} />
      </div>
    </section>
  );
}

export function SimilarityFilterSliders({ request, onChange }: { request: SimilarityQueryRequest; onChange: (request: SimilarityQueryRequest) => void }) {
  const activeCount = Object.entries(request.filters).filter(([key, value]) => value !== defaultSimilarityFilters[key as keyof SimilarityFilters]).length;
  return (
    <Card className="mb-5 overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] bg-[var(--theme-primary-muted)] px-5 py-4">
        <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--theme-primary-soft)] text-[var(--theme-primary-light)]"><SlidersHorizontal className="size-4" /></span><div><h2 className="text-sm font-semibold text-white">候选铺面筛选</h2><p className="mt-1 text-xs text-slate-400">每项使用一条双滑块：左侧控制最低值，右侧控制最高值；不会改变五维难度的相似度排序。</p></div></div>
        <Button disabled={activeCount === 0} onClick={() => onChange({ ...request, filters: { ...defaultSimilarityFilters } })} size="sm" variant="ghost"><RotateCcw className="size-3.5" />清除筛选{activeCount ? ` (${activeCount})` : ""}</Button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{controls.map((control) => <RangeFilter control={control} filters={request.filters} key={control.label} onChange={(filters) => onChange({ ...request, filters })} />)}</div>
    </Card>
  );
}
