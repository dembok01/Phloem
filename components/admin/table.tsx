"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
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
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full text-sm" aria-label={label}>
        <thead className="sticky top-14 z-10 bg-card/95 backdrop-blur">
          <tr className="border-b text-left text-muted-foreground">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({
  children,
  className,
  pending,
}: {
  children: React.ReactNode;
  className?: string;
  /** Dims the row while its own action is in flight. */
  pending?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b transition-colors last:border-0 hover:bg-muted/50",
        pending && "pointer-events-none opacity-50",
        className,
      )}
    >
      {children}
    </tr>
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
