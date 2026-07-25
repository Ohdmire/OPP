import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { isTauri } from "../lib/tauri";

async function windowAction(action: "minimize" | "maximize" | "close") {
  if (!isTauri()) return;
  const window = getCurrentWindow();
  if (action === "minimize") await window.minimize();
  if (action === "maximize") await window.toggleMaximize();
  if (action === "close") await window.close();
}

export function TitleBar() {
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-11 items-center border-b border-white/[0.06] bg-[#080b14]/92 pl-4 backdrop-blur-xl"
      data-tauri-drag-region
    >
      <div
        className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-300"
        data-tauri-drag-region
      >
        <span className="grid size-5 place-items-center rounded-full border-2 border-pink-300 text-[8px] text-pink-200 shadow-[0_0_15px_rgba(255,106,167,.35)]">
          O
        </span>
        OPP
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold text-slate-500">
          v0.2
        </span>
      </div>
      <div className="ml-auto flex h-full">
        <button
          aria-label="最小化"
          className="grid w-12 place-items-center text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
          onClick={() => windowAction("minimize")}
          type="button"
        >
          <Minus className="size-4" />
        </button>
        <button
          aria-label="最大化"
          className="grid w-12 place-items-center text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
          onClick={() => windowAction("maximize")}
          type="button"
        >
          <Square className="size-3.5" />
        </button>
        <button
          aria-label="关闭"
          className="grid w-12 place-items-center text-slate-500 transition hover:bg-rose-500 hover:text-white"
          onClick={() => windowAction("close")}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
