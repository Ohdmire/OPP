import { Search } from "lucide-react";
import { createPortal } from "react-dom";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  ariaLabel?: string;
  "aria-label"?: string;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
  maxSuggestions?: number;
}

function uniqueSuggestions(items: SearchSuggestion[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = item.value.trim().toLocaleLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function SearchAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  ariaLabel,
  "aria-label": legacyAriaLabel,
  className,
  inputClassName,
  iconClassName,
  maxSuggestions = 50,
}: SearchAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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
  const activeIndex = Math.min(highlighted, Math.max(0, matches.length - 1));

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 6;
    const minimumHeight = 120;
    const roomBelow = window.innerHeight - rect.bottom - gap - 8;
    const roomAbove = rect.top - gap - 8;
    const openAbove = roomBelow < minimumHeight && roomAbove > roomBelow;
    const availableHeight = Math.max(minimumHeight, Math.min(320, openAbove ? roomAbove : roomBelow));
    setMenuStyle({
      left: rect.left,
      top: openAbove ? Math.max(8, rect.top - gap - availableHeight) : rect.bottom + gap,
      width: rect.width,
      maxHeight: availableHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !matches.length) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [matches.length, open, updateMenuPosition]);

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
        aria-label={ariaLabel ?? legacyAriaLabel ?? "Search"}
        className={cn("w-full", inputClassName)}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!open || !matches.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setHighlighted((current) => (current + 1) % matches.length); }
          if (event.key === "ArrowUp") { event.preventDefault(); setHighlighted((current) => (current - 1 + matches.length) % matches.length); }
          if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(matches[activeIndex]); }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />
      {open && matches.length && menuStyle && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed z-[250] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#111725] p-1 shadow-2xl shadow-black/40"
          onPointerDown={(event) => event.stopPropagation()}
          ref={menuRef}
          role="listbox"
          style={menuStyle}
        >
          {matches.map((suggestion, index) => (
            <button
              className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm", index === activeIndex ? "bg-cyan-300/10 text-cyan-100" : "text-slate-300 hover:bg-white/[0.06]")}
              key={`${suggestion.value}-${index}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
            >
              <span className="truncate">{suggestion.label ?? suggestion.value}</span>
              {suggestion.detail ? <span className="shrink-0 text-xs text-slate-500">{suggestion.detail}</span> : null}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
