import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import type { CommandError, Ruleset } from "../shared/types/osu";
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

function GameCompletionOverlay({ session, onClose }: { session: GameSessionSummary; onClose: () => void }) {
  const end = session.end;
  if (!end) return null;
  const change = (before: number | null, after: number | null) => before === null || after === null ? "—" : `${after - before >= 0 ? "+" : ""}${(after - before).toFixed(2)}`;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-6 backdrop-blur-sm"><Card className="w-full max-w-xl p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><Badge tone="success">游戏已结束</Badge><h2 className="mt-3 text-2xl font-semibold text-white">本次游戏总结</h2><p className="mt-1 text-sm text-slate-500">{dateTime(session.started_at)} → {dateTime(session.ended_at)}</p></div><Button onClick={onClose} size="sm">关闭</Button></div><div className="mt-5"><DataLine label="PP" value={`${end.pp?.toFixed(2) ?? "—"} (${change(session.start.pp, end.pp)})`} /><DataLine label="BP 最高 PP" value={`${end.best_pp?.toFixed(2) ?? "—"} (${change(session.start.best_pp, end.best_pp)})`} /><DataLine label="BP 数量" value={`${end.best_count} (${end.best_count - session.start.best_count >= 0 ? "+" : ""}${end.best_count - session.start.best_count})`} /><DataLine label="准确率" value={`${percent(end.hit_accuracy)} (${change(session.start.hit_accuracy, end.hit_accuracy)}%)`} /><DataLine label="游玩次数" value={`${fullNumber(end.play_count)} (${end.play_count !== null && session.start.play_count !== null ? end.play_count - session.start.play_count : "—"})`} /><DataLine label="总命中数" value={`${fullNumber(end.total_hits)} (${end.total_hits !== null && session.start.total_hits !== null ? end.total_hits - session.start.total_hits : "—"})`} /><DataLine label="最大连击" value={`${fullNumber(end.maximum_combo)} (${end.maximum_combo !== null && session.start.maximum_combo !== null ? end.maximum_combo - session.start.maximum_combo : "—"})`} /></div></Card></div>;
}

export function AppShell() {
  const { ruleset, setRuleset, hasRulesetPreference } = useMode();
  const profileQuery = useOwnProfile(ruleset);
  const initializedMode = useRef(hasRulesetPreference);
  const queryClient = useQueryClient();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [completedSession, setCompletedSession] = useState<GameSessionSummary | null>(null);
  const [dismissedSession, setDismissedSession] = useState<string | null>(null);
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
      void desktopApi.getSettings().then((settings) => {
        if (settings.launch_tosu_on_game_detect) return desktopApi.startTosu();
      }).catch(() => undefined);
    };
    void desktopApi.getGameStatus().then(handleStatus).catch(() => undefined);
    void desktopApi.onGameStatusChanged(handleStatus).then((unlisten) => { if (disposed) unlisten(); else off = unlisten; });
    return () => { disposed = true; off?.(); };
  }, [ruleset]);

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
        <div className="relative min-h-[calc(100vh-108px)] overflow-hidden">
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
    </div>
  );
}
