import { useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button, Card } from "../../shared/components/ui";
import type { SimilarityFilters, SimilarityQueryRequest } from "../../shared/types/osu";
import { defaultSimilarityFilters } from "./defaults";

interface FilterControl { label: string; minKey: keyof SimilarityFilters; maxKey: keyof SimilarityFilters; floor: number; ceiling: number; step: number; format?: (value: number) => string; }
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
  const format = control.format ?? String;
  const setMinimum = (value: number) => onChange({ ...filters, [control.minKey]: value === control.floor ? null : Math.min(value, currentMax) });
  const setMaximum = (value: number) => onChange({ ...filters, [control.maxKey]: value === control.ceiling ? null : Math.max(value, currentMin) });
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
      <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-slate-200">{control.label}</h3><output className="font-mono text-[11px] text-[var(--theme-primary-light)]">{format(currentMin)} — {format(currentMax)}</output></div>
      <div className="flex items-center gap-2">
        <input aria-label={`${control.label} 最低`} className="opp-filter-number" max={currentMax} min={control.floor} onChange={(event) => setTypedValue("min", event.target.value)} step={control.step} type="number" value={filters[control.minKey] ?? ""} />
        <div className="opp-dual-range">
          <div className="opp-dual-range__track" />
          <div className="opp-dual-range__selection" style={{ left: `${((currentMin - control.floor) / (control.ceiling - control.floor)) * 100}%`, right: `${100 - ((currentMax - control.floor) / (control.ceiling - control.floor)) * 100}%` }} />
          <input aria-label={`${control.label} 最低滑块`} className="opp-dual-range__input opp-dual-range__input--min" max={control.ceiling} min={control.floor} onChange={(event) => setMinimum(Number(event.target.value))} step={control.step} type="range" value={currentMin} />
          <input aria-label={`${control.label} 最高滑块`} className="opp-dual-range__input opp-dual-range__input--max" max={control.ceiling} min={control.floor} onChange={(event) => setMaximum(Number(event.target.value))} step={control.step} type="range" value={currentMax} />
        </div>
        <input aria-label={`${control.label} 最高`} className="opp-filter-number" max={control.ceiling} min={currentMin} onChange={(event) => setTypedValue("max", event.target.value)} step={control.step} type="number" value={filters[control.maxKey] ?? ""} />
      </div>
    </section>
  );
}

export function SimilarityFilterSliders({ request, onChange }: { request: SimilarityQueryRequest; onChange: (request: SimilarityQueryRequest) => void }) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.entries(request.filters).filter(([key, value]) => value !== defaultSimilarityFilters[key as keyof SimilarityFilters]).length;
  return (
    <Card className="mb-5 overflow-hidden p-0">
      <div className={`flex items-center justify-between gap-4 px-5 py-3 ${open ? "border-b border-white/[0.08]" : ""}`}>
        <button aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen((value) => !value)} type="button">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-slate-400"><SlidersHorizontal className="size-4" /></span>
          <span><span className="text-sm font-semibold text-slate-200">候选谱面筛选</span>{activeCount ? <span className="ml-2 rounded-full bg-[var(--theme-primary-soft)] px-2 py-0.5 text-[10px] text-[var(--theme-primary-light)]">已启用 {activeCount} 项</span> : <span className="ml-2 text-xs text-slate-600">未启用</span>}</span>
          <ChevronDown className={`ml-auto size-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {activeCount ? <Button onClick={() => onChange({ ...request, filters: { ...defaultSimilarityFilters } })} size="sm" variant="ghost"><RotateCcw className="size-3.5" />清除</Button> : null}
      </div>
      {open ? <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{controls.map((control) => <RangeFilter control={control} filters={request.filters} key={control.label} onChange={(filters) => onChange({ ...request, filters })} />)}</div> : null}
    </Card>
  );
}
