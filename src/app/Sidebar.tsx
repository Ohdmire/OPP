import { useState } from "react";
import { BarChart3, ExternalLink, FileChartColumn, Gauge, Gamepad2, Image, Map, Music2, Palette, Settings, Wrench } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { OwnProfile, OsuClient } from "../shared/types/osu";
import { cn } from "../shared/lib/cn";
import { Avatar } from "../shared/components/Avatar";
import { Skeleton } from "../shared/components/ui";
import { desktopApi } from "../shared/lib/tauri";
import { useMode } from "./ModeContext";

const onlineLinks = [
  { to: "/online/overview", label: "概览", icon: Gauge },
  { to: "/online/profile", label: "详细档案", icon: FileChartColumn },
  { to: "/online/scores", label: "最佳成绩", icon: BarChart3 },
  { to: "/online/beatmaps", label: "在线谱面", icon: Music2 },
];

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Gauge }) {
  return <NavLink className={({ isActive }) => cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 outline-none transition hover:bg-white/[0.045] hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-300/40", isActive && "bg-white/[0.065] text-white shadow-[inset_2px_0_0_#ff83b8]")} to={to}><Icon className="size-[17px] shrink-0" /><span>{label}</span></NavLink>;
}

function GroupLabel({ children }: { children: React.ReactNode }) { return <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{children}</p>; }

export function Sidebar({ profile, loading }: { profile?: OwnProfile; loading: boolean }) {
  const { ruleset } = useMode();
  const [starting, setStarting] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const startGame = async (targetClient: OsuClient) => { setStarting(true); setStartMenuOpen(false); try { await desktopApi.startGameSession(ruleset, targetClient); } finally { setStarting(false); } };
  return <aside className="fixed bottom-0 left-0 top-11 z-40 flex w-[224px] flex-col border-r border-white/[0.06] bg-[#0a0e18]/94 px-3 py-5 backdrop-blur-xl">
    <nav aria-label="主导航" className="flex min-h-0 flex-1 flex-col"><GroupLabel>在线资料</GroupLabel><div className="space-y-1">{onlineLinks.map((link) => <NavItem key={link.to} {...link} />)}</div><div className="mt-7"><GroupLabel>本地资源</GroupLabel><div className="space-y-1"><NavItem icon={Map} label="本地谱面" to="/local/maps" /><NavItem icon={Palette} label="本地皮肤" to="/local/skins" /><NavItem icon={Image} label="截图回放" to="/local/media" /></div></div><div className="mt-7"><GroupLabel>工具</GroupLabel><NavItem icon={Wrench} label="工具集合" to="/tools" /></div></nav>
    <div className="relative flex items-center gap-1"><div className="min-w-0 flex-1"><NavItem icon={Settings} label="设置" to="/settings" /></div><button aria-label="选择客户端并启动游戏" className="grid size-9 shrink-0 place-items-center rounded-xl border border-pink-300/20 bg-pink-300/10 text-pink-200 transition hover:bg-pink-300/20 disabled:opacity-50" disabled={starting} onClick={() => setStartMenuOpen((open) => !open)} title="选择客户端并启动游戏" type="button"><Gamepad2 className={`size-[17px] ${starting ? "animate-pulse" : ""}`} /></button>{startMenuOpen ? <div className="absolute bottom-11 right-0 z-50 w-36 rounded-xl border border-white/10 bg-[#111725] p-2 shadow-2xl"><p className="px-2 pb-2 text-[10px] uppercase tracking-wider text-slate-600">启动客户端</p><button className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-300 hover:bg-pink-300/10 hover:text-pink-100" onClick={() => void startGame("stable")} type="button">osu! Stable</button><button className="mt-1 w-full rounded-lg px-2 py-2 text-left text-xs text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100" onClick={() => void startGame("lazer")} type="button">osu! Lazer</button></div> : null}</div>
    <div className="mt-3 border-t border-white/[0.06] pt-3">{loading ? <div className="flex items-center gap-3 px-2 py-1"><Skeleton className="size-9 rounded-full" /><Skeleton className="h-3 w-20" /></div> : profile ? <div className="flex items-center gap-3 rounded-xl px-2 py-1.5"><Avatar className="size-9 rounded-full border border-white/10" profile={profile} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{profile.username}</p><p className="mt-0.5 text-[11px] text-slate-600">ID {profile.id} · {profile.country_code}</p></div><button aria-label="在浏览器中打开个人主页" className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-cyan-300/10 hover:text-cyan-100" onClick={() => void desktopApi.openExternal(`https://osu.ppy.sh/users/${profile.id}`)} title="在浏览器中打开个人主页" type="button"><ExternalLink className="size-3.5" /></button></div> : null}</div>
  </aside>;
}
