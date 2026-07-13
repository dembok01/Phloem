import Link from "next/link";
import { ChevronRight, FileWarning, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Monogram } from "@/components/monogram";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDateTimeIST } from "@/lib/datetime";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";

// §10 clinician list — assigned members only (mem_clinician RLS), pending work
// first (C4), with cycle context, next own-type consult, and red-flag dot.
export default async function ClinicianClientsPage() {
  const supabase = await createClient();

  const [{ data: members }, { data: consults }, { data: activeCycles }] = await Promise.all([
    supabase.from("members").select("id, full_name, age, status, red_flags").order("full_name"),
    // cons_clinician already scopes these to the viewer's own type + assigned members.
    supabase.from("consultations").select("member_id, meeting_status, report_status, scheduled_at"),
    // cyc_read: assigned clinicians may read cycles through the package join.
    supabase.from("cycles").select("status, number, start_date, packages!inner(member_id)").eq("status", "active"),
  ]);

  const pending = new Map<string, boolean>();
  const nextConsult = new Map<string, string>();
  const now = Date.now();
  for (const c of consults ?? []) {
    if (c.meeting_status === "done" && c.report_status === "pending") pending.set(c.member_id, true);
    if (c.scheduled_at && new Date(c.scheduled_at).getTime() >= now) {
      const cur = nextConsult.get(c.member_id);
      if (!cur || new Date(c.scheduled_at) < new Date(cur)) nextConsult.set(c.member_id, c.scheduled_at);
    }
  }

  const cycleByMember = new Map<string, string>();
  for (const cy of activeCycles ?? []) {
    const pkg = cy.packages as { member_id: string } | { member_id: string }[] | null;
    const memberId = Array.isArray(pkg) ? pkg[0]?.member_id : pkg?.member_id;
    if (memberId) cycleByMember.set(memberId, `Cycle ${cy.number} · Day ${istDay(cy.start_date)}`);
  }

  // Pending work first, then nearest upcoming consult.
  const list = [...(members ?? [])].sort((a, b) => {
    const pa = pending.get(a.id) ? 0 : 1;
    const pb = pending.get(b.id) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const na = nextConsult.get(a.id) ?? "9999";
    const nb = nextConsult.get(b.id) ?? "9999";
    return na < nb ? -1 : na > nb ? 1 : a.full_name.localeCompare(b.full_name);
  });

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="My members"
        description="Members assigned to you — anything needing your form comes first."
      />

      {list.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No members yet"
          description="The coordinator assigns members to you; they'll appear here with their consultation status."
        />
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const flags = parseRedFlags(m.red_flags);
            const high = hasHighFlag(flags);
            const next = nextConsult.get(m.id);
            const due = pending.get(m.id);
            return (
              <li key={m.id}>
                <Link
                  href={`/clinician/clients/${m.id}${due ? "?tab=form" : ""}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-secondary/40",
                    due && "border-warning/50",
                  )}
                >
                  <Monogram name={m.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      {m.full_name}
                      {m.age ? <span className="font-normal text-muted-foreground"> · {m.age} yrs</span> : null}
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
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[cycleByMember.get(m.id), next ? `Next consult ${formatDateTimeIST(next)}` : "No upcoming consult"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {due ? (
                    <Badge variant="warning">
                      <FileWarning className="size-3.5" aria-hidden /> Form due
                    </Badge>
                  ) : null}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// 1-based IST day within a 30-day cycle.
function istDay(startIso: string): number {
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  const today = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const start = new Date(startIso + "T00:00:00Z").getTime();
  return Math.min(Math.max(Math.round((today - start) / 86400_000) + 1, 1), 30);
}
