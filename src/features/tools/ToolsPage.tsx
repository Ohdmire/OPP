import { useEffect, useState } from "react";
import { FileCog, FolderOpen, Info, RefreshCw, Save, Wrench } from "lucide-react";
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
  const convert = async () => {
    const paths = await desktopApi.chooseManiaBeatmaps();
    if (!paths.length) return;
    setBusy(true); setError(null);
    try { setItems((await desktopApi.convertManiaBeatmaps(paths)).items); } catch (value) { setError(value); }
    finally { setBusy(false); }
  };
  return <Card className="p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary)]"><RefreshCw className="size-5" /></div><SectionTitle title="Malody 铺面转换" description="选择一个或多个 .mcz 文件，转换后的 .osz 将保存在原文件目录。已有同名输出会安全跳过。" /></div><div className="mt-5"><Button loading={busy} onClick={() => void convert()}><FolderOpen className="size-4" />选择 .mcz 文件并转换</Button></div>{error ? <div className="mt-4"><ErrorPanel error={error} /></div> : null}{items.length ? <div className="mt-5 space-y-2">{items.map((item) => <div className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3" key={item.input}><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-sm font-medium text-slate-100">{item.input}</span><Badge tone={item.status === "completed" ? "success" : item.status === "skipped" ? "warning" : "pink"}>{item.status === "completed" ? "已完成" : item.status === "skipped" ? "已跳过" : "失败"}</Badge></div><p className="mt-1 truncate text-xs text-slate-300">{item.output ?? item.message}</p></div>)}</div> : null}</Card>;
}

function FileAssociationCard({ title, description, value, saving, onSave }: { kind: "beatmap" | "skin"; title: string; description: string; value: OsuClient; saving: boolean; onSave: (client: OsuClient) => void }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div><Badge tone={value === "stable" ? "pink" : "cyan"}>{value === "stable" ? "Stable" : "Lazer"}</Badge></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><ClientSwitch value={value} onChange={onSave} /><Button loading={saving} onClick={() => onSave(value)} size="sm"><Save className="size-3.5" />保存设置</Button></div></div>;
}

export function ToolsPage() {
  const { client } = useMode();
  const [defaults, setDefaults] = useState<DefaultFileClients>({ beatmap: client, skin: client });
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<"beatmap" | "skin" | null>(null);
  useEffect(() => { void desktopApi.getDefaultFileClients().then(setDefaults).catch(setError); }, []);
  const save = async (kind: "beatmap" | "skin", target: OsuClient) => { setSaving(kind); setNotice(null); setError(null); try { await desktopApi.setDefaultFileClient(kind, target); setDefaults((current) => ({ ...current, [kind]: target })); setNotice(`${kind === "beatmap" ? "谱面" : "Skin"} 默认打开端已设为 ${target === "stable" ? "Stable" : "Lazer"}`); } catch (value) { setError(value); } finally { setSaving(null); } };
  return <><PageHeader eyebrow="Tools" title="工具集合" description="集中放置 osu! 日常使用的小工具与系统集成设置。" actions={<Badge tone="cyan"><Wrench className="size-3.5" />实用工具</Badge>} />{error ? <div className="mb-5"><ErrorPanel error={error} onRetry={() => void desktopApi.getDefaultFileClients().then(setDefaults).catch(setError)} /></div> : null}{notice ? <div className="mb-5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}<div className="space-y-5"><Card className="p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary)]"><FileCog className="size-5" /></div><SectionTitle title="文件默认打开端" description="设置 Windows 双击 .osz 谱面包和 .osk Skin 文件时使用的 osu! 客户端。" /></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><FileAssociationCard kind="beatmap" title="谱面包文件 (.osz)" description="双击 .osz 文件时直接交给选中的客户端读取。" value={defaults.beatmap} saving={saving === "beatmap"} onSave={(target) => void save("beatmap", target)} /><FileAssociationCard kind="skin" title="Skin 文件 (.osk)" description="双击 .osk 文件时使用选中的客户端导入或读取。" value={defaults.skin} saving={saving === "skin"} onSave={(target) => void save("skin", target)} /></div><div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-sm leading-5 text-amber-100"><Info className="mt-0.5 size-4 shrink-0" />请先在设置中确认 Stable 或 Lazer 的游戏目录。</div></Card><ManiaConverterCard /></div></>;
}
