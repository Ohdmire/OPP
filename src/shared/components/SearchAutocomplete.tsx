import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn";

export interface SearchSuggestion {
  value: string;
  label?: string;
  detail?: string;
}

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: SearchSuggestion[];
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
  maxSuggestions?: number;
}

function uniqueSuggestions(items: SearchSuggestion[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = item.value.trim();
    if (!value || seen.has(value.toLocaleLowerCase())) return false;
    seen.add(value.toLocaleLowerCase());
    return true;
  });
}

export function SearchAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  iconClassName,
  maxSuggestions = 8,
}: SearchAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = value.trim().toLocaleLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return [];
    return uniqueSuggestions(suggestions)
      .filter((item) => `${item.value} ${item.label ?? ""}`.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => {
        const aValue = a.value.toLocaleLowerCase();
        const bValue = b.value.toLocaleLowerCase();
        return Number(!aValue.startsWith(normalized)) - Number(!bValue.startsWith(normalized));
      })
      .slice(0, maxSuggestions);
  }, [maxSuggestions, normalized, suggestions]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const choose = (suggestion: SearchSuggestion) => {
    onChange(suggestion.value);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <Search className={cn("pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-600", iconClassName)} />
      <input
        ref={inputRef}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        className={cn("w-full", inputClassName)}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!open || !matches.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setHighlighted((current) => (current + 1) % matches.length); }
          if (event.key === "ArrowUp") { event.preventDefault(); setHighlighted((current) => (current - 1 + matches.length) % matches.length); }
          if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(matches[highlighted]); }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />
      {open && matches.length ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#111725] p-1 shadow-2xl shadow-black/40" role="listbox">
          {matches.map((suggestion, index) => (
            <button
              className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm", index === highlighted ? "bg-cyan-300/10 text-cyan-100" : "text-slate-300 hover:bg-white/[0.06]")}
              key={`${suggestion.value}-${index}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
              role="option"
              aria-selected={index === highlighted}
              type="button"
            >
              <span className="truncate">{suggestion.label ?? suggestion.value}</span>
              {suggestion.detail ? <span className="shrink-0 text-xs text-slate-500">{suggestion.detail}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
