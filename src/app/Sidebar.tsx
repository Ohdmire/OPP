import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ExternalLink,
  Film,
  FileChartColumn,
  Image,
  LayoutDashboard,
  Map,
  Music2,
  Palette,
  Play,
  Radio,
  ScanSearch,
  Settings,
  Wrench,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import type { OwnProfile, OsuClient } from "../shared/types/osu";
import { cn } from "../shared/lib/cn";
import { Avatar } from "../shared/components/Avatar";
import { Skeleton } from "../shared/components/ui";
import { desktopApi } from "../shared/lib/tauri";
import { useMode } from "./ModeContext";

interface NavItemProps {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

function NavItem({ to, label, icon: Icon }: NavItemProps) {
  const location = useLocation();
  const active = location.pathname === to;
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      linkRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  return (
    <NavLink
      className={
        cn(
          "group relative flex min-h-10 items-center gap-3 rounded-lg border border-transparent px-2.5 text-[13px] font-medium text-slate-400 outline-none transition-colors duration-200 hover:bg-white/[0.045] hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]",
          active &&
            "selected-mask border-[var(--theme-primary)] text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--theme-primary)]",
        )
      }
      end
      ref={linkRef}
      to={to}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </NavLink>
  );
}

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      <p className="mb-1.5 px-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export function Sidebar({ profile, loading }: { profile?: OwnProfile; loading: boolean }) {
  const { ruleset } = useMode();
  const [starting, setStarting] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [launchTosu, setLaunchTosu] = useState(false);
  useEffect(() => { void desktopApi.getSettings().then((settings) => setLaunchTosu(settings.launch_tosu_with_game)).catch(() => undefined); }, []);
  const updateLaunchTosu = async (value: boolean) => { setLaunchTosu(value); try { const settings = await desktopApi.getSettings(); await desktopApi.updateSettings({ ...settings, launch_tosu_with_game: value }); } catch { setLaunchTosu(!value); } };
  const startGame = async (targetClient: OsuClient) => { setStarting(true); setStartMenuOpen(false); try { await desktopApi.startGameSession(ruleset, targetClient, launchTosu); } finally { setStarting(false); } };
  return (
    <aside className="fixed bottom-0 left-0 top-11 z-40 flex w-[248px] flex-col overflow-hidden border-r border-white/[0.08] bg-[var(--surface-sidebar)] px-3 pb-3 pt-4">
      <div className="mb-4 border-b border-white/[0.07] px-2 pb-4">
        <div className="flex items-center gap-3">
          <img alt="OPP" className="size-10 rounded-lg border border-white/10" src="/opp-icon.png" />
          <p className="text-sm font-semibold text-white">OSU! Plus Plus</p>
        </div>
      </div>

      <nav aria-label="主导航" className="min-h-0 flex-1 overflow-y-auto pr-1">
        <NavGroup label="开始与复盘">
          <NavItem icon={LayoutDashboard} label="个人概览" to="/online/overview" />
          <NavItem icon={BarChart3} label="最佳成绩" to="/online/scores" />
          <NavItem icon={FileChartColumn} label="详细档案" to="/online/profile" />
        </NavGroup>

        <NavGroup label="谱面与资源">
          <NavItem icon={Music2} label="在线谱面" to="/online/beatmaps" />
          <NavItem icon={ScanSearch} label="相似谱面" to="/online/similar" />
          <NavItem icon={Map} label="本地谱面" to="/local/maps" />
          <NavItem icon={Palette} label="本地皮肤" to="/local/skins" />
          <NavItem icon={Image} label="截图与回放" to="/local/media" />
        </NavGroup>

        <NavGroup label="创作与直播">
          <NavItem icon={Film} label="回放渲染" to="/local/media/render" />
          <NavItem icon={Radio} label="tosu 直播集成" to="/tosu" />
          <NavItem icon={Wrench} label="工具集合" to="/tools" />
        </NavGroup>
      </nav>

      <div className="relative shrink-0 border-t border-white/[0.07] pt-3">
        <button
          aria-expanded={startMenuOpen}
          aria-label="选择客户端并启动游戏"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--theme-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--on-primary)] shadow-[0_8px_22px_var(--theme-primary-glow)] transition-colors hover:bg-[var(--theme-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-sidebar)] disabled:opacity-50"
          disabled={starting}
          onClick={() => setStartMenuOpen((open) => !open)}
          type="button"
        >
          <Play className={`size-4 ${starting ? "animate-pulse" : ""}`} />
          启动 osu!
        </button>
        {startMenuOpen ? (
          <div className="absolute bottom-14 left-0 z-50 w-full rounded-lg border border-white/10 bg-[var(--surface-panel-strong)] p-2 shadow-2xl">
            <label className="mb-1 flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs text-slate-300 hover:bg-white/[0.05]">
              <input checked={launchTosu} className="accent-[var(--theme-primary)]" onChange={(event) => void updateLaunchTosu(event.target.checked)} type="checkbox" />
              同时启动 tosu
            </label>
            <button className="min-h-10 w-full rounded-md px-2 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white" onClick={() => void startGame("stable")} type="button">
              osu! Stable
            </button>
            <button className="mt-0.5 min-h-10 w-full rounded-md px-2 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white" onClick={() => void startGame("lazer")} type="button">
              osu! Lazer
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-2 shrink-0">
        <NavItem icon={Settings} label="设置" to="/settings" />
        {loading ? (
          <div className="mt-2 flex items-center gap-3 px-2 py-1">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : profile ? (
          <div className="mt-2 flex items-center gap-3 border-t border-white/[0.06] px-2 pt-3">
            <Avatar className="size-8 rounded-lg border border-white/10" profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{profile.username}</p>
            </div>
            <button
              aria-label="在浏览器中打开个人主页"
              className="grid size-8 shrink-0 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]"
              onClick={() => void desktopApi.openExternal(`https://osu.ppy.sh/users/${profile.id}`)}
              title="在浏览器中打开个人主页"
              type="button"
            >
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
