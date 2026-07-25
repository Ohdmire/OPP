import {
  BarChart3,
  FileChartColumn,
  Gauge,
  Map,
  Palette,
  Settings,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import type { OwnProfile } from "../shared/types/osu";
import { cn } from "../shared/lib/cn";
import { Avatar } from "../shared/components/Avatar";
import { Skeleton } from "../shared/components/ui";

const onlineLinks = [
  { to: "/online/overview", label: "概览", icon: Gauge },
  { to: "/online/profile", label: "详细档案", icon: FileChartColumn },
  { to: "/online/scores", label: "最佳成绩", icon: BarChart3 },
];

function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Gauge;
}) {
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 outline-none transition hover:bg-white/[0.045] hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-300/40",
          isActive &&
            "bg-white/[0.065] text-white shadow-[inset_2px_0_0_#ff83b8]",
        )
      }
      to={to}
    >
      <Icon className="size-[17px] shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
      {children}
    </p>
  );
}

export function Sidebar({
  profile,
  loading,
}: {
  profile?: OwnProfile;
  loading: boolean;
}) {
  return (
    <aside className="fixed bottom-0 left-0 top-11 z-40 flex w-[224px] flex-col border-r border-white/[0.06] bg-[#0a0e18]/94 px-3 py-5 backdrop-blur-xl">
      <nav aria-label="主导航" className="flex min-h-0 flex-1 flex-col">
        <GroupLabel>在线资料</GroupLabel>
        <div className="space-y-1">
          {onlineLinks.map((link) => (
            <NavItem key={link.to} {...link} />
          ))}
        </div>

        <div className="mt-7">
          <GroupLabel>本地资源</GroupLabel>
          <div className="space-y-1">
            <NavItem icon={Map} label="本地谱面" to="/local/maps" />
            <NavItem icon={Palette} label="本地皮肤" to="/local/skins" />
          </div>
        </div>
      </nav>

      <NavItem icon={Settings} label="设置" to="/settings" />

      <div className="mt-3 border-t border-white/[0.06] pt-3">
        {loading ? (
          <div className="flex items-center gap-3 px-2 py-1">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : profile ? (
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <Avatar
              className="size-9 rounded-full border border-white/10"
              profile={profile}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {profile.username}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {profile.country_code} · {profile.is_online ? "在线" : "离线"}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
