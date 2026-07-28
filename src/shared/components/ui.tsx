import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CircleHelp, LoaderCircle } from "lucide-react";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]/60 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-secondary)] px-4 py-2.5 text-white shadow-[0_10px_30px_var(--theme-primary-glow)] hover:brightness-110",
        secondary:
          "border border-white/10 bg-white/[0.055] px-4 py-2.5 text-slate-100 hover:border-white/20 hover:bg-white/[0.09]",
        ghost:
          "px-3 py-2 text-slate-300 hover:bg-white/[0.06] hover:text-white",
        danger:
          "border border-rose-400/20 bg-rose-400/10 px-4 py-2.5 text-rose-200 hover:bg-rose-400/15",
      },
      size: {
        md: "min-h-10 text-sm",
        sm: "min-h-8 text-xs",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.09] bg-[#101622]/90 shadow-[0_12px_38px_rgba(0,0,0,.14)]",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "pink" | "cyan" | "warning" | "success";
  className?: string;
}) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.055] text-slate-200",
    pink: "border-pink-400/20 bg-pink-400/10 text-pink-200",
    cyan: "border-[var(--theme-primary-soft)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary-light)]",
    warning: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    success: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-gradient-to-r from-white/[0.04] via-white/[0.09] to-white/[0.04] bg-[length:220%_100%]",
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="grid min-h-64 place-items-center p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] text-cyan-200">
          {icon ?? <AlertCircle className="size-5" />}
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </Card>
  );
}

export function DataLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-5 border-b border-white/[0.06] py-2.5 last:border-b-0">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="text-right text-sm font-medium text-slate-200">
        {value ?? "—"}
      </span>
    </div>
  );
}

export function SectionTitle({
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {description ? <InfoTip text={description} /> : null}
      </div>
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button aria-label={text} className="inline-grid size-4 shrink-0 cursor-help place-items-center rounded-full border border-current/35 text-slate-500 hover:text-slate-200" type="button"><CircleHelp className="size-3" /></button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="z-[200] max-w-xs rounded-lg border border-white/10 bg-[#111725] px-3 py-2 text-xs leading-5 text-slate-200 shadow-xl" sideOffset={7}>{text}<Tooltip.Arrow className="fill-[#111725]" /></Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}
