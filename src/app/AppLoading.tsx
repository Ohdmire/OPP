import { LoaderCircle } from "lucide-react";

/** Shared fallback used while authentication or a lazy route is loading. */
export function AppLoading() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full border-[3px] border-pink-300 text-sm font-black text-pink-100 shadow-[0_0_55px_rgba(255,106,167,.28)]">
          O
        </div>
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="size-4 animate-spin text-cyan-200" />
          正在打开个人分析空间
        </div>
      </div>
    </main>
  );
}
