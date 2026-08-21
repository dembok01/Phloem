"use client";

import * as React from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, syncUrl, type Chip } from "./filter-bar";
import { AdminTable, SortTh, Td, Th, Tr, useSort } from "./table";
import { matchesQuery, sortRows } from "@/lib/admin-filters";

export type AuditRow = {
  id: number;
  when: string;
  whenIso: string;
  actor: string;
  action: string;
  entity: string;
  entityType: string;
};

type SortKey = "whenIso" | "actor" | "action";

const PAGE = 50;

export function AuditTable({
  rows,
  initialEntity,
}: {
  rows: AuditRow[];
  initialEntity: string | null;
}) {
  const [query, setQuery] = React.useState("");
  const [entity, setEntity] = React.useState<string | null>(initialEntity);
  const [limit, setLimit] = React.useState(PAGE);
  const { sort, onSort } = useSort<SortKey>("whenIso", "desc");

  const chips: Chip[] = React.useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const seen = counts.get(r.entityType);
      if (seen) seen.count += 1;
      else counts.set(r.entityType, { label: r.entity, count: 1 });
    }
    return [...counts.entries()]
      .map(([value, v]) => ({ value, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const visible = React.useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (entity === null || r.entityType === entity) &&
        matchesQuery([r.actor, r.action, r.entity], query),
    );
    return sortRows(filtered, (r) => r[sort.key], sort.dir);
  }, [rows, entity, query, sort]);

  // Reset paging whenever the result set changes underneath it, so "Show more"
  // never reveals rows from a filter you already moved on from.
  React.useEffect(() => setLimit(PAGE), [query, entity, sort]);

  function selectEntity(next: string | null) {
    setEntity(next);
    syncUrl({ entity: next });
  }

  const page = visible.slice(0, limit);

  return (
    <div className="space-y-4">
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search the log by actor or action"
        chips={chips}
        active={entity}
        onSelect={selectEntity}
        shown={visible.length}
        total={rows.length}
        noun="entries"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={rows.length === 0 ? "No audit entries yet" : "Nothing matches those filters"}
          description={
            rows.length === 0
              ? "Every state change in the system is recorded here as it happens."
              : "Try a different entity, or clear the search to see the whole log."
          }
        />
      ) : (
        <>
          <AdminTable
            label="Audit log"
            head={
              <>
                <SortTh id="whenIso" label="When" sort={sort} onSort={onSort} />
                <SortTh id="actor" label="Actor" sort={sort} onSort={onSort} />
                <SortTh id="action" label="Action" sort={sort} onSort={onSort} />
                <Th>Entity</Th>
              </>
            }
          >
            {page.map((r) => (
              <Tr key={r.id}>
                <Td numeric className="whitespace-nowrap text-muted-foreground">
                  {r.when}
                </Td>
                <Td>{r.actor}</Td>
                <Td>
                  <Badge variant="muted">
                    <span className="font-mono text-[0.7rem]">{r.action}</span>
                  </Badge>
                </Td>
                <Td className="text-muted-foreground">{r.entity}</Td>
              </Tr>
            ))}
          </AdminTable>

          {limit < visible.length ? (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="pressable w-full rounded-xl border border-dashed py-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:bg-card hover:text-foreground"
            >
              Show {Math.min(PAGE, visible.length - limit)} more
              <span className="ml-1.5 tabular-nums opacity-70">
                ({limit} of {visible.length})
              </span>
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
