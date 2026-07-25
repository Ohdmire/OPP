import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import {
  ExternalLink,
  Calculator,
  Headphones,
  LoaderCircle,
  Pause,
  X,
} from "lucide-react";
import { Badge, Button, DataLine } from "../../shared/components/ui";
import { fullNumber } from "../../shared/lib/format";
import { desktopApi } from "../../shared/lib/tauri";
import type { OnlineBeatmapset } from "../../shared/types/osu";
import { useOnlineBeatmapsetDetail } from "./api";
import { DifficultyIcon, ModeIcon } from "./BeatmapVisuals";
import {
  durationLabel,
  normalizePreviewUrl,
  starRange,
} from "./filters";

export function BeatmapsetDetailDialog({
  beatmapsetId,
  fallback,
  playing,
  onClose,
  onPreview,
}: {
  beatmapsetId: number | null;
  fallback: OnlineBeatmapset | null;
  playing: boolean;
  onClose: () => void;
  onPreview: (beatmapset: OnlineBeatmapset) => void;
}) {
  const detailQuery = useOnlineBeatmapsetDetail(beatmapsetId);
  const beatmapset = detailQuery.data ?? fallback;
  const [selectedBeatmapId, setSelectedBeatmapId] = useState<number | null>(null);
  const [mods, setMods] = useState<string[]>([]);
  const [accuracy, setAccuracy] = useState("100");
  const [misses, setMisses] = useState("0");
  const [calculation, setCalculation] = useState<Awaited<ReturnType<typeof desktopApi.calculateBeatmapPp>> | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);

  const calculate = async () => {
    if (!selectedBeatmapId) return;
    setCalculationError(null);
    try {
      setCalculation(await desktopApi.calculateBeatmapPp({
        beatmap_id: selectedBeatmapId,
        mods,
        accuracy: Number(accuracy),
        misses: Number(misses),
      }));
    } catch (error) {
      setCalculationError((error as { message?: string }).message ?? String(error));
    }
  };

  const toggleMod = (mod: string) => {
    setMods((current) => {
      if (current.includes(mod)) return current.filter((item) => item !== mod);
      const blocked = new Set<string>();
      if (mod === "DT") blocked.add("NC");
      if (mod === "NC") blocked.add("DT");
      if (mod === "EZ") blocked.add("HR");
      if (mod === "HR") blocked.add("EZ");
      if (mod === "HT") { blocked.add("DT"); blocked.add("NC"); }
      if (mod === "DT" || mod === "NC") blocked.add("HT");
      return [...current.filter((item) => !blocked.has(item)), mod];
    });
  };

  return (
    <Dialog.Root onOpenChange={(open) => !open && onClose()} open={beatmapsetId !== null}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[#03050a]/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-[90] w-[min(820px,78vw)] overflow-y-auto border-l border-white/10 bg-[#0d131f] shadow-[-30px_0_100px_rgba(0,0,0,.5)] outline-none">
          {beatmapset ? (
            <>
              <div className="relative h-60 overflow-hidden bg-[#080b14]">
                {beatmapset.covers?.["cover@2x"] || beatmapset.covers?.cover ? (
                  <img
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-65"
                    src={beatmapset.covers["cover@2x"] ?? beatmapset.covers.cover}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b101b] via-[#0b101b]/30 to-black/20" />
                <Dialog.Close asChild>
                  <Button
                    aria-label="关闭详情"
                    className="absolute right-5 top-5 bg-black/45 backdrop-blur"
                    size="icon"
                  >
                    <X className="size-4" />
                  </Button>
                </Dialog.Close>
                <div className="absolute bottom-6 left-7 right-7">
                  <div className="flex gap-2">
                    <Badge tone="success">{beatmapset.status.toUpperCase()}</Badge>
                    <Badge>{beatmapset.beatmaps?.length ?? 0} 个难度</Badge>
                  </div>
                  <Dialog.Title className="mt-3 text-2xl font-semibold tracking-tight text-white">
                    {beatmapset.title}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-slate-300">
                    {beatmapset.artist} · mapped by {beatmapset.creator}
                  </Dialog.Description>
                </div>
              </div>

              <div className="p-7">
                <div className="mb-6 flex flex-wrap gap-2">
                  <Button
                    disabled={!normalizePreviewUrl(beatmapset.preview_url)}
                    onClick={() => onPreview(beatmapset)}
                    variant={playing ? "primary" : "secondary"}
                  >
                    {playing ? <Pause className="size-4" /> : <Headphones className="size-4" />}
                    {playing ? "暂停试听" : "试听预览"}
                  </Button>
                  <Button
                    onClick={() =>
                      desktopApi.openExternal(
                        `https://osu.ppy.sh/beatmapsets/${beatmapset.id}`,
                      )
                    }
                  >
                    <ExternalLink className="size-4" />
                    osu! 官网
                  </Button>
                </div>

                {detailQuery.isLoading && !detailQuery.data ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在获取完整信息
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-x-8 rounded-2xl border border-white/[0.065] bg-white/[0.025] px-5 py-2">
                  <DataLine label="谱面集 ID" value={beatmapset.id} />
                  <DataLine label="难度范围" value={starRange(beatmapset.beatmaps)} />
                  <DataLine label="BPM" value={beatmapset.bpm ? Math.round(beatmapset.bpm) : "—"} />
                  <DataLine label="游玩次数" value={fullNumber(beatmapset.play_count ?? 0)} />
                  <DataLine label="收藏数" value={fullNumber(beatmapset.favourite_count ?? 0)} />
                  <DataLine
                    label="Rank 日期"
                    value={
                      beatmapset.ranked_date
                        ? new Date(beatmapset.ranked_date).toLocaleDateString("zh-CN")
                        : "—"
                    }
                  />
                  <DataLine label="流派" value={beatmapset.genre?.name ?? "—"} />
                  <DataLine label="语言" value={beatmapset.language?.name ?? "—"} />
                </div>

                <div className="mt-7">
                  <h3 className="text-sm font-semibold text-white">难度列表</h3>
                  <div className="mt-3 space-y-2">
                    {(beatmapset.beatmaps ?? [])
                      .slice()
                      .sort(
                        (left, right) =>
                          left.difficulty_rating - right.difficulty_rating,
                      )
                      .map((beatmap) => (
                        <div
                          className="grid grid-cols-[minmax(0,1fr)_70px_72px_62px_62px_42px] items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-sm"
                          key={beatmap.id}
                          onClick={() => { setSelectedBeatmapId(beatmap.id); setCalculation(null); }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="col-span-2 flex min-w-0 items-center gap-3">
                            <ModeIcon mode={beatmap.mode} />
                            <DifficultyIcon stars={beatmap.difficulty_rating} />
                            <div className="min-w-0">
                            <p className="truncate font-medium text-slate-200">
                              {beatmap.version}
                            </p>
                            <p className="mt-0.5 text-[10px] uppercase text-slate-600">
                              {beatmap.mode}
                            </p>
                            </div>
                          </div>
                          <span className="font-mono text-amber-100">
                            {beatmap.difficulty_rating.toFixed(2)}★
                          </span>
                          <span className="text-slate-500">
                            {durationLabel(beatmap.total_length)}
                          </span>
                          <span className="font-mono text-slate-500">
                            AR {beatmap.ar?.toFixed(1) ?? "—"}
                          </span>
                          <span className="font-mono text-slate-500">
                            OD {beatmap.accuracy?.toFixed(1) ?? "—"}
                          </span>
                          <button
                            aria-label={`计算 ${beatmap.version} 的 PP`}
                            className="grid size-9 place-items-center rounded-lg border border-cyan-300/20 text-cyan-200 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                            onClick={(event) => { event.stopPropagation(); setSelectedBeatmapId(beatmap.id); setCalculation(null); setShowCalculator(true); }}
                            type="button"
                          >
                            <Calculator className="size-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                {showCalculator ? <div className="fixed inset-0 z-[110] grid place-items-center bg-[#03050a]/70 p-6 backdrop-blur-sm">
                <div className="w-full max-w-xl rounded-3xl border border-white/[0.1] bg-[#0b101b] p-6 shadow-2xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">单谱面难度 / PP</h3>
                      <p className="mt-1 text-[10px] text-slate-600">选择上方难度后从 Catboy 获取 .osu 文件计算</p>
                    </div>
                    <div className="flex gap-2"><Button onClick={() => setShowCalculator(false)} size="sm" variant="ghost">关闭</Button><Button disabled={!selectedBeatmapId} loading={false} onClick={calculate} size="sm">计算</Button></div>
                  </div>
                  {calculation ? <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/10 to-violet-300/5 p-5 text-center"><p className="text-xs uppercase tracking-[0.2em] text-cyan-100/60">Performance</p><p className="mt-1 text-5xl font-semibold tracking-tight text-white">{calculation.pp.toFixed(2)}<span className="ml-2 text-lg text-cyan-100/60">pp</span></p><div className="mt-4 grid grid-cols-3 gap-2 text-left"><DataLine label="Stars" value={calculation.stars.toFixed(2)} /><DataLine label="Max PP" value={calculation.max_pp.toFixed(2)} /><DataLine label="Max Combo" value={calculation.max_combo} /></div></div> : <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">调整参数后点击“计算”，查看谱面性能结果</div>}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-500">Accuracy %<input className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-300/40" max="100" min="0" onChange={(e) => setAccuracy(e.target.value)} type="number" value={accuracy} /></label>
                    <label className="text-xs text-slate-500">Misses<input className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-300/40" min="0" onChange={(e) => setMisses(e.target.value)} type="number" value={misses} /></label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{[95, 97, 98, 99, 100].map((preset) => <button className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-xs text-slate-400 hover:border-cyan-300/30 hover:text-cyan-100" key={preset} onClick={() => setAccuracy(String(preset))} type="button">{preset}%</button>)}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["HD", "HR", "DT", "NC", "FL", "EZ", "HT", "NF", "SD", "SO"].map((mod) => (
                      <button className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${mods.includes(mod) ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/[0.08] text-slate-500 hover:border-white/20 hover:text-slate-300"}`} key={mod} onClick={() => toggleMod(mod)} type="button">{mod}</button>
                    ))}
                  </div>
                  {calculationError ? <p className="mt-3 text-xs text-amber-200">{calculationError}</p> : null}
                </div>
                </div> : null}

                {beatmapset.tags ? (
                  <div className="mt-7">
                    <h3 className="text-sm font-semibold text-white">标签</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-500">
                      {beatmapset.tags}
                    </p>
                  </div>
                ) : null}

                {detailQuery.error ? (
                  <p className="mt-5 rounded-xl border border-amber-300/10 bg-amber-300/[0.05] px-4 py-3 text-xs text-amber-100">
                    完整详情暂时不可用，当前显示搜索结果中的信息。
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center text-slate-500">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
