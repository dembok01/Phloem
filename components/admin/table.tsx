"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { SortDir } from "@/lib/admin-filters";
import { cn } from "@/lib/utils";

/**
 * Table chrome for the admin lists.
 *
 * These stay tables rather than moving onto the List/ListRow queue component:
 * a queue has one dominant name per row and repeats its verb, while admin data
 * is genuinely columnar (age, city, caregiver, status). What they were missing
 * was not a different component — it was a sticky header, a real hover state,
 * tabular numerals, and sortable columns.
 */

export function AdminTable({
  head,
  children,
  label,
  className,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  label: string;
  /** e.g. `max-md:hidden` when a PhoneList stands in for the table on phones */
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-card shadow-card", className)}>
      <table className="w-full text-sm" aria-label={label}>
        {/* top-0, never an offset: the overflow-x wrapper is the box sticky measures
            against, so `top-14` pushed the header 56px down onto row 1 and hid the
            first member — the only one, when a filter left a single match. */}
        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <tr className="border-b text-left text-muted-foreground">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * The phone stand-in for an AdminTable. A table's columns are wider than a phone
 * (members 728px, invites 806px at 360), so on phones each list renders its own
 * compact rows here and hides the table with `className="max-md:hidden"`. Both
 * read the same filtered rows, so search, chips and sort order match.
 */
export function PhoneList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="divide-y overflow-hidden rounded-xl border bg-card shadow-card md:hidden"
    >
      {children}
    </ul>
  );
}

/**
 * A table row. With `href`, the WHOLE row opens it: before this only the name
 * was a link, and it looked like plain text, so the row gave no sign it led
 * anywhere. The row keeps a real <a> (the name) for keyboard, screen readers and
 * right-click; the row's own click is the mouse convenience on top. Pair it with
 * `ThOpen` / `TdOpen` for the trailing chevron.
 */
export function Tr({
  children,
  className,
  pending,
  href,
}: {
  children: React.ReactNode;
  className?: string;
  /** Dims the row while its own action is in flight. */
  pending?: boolean;
  href?: string;
}) {
  const router = useRouter();

  function open(e: React.MouseEvent<HTMLTableRowElement>) {
    if (!href) return;
    // A control inside the row does its own job (the name link already navigates).
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label, summary")) return;
    // Letting go of a text selection is not a click on the row.
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
    else router.push(href);
  }

  return (
    <tr
      onClick={href ? open : undefined}
      className={cn(
        "group/tr border-b transition-colors last:border-0 hover:bg-muted/50",
        href && "cursor-pointer hover:bg-secondary/45",
        pending && "pointer-events-none opacity-50",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/** Header cell for the trailing chevron column of a linked row. */
export function ThOpen() {
  return (
    <th className="w-10 p-0">
      <span className="sr-only">Open</span>
    </th>
  );
}

/** The chevron that says "this row opens". Nudges right as the row is hovered. */
export function TdOpen() {
  return (
    <td className="w-10 pr-3 text-muted-foreground">
      <ChevronRight
        className="size-4 transition-[translate,color] duration-(--motion-press) ease-out group-hover/tr:translate-x-0.5 group-hover/tr:text-foreground"
        aria-hidden
      />
    </td>
  );
}

export function Td({
  children,
  className,
  numeric,
}: {
  children: React.ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td className={cn("px-4 py-3", numeric && "tabular-nums", className)}>{children}</td>
  );
}

export function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={cn("px-4 py-3 font-medium", className)}>{children}</th>;
}

/**
 * A sortable column header. Shows the neutral glyph until it is the active
 * column, so the affordance is visible before you have used it — the whole
 * point of "make the buttons evident".
 */
export function SortTh<K extends string>({
  id,
  label,
  sort,
  onSort,
  className,
}: {
  id: K;
  label: string;
  sort: { key: K; dir: SortDir };
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === id;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("p-0 font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(id)}
        aria-label={`Sort by ${label}${active ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
        className={cn(
          "pressable flex w-full items-center gap-1.5 px-4 py-3 text-left hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5 transition-opacity", active ? "opacity-100" : "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

/** Column sort state + toggler. Clicking the active column flips direction. */
export function useSort<K extends string>(initial: K, initialDir: SortDir = "asc") {
  const [sort, setSort] = React.useState<{ key: K; dir: SortDir }>({
    key: initial,
    dir: initialDir,
  });
  const onSort = React.useCallback((key: K) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }, []);
  return { sort, onSort };
}
