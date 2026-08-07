import { FileVideo, Image } from "lucide-react";
import { NavLink } from "react-router-dom";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `opp-action inline-flex items-center px-4 py-2 text-sm ${
    isActive
      ? "text-[var(--theme-primary)] font-semibold shadow-[inset_0_-2px_0_var(--theme-primary)]"
      : "text-slate-500 hover:bg-[var(--surface-interactive)] hover:text-slate-200"
  }`;

export function MediaSubnav() {
  return (
    <nav className="mb-5 flex gap-2 border-b border-white/[0.06] pb-3">
      <NavLink className={itemClass} to="/local/media/screenshots">
        <Image className="mr-2 size-4" />截图
      </NavLink>
      <NavLink className={itemClass} to="/local/media/replays">
        <FileVideo className="mr-2 size-4" />回放
      </NavLink>
      <NavLink className={itemClass} to="/local/media/render">
        <FileVideo className="mr-2 size-4" />渲染
      </NavLink>
    </nav>
  );
}
