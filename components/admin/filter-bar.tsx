"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Chip as ToggleChip } from "@/components/ui/chip";
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
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm outline-none transition-colors hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
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

      {/* Phones: one row of chips that swipes sideways instead of wrapping onto
          several rows and pushing the list down. It bleeds to the screen edge like
          NavTabs, so a chip cut off at the edge says "swipe". The shown/total line
          goes to screen readers only there; the chips already carry every count. */}
      {/* py-1.5 on phones: room for each chip's 44px touch area inside the scroller. */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 max-md:py-1.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <ToggleChip selected={active === null} onClick={() => onSelect(null)} count={total}>
          All
        </ToggleChip>
        {chips.map((c) => (
          <ToggleChip
            key={c.value}
            selected={active === c.value}
            tone={c.tone ?? "neutral"}
            count={c.count}
            onClick={() => onSelect(active === c.value ? null : c.value)}
            // A zero-count chip stays clickable but recedes — hiding it would make
            // the row of filters jump around as data changes, worse than a dim chip.
            className={cn(c.count === 0 && active !== c.value && "opacity-45")}
          >
            {c.label}
          </ToggleChip>
        ))}
        <p
          aria-live="polite"
          className={cn(
            "ml-auto text-xs tabular-nums transition-colors",
            filtered ? "font-medium text-foreground" : "text-muted-foreground",
            "max-md:sr-only",
          )}
        >
          {filtered ? `${shown} of ${total} ${noun}` : `${total} ${noun}`}
        </p>
      </div>
    </div>
  );
}
