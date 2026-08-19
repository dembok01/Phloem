// W1.4 — case-wise timeline. One thread per clinical problem: what it is, how
// serious, when it started, and everything recorded against it since.
//
// This is the answer to "is her knee actually getting better?" — a question the old
// report list could not answer, because each month's assessment lived in a separate
// document with no thread connecting them.
//
// RLS is the boundary: member_cases is invisible to the psychologist and the
// coordinator, and a caregiver sees only cases the doctor shared. This component
// just reads what the caller may read.
import { Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CaseControls } from "@/components/cases/case-controls";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST, formatDateTimeIST } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const SEVERITY: Record<string, { label: string; variant: "muted" | "warning" | "danger" }> = {
  low: { label: "Low", variant: "muted" },
  medium: { label: "Watch", variant: "warning" },
  high: { label: "Serious", variant: "danger" },
};

const STATUS_COPY: Record<string, string> = {
  open: "Active",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

export async function CasePanel({
  memberId,
  canEdit = false,
  title = "Health matters",
  description,
}: {
  memberId: string;
  /** the assigned doctor and admins may author; everyone else reads */
  canEdit?: boolean;
  title?: string;
  description?: string;
}) {
  const supabase = await createClient();
  const { data: cases } = await supabase
    .from("member_cases")
    .select("id, title, detail, status, severity, share_with_caregiver, opened_at, resolved_at")
    .eq("member_id", memberId)
    .order("opened_at", { ascending: false });

  const list = cases ?? [];
  const { data: events } = list.length
    ? await supabase
        .from("member_case_events")
        .select("id, case_id, at, kind, summary")
        .in(
          "case_id",
          list.map((c) => c.id),
        )
        .order("at", { ascending: false })
    : { data: [] as { id: string; case_id: string; at: string; kind: string; summary: string }[] };

  const byCase = new Map<string, { id: string; at: string; kind: string; summary: string }[]>();
  for (const e of events ?? []) {
    const arr = byCase.get(e.case_id) ?? [];
    arr.push(e);
    byCase.set(e.case_id, arr);
  }

  if (list.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Stethoscope}
            title="Nothing being tracked yet"
            description={
              canEdit
                ? "The problems you list in the initial consultation form become tracked matters here, each with its own history."
                : "Long-running health matters appear here once the doctor has recorded them."
            }
          />
        </CardContent>
      </Card>
    );
  }

  // Active first — a resolved problem is history, not today's work.
  const active = list.filter((c) => c.status !== "resolved");
  const resolved = list.filter((c) => c.status === "resolved");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {active.map((c) => (
          <CaseRow
            key={c.id}
            row={c}
            events={byCase.get(c.id) ?? []}
            memberId={memberId}
            canEdit={canEdit}
          />
        ))}

        {resolved.length > 0 ? (
          <details className="rounded-xl border bg-muted/30 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              {resolved.length} resolved{" "}
              {resolved.length === 1 ? "matter" : "matters"}
            </summary>
            <div className="mt-3 space-y-4">
              {resolved.map((c) => (
                <CaseRow
                  key={c.id}
                  row={c}
                  events={byCase.get(c.id) ?? []}
                  memberId={memberId}
                  canEdit={canEdit}
                />
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CaseRow({
  row,
  events,
  memberId,
  canEdit,
}: {
  row: {
    id: string;
    title: string;
    detail: string | null;
    status: string;
    severity: string;
    share_with_caregiver: boolean;
    opened_at: string;
    resolved_at: string | null;
  };
  events: { id: string; at: string; kind: string; summary: string }[];
  memberId: string;
  canEdit: boolean;
}) {
  const sev = SEVERITY[row.severity] ?? SEVERITY.medium;
  const resolved = row.status === "resolved";

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 shadow-card",
        resolved && "opacity-80",
        row.severity === "high" && !resolved && "border-danger/40",
      )}
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className={cn("font-display text-lg font-semibold", resolved && "line-through decoration-1")}>
          {row.title}
        </h3>
        <Badge variant={resolved ? "muted" : sev.variant}>{sev.label}</Badge>
        <Badge variant={resolved ? "success" : "outline"}>{STATUS_COPY[row.status] ?? row.status}</Badge>
        <span className="ml-auto font-data text-xs text-muted-foreground">
          {resolved && row.resolved_at
            ? `Resolved ${formatDateIST(row.resolved_at)}`
            : `Since ${formatDateIST(row.opened_at)}`}
        </span>
      </header>

      {row.detail ? <p className="mt-1 text-sm text-muted-foreground">{row.detail}</p> : null}

      {events.length > 0 ? (
        <ol className="mt-3 space-y-2 border-l pl-3">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span
                className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-border ring-2 ring-card"
                aria-hidden
              />
              <p className="text-sm">{e.summary}</p>
              <p className="font-data text-xs text-muted-foreground">{formatDateTimeIST(e.at)}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {canEdit ? (
        <CaseControls
          caseId={row.id}
          memberId={memberId}
          status={row.status}
          shared={row.share_with_caregiver}
        />
      ) : null}
    </article>
  );
}
