"use client";

import * as React from "react";
import { MailPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyField } from "@/components/copy-field";
import { FilterBar, syncUrl, type Chip } from "./filter-bar";
import { RowAction } from "./row-action";
import { AdminTable, SortTh, Td, Th, Tr, useSort } from "./table";
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
        <AdminTable
          label="Invites"
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
                {inv.state === "used" ? (
                  <Badge variant="success">Used</Badge>
                ) : inv.state === "expired" ? (
                  <Badge variant="danger">Expired</Badge>
                ) : (
                  <Badge variant="warning">Pending</Badge>
                )}
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
                  <div className="flex flex-col items-end gap-2">
                    {inv.url ? <CopyField value={inv.url} label={`Invite link for ${inv.email}`} /> : null}
                    {/* No Undo offered: revoking DELETES the row. */}
                    <RowAction
                      variant="destructive"
                      pendingText="Revoking…"
                      run={() => revokeInviteAction(inv.id)}
                      success={`Invite to ${inv.email} revoked`}
                    >
                      Revoke
                    </RowAction>
                  </div>
                )}
              </Td>
            </Tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
