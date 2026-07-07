import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { MEMBER_STATUS_LABEL, PIPELINE_COLUMNS, type MemberStatus } from "@/lib/member-status";

// §10 pipeline board: members grouped into member_status columns; cards show
// name, red-flag dot, and the next action.
export default async function CoordinatorPipelinePage() {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, status, red_flags")
    .order("created_at", { ascending: true });

  const list = members ?? [];
  const ids = list.map((m) => m.id);

  // Submitted-report counts for the Initial Consults chip (N/4).
  const submittedByMember = new Map<string, number>();
  if (ids.length > 0) {
    const { data: consults } = await supabase
      .from("consultations")
      .select("member_id, report_status")
      .is("cycle_id", null)
      .in("member_id", ids);
    for (const c of consults ?? []) {
      if (c.report_status === "submitted") {
        submittedByMember.set(c.member_id, (submittedByMember.get(c.member_id) ?? 0) + 1);
      }
    }
  }

  function nextAction(status: MemberStatus, memberId: string): string {
    switch (status) {
      case "invited":
      case "signed_up":
        return "Awaiting onboarding";
      case "onboarding":
        return "Onboarding in progress";
      case "onboarded":
        return "Assign care team";
      case "assigned":
      case "initial_consults":
        return `${submittedByMember.get(memberId) ?? 0}/4 reports in`;
      case "ready_to_start":
        return "Ready — start program";
      case "active":
        return "Program active";
      case "renewal_due":
        return "Renewal conversation";
      case "inactive":
        return "Inactive";
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Every member by stage. Select a card to manage.</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_COLUMNS.map((col) => {
          const cards = list.filter((m) => col.statuses.includes(m.status as MemberStatus));
          return (
            <div key={col.key} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Empty</p>
                ) : (
                  cards.map((m) => {
                    const flags = parseRedFlags(m.red_flags);
                    return (
                      <Link
                        key={m.id}
                        href={`/coordinator/members/${m.id}`}
                        className="block rounded-lg border bg-card p-3 ring-1 ring-transparent transition-colors hover:ring-foreground/10"
                      >
                        <div className="flex items-center gap-2">
                          {hasHighFlag(flags) ? (
                            <span className="size-2 shrink-0 rounded-full bg-destructive" title="High red flag" />
                          ) : flags.length > 0 ? (
                            <span className="size-2 shrink-0 rounded-full bg-amber-500" title="Red flag" />
                          ) : null}
                          <span className="truncate font-medium">{m.full_name}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {nextAction(m.status as MemberStatus, m.id)}
                        </p>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No members yet — {MEMBER_STATUS_LABEL.invited.toLowerCase()} members appear as they are enrolled.
        </p>
      ) : null}
    </section>
  );
}
