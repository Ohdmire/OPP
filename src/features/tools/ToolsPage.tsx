import { useEffect, useState } from "react";
import { FileCog, FolderOpen, Info, Save, Wrench } from "lucide-react";
import { useMode } from "../../app/ModeContext";
import { ClientSwitch } from "../../shared/components/ClientSwitch";
import { ErrorPanel } from "../../shared/components/ErrorPanel";
import { PageHeader } from "../../shared/components/PageHeader";
import { Badge, Button, Card, SectionTitle } from "../../shared/components/ui";
import { desktopApi } from "../../shared/lib/tauri";
import type { DefaultFileClients, OsuClient } from "../../shared/types/osu";

export function ToolsPage() {
  const { client } = useMode();
  const [defaults, setDefaults] = useState<DefaultFileClients>({ beatmap: client, skin: client });
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<"beatmap" | "skin" | null>(null);

  useEffect(() => {
    void desktopApi.getDefaultFileClients().then(setDefaults).catch(setError);
  }, []);

  const save = async (kind: "beatmap" | "skin", target: OsuClient) => {
    setSaving(kind); setNotice(null); setError(null);
    try {
      await desktopApi.setDefaultFileClient(kind, target);
      setDefaults((current) => ({ ...current, [kind]: target }));
      setNotice(`${kind === "beatmap" ? "谱面" : "Skin"} 文件默认打开端已设置为 ${target === "stable" ? "Stable" : "Lazer"}`);
    } catch (value) { setError(value); }
    finally { setSaving(null); }
  };

  return <><PageHeader eyebrow="Tools" title="工具集合" description="集中放置 osu! 日常使用的小工具与系统集成设置。" actions={<Badge tone="cyan"><Wrench className="size-3.5" />实用工具</Badge>} />{error ? <div className="mb-5"><ErrorPanel error={error} onRetry={() => void desktopApi.getDefaultFileClients().then(setDefaults).catch(setError)} /></div> : null}{notice ? <div className="mb-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3 text-xs text-emerald-100">{notice}</div> : null}<Card className="p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-100"><FileCog className="size-5" /></div><SectionTitle title="文件默认打开端" description="设置 Windows 双击 .osz 谱面包和 .osk Skin 文件时使用的 osu! 客户端。设置写入当前用户，不需要管理员权限。" /></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><FileAssociationCard kind="beatmap" title="谱面包文件 (.osz)" description="例如双击 .osz 文件时直接交给选中的客户端读取。" value={defaults.beatmap} saving={saving === "beatmap"} onSave={(target) => void save("beatmap", target)} /><FileAssociationCard kind="skin" title="Skin 文件 (.osk)" description="例如双击 .osk 文件时使用选中的客户端导入或读取。" value={defaults.skin} saving={saving === "skin"} onSave={(target) => void save("skin", target)} /></div><div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100/80"><Info className="mt-0.5 size-4 shrink-0" />如果对应客户端没有被检测到，设置会失败；请先在设置中确认 Stable 或 Lazer 的游戏目录。</div></Card><Card className="mt-5 p-6"><SectionTitle title="后续工具位" description="这里将继续加入谱面批处理、Skin 检查、媒体转换和其他 osu! 实用工具。" /><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500"><FolderOpen className="mb-3 size-4" />资源批处理</div><div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500"><FileCog className="mb-3 size-4" />文件检查</div><div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500"><Wrench className="mb-3 size-4" />更多工具</div></div></Card></>;
}

function FileAssociationCard({ kind, title, description, value, saving, onSave }: { kind: "beatmap" | "skin"; title: string; description: string; value: OsuClient; saving: boolean; onSave: (client: OsuClient) => void }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div><Badge tone={value === "stable" ? "pink" : "cyan"}>{value === "stable" ? "Stable" : "Lazer"}</Badge></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><ClientSwitch value={value} onChange={(target) => onSave(target)} /><Button loading={saving} onClick={() => onSave(value)} size="sm"><Save className="size-3.5" />保存 {kind === "beatmap" ? "谱面" : "Skin"}设置</Button></div></div>;
}
