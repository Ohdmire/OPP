import type { ReactNode } from "react";

export function PageHeader({
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-white">
        {title}
      </h1>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
