"use client";

import * as React from "react";
import { Ban, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Monogram, toneForRole } from "@/components/monogram";
import { FilterBar, syncUrl, type Chip } from "./filter-bar";
import { RowAction } from "./row-action";
import { AdminTable, SortTh, Td, Th, Tr, useSort } from "./table";
import { setAccountStatusAction } from "@/app/(app)/admin/care-team/actions";
import { matchesQuery, sortRows } from "@/lib/admin-filters";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

export type CareTeamRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  role: "doctor" | "nutritionist" | "trainer" | "psychologist";
  suspended: boolean;
};

type SortKey = "full_name" | "role" | "status";

const ROLES: CareTeamRow["role"][] = ["doctor", "nutritionist", "trainer", "psychologist"];

export function CareTeamTable({
  rows,
  initialRole,
}: {
  rows: CareTeamRow[];
  initialRole: string | null;
}) {
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState<string | null>(initialRole);
  const [suspendedOnly, setSuspendedOnly] = React.useState(false);
  const { sort, onSort } = useSort<SortKey>("full_name");

  const chips: Chip[] = ROLES.map((r) => ({
    value: r,
    label: ROLE_LABEL[r],
    count: rows.filter((x) => x.role === r).length,
  }));

  const visible = React.useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (role === null || r.role === role) &&
        (!suspendedOnly || r.suspended) &&
        matchesQuery([r.full_name, r.email, r.specialization, ROLE_LABEL[r.role]], query),
    );
    return sortRows(
      filtered,
      (r) =>
        sort.key === "role"
          ? ROLE_LABEL[r.role]
          : sort.key === "status"
            ? r.suspended
              ? "Suspended"
              : "Active"
            : r.full_name,
      sort.dir,
    );
  }, [rows, role, suspendedOnly, query, sort]);

  const suspendedCount = rows.filter((r) => r.suspended).length;

  function selectRole(next: string | null) {
    setRole(next);
    syncUrl({ role: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search by name, email or specialization"
        chips={chips}
        active={role}
        onSelect={selectRole}
        shown={visible.length}
        total={rows.length}
        noun="people"
      >
        {suspendedCount > 0 ? (
          <button
            type="button"
            aria-pressed={suspendedOnly}
            onClick={() => setSuspendedOnly((v) => !v)}
            className={cn(
              "pressable inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
              suspendedOnly ? "border-transparent bg-danger text-white" : "hover:bg-muted",
            )}
          >
            <Ban className="size-4" aria-hidden />
            Suspended only
            <span className="tabular-nums opacity-70">{suspendedCount}</span>
          </button>
        ) : null}
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={rows.length === 0 ? "No care team yet" : "Nobody matches those filters"}
          description={
            rows.length === 0
              ? "Invite a doctor, nutritionist, trainer or psychologist using the form beside this list."
              : "Try a different role, or clear the search to see everyone."
          }
        />
      ) : (
        <AdminTable
          label="Care team"
          head={
            <>
              <SortTh id="full_name" label="Name" sort={sort} onSort={onSort} />
              <SortTh id="role" label="Role" sort={sort} onSort={onSort} />
              <Th>Contact</Th>
              <SortTh id="status" label="Status" sort={sort} onSort={onSort} />
              <Th className="text-right">Action</Th>
            </>
          }
        >
          {visible.map((p) => (
            <Tr key={p.id} className={cn(p.suspended && "bg-danger-tint/40")}>
              <Td>
                <span className="flex items-center gap-2.5">
                  <Monogram name={p.full_name} size="xs" tone={toneForRole(p.role)} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{p.full_name}</span>
                    {p.specialization ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.specialization}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Td>
              <Td>{ROLE_LABEL[p.role]}</Td>
              <Td>
                <span className="block truncate">{p.email ?? "—"}</span>
                {p.phone ? (
                  <span className="block text-xs tabular-nums text-muted-foreground">{p.phone}</span>
                ) : null}
              </Td>
              <Td>
                {p.suspended ? (
                  <Badge variant="danger">Suspended</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
              </Td>
              <Td className="text-right">
                {/* Suspend and reactivate are true inverses, so this is the one
                    place in the admin shell that can honestly offer an Undo. */}
                <RowAction
                  variant={p.suspended ? "outline" : "destructive"}
                  pendingText={p.suspended ? "Reactivating…" : "Suspending…"}
                  run={() => setAccountStatusAction(p.id, p.suspended ? "active" : "suspended")}
                  success={
                    p.suspended
                      ? `Reactivated ${p.full_name}`
                      : `Suspended ${p.full_name} — locked out everywhere`
                  }
                  undo={{
                    label: "Undo",
                    run: () => setAccountStatusAction(p.id, p.suspended ? "suspended" : "active"),
                    success: p.suspended
                      ? `${p.full_name} is suspended again`
                      : `${p.full_name} is active again`,
                  }}
                >
                  {p.suspended ? "Reactivate" : "Suspend"}
                </RowAction>
              </Td>
            </Tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
