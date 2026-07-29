import type { ReactNode } from "react";

export function PageHeader({
  title,
  actions,
}: {
  eyebrow?: string;
  title: string;
  /**
   * Kept optional while callers are migrated. Page-level helper copy is no
   * longer displayed beneath titles.
   */
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex items-center justify-between gap-8 border-b border-white/[0.08] pb-5">
      <div className="min-w-0">
        <h1 className="text-[30px] font-semibold leading-none tracking-[-0.035em] text-white">
          {title}
        </h1>
      </div>
      {actions ? <div className="shrink-0 pb-1">{actions}</div> : null}
    </header>
  );
}
