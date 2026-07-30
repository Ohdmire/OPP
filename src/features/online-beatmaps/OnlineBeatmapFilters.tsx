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

function Section({ title, children, open, count }: { title: string; children: ReactNode; open?: boolean; count?: number }) {
  return (
    <details className="group border-t border-white/[0.08] first:border-t-0" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-sm font-semibold text-slate-200">
        <ChevronRight className="size-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
        <span className="flex-1">{title}</span>
        {count ? <Badge tone="cyan">{count}</Badge> : null}
      </summary>
      <div className="space-y-4 pb-5">{children}</div>
    </details>
  );
}

function Range({ label, min, max, onMin, onMax }: { label: string; min: number | null; max: number | null; onMin: (value: number | null) => void; onMax: (value: number | null) => void }) {
  return <Field label={label}><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input className={inputClass} inputMode="decimal" onChange={(event) => onMin(parseOptionalNumber(event.target.value))} placeholder="最小" type="number" value={min ?? ""} /><span className="text-slate-600">至</span><input className={inputClass} inputMode="decimal" onChange={(event) => onMax(parseOptionalNumber(event.target.value))} placeholder="最大" type="number" value={max ?? ""} /></div></Field>;
}

const maniaKeyOptions = [4, 5, 6, 7, 8, 9, 10] as const;

const contentOptions = [
  ["", "全部内容"], ["recommended", "推荐难度"], ["converts", "包括转谱"], ["follows", "已关注谱师"], ["spotlights", "聚光灯谱面"], ["featured_artists", "精选艺术家"],
] as const;
const gradeOptions = [["", "全部成绩"], ["XH", "银 SS"], ["X", "SS"], ["SH", "银 S"], ["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"]] as const;

export function OnlineBeatmapFilters({ query, loading, onChange, onReset, onSubmit, suggestions = [] }: { query: OnlineBeatmapSearchQuery; loading: boolean; onChange: (query: OnlineBeatmapSearchQuery) => void; onReset: () => void; onSubmit: () => void; suggestions?: SearchSuggestion[] }) {
  const patch = (value: Partial<OnlineBeatmapSearchQuery>) => onChange({ ...query, ...value, cursor_string: null });
  const count = activeFilterCount(query);
  return (
    <Card className="overflow-hidden">
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
          <Filter className="size-5 text-cyan-200" />
          <h2 className="text-base font-semibold text-white">筛选谱面</h2>
          {count ? <Badge tone="cyan">{count} 项条件</Badge> : null}
          <div className="ml-auto flex gap-2"><Button aria-label="重置筛选" onClick={onReset} size="icon" type="button" variant="ghost"><RotateCcw className="size-4" /></Button><Button loading={loading} size="sm" type="submit">应用筛选</Button></div>
        </div>
        <div className="space-y-1 px-5">
          <div className="relative py-5"><SearchAutocomplete ariaLabel="搜索在线谱面" className="w-full" inputClassName={`${inputClass} py-3 pl-11 pr-10`} onChange={(value) => patch({ query: value })} placeholder="搜索标题、艺术家、mapper、标签或 ID" suggestions={suggestions} value={query.query} /><span className="absolute right-3 top-1/2 z-20 -translate-y-1/2"><InfoTip text="自动补全只基于当前已加载的搜索结果，不会查询尚未获取的在线谱面。输入后仍可点击“应用筛选”进行完整的在线搜索。" /></span></div>

          <Section title="模式、分类与排序">
            <div className="grid gap-4 md:grid-cols-3"><Field label="游戏模式"><select className={inputClass} onChange={(event) => patch({ ruleset: (event.target.value || null) as Ruleset | null })} value={query.ruleset ?? ""}><option value="">全部模式</option><option value="osu">osu!</option><option value="taiko">osu!taiko</option><option value="fruits">osu!catch</option><option value="mania">osu!mania</option></select></Field><Field label="谱面状态"><select className={inputClass} onChange={(event) => patch({ status: event.target.value })} value={query.status}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="排序"><select className={inputClass} onChange={(event) => patch({ sort: event.target.value })} value={query.sort}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div>
            <div className="grid gap-4 md:grid-cols-2"><Field label="流派"><select className={inputClass} onChange={(event) => patch({ genre: event.target.value ? Number(event.target.value) : null })} value={query.genre ?? ""}>{genreOptions.map((option) => <option key={option.label} value={option.value ?? ""}>{option.label}</option>)}</select></Field><Field label="语言"><select className={inputClass} onChange={(event) => patch({ language: event.target.value ? Number(event.target.value) : null })} value={query.language ?? ""}>{languageOptions.map((option) => <option key={option.label} value={option.value ?? ""}>{option.label}</option>)}</select></Field></div>
            {query.ruleset === "mania" ? <Field label="Mania 键数"><div className="flex flex-wrap gap-2"><button className={`rounded-lg border px-3 py-2 text-xs ${query.keys_min === null && query.keys_max === null ? "border-violet-300/50 bg-violet-300/10 text-violet-100" : "border-white/[0.09] text-slate-400"}`} onClick={() => patch({ keys_min: null, keys_max: null })} type="button">全部</button>{maniaKeyOptions.map((keys) => <button className={`rounded-lg border px-3 py-2 text-xs font-medium ${query.keys_min === keys && query.keys_max === keys ? "border-violet-300/50 bg-violet-300/10 text-violet-100" : "border-white/[0.09] text-slate-400 hover:border-violet-300/30 hover:text-violet-100"}`} key={keys} onClick={() => patch({ keys_min: keys, keys_max: keys })} type="button">{keys}K</button>)}</div></Field> : null}
          </Section>

          <Section title="内容筛选" count={query.content_filter || query.grade || query.played ? 1 : 0}>
            <div className="flex flex-wrap gap-2">{contentOptions.map(([value, label]) => <button className={`rounded-full border px-3 py-2 text-sm transition ${query.content_filter === value ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" : "border-white/[0.09] text-slate-400 hover:border-white/20 hover:text-slate-200"}`} key={value || "all"} onClick={() => patch({ content_filter: value })} type="button">{label}</button>)}</div>
            <div className="grid gap-4 md:grid-cols-2"><Field label="成绩"><select className={inputClass} onChange={(event) => patch({ grade: event.target.value })} value={query.grade}>{gradeOptions.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}</select></Field><Field label="玩过状态"><select className={inputClass} onChange={(event) => patch({ played: event.target.value })} value={query.played}><option value="">全部</option><option value="played">玩过</option><option value="unplayed">没玩过</option></select></Field></div>
          </Section>


          <Section title="标题与日期">
            <div className="grid gap-4 md:grid-cols-2"><Field label="艺术家"><input className={inputClass} onChange={(event) => patch({ artist: event.target.value })} value={query.artist} /></Field><Field label="标题"><input className={inputClass} onChange={(event) => patch({ title: event.target.value })} value={query.title} /></Field><Field label="Mapper"><input className={inputClass} onChange={(event) => patch({ mapper: event.target.value })} value={query.mapper} /></Field><Field label="来源"><input className={inputClass} onChange={(event) => patch({ source: event.target.value })} value={query.source} /></Field><Field label="标签"><input className={inputClass} onChange={(event) => patch({ tags: event.target.value })} placeholder="逗号分隔" value={query.tags} /></Field></div>
            <div className="grid gap-4 md:grid-cols-2"><Field label="Rank 日期范围"><div className="grid grid-cols-2 gap-2"><input className={inputClass} onChange={(event) => patch({ ranked_from: event.target.value })} type="date" value={query.ranked_from} /><input className={inputClass} onChange={(event) => patch({ ranked_to: event.target.value })} type="date" value={query.ranked_to} /></div></Field><Field label="提交日期范围"><div className="grid grid-cols-2 gap-2"><input className={inputClass} onChange={(event) => patch({ submitted_from: event.target.value })} type="date" value={query.submitted_from} /><input className={inputClass} onChange={(event) => patch({ submitted_to: event.target.value })} type="date" value={query.submitted_to} /></div></Field></div>
          </Section>

          <Section title="数值范围">
            <div className="grid gap-4 md:grid-cols-2"><Range label="星数" max={query.stars_max} min={query.stars_min} onMax={(stars_max) => patch({ stars_max })} onMin={(stars_min) => patch({ stars_min })} /><Range label="BPM" max={query.bpm_max} min={query.bpm_min} onMax={(bpm_max) => patch({ bpm_max })} onMin={(bpm_min) => patch({ bpm_min })} /><Range label="长度（秒）" max={query.length_max} min={query.length_min} onMax={(length_max) => patch({ length_max })} onMin={(length_min) => patch({ length_min })} /><Range label="收藏数" max={query.favourites_max} min={query.favourites_min} onMax={(favourites_max) => patch({ favourites_max })} onMin={(favourites_min) => patch({ favourites_min })} /><Range label="AR" max={query.ar_max} min={query.ar_min} onMax={(ar_max) => patch({ ar_max })} onMin={(ar_min) => patch({ ar_min })} /><Range label="CS" max={query.cs_max} min={query.cs_min} onMax={(cs_max) => patch({ cs_max })} onMin={(cs_min) => patch({ cs_min })} /><Range label="OD" max={query.od_max} min={query.od_min} onMax={(od_max) => patch({ od_max })} onMin={(od_min) => patch({ od_min })} /><Range label="HP" max={query.hp_max} min={query.hp_min} onMax={(hp_max) => patch({ hp_max })} onMin={(hp_min) => patch({ hp_min })} /></div>
          </Section>

          <Section title="附加内容"><div className="grid gap-3 md:grid-cols-3"><label className="flex items-center gap-3 rounded-xl border border-white/[0.09] px-3 py-3 text-sm text-slate-300"><input checked={query.include_nsfw} onChange={(event) => patch({ include_nsfw: event.target.checked })} type="checkbox" />显示不良内容</label>{(["video", "storyboard"] as const).map((extra) => <label className="flex items-center gap-3 rounded-xl border border-white/[0.09] px-3 py-3 text-sm text-slate-300" key={extra}><input checked={query.extras.includes(extra)} onChange={(event) => patch({ extras: event.target.checked ? [...query.extras, extra] : query.extras.filter((item) => item !== extra) })} type="checkbox" />{extra === "video" ? "有视频" : "有故事板"}</label>)}</div></Section>
        </div>
      </form>
    </Card>
  );
}
