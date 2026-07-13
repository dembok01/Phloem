import Link from "next/link";
import { GripVertical } from "lucide-react";
import { Monogram } from "@/components/monogram";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { PIPELINE_COLUMNS, type MemberStatus } from "@/lib/member-status";

// §10 pipeline board: members grouped into member_status columns; cards show
// name, red-flag dot, and the next action. Transitions are side-effect-heavy
// §6 RPCs, so cards open the member page rather than dragging between columns
// (DESIGN-PROPOSALS P-2).
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
        return "Assign the care team";
      case "assigned":
      case "initial_consults":
        return `${submittedByMember.get(memberId) ?? 0}/4 reports in`;
      case "ready_to_start":
        return "Ready — start the program";
      case "active":
        return "Program running";
      case "renewal_due":
        return "Renewal conversation";
      case "inactive":
        return "Program complete";
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Every member by stage — open a card to schedule, assign, or start."
      />

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
        {PIPELINE_COLUMNS.map((col) => {
          const cards = list.filter((m) => col.statuses.includes(m.status as MemberStatus));
          const hot = col.key === "renewal" && cards.length > 0;
          return (
            <div key={col.key} className="w-64 shrink-0 snap-start">
              <div
                className={cn(
                  "flex h-full min-h-40 flex-col rounded-xl border bg-sidebar/60 p-2",
                  hot && "border-warning/40",
                )}
              >
                <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                  <h2 className="eyebrow">{col.label}</h2>
                  <span
                    className={cn(
                      "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 font-data text-xs",
                      cards.length > 0 ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {cards.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2">
                  {cards.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No one here right now
                    </p>
                  ) : (
                    cards.map((m) => {
                      const flags = parseRedFlags(m.red_flags);
                      const high = hasHighFlag(flags);
                      return (
                        <Link
                          key={m.id}
                          href={`/coordinator/members/${m.id}`}
                          className="group block cursor-grab rounded-lg border bg-card p-3 shadow-card transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-pop"
                        >
                          <div className="flex items-center gap-2.5">
                            <Monogram name={m.full_name} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{m.full_name}</span>
                                {high ? (
                                  <span
                                    className="size-2.5 shrink-0 rounded-full bg-danger ring-2 ring-danger/20"
                                    title="High red flag on file"
                                    aria-label="High red flag on file"
                                  />
                                ) : flags.length > 0 ? (
                                  <span
                                    className="size-2.5 shrink-0 rounded-full bg-warning ring-2 ring-warning/20"
                                    title="Red flags on file"
                                    aria-label="Red flags on file"
                                  />
                                ) : null}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {nextAction(m.status as MemberStatus, m.id)}
                              </span>
                            </span>
                            <GripVertical
                              className="size-4 shrink-0 text-border transition-colors group-hover:text-muted-foreground"
                              aria-hidden
                            />
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="font-data text-xs text-muted-foreground">
        Tip: press <kbd className="rounded border bg-muted px-1">⌘K</kbd> to jump straight to a member.
      </p>
    </section>
  );
}
