import { useEffect, useRef, useState } from "react";
import { ArrowUp, FolderOpen, Play } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import type { AppSettings, BeatmapDownloadProgress, CommandError, Ruleset } from "../shared/types/osu";
import { authQueryKey } from "../features/auth/api";
import { useOwnProfile } from "../features/profile/api";
import { useMode } from "./ModeContext";
import { Sidebar } from "./Sidebar";
import { GlobalContextBar } from "./GlobalContextBar";
import { desktopApi } from "../shared/lib/tauri";
import type { GameSessionSummary } from "../shared/types/osu";
import { dateTime, fullNumber, percent } from "../shared/lib/format";
import { Badge, Button, Card, DataLine } from "../shared/components/ui";

const validRulesets: Ruleset[] = ["osu", "taiko", "fruits", "mania"];

function formatTransfer(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "计算中";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let size = value; let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function downloadProgressPercent(progress: BeatmapDownloadProgress) {
  if (!progress.total) return 0;
  const currentFileProgress = progress.total_bytes
    ? Math.min(1, (progress.downloaded_bytes ?? 0) / progress.total_bytes)
    : 0;
  return Math.min(100, ((progress.processed + currentFileProgress) / progress.total) * 100);
}

function formatDownloadedBytes(progress: BeatmapDownloadProgress) {
  const downloaded = progress.downloaded_bytes ?? 0;
  if (!downloaded) return progress.message ?? "等待连接";
  const current = `${(downloaded / 1024 / 1024).toFixed(1)} MB`;
  return progress.total_bytes
    ? `${current} / ${(progress.total_bytes / 1024 / 1024).toFixed(1)} MB`
    : current;
}

function DownloadToast() {
  const [progress, setProgress] = useState<BeatmapDownloadProgress | null>(null);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let timer: number | undefined;
    void desktopApi.onBeatmapDownloadProgress((next) => {
      window.clearTimeout(timer);
      setProgress(next);
      if (next.phase === "finished" || next.phase === "cancelled") timer = window.setTimeout(() => setProgress(null), 5_000);
    }).then((unlisten) => { dispose = unlisten; });
    return () => { window.clearTimeout(timer); dispose?.(); };
  }, []);
  if (!progress) return null;
  const completed = progress.phase === "finished" || progress.phase === "cancelled";
  const percent = downloadProgressPercent(progress);
  return <div aria-live="polite" className="fixed bottom-6 right-6 z-[180] w-[340px] rounded-2xl border border-cyan-300/20 bg-[#0b101b]/95 p-4 shadow-2xl backdrop-blur"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-white">{completed ? "下载完成" : "正在下载谱面"}</p><p className="mt-1 truncate text-xs text-slate-400">{progress.current_title ?? progress.message ?? "准备下载"}</p></div><span className="shrink-0 font-mono text-xs text-cyan-200">{progress.processed}/{progress.total}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-[var(--theme-primary)] transition-[width]" style={{ width: `${percent}%` }} /></div><div className="mt-2 flex justify-between gap-3 text-xs"><span className="truncate text-slate-500">{formatDownloadedBytes(progress)}</span><strong className="shrink-0 font-mono text-emerald-200">{formatTransfer(progress.bytes_per_second ?? 0)}</strong></div></div>;
}

function DownloadCompletedPlaylist() {
  const [files, setFiles] = useState<string[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const [noticeVisible, setNoticeVisible] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let timer: number | undefined;
    void desktopApi.onBeatmapDownloadProgress((next) => {
      if (next.phase !== "finished" || !next.completed_paths?.length) return;
      window.clearTimeout(timer);
      setFiles(next.completed_paths);
      setDestination(next.destination ?? null);
      setNoticeVisible(true);
      timer = window.setTimeout(() => setNoticeVisible(false), 5_000);
    }).then((unlisten) => { dispose = unlisten; });
    return () => { window.clearTimeout(timer); dispose?.(); };
  }, []);

  if (!files.length) return null;
  const openFirst = () => void desktopApi.openDownloadedPath(files[0]);
  return <>
    {noticeVisible ? <button aria-label="打开已下载谱面" className="fixed right-6 top-6 z-[185] w-[320px] rounded-lg border border-emerald-300/25 bg-[var(--surface-panel)] p-4 text-left shadow-xl" onDoubleClick={openFirst} type="button">
      <p className="text-sm font-semibold text-emerald-300">下载完成</p>
      <p className="mt-1 truncate text-xs text-slate-400">双击打开第一个已下载文件</p>
    </button> : null}
    <section aria-label="已下载文件" className="fixed bottom-6 right-6 z-[181] w-[340px] overflow-hidden rounded-lg border border-white/10 bg-[var(--surface-panel)] shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
        <p className="text-sm font-semibold text-white">已下载文件</p>
        {destination ? <Button aria-label="打开下载位置" onClick={() => void desktopApi.openDownloadedPath(destination)} size="icon" title="打开下载位置" variant="ghost"><FolderOpen className="size-4" /></Button> : null}
      </div>
      <div className="max-h-44 overflow-y-auto p-2">
        {files.map((file) => <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-slate-300 hover:bg-white/[0.06]" key={file} onDoubleClick={() => void desktopApi.openDownloadedPath(file)} title={file} type="button">
          <Play className="size-3.5 shrink-0 text-[var(--theme-primary)]" />
          <span className="truncate">{file.split(/[\\/]/).pop()}</span>
        </button>)}
      </div>
    </section>
  </>;
}

function GameCompletionOverlay({ session, onClose }: { session: GameSessionSummary; onClose: () => void }) {
  const end = session.end;
  if (!end) return null;
  const change = (before: number | null, after: number | null) => before === null || after === null ? "—" : `${after - before >= 0 ? "+" : ""}${(after - before).toFixed(2)}`;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-6 backdrop-blur-sm"><Card className="w-full max-w-xl p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><Badge tone="success">游戏已结束</Badge><h2 className="mt-3 text-2xl font-semibold text-white">本次游戏总结</h2><p className="mt-1 text-sm text-slate-500">{dateTime(session.started_at)} → {dateTime(session.ended_at)}</p></div><Button onClick={onClose} size="sm">关闭</Button></div><div className="mt-5"><DataLine label="PP" value={`${end.pp?.toFixed(2) ?? "—"} (${change(session.start.pp, end.pp)})`} /><DataLine label="BP 最高 PP" value={`${end.best_pp?.toFixed(2) ?? "—"} (${change(session.start.best_pp, end.best_pp)})`} /><DataLine label="BP 数量" value={`${end.best_count} (${end.best_count - session.start.best_count >= 0 ? "+" : ""}${end.best_count - session.start.best_count})`} /><DataLine label="准确率" value={`${percent(end.hit_accuracy)} (${change(session.start.hit_accuracy, end.hit_accuracy)}%)`} /><DataLine label="游玩次数" value={`${fullNumber(end.play_count)} (${end.play_count !== null && session.start.play_count !== null ? end.play_count - session.start.play_count : "—"})`} /><DataLine label="总命中数" value={`${fullNumber(end.total_hits)} (${end.total_hits !== null && session.start.total_hits !== null ? end.total_hits - session.start.total_hits : "—"})`} /><DataLine label="最大连击" value={`${fullNumber(end.maximum_combo)} (${end.maximum_combo !== null && session.start.maximum_combo !== null ? end.maximum_combo - session.start.maximum_combo : "—"})`} /></div></Card></div>;
}

function TosuLaunchPrompt({ settings, onClose }: { settings: AppSettings; onClose: () => void }) {
  const [autoLaunch, setAutoLaunch] = useState(settings.launch_tosu_on_obs_detect ?? false);
  const [dontAsk, setDontAsk] = useState(settings.suppress_tosu_launch_prompt ?? false);
  const [busy, setBusy] = useState(false);
  const start = async () => { setBusy(true); try { await desktopApi.updateSettings({ ...settings, launch_tosu_on_obs_detect: autoLaunch, suppress_tosu_launch_prompt: dontAsk }); await desktopApi.startTosu(); onClose(); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-[220] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"><Card className="w-full max-w-md p-6 shadow-2xl"><h2 className="text-lg font-semibold text-white">启动 tosu</h2><p className="mt-2 text-sm leading-6 text-slate-400">检测到 OBS 已启动。Tosu 就绪后会刷新所选场景中的浏览器源。</p><label className="mt-5 flex items-center gap-3 text-sm text-slate-200"><input checked={autoLaunch} onChange={(event) => setAutoLaunch(event.target.checked)} type="checkbox" />每次检测到 OBS 启动时自动打开 tosu</label><label className="mt-3 flex items-center gap-3 text-sm text-slate-200"><input checked={dontAsk} onChange={(event) => setDontAsk(event.target.checked)} type="checkbox" />不再提示</label><div className="mt-6 flex justify-end gap-2"><Button disabled={busy} onClick={onClose} variant="ghost">取消</Button><Button loading={busy} onClick={() => void start()}>启动 tosu</Button></div></Card></div>;
}

export function AppShell() {
  const { ruleset, setRuleset, hasRulesetPreference } = useMode();
  const profileQuery = useOwnProfile(ruleset);
  const initializedMode = useRef(hasRulesetPreference);
  const queryClient = useQueryClient();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [completedSession, setCompletedSession] = useState<GameSessionSummary | null>(null);
  const [dismissedSession, setDismissedSession] = useState<string | null>(null);
  const [tosuPromptSettings, setTosuPromptSettings] = useState<AppSettings | null>(null);
  const analysisEnabled = true;

  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      try {
        const session = await desktopApi.getGameSessionStatus();
        if (!disposed && analysisEnabled && session && !session.running && session.end && session.started_at !== dismissedSession) setCompletedSession(session);
      } catch { /* The rest of the shell remains usable when the desktop bridge is unavailable. */ }
    };
    const initial = window.setTimeout(() => void poll(), 0);
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { disposed = true; window.clearTimeout(initial); window.clearInterval(timer); };
  }, [analysisEnabled, dismissedSession]);

  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    const handleStatus = (status: { clients: Array<{ client: Ruleset | "stable" | "lazer"; running: boolean }> }) => {
      if (!status.clients.some((client) => client.running) || disposed) return;
      status.clients.filter((client) => client.running).forEach((client) => {
        if (client.client === "stable" || client.client === "lazer") {
          void desktopApi.startDetectedGameSession(ruleset, client.client).catch(() => undefined);
        }
      });
    };
    void desktopApi.getGameStatus().then(handleStatus).catch(() => undefined);
    void desktopApi.onGameStatusChanged(handleStatus).then((unlisten) => { if (disposed) unlisten(); else off = unlisten; });
    return () => { disposed = true; off?.(); };
  }, [ruleset]);

  useEffect(() => {
    let disposed = false; let off: (() => void) | undefined;
    const handleObs = (status: { running: boolean }) => {
      if (!status.running || disposed) return;
      void desktopApi.getSettings().then((settings) => { if (!disposed && !settings.suppress_tosu_launch_prompt) setTosuPromptSettings(settings); }).catch(() => undefined);
    };
    void desktopApi.onObsStatusChanged(handleObs).then((unlisten) => { if (disposed) unlisten(); else off = unlisten; });
    return () => { disposed = true; off?.(); };
  }, []);

  useEffect(() => {
    const requestLaunch = () => { void desktopApi.getSettings().then((settings) => { if (settings.suppress_tosu_launch_prompt) void desktopApi.startTosu(); else setTosuPromptSettings(settings); }).catch(() => undefined); };
    window.addEventListener("opp:request-tosu-launch", requestLaunch);
    return () => window.removeEventListener("opp:request-tosu-launch", requestLaunch);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 420);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const defaultMode = profileQuery.data?.data.playmode;
    if (
      !initializedMode.current &&
      defaultMode &&
      validRulesets.includes(defaultMode)
    ) {
      initializedMode.current = true;
      setRuleset(defaultMode);
    }
  }, [profileQuery.data, setRuleset]);

  useEffect(() => {
    const error = profileQuery.error as CommandError | null;
    if (error?.code === "AUTH_REQUIRED") {
      queryClient.invalidateQueries({ queryKey: authQueryKey });
    }
  }, [profileQuery.error, queryClient]);

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <a
        className="fixed left-[264px] top-2 z-[200] -translate-y-20 rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition-transform focus:translate-y-0"
        href="#main-content"
      >
        跳到主要内容
      </a>
      <Sidebar
        loading={profileQuery.isLoading}
        profile={profileQuery.data?.data}
      />
      <GlobalContextBar />
      <main className="ml-[248px] min-h-screen pt-[108px]" id="main-content" tabIndex={-1}>
        <div className="relative min-h-[calc(100vh-108px)] overflow-x-clip">
          <div className="theme-content-frame relative mx-auto max-w-[1440px] p-7 xl:p-9">
            <Outlet />
          </div>
        </div>
      </main>
      {showBackToTop ? (
        <button
          aria-label="回到顶部"
          className="fixed bottom-7 right-7 z-[70] grid size-11 place-items-center rounded-lg border border-white/10 bg-[var(--surface-panel)] text-[var(--theme-primary)] shadow-xl transition-colors hover:border-[var(--theme-primary-soft)] hover:bg-[var(--theme-primary-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          type="button"
        >
          <ArrowUp className="size-5" />
        </button>
      ) : null}
      {completedSession ? <><GameCompletionOverlay session={completedSession} onClose={() => { setDismissedSession(completedSession.started_at); setCompletedSession(null); }} /><div className="fixed bottom-8 left-1/2 z-[110] -translate-x-1/2 rounded-xl border border-cyan-300/15 bg-[#0b101b]/95 px-4 py-2 text-xs text-slate-400 shadow-xl">Tips：嘛，如果拘泥于数据就会让游戏本来的乐趣消失哦</div></> : null}
      {tosuPromptSettings ? <TosuLaunchPrompt settings={tosuPromptSettings} onClose={() => setTosuPromptSettings(null)} /> : null}
      <DownloadToast />
      <DownloadCompletedPlaylist />
    </div>
  );
}
