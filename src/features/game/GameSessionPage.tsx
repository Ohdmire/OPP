import { useEffect, useState } from "react";
import { Gamepad2, Play } from "lucide-react";
import { useMode } from "../../app/ModeContext";
import { desktopApi } from "../../shared/lib/tauri";
import type { GameSessionSummary, GameStatusSnapshot, OsuClient } from "../../shared/types/osu";
import { dateTime } from "../../shared/lib/format";
import { Badge, Button, Card, DataLine, EmptyState, SectionTitle } from "../../shared/components/ui";
import { ErrorPanel } from "../../shared/components/ErrorPanel";
import { PageHeader } from "../../shared/components/PageHeader";
import { ClientSwitch } from "../../shared/components/ClientSwitch";

export function GameSessionPage() {
  const { client, ruleset } = useMode();
  const [targetClient, setTargetClient] = useState<OsuClient>(client);
  const [session, setSession] = useState<GameSessionSummary | null>(null);
  const [status, setStatus] = useState<GameStatusSnapshot>({ clients: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const refresh = async () => { try { const [gameStatus, gameSession] = await Promise.all([desktopApi.getGameStatus(), desktopApi.getGameSessionStatus()]); setStatus(gameStatus); setSession(gameSession); setError(null); } catch (value) { setError(value); } };
  useEffect(() => { let disposed = false; const timer = window.setTimeout(() => void refresh(), 0); let off: (() => void) | undefined; void desktopApi.onGameStatusChanged((value) => { if (!disposed) { setStatus(value); void desktopApi.getGameSessionStatus().then(setSession).catch(() => undefined); } }).then((unlisten) => { if (disposed) unlisten(); else off = unlisten; }); return () => { disposed = true; window.clearTimeout(timer); off?.(); }; }, []);
  const launch = async () => { setBusy(true); setError(null); try { setSession(await desktopApi.startGameSession(ruleset, targetClient)); await refresh(); } catch (value) { setError(value); } finally { setBusy(false); } };
  const running = status.clients.filter((item) => item.running);
  return <><PageHeader eyebrow="Game status" title="游戏状态" description="OPP 会持续监控已配置的 Stable 与 Lazer 客户端，包括从外部启动的游戏。" actions={<div className="flex items-center gap-3"><ClientSwitch value={targetClient} onChange={setTargetClient} /><Button loading={busy} onClick={() => void launch()} variant="primary"><Play className="size-4" />启动 osu!</Button></div>} />{error ? <div className="mb-5"><ErrorPanel error={error} onRetry={() => void refresh()} /></div> : null}<div className="grid gap-5 lg:grid-cols-2">{(["stable", "lazer"] as const).map((gameClient) => { const item = status.clients.find((value) => value.client === gameClient); return <Card className="p-6" key={gameClient}><div className="flex items-start justify-between"><SectionTitle title={`osu! ${gameClient === "stable" ? "Stable" : "Lazer"}`} description={item?.executable ?? "尚未检测到安装目录"} /><Badge tone={item?.running ? "success" : "neutral"}>{item?.running ? "运行中" : "未运行"}</Badge></div><p className="mt-5 text-sm text-slate-300">{item?.running ? `已于 ${dateTime(item.detected_at)} 检测到进程。` : "后台监控正在等待该客户端启动。"}</p></Card>; })}</div><Card className="mt-5 p-6"><SectionTitle title="会话记录" description="只有从 OPP 启动并成功获取初始数据的会话才会生成结束后的统计对比。" />{session ? <div className="mt-4"><DataLine label="客户端" value={session.client} /><DataLine label="开始时间" value={dateTime(session.started_at)} /><DataLine label="状态" value={session.running ? "运行中" : "已结束"} /></div> : <div className="mt-4"><EmptyState icon={<Gamepad2 className="size-5" />} title={running.length ? "检测到游戏正在运行" : "尚未启动游戏"} description={running.length ? "这是外部或已有进程；OPP 会持续显示其运行状态。" : "选择客户端后可从这里启动 osu!。"} /></div>}</Card></>;
}
