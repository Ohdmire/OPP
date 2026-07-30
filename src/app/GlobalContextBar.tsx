import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ClientSwitch } from "../shared/components/ClientSwitch";
import { ModeSwitch } from "../shared/components/ModeSwitch";
import { desktopApi } from "../shared/lib/tauri";
import type { GameStatusSnapshot } from "../shared/types/osu";
import { useMode } from "./ModeContext";

const routeContexts = [
  ["/data", "数据中心"],
  ["/online/overview", "个人概览"],
  ["/online/scores", "最佳成绩"],
  ["/online/profile", "详细档案"],
  ["/online/beatmaps", "在线谱面"],
  ["/online/similar", "相似谱面"],
  ["/local/maps", "本地谱面"],
  ["/local/skins", "本地皮肤"],
  ["/local/media", "截图与回放"],
  ["/tosu", "tosu 直播集成"],
  ["/tools", "工具集合"],
  ["/settings", "设置"],
] as const;

export function GlobalContextBar() {
  const { client, setClient, ruleset, setRuleset } = useMode();
  const location = useLocation();
  const [gameStatus, setGameStatus] = useState<GameStatusSnapshot | null>(null);
  const current =
    routeContexts.find(([path]) => location.pathname === path) ??
    routeContexts[0];
  const runningClients = useMemo(
    () => gameStatus?.clients.filter((item) => item.running) ?? [],
    [gameStatus],
  );

  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    const update = (status: GameStatusSnapshot) => {
      if (!disposed) setGameStatus(status);
    };
    void desktopApi.getGameStatus().then(update).catch(() => undefined);
    void desktopApi.onGameStatusChanged(update).then((unlisten) => {
      if (disposed) unlisten();
      else off = unlisten;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);

  return (
    <header className="fixed left-[248px] right-0 top-11 z-30 h-16 border-b border-white/[0.08] bg-[var(--surface-chrome)] px-7 xl:px-9">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-5">
        <p className="min-w-0 truncate text-[15px] font-semibold text-slate-200">
          {current[1]}
        </p>
        <div
          className="flex min-h-8 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-xs font-medium text-slate-400"
          title={runningClients.map((item) => item.executable).filter(Boolean).join("\n") || "未检测到运行中的 osu! 客户端"}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${runningClients.length ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]" : "bg-slate-500"}`}
          />
          {runningClients.length
            ? `${runningClients.map((item) => item.client === "stable" ? "Stable" : "Lazer").join(" + ")} 运行中`
            : "游戏未运行"}
        </div>
        <span className="ml-auto h-6 w-px bg-white/[0.08]" />
        <div aria-label="游戏模式" className="flex items-center">
          <ModeSwitch compact onChange={setRuleset} value={ruleset} />
        </div>
        <div aria-label="osu! 客户端" className="flex items-center">
          <ClientSwitch onChange={setClient} value={client} />
        </div>
      </div>
    </header>
  );
}
