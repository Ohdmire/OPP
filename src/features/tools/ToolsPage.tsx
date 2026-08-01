import { useEffect, useRef, useState } from "react";
import { FileCog, FolderOpen, Info, Keyboard, MonitorCog, RefreshCw, RotateCcw, Save, Wrench } from "lucide-react";

import { useMode } from "../../app/ModeContext";
import { ClientSwitch } from "../../shared/components/ClientSwitch";
import { ErrorPanel } from "../../shared/components/ErrorPanel";
import { PageHeader } from "../../shared/components/PageHeader";
import { Badge, Button, Card, SectionTitle } from "../../shared/components/ui";
import { desktopApi } from "../../shared/lib/tauri";
import type { DefaultFileClients, ManiaConversionItem, OsuClient } from "../../shared/types/osu";

function ManiaConverterCard() {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ManiaConversionItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const convert = async () => { const paths = await desktopApi.chooseManiaBeatmaps(); if (!paths.length) return; setBusy(true); setError(null); try { setItems((await desktopApi.convertManiaBeatmaps(paths)).items); } catch (value) { setError(value); } finally { setBusy(false); } };
  return <Card className="p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary)]"><RefreshCw className="size-5" /></div><SectionTitle title="Malody 谱面转换" description="选择一个或多个 .mcz 文件，转换后的 .osz 将保存在原文件目录。已有同名输出会安全跳过。" /></div><div className="mt-5"><Button loading={busy} onClick={() => void convert()}><FolderOpen className="size-4" />选择 .mcz 文件并转换</Button></div>{error ? <div className="mt-4"><ErrorPanel error={error} /></div> : null}{items.length ? <div className="mt-5 space-y-2">{items.map((item) => <div className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3" key={item.input}><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-sm font-medium text-slate-100">{item.input}</span><Badge tone={item.status === "completed" ? "success" : item.status === "skipped" ? "warning" : "pink"}>{item.status === "completed" ? "已完成" : item.status === "skipped" ? "已跳过" : "失败"}</Badge></div><p className="mt-1 truncate text-xs text-slate-300">{item.output ?? item.message}</p></div>)}</div> : null}</Card>;
}

function DisplayGammaCard() {
  const [gamma, setGamma] = useState(1);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const apply = async (value: number) => { setApplying(true); setError(null); try { await desktopApi.setDisplayGamma(value); } catch (caught) { setError(caught); } finally { setApplying(false); } };
  const changeGamma = (value: number) => { setGamma(value); void apply(value); };
  return <Card className="p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary)]"><MonitorCog className="size-5" /></div><SectionTitle title="显示器伽马" description="直接使用 Windows 显示接口调整主显示器的伽马。1.00 为默认值，数值越高会提亮中间调。" /></div><div className="mt-6 flex items-center gap-4"><input aria-label="显示器伽马" className="h-2 w-full cursor-pointer accent-[var(--theme-primary)]" type="range" min="0.5" max="2.5" step="0.01" value={gamma} onChange={(event) => changeGamma(Number(event.target.value))} /><output className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-white">{gamma.toFixed(2)}</output><Button disabled={applying || gamma === 1} onClick={() => changeGamma(1)} size="sm"><RotateCcw className="size-3.5" />复原</Button></div><p className="mt-3 text-xs leading-5 text-slate-400">拖动滑块后立即生效；关闭或重启显示驱动后，Windows 可能会恢复系统默认伽马。</p>{error ? <div className="mt-4"><ErrorPanel error={error} /></div> : null}</Card>;
}

function SpeedTestCard() {
  const [active, setActive] = useState(false);
  const [presses, setPresses] = useState(0);
  const [duration, setDuration] = useState(10);
  const [remaining, setRemaining] = useState(10);
  const [result, setResult] = useState<number | null>(null);
  const startedAt = useRef(0);
  const pressesRef = useRef(0);
  useEffect(() => { if (!active) return; const onKeyDown = (event: KeyboardEvent) => { if (!event.repeat && event.code !== "Escape") { pressesRef.current += 1; setPresses(pressesRef.current); } }; window.addEventListener("keydown", onKeyDown); const interval = window.setInterval(() => { const next = Math.max(0, duration - (performance.now() - startedAt.current) / 1000); setRemaining(next); if (next === 0) { window.clearInterval(interval); setActive(false); setResult(pressesRef.current / duration); } }, 50); return () => { window.removeEventListener("keydown", onKeyDown); window.clearInterval(interval); }; }, [active, duration]);
  const start = () => { startedAt.current = performance.now(); pressesRef.current = 0; setPresses(0); setRemaining(duration); setResult(null); setActive(true); };
  const bpm = result == null ? null : result * 60;
  return <Card className="p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary)]"><Keyboard className="size-5" /></div><SectionTitle title="手速测试" description="连续按任意按键（按住不算），按所选时间计算 KPS，并转换为每分钟 BPM。" /></div><div className="mt-5 flex items-center gap-3"><span className="text-xs text-slate-500">测试时长</span>{[5, 10, 15, 30].map((value) => <button className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${duration === value ? "border-[var(--theme-primary)] bg-[var(--theme-primary-muted)] text-white" : "border-white/[0.08] text-slate-400"}`} disabled={active} key={value} onClick={() => { setDuration(value); setRemaining(value); setResult(null); }} type="button">{value}s</button>)}</div><div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/[0.12] p-5"><div className="flex items-end justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{active ? "正在计时" : result == null ? "准备开始" : "本次成绩"}</p><p className="mt-1 text-3xl font-semibold tabular-nums text-white">{active ? presses : result == null ? "—" : `${result.toFixed(1)} KPS`}</p>{bpm != null ? <p className="mt-1 text-sm font-semibold text-pink-200">≈ {bpm.toFixed(0)} BPM</p> : null}</div><div className="text-right"><p className="text-xs text-slate-500">剩余时间</p><p className="mt-1 text-xl font-semibold tabular-nums text-[var(--theme-primary-light)]">{remaining.toFixed(1)}s</p></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-[var(--theme-primary)] transition-[width]" style={{ width: `${((duration - remaining) / duration) * 100}%` }} /></div><Button className="mt-5" disabled={active} onClick={start} variant="primary">{result == null ? `开始 ${duration} 秒测试` : "再测一次"}</Button></div></Card>;
}

function FileAssociationCard({ title, description, value, saving, onSave }: { title: string; description: string; value: OsuClient; saving: boolean; onSave: (client: OsuClient) => void }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div><Badge tone={value === "stable" ? "pink" : "cyan"}>{value === "stable" ? "Stable" : "Lazer"}</Badge></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><ClientSwitch value={value} onChange={onSave} /><Button loading={saving} onClick={() => onSave(value)} size="sm"><Save className="size-3.5" />保存设置</Button></div></div>;
}

export function ToolsPage() {
  const { client } = useMode();
  const [defaults, setDefaults] = useState<DefaultFileClients>({ beatmap: client, skin: client });
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<"beatmap" | "skin" | null>(null);
  useEffect(() => { void desktopApi.getDefaultFileClients().then(setDefaults).catch(setError); }, []);
  const save = async (kind: "beatmap" | "skin", target: OsuClient) => { setSaving(kind); setNotice(null); setError(null); try { await desktopApi.setDefaultFileClient(kind, target); setDefaults((current) => ({ ...current, [kind]: target })); setNotice(`${kind === "beatmap" ? "谱面" : "Skin"} 默认打开端已设为 ${target === "stable" ? "Stable" : "Lazer"}`); } catch (caught) { setError(caught); } finally { setSaving(null); } };
  return <><PageHeader eyebrow="Tools" title="工具集合" description="集中放置 osu! 日常使用的小工具与系统集成设置。" actions={<Badge tone="cyan"><Wrench className="size-3.5" />实用工具</Badge>} />{error ? <div className="mb-5"><ErrorPanel error={error} onRetry={() => void desktopApi.getDefaultFileClients().then(setDefaults).catch(setError)} /></div> : null}{notice ? <div className="mb-5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}<div className="space-y-5"><SpeedTestCard /><Card className="p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary)]"><FileCog className="size-5" /></div><SectionTitle title="文件默认打开端" description="设置 Windows 双击 .osz 谱面包和 .osk Skin 文件时使用的 osu! 客户端。" /></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><FileAssociationCard title="谱面包文件 (.osz)" description="双击 .osz 文件时直接交给选中的客户端读取。" value={defaults.beatmap} saving={saving === "beatmap"} onSave={(target) => void save("beatmap", target)} /><FileAssociationCard title="Skin 文件 (.osk)" description="双击 .osk 文件时使用选中的客户端导入或读取。" value={defaults.skin} saving={saving === "skin"} onSave={(target) => void save("skin", target)} /></div><div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-sm leading-5 text-amber-100"><Info className="mt-0.5 size-4 shrink-0" />请先在设置中确认 Stable 或 Lazer 的游戏目录。</div></Card><DisplayGammaCard /><ManiaConverterCard /></div></>;
}
