import { useEffect, useState } from "react";
import { Gamepad2, Play } from "lucide-react";
import { useMode } from "../../app/ModeContext";
import { desktopApi } from "../../shared/lib/tauri";
import type { GameSessionSummary } from "../../shared/types/osu";
import { dateTime, fullNumber, percent, rulesetLabels } from "../../shared/lib/format";
import { Badge, Button, Card, DataLine, EmptyState, SectionTitle } from "../../shared/components/ui";
import { ErrorPanel } from "../../shared/components/ErrorPanel";
import { PageHeader } from "../../shared/components/PageHeader";
import { ClientSwitch } from "../../shared/components/ClientSwitch";
import type { OsuClient } from "../../shared/types/osu";

function delta(a: number | null, b: number | null, digits = 0) {
  if (a === null || b === null) return "—";
  const value = b - a;
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function SessionComparison({ session }: { session: GameSessionSummary }) {
  const end = session.end;
  if (!end) return null;
  const rows: Array<[string, string]> = [
    ["PP", `${end.pp?.toFixed(2) ?? "—"} (${delta(session.start.pp, end.pp, 2)})`],
    ["BP 最高 PP", `${end.best_pp?.toFixed(2) ?? "—"} (${delta(session.start.best_pp, end.best_pp, 2)})`],
    ["BP 数量", `${end.best_count} (${delta(session.start.best_count, end.best_count)})`],
    ["准确率", `${percent(end.hit_accuracy)} (${delta(session.start.hit_accuracy, end.hit_accuracy, 2)}%)`],
    ["游玩次数", `${fullNumber(end.play_count)} (${delta(session.start.play_count, end.play_count)})`],
    ["总命中数", `${fullNumber(end.total_hits)} (${delta(session.start.total_hits, end.total_hits)})`],
    ["最大连击", `${fullNumber(end.maximum_combo)} (${delta(session.start.maximum_combo, end.maximum_combo)})`],
    ["全球排名", `#${fullNumber(end.global_rank)} (${delta(session.start.global_rank, end.global_rank)})`],
  ];
  return <Card className="p-5"><SectionTitle title="本次游戏数据对比" description={`${dateTime(session.started_at)} → ${dateTime(session.ended_at)}`} />{rows.map(([label, value]) => <DataLine key={label} label={label} value={value} />)}</Card>;
}

export function GameSessionPage() {
  const { client, ruleset } = useMode();
  const [targetClient, setTargetClient] = useState<OsuClient>(client);
  const [session, setSession] = useState<GameSessionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const refresh = async () => { try { setSession(await desktopApi.getGameSessionStatus()); setError(null); } catch (value) { setError(value); } };
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(), 2500); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, []);
  const launch = async () => { setBusy(true); setError(null); try { setSession(await desktopApi.startGameSession(ruleset, targetClient)); } catch (value) { setError(value); } finally { setBusy(false); } };
  return <>
    <div className="mb-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3"><span className="text-xs text-slate-500">启动客户端</span><ClientSwitch value={targetClient} onChange={setTargetClient} /></div>
    <PageHeader eyebrow="Game session" title="游戏会话" description="游戏运行期间记录状态，结束后查看本次用户数据变化。" actions={<Button loading={busy} onClick={launch} variant="primary"><Play className="size-4" />一键启动游戏</Button>} />
    {error ? <div className="mb-5"><ErrorPanel error={error} onRetry={refresh} /></div> : null}
    <Card className="p-6"><div className="flex items-start justify-between gap-4"><div><Badge tone={session?.running ? "success" : "cyan"}>{session?.running ? "游戏运行中" : "等待启动"}</Badge><h2 className="mt-4 text-2xl font-semibold text-white">{session?.running ? "正在检测 osu! 进程" : "准备开始一次游戏会话"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{session ? `启动客户端：${session.client} · ${rulesetLabels[session.ruleset]}` : "启动时保存个人资料、PP 与 BP 快照，结束时自动读取第二份快照。"}</p></div><Gamepad2 className="size-9 text-pink-300" /></div>{session ? <div className="mt-6 grid grid-cols-2 gap-3"><DataLine label="开始时间" value={dateTime(session.started_at)} /><DataLine label="可执行文件" value={<span className="max-w-52 truncate font-mono text-xs">{session.executable}</span>} /></div> : <EmptyState icon={<Gamepad2 className="size-5" />} title="尚未启动游戏" description="确认已检测到 osu! stable 后，点击启动按钮。" />}</Card>
    {session?.end ? <div className="mt-5"><SessionComparison session={session} /></div> : null}
  </>;
}
