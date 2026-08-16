import type { ReactNode } from "react";
import { ChevronRight, Filter, RotateCcw } from "lucide-react";
import { Badge, Button, Card, InfoTip } from "../../shared/components/ui";
import type { OnlineBeatmapSearchQuery, Ruleset } from "../../shared/types/osu";
import { SearchAutocomplete, type SearchSuggestion } from "../../shared/components/SearchAutocomplete";
import { activeFilterCount, genreOptions, languageOptions, parseOptionalNumber, sortOptions, statusOptions } from "./filters";

const inputClass = "w-full rounded-xl border border-white/[0.09] bg-[#0b101b] px-3 py-2.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/10";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-slate-400">{label}</span>{children}</label>;
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-white/[0.06] py-3 first:border-t-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-4">
      <div className="pt-1 text-sm font-semibold text-slate-500">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">{children}</div>
    </div>
  );
}

function TextOption({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`py-1 text-left text-sm transition-colors ${active ? "font-bold text-white" : "font-normal text-slate-500 hover:text-slate-200"}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Range({ label, min, max, onMin, onMax }: { label: string; min: number | null; max: number | null; onMin: (value: number | null) => void; onMax: (value: number | null) => void }) {
  return <Field label={label}><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input className={inputClass} inputMode="decimal" onChange={(event) => onMin(parseOptionalNumber(event.target.value))} placeholder="最小" type="number" value={min ?? ""} /><span className="text-slate-600">至</span><input className={inputClass} inputMode="decimal" onChange={(event) => onMax(parseOptionalNumber(event.target.value))} placeholder="最大" type="number" value={max ?? ""} /></div></Field>;
}

const rulesetOptions: ReadonlyArray<{ value: Ruleset | null; label: string }> = [
  { value: null, label: "全部" },
  { value: "osu", label: "osu!" },
  { value: "taiko", label: "osu!taiko" },
  { value: "fruits", label: "osu!catch" },
  { value: "mania", label: "osu!mania" },
];
const maniaKeyOptions = [4, 5, 6, 7, 8, 9, 10] as const;
const contentOptions = [
  ["", "全部"], ["recommended", "推荐难度"], ["converts", "包括转谱"], ["follows", "已关注谱师"], ["spotlights", "聚光灯谱面"], ["featured_artists", "精选艺术家"],
] as const;
const gradeOptions = [["", "全部"], ["XH", "银 SS"], ["X", "SS"], ["SH", "银 S"], ["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"]] as const;
const playedOptions = [["", "全部"], ["played", "玩过"], ["unplayed", "没玩过"]] as const;

export function OnlineBeatmapFilters({ query, loading, onChange, onReset, onSubmit, suggestions = [] }: { query: OnlineBeatmapSearchQuery; loading: boolean; onChange: (query: OnlineBeatmapSearchQuery) => void; onReset: () => void; onSubmit: () => void; suggestions?: SearchSuggestion[] }) {
  const patch = (value: Partial<OnlineBeatmapSearchQuery>) => {
    const sort = Object.prototype.hasOwnProperty.call(value, "query")
      ? value.query?.trim() ? "relevance_desc" : "ranked_desc"
      : value.sort ?? query.sort;
    onChange({ ...query, ...value, sort, cursor_string: null });
  };
  const count = activeFilterCount(query);
  const toggleExtra = (extra: "video" | "storyboard") => patch({ extras: query.extras.includes(extra) ? query.extras.filter((item) => item !== extra) : [...query.extras, extra] });

  return (
    <Card className="overflow-hidden">
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
          <Filter className="size-5 text-cyan-200" />
          <h2 className="text-base font-semibold text-white">筛选谱面</h2>
          {count ? <Badge tone="cyan">{count} 项条件</Badge> : null}
          <div className="ml-auto flex gap-2"><Button aria-label="重置筛选" onClick={onReset} size="icon" type="button" variant="ghost"><RotateCcw className="size-4" /></Button><Button loading={loading} size="sm" type="submit">应用筛选</Button></div>
        </div>

        <div className="px-5 pb-2">
          <div className="relative py-5" data-page-guide-online-search="true"><SearchAutocomplete ariaLabel="搜索在线谱面" className="w-full" inputClassName={`${inputClass} py-3 pl-11 pr-10`} onChange={(value) => patch({ query: value })} placeholder="搜索标题、艺术家、mapper、标签或 ID" suggestions={suggestions} value={query.query} /><span className="absolute right-3 top-1/2 z-20 -translate-y-1/2"><InfoTip text="自动补全只基于当前已加载的搜索结果。输入后点击“应用筛选”进行完整的在线搜索。" /></span></div>

          <div className="border-y border-white/[0.08]" data-page-guide-online-core-filters="true">
            <FilterRow label="模式">{rulesetOptions.map((option) => <TextOption active={query.ruleset === option.value} key={option.value ?? "all"} onClick={() => patch({ ruleset: option.value })}>{option.label}</TextOption>)}</FilterRow>
            <FilterRow label="状态">{statusOptions.map((option) => <TextOption active={query.status === option.value} key={option.value} onClick={() => patch({ status: option.value })}>{option.value === "any" ? "全部" : option.label}</TextOption>)}</FilterRow>
            <FilterRow label="流派">{genreOptions.map((option) => <TextOption active={query.genre === option.value} key={option.value ?? "all"} onClick={() => patch({ genre: option.value })}>{option.value === null ? "全部" : option.label}</TextOption>)}</FilterRow>
            <FilterRow label="语言">{languageOptions.map((option) => <TextOption active={query.language === option.value} key={option.value ?? "all"} onClick={() => patch({ language: option.value })}>{option.value === null ? "全部" : option.label}</TextOption>)}</FilterRow>
            {query.ruleset === "mania" ? <FilterRow label="键数"><TextOption active={query.keys_min === null && query.keys_max === null} onClick={() => patch({ keys_min: null, keys_max: null })}>全部</TextOption>{maniaKeyOptions.map((keys) => <TextOption active={query.keys_min === keys && query.keys_max === keys} key={keys} onClick={() => patch({ keys_min: keys, keys_max: keys })}>{keys}K</TextOption>)}</FilterRow> : null}
            <FilterRow label="内容">{contentOptions.map(([value, label]) => <TextOption active={query.content_filter === value} key={value || "all"} onClick={() => patch({ content_filter: value })}>{label}</TextOption>)}</FilterRow>
            <FilterRow label="成绩">{gradeOptions.map(([value, label]) => <TextOption active={query.grade === value} key={value || "all"} onClick={() => patch({ grade: value })}>{label}</TextOption>)}</FilterRow>
            <FilterRow label="游玩状态">{playedOptions.map(([value, label]) => <TextOption active={query.played === value} key={value || "all"} onClick={() => patch({ played: value })}>{label}</TextOption>)}</FilterRow>
            <FilterRow label="附加内容"><TextOption active={!query.include_nsfw} onClick={() => patch({ include_nsfw: false })}>安全内容</TextOption><TextOption active={query.include_nsfw} onClick={() => patch({ include_nsfw: true })}>包括成人内容</TextOption><TextOption active={query.extras.includes("video")} onClick={() => toggleExtra("video")}>有视频</TextOption><TextOption active={query.extras.includes("storyboard")} onClick={() => toggleExtra("storyboard")}>有故事板</TextOption></FilterRow>
            <FilterRow label="排序">{sortOptions.map((option) => <TextOption active={query.sort === option.value} key={option.value} onClick={() => patch({ sort: option.value })}>{option.label}</TextOption>)}</FilterRow>
          </div>

          <details className="group" data-page-guide-online-advanced="true">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-sm font-semibold text-slate-400 transition hover:text-white">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              更多筛选
            </summary>
            <div className="space-y-5 pb-5">
              <div className="grid gap-4 md:grid-cols-2"><Field label="艺术家"><input className={inputClass} onChange={(event) => patch({ artist: event.target.value })} value={query.artist} /></Field><Field label="标题"><input className={inputClass} onChange={(event) => patch({ title: event.target.value })} value={query.title} /></Field><Field label="Mapper"><input className={inputClass} onChange={(event) => patch({ mapper: event.target.value })} value={query.mapper} /></Field><Field label="来源"><input className={inputClass} onChange={(event) => patch({ source: event.target.value })} value={query.source} /></Field><Field label="标签"><input className={inputClass} onChange={(event) => patch({ tags: event.target.value })} placeholder="逗号分隔" value={query.tags} /></Field></div>
              <div className="grid gap-4 md:grid-cols-2"><Field label="Rank 日期范围"><div className="grid grid-cols-2 gap-2"><input className={inputClass} onChange={(event) => patch({ ranked_from: event.target.value })} type="date" value={query.ranked_from} /><input className={inputClass} onChange={(event) => patch({ ranked_to: event.target.value })} type="date" value={query.ranked_to} /></div></Field><Field label="提交日期范围"><div className="grid grid-cols-2 gap-2"><input className={inputClass} onChange={(event) => patch({ submitted_from: event.target.value })} type="date" value={query.submitted_from} /><input className={inputClass} onChange={(event) => patch({ submitted_to: event.target.value })} type="date" value={query.submitted_to} /></div></Field></div>
              <div className="grid gap-4 md:grid-cols-2"><Range label="星数" max={query.stars_max} min={query.stars_min} onMax={(stars_max) => patch({ stars_max })} onMin={(stars_min) => patch({ stars_min })} /><Range label="BPM" max={query.bpm_max} min={query.bpm_min} onMax={(bpm_max) => patch({ bpm_max })} onMin={(bpm_min) => patch({ bpm_min })} /><Range label="长度（秒）" max={query.length_max} min={query.length_min} onMax={(length_max) => patch({ length_max })} onMin={(length_min) => patch({ length_min })} /><Range label="收藏数" max={query.favourites_max} min={query.favourites_min} onMax={(favourites_max) => patch({ favourites_max })} onMin={(favourites_min) => patch({ favourites_min })} /><Range label="AR" max={query.ar_max} min={query.ar_min} onMax={(ar_max) => patch({ ar_max })} onMin={(ar_min) => patch({ ar_min })} /><Range label="CS" max={query.cs_max} min={query.cs_min} onMax={(cs_max) => patch({ cs_max })} onMin={(cs_min) => patch({ cs_min })} /><Range label="OD" max={query.od_max} min={query.od_min} onMax={(od_max) => patch({ od_max })} onMin={(od_min) => patch({ od_min })} /><Range label="HP" max={query.hp_max} min={query.hp_min} onMax={(hp_max) => patch({ hp_max })} onMin={(hp_min) => patch({ hp_min })} /></div>
            </div>
          </details>
        </div>
      </form>
    </Card>
  );
}
