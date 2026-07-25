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
      className="inline-flex rounded-xl border border-white/[0.08] bg-black/20 p-1"
      role="tablist"
    >
      {clients.map((client) => (
        <button
          aria-selected={value === client.value}
          className={cn(
            "relative min-w-[72px] rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 outline-none transition duration-200 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-300/50",
            value === client.value &&
              (client.value === "stable"
                ? "bg-pink-400/[0.13] text-pink-100 shadow-[0_6px_22px_rgba(0,0,0,.25)]"
                : "bg-cyan-300/[0.12] text-cyan-100 shadow-[0_6px_22px_rgba(0,0,0,.25)]"),
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
