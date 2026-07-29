import { LoaderCircle } from "lucide-react";

/** Shared fallback used while authentication or a lazy route is loading. */
export function AppLoading() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <img alt="" className="mx-auto size-14 rounded-xl border border-white/10" src="/opp-icon.png" />
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="size-4 animate-spin text-[var(--theme-primary)]" />
          正在打开个人分析空间
        </div>
      </div>
    </main>
  );
}
