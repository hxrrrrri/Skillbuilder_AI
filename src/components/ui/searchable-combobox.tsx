"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SearchableComboboxProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Show a search box and filter the list (roles). Off → plain dropdown (levels). */
  searchable?: boolean;
  /** Optional custom filter (e.g. role keyword search). Falls back to substring. */
  filter?: (query: string) => string[];
  /** Selecting this option switches to a free-text custom input. */
  customTriggerLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
};

/**
 * Accessible searchable combobox / dropdown. Keyboard: ↑/↓ to move, Enter to
 * pick, Esc to close. Selecting `customTriggerLabel` reveals a free-text input
 * so a value outside the list can only be entered through the explicit custom
 * path. Dark UI, no layout shift (panel is absolutely positioned).
 */
export function SearchableCombobox({
  options,
  value,
  onChange,
  searchable = true,
  filter,
  customTriggerLabel,
  placeholder = "Select…",
  ariaLabel,
  id,
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const customInputRef = React.useRef<HTMLInputElement>(null);

  const isCustomValue = !!value && !options.includes(value);
  const [customMode, setCustomMode] = React.useState(isCustomValue);

  const filtered = React.useMemo(() => {
    if (!searchable || !query.trim()) return options;
    if (filter) return filter(query);
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query, searchable, filter]);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  React.useEffect(() => {
    if (open && searchable) inputRef.current?.focus();
  }, [open, searchable]);

  React.useEffect(() => {
    if (customMode) customInputRef.current?.focus();
  }, [customMode]);

  function choose(option: string) {
    if (customTriggerLabel && option === customTriggerLabel) {
      setCustomMode(true);
      setOpen(false);
      onChange("");
      return;
    }
    setCustomMode(false);
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[activeIndex];
      if (option) choose(option);
    }
  }

  if (customMode) {
    return (
      <div className="flex items-stretch gap-2" ref={rootRef}>
        <input
          ref={customInputRef}
          id={id}
          aria-label={ariaLabel}
          value={value}
          placeholder="Type a custom value…"
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-11 w-full appearance-none rounded-xl border border-accent/60 bg-[#171716] px-3 text-ink placeholder:text-muted",
            "shadow-inner shadow-black/10 transition focus:border-accent/80 focus:outline-none focus:ring-2 focus:ring-accent/25",
          )}
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange(options[0] ?? "");
          }}
          className="flex-shrink-0 rounded-xl border border-border bg-panel2 px-3 text-xs text-muted transition hover:border-accent/50 hover:text-ink"
        >
          List
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-border bg-[#171716] px-3 text-left text-ink",
          "shadow-inner shadow-black/10 transition focus:border-accent/80 focus:outline-none focus:ring-2 focus:ring-accent/25",
        )}
      >
        <span className={cn(!value && "text-muted")}>{value || placeholder}</span>
        <span className="ml-2 text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-border bg-panel shadow-2xl shadow-black/40">
          {searchable && (
            <div className="border-b border-border p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Search…"
                aria-label="Search options"
                className="h-9 w-full appearance-none rounded-lg border border-border bg-[#171716] px-2 text-sm text-ink placeholder:text-muted focus:border-accent/70 focus:outline-none"
              />
            </div>
          )}
          <ul role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">No matches.</li>
            ) : (
              filtered.map((option, i) => (
                <li key={option} role="option" aria-selected={option === value}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition",
                      i === activeIndex ? "bg-accent/15 text-ink" : "text-body hover:bg-panel2",
                      option === value && "font-semibold text-accent",
                    )}
                  >
                    {option}
                    {option === customTriggerLabel && <span className="text-[10px] uppercase tracking-widest text-muted">custom</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
