import type { OsuClient } from "../types/osu";
import { cn } from "../lib/cn";

const clients: Array<{ value: OsuClient; label: string }> = [
  { value: "stable", label: "Stable" },
  { value: "lazer", label: "Lazer" },
];

export function ClientSwitch({
  value,
  onChange,
}: {
  value: OsuClient;
  onChange: (client: OsuClient) => void;
}) {
  return (
    <div
      aria-label="osu! 客户端"
      className="opp-control-track inline-flex gap-1 border-b border-[var(--line-subtle)] p-0"
      role="tablist"
    >
      {clients.map((client) => (
        <button
          aria-selected={value === client.value}
          className={cn(
            "opp-action relative min-h-8 min-w-[64px] px-2.5 py-1 text-[11px] font-semibold text-slate-500 outline-none hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]",
            value === client.value &&
              "selected-mask text-[var(--theme-primary)]",
          )}
          key={client.value}
          onClick={() => onChange(client.value)}
          role="tab"
          type="button"
        >
          {client.label}
        </button>
      ))}
    </div>
  );
}
