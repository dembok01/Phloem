"use client";

import * as React from "react";
import { MailPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyField } from "@/components/copy-field";
import { FilterBar, syncUrl, type Chip } from "./filter-bar";
import { RowAction } from "./row-action";
import { AdminTable, PhoneList, SortTh, Td, Th, Tr, useSort } from "./table";
import { revokeInviteAction } from "@/app/(app)/admin/invites/actions";
import { matchesQuery, relativeDayLabel, sortRows } from "@/lib/admin-filters";
import type { InviteState } from "@/lib/invite";
import { cn } from "@/lib/utils";

export type InviteRow = {
  id: string;
  email: string;
  roleLabel: string;
  kind: string;
  state: InviteState;
  expires_at: string;
  /** Built server-side (needs NEXT_PUBLIC_APP_URL); null once used. */
  url: string | null;
};

type SortKey = "email" | "roleLabel" | "expires_at";

const STATES: { value: InviteState; label: string; tone?: Chip["tone"] }[] = [
  { value: "pending", label: "Pending", tone: "warning" },
  { value: "used", label: "Used", tone: "success" },
  { value: "expired", label: "Expired", tone: "danger" },
];

export function InvitesTable({
  rows,
  initialState,
}: {
  rows: InviteRow[];
  initialState: string | null;
}) {
  const [query, setQuery] = React.useState("");
  const [state, setState] = React.useState<string | null>(initialState);
  const { sort, onSort } = useSort<SortKey>("expires_at", "desc");

  const chips: Chip[] = STATES.map((s) => ({
    value: s.value,
    label: s.label,
    tone: s.tone,
    count: rows.filter((r) => r.state === s.value).length,
  }));

  const visible = React.useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (state === null || r.state === state) && matchesQuery([r.email, r.roleLabel, r.kind], query),
    );
    return sortRows(filtered, (r) => r[sort.key], sort.dir);
  }, [rows, state, query, sort]);

  function selectState(next: string | null) {
    setState(next);
    syncUrl({ state: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search invites by email or role"
        chips={chips}
        active={state}
        onSelect={selectState}
        shown={visible.length}
        total={rows.length}
        noun="invites"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={MailPlus}
          title={rows.length === 0 ? "No invites yet" : "No invites match those filters"}
          description={
            rows.length === 0
              ? "Enroll a member or invite a professional — the accept link appears here to copy."
              : "Try a different state, or clear the search to see them all."
          }
        />
      ) : (
        <>
          <PhoneList label="Invites">
            {visible.map((inv) => (
              <li key={inv.id} className={cn("space-y-2 px-3 py-3", inv.state === "expired" && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] leading-5 font-medium text-foreground">{inv.email}</p>
                    <p className="truncate text-xs leading-4 text-muted-foreground">
                      {inv.roleLabel} · {inv.kind}
                      {inv.state === "used" ? "" : ` · expires ${relativeDayLabel(inv.expires_at)}`}
                    </p>
                  </div>
                  <StateBadge state={inv.state} />
                </div>
                {inv.state === "used" ? null : <InviteActions inv={inv} />}
              </li>
            ))}
          </PhoneList>

          <AdminTable
            label="Invites"
            className="max-md:hidden"
            head={
              <>
                <SortTh id="email" label="Email" sort={sort} onSort={onSort} />
                <SortTh id="roleLabel" label="Role" sort={sort} onSort={onSort} />
                <Th>Kind</Th>
                <Th>State</Th>
                <SortTh id="expires_at" label="Expires" sort={sort} onSort={onSort} />
                <Th className="text-right">Link / action</Th>
              </>
            }
          >
            {visible.map((inv) => (
              <Tr key={inv.id} className={cn(inv.state === "expired" && "opacity-70")}>
                <Td className="font-medium text-foreground">{inv.email}</Td>
                <Td>{inv.roleLabel}</Td>
                <Td className="text-muted-foreground">{inv.kind}</Td>
                <Td>
                  <StateBadge state={inv.state} />
                </Td>
                {/* An expiry is only useful as a distance — "in 3 days", not a date
                    you have to subtract today from. */}
                <Td numeric className="whitespace-nowrap text-muted-foreground">
                  {relativeDayLabel(inv.expires_at)}
                </Td>
                <Td>
                  {inv.state === "used" ? (
                    <span className="block text-right text-muted-foreground">—</span>
                  ) : (
                    <InviteActions inv={inv} className="items-end" />
                  )}
                </Td>
              </Tr>
            ))}
          </AdminTable>
        </>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: InviteRow["state"] }) {
  if (state === "used") return <Badge variant="success">Used</Badge>;
  if (state === "expired") return <Badge variant="danger">Expired</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

/** Copy the link, or revoke. Shared by the phone row and the table. */
function InviteActions({ inv, className }: { inv: InviteRow; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {inv.url ? <CopyField value={inv.url} label={`Invite link for ${inv.email}`} /> : null}
      {/* No Undo offered: revoking DELETES the row. */}
      <RowAction
        variant="destructive"
        pendingText="Revoking…"
        run={() => revokeInviteAction(inv.id)}
        success={`Invite to ${inv.email} revoked`}
        doneText="Revoked"
      >
        Revoke
      </RowAction>
    </div>
  );
}
