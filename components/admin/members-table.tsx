"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldAlert, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Monogram } from "@/components/monogram";
import { FilterBar, syncUrl, type Chip } from "./filter-bar";
import { AdminTable, SortTh, Td, Th, Tr, useSort } from "./table";
import { matchesQuery, sortRows } from "@/lib/admin-filters";
import { MEMBER_STATUS_LABEL, memberStatusVariant, type MemberStatus } from "@/lib/member-status";
import { cn } from "@/lib/utils";

export type MemberRow = {
  id: string;
  full_name: string;
  age: number | null;
  city: string | null;
  status: MemberStatus;
  linked: boolean;
  /** Precomputed on the server so the red-flag parser never ships to the client. */
  high: boolean;
};

type SortKey = "full_name" | "age" | "city" | "status";

const STATUS_ORDER: MemberStatus[] = [
  "invited",
  "signed_up",
  "onboarding",
  "onboarded",
  "assigned",
  "initial_consults",
  "ready_to_start",
  "active",
  "renewal_due",
  "inactive",
];

export function MembersTable({
  rows,
  initialStatus,
}: {
  rows: MemberRow[];
  /** From `?status=` — the dashboard funnel and tiles deep-link straight here. */
  initialStatus: string | null;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(initialStatus);
  const [flaggedFirst, setFlaggedFirst] = React.useState(false);
  const { sort, onSort } = useSort<SortKey>("full_name");

  const chips: Chip[] = React.useMemo(
    () =>
      STATUS_ORDER.map((s) => ({
        value: s,
        label: MEMBER_STATUS_LABEL[s],
        count: rows.filter((r) => r.status === s).length,
        tone: s === "renewal_due" ? ("warning" as const) : undefined,
      })).filter((c) => c.count > 0 || c.value === status),
    [rows, status],
  );

  const visible = React.useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (status === null || r.status === status) &&
        matchesQuery([r.full_name, r.city, MEMBER_STATUS_LABEL[r.status]], query),
    );
    const sorted = sortRows(
      filtered,
      (r) => (sort.key === "status" ? MEMBER_STATUS_LABEL[r.status] : r[sort.key]),
      sort.dir,
    );
    // A stable partition, so flagged members rise without losing the column sort
    // underneath them.
    return flaggedFirst ? [...sorted.filter((r) => r.high), ...sorted.filter((r) => !r.high)] : sorted;
  }, [rows, status, query, sort, flaggedFirst]);

  const flaggedCount = rows.filter((r) => r.high).length;

  function selectStatus(next: string | null) {
    setStatus(next);
    syncUrl({ status: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search members by name or city"
        chips={chips}
        active={status}
        onSelect={selectStatus}
        shown={visible.length}
        total={rows.length}
        noun="members"
      >
        {flaggedCount > 0 ? (
          <button
            type="button"
            aria-pressed={flaggedFirst}
            onClick={() => setFlaggedFirst((v) => !v)}
            className={cn(
              "pressable inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
              flaggedFirst
                ? "border-transparent bg-danger text-white"
                : "hover:bg-muted",
            )}
          >
            <ShieldAlert className="size-4" aria-hidden />
            Flagged first
            <span className="tabular-nums opacity-70">{flaggedCount}</span>
          </button>
        ) : null}
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={rows.length === 0 ? "No members yet" : "No members match those filters"}
          description={
            rows.length === 0
              ? "Enroll a member to send their caregiver an invite and start onboarding."
              : "Try a different status, or clear the search to see everyone."
          }
        />
      ) : (
        <AdminTable
          label="Members"
          head={
            <>
              <SortTh id="full_name" label="Name" sort={sort} onSort={onSort} />
              <SortTh id="age" label="Age" sort={sort} onSort={onSort} className="w-20" />
              <SortTh id="city" label="City" sort={sort} onSort={onSort} />
              <Th>Caregiver</Th>
              <SortTh id="status" label="Status" sort={sort} onSort={onSort} />
            </>
          }
        >
          {visible.map((m) => (
            <Tr key={m.id} className={cn(m.high && "bg-danger-tint/40")}>
              <Td>
                <Link
                  href={`/admin/members/${m.id}`}
                  className="pressable -m-1 flex items-center gap-2.5 rounded-lg p-1 font-medium text-foreground hover:text-primary"
                >
                  <Monogram name={m.full_name} size="xs" />
                  <span className="truncate">{m.full_name}</span>
                  {m.high ? (
                    <ShieldAlert
                      className="size-4 shrink-0 text-danger"
                      aria-label="High red flag"
                    />
                  ) : null}
                </Link>
              </Td>
              <Td numeric>{m.age ?? "—"}</Td>
              <Td>{m.city ?? "—"}</Td>
              <Td>
                {m.linked ? (
                  <Badge variant="success">Linked</Badge>
                ) : (
                  <Badge variant="warning">Pending</Badge>
                )}
              </Td>
              <Td>
                <Badge variant={memberStatusVariant(m.status)}>
                  {MEMBER_STATUS_LABEL[m.status]}
                </Badge>
              </Td>
            </Tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
