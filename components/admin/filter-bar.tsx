"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Search + one row of single-select chips, shared by every admin list.
 *
 * Filtering is client-side over rows the page already fetched, so it is
 * keystroke-instant. Selection is mirrored into the URL with replaceState
 * rather than router.replace: the link stays shareable (the dashboard funnel
 * deep-links straight into a filtered list) without re-running the server
 * component on every chip press.
 */

export type Chip = {
  value: string;
  label: string;
  count: number;
  tone?: "danger" | "warning" | "success";
};

const TONE: Record<string, string> = {
  danger: "data-[on=true]:bg-danger data-[on=true]:text-white",
  warning: "data-[on=true]:bg-warning data-[on=true]:text-white",
  success: "data-[on=true]:bg-success data-[on=true]:text-white",
};

/** Mirror a filter into the querystring without a server round trip. */
export function syncUrl(patch: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(null, "", url.toString());
}

export function FilterBar({
  query,
  onQuery,
  placeholder,
  chips,
  active,
  onSelect,
  shown,
  total,
  noun,
  children,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  chips: Chip[];
  /** null = "All". Clicking the active chip clears it. */
  active: string | null;
  onSelect: (value: string | null) => void;
  shown: number;
  total: number;
  noun: string;
  /** Extra controls pinned to the right of the search row. */
  children?: React.ReactNode;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere on the page — the one keystroke a list
  // this long earns. Ignored while typing somewhere else.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        onQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onQuery]);

  const filtered = query.trim() !== "" || active !== null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="pressable absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[0.7rem] text-muted-foreground sm:block">
              /
            </kbd>
          )}
        </div>
        {children}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ChipButton on={active === null} onClick={() => onSelect(null)} count={total}>
          All
        </ChipButton>
        {chips.map((c) => (
          <ChipButton
            key={c.value}
            on={active === c.value}
            tone={c.tone}
            count={c.count}
            onClick={() => onSelect(active === c.value ? null : c.value)}
          >
            {c.label}
          </ChipButton>
        ))}
        <p
          aria-live="polite"
          className={cn(
            "ml-auto text-xs tabular-nums transition-colors",
            filtered ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {filtered ? `${shown} of ${total} ${noun}` : `${total} ${noun}`}
        </p>
      </div>
    </div>
  );
}

function ChipButton({
  on,
  tone,
  count,
  onClick,
  children,
}: {
  on: boolean;
  tone?: Chip["tone"];
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-on={on}
      aria-pressed={on}
      onClick={onClick}
      // A zero-count chip stays clickable but recedes — hiding it would make the
      // row of filters jump around as data changes, which is worse than a dim chip.
      className={cn(
        "pressable inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        "data-[on=false]:hover:bg-muted data-[on=true]:border-transparent",
        count === 0 && !on && "opacity-45",
        tone ? TONE[tone] : "data-[on=true]:bg-foreground data-[on=true]:text-background",
      )}
    >
      {children}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
