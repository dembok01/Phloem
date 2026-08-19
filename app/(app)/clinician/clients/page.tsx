import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  FileWarning,
  ShieldAlert,
  Stethoscope,
  UsersRound,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Monogram } from "@/components/monogram";
import { PageHeader } from "@/components/page-header";
import { IssueChips } from "@/components/issue-chips";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDateTimeIST, isTodayIST } from "@/lib/datetime";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { resolveClearance } from "@/lib/clearance";
import { computeIssues, worstSeverity, type Issue } from "@/lib/issues";
import { getSessionProfile } from "@/lib/auth";

// §10 clinician list — assigned members only (mem_clinician RLS).
//
// W5: for the DOCTOR this is a dashboard rather than a list. A doctor's day is
// "who is on my calendar, and who needs a decision only I can make" — so today's
// consultations lead, then everyone with an outstanding issue, ordered by how bad
// it is. The other clinical roles keep the queue shape, which already fits their
// day (they work a form at a time).
//
// Every input to the issue computation is something this doctor's RLS already
// grants; nothing here widens what they can read.
export default async function ClinicianClientsPage() {
  const supabase = await createClient();

  const profile = await getSessionProfile();
  const isDoctor = profile?.role === "doctor";

  const [
    { data: members },
    { data: consults },
    { data: activeCycles },
    { data: docReports },
    { data: declining },
    { data: unread },
    { data: engagement },
    { data: feedback },
  ] = await Promise.all([
    supabase.from("members").select("id, full_name, age, status, red_flags").order("full_name"),
    // cons_clinician already scopes these to the viewer's own type + assigned members.
    supabase
      .from("consultations")
      .select("member_id, meeting_status, report_status, scheduled_at, completed_at, mode, meeting_link"),
    // cyc_read: assigned clinicians may read cycles through the package join.
    supabase
      .from("cycles")
      .select("status, number, start_date, end_date, packages!inner(member_id)")
      .eq("status", "active"),
    // Only the doctor decides clearance, so only the doctor pays for this read.
    isDoctor
      ? supabase
          .from("reports")
          .select("member_id, content, created_at")
          .in("type", ["doctor_initial", "doctor_review"])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { member_id: string; content: unknown; created_at: string }[] }),
    isDoctor ? supabase.rpc("my_declining_measures") : Promise.resolve({ data: [] }),
    isDoctor ? supabase.rpc("my_unread_threads") : Promise.resolve({ data: [] }),
    isDoctor ? supabase.rpc("list_engagement") : Promise.resolve({ data: [] }),
    isDoctor
      ? supabase
          .from("form_responses")
          .select("member_id, answers, form_templates!inner(key)")
          .eq("form_templates.key", "feedback_training")
          .not("submitted_at", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  // ---- per-member derivations -------------------------------------------------
  const reportsByMember = new Map<string, { content: unknown }[]>();
  for (const r of docReports ?? []) {
    const list = reportsByMember.get(r.member_id) ?? [];
    list.push({ content: r.content });
    reportsByMember.set(r.member_id, list);
  }

  const decliningByMember = new Map<string, string[]>();
  for (const d of (declining ?? []) as { member_id: string; label: string }[]) {
    const list = decliningByMember.get(d.member_id) ?? [];
    list.push(d.label);
    decliningByMember.set(d.member_id, list);
  }

  const unreadByMember = new Map<string, number>();
  for (const t of (unread ?? []) as { member_id: string; unread: number }[]) {
    unreadByMember.set(t.member_id, (unreadByMember.get(t.member_id) ?? 0) + Number(t.unread));
  }

  const engagementByMember = new Map<string, string>();
  for (const e of (engagement ?? []) as { member_id: string; state: string }[]) {
    engagementByMember.set(e.member_id, e.state);
  }

  const adverseByMember = new Set<string>();
  for (const f of (feedback ?? []) as { member_id: string; answers: Record<string, unknown> }[]) {
    if (String(f.answers?.adverse_events) === "true") adverseByMember.add(f.member_id);
  }

  const pending = new Map<string, boolean>();
  const overdueHours = new Map<string, number>();
  const nextConsult = new Map<string, string>();
  const todayConsults: {
    memberId: string;
    at: string;
    mode: string | null;
    link: string | null;
  }[] = [];
  const now = Date.now();
  for (const c of consults ?? []) {
    if (c.meeting_status === "done" && c.report_status === "pending") {
      pending.set(c.member_id, true);
      if (c.completed_at) {
        const hours = (now - new Date(c.completed_at).getTime()) / 3_600_000;
        overdueHours.set(c.member_id, Math.max(overdueHours.get(c.member_id) ?? 0, hours));
      }
    }
    if (c.scheduled_at && new Date(c.scheduled_at).getTime() >= now) {
      const cur = nextConsult.get(c.member_id);
      if (!cur || new Date(c.scheduled_at) < new Date(cur)) nextConsult.set(c.member_id, c.scheduled_at);
    }
    if (c.scheduled_at && c.meeting_status === "scheduled" && isTodayIST(c.scheduled_at)) {
      todayConsults.push({
        memberId: c.member_id,
        at: c.scheduled_at,
        mode: c.mode,
        link: c.meeting_link,
      });
    }
  }
  todayConsults.sort((a, b) => (a.at < b.at ? -1 : 1));

  const cycleByMember = new Map<string, string>();
  const cycleEndByMember = new Map<string, string>();
  for (const cy of activeCycles ?? []) {
    const pkg = cy.packages as { member_id: string } | { member_id: string }[] | null;
    const memberId = Array.isArray(pkg) ? pkg[0]?.member_id : pkg?.member_id;
    if (memberId) {
      cycleByMember.set(memberId, `Cycle ${cy.number} · Day ${istDay(cy.start_date)}`);
      cycleEndByMember.set(memberId, cy.end_date);
    }
  }

  const rows = (members ?? []).map((m) => {
    const flags = parseRedFlags(m.red_flags);
    const clearance = isDoctor ? resolveClearance(reportsByMember.get(m.id) ?? []) : null;
    const issues: Issue[] = isDoctor
      ? computeIssues({
          flags,
          clearance,
          adverseEvent: adverseByMember.has(m.id),
          reportOverdueHours: overdueHours.get(m.id) ?? null,
          decliningMeasures: decliningByMember.get(m.id) ?? [],
          engagement: engagementByMember.get(m.id) ?? "engaged",
          // The doctor cannot read `packages`; the active cycle's end date is the
          // programme signal their RLS does grant.
          daysUntilProgrammeEnds: daysUntil(cycleEndByMember.get(m.id)),
          unreadMessages: unreadByMember.get(m.id) ?? 0,
        })
      : [];
    return {
      m,
      flags,
      high: hasHighFlag(flags),
      due: !!pending.get(m.id),
      next: nextConsult.get(m.id),
      clearance: isDoctor && flags.length > 0 && clearance === null,
      issues,
      worst: worstSeverity(issues),
    };
  });

  const byId = new Map(rows.map((r) => [r.m.id, r]));

  // ---- grouping ---------------------------------------------------------------
  const groups = isDoctor
    ? (() => {
        const needsYou = rows
          .filter((r) => r.worst === "danger" || r.worst === "warning")
          .sort((a, b) => (a.worst === "danger" ? -1 : 1) - (b.worst === "danger" ? -1 : 1));
        const rest = rows.filter((r) => !needsYou.includes(r));
        const upcoming = rest.filter((r) => r.next);
        const others = rest.filter((r) => !r.next);
        return [
          { key: "needs", label: "Needs you", tone: "danger" as const, rows: needsYou },
          { key: "next", label: "Upcoming consultations", tone: "muted" as const, rows: upcoming },
          { key: "rest", label: "Everyone else", tone: "muted" as const, rows: others },
        ].filter((g) => g.rows.length > 0);
      })()
    : (() => {
        const formsDue = rows.filter((r) => r.due);
        const upcoming = rows.filter((r) => !r.due && r.next);
        const others = rows.filter((r) => !r.due && !r.next);
        return [
          { key: "due", label: "Needs your form", tone: "warning" as const, rows: formsDue },
          { key: "next", label: "Upcoming consultations", tone: "muted" as const, rows: upcoming },
          { key: "rest", label: "Everyone else", tone: "muted" as const, rows: others },
        ].filter((g) => g.rows.length > 0);
      })();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={isDoctor ? "Your day" : "My members"}
        description={
          isDoctor
            ? "Today's consultations first, then everyone with something outstanding — worst first."
            : "Your queue — what is blocking comes first, then what only you can decide."
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No members yet"
          description="The coordinator assigns members to you; they'll appear here with their consultation status."
        />
      ) : (
        <>
          {isDoctor && todayConsults.length > 0 ? (
            <div className="space-y-2">
              <h2 className="eyebrow flex items-center gap-2">
                <CalendarClock className="size-3.5 text-info" aria-hidden />
                Today
                <span className="font-data text-foreground tabular-nums">{todayConsults.length}</span>
              </h2>
              <ul className="space-y-2">
                {todayConsults.map((c, i) => {
                  const row = byId.get(c.memberId);
                  if (!row) return null;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-info/40 bg-card p-4 shadow-card"
                    >
                      <Monogram name={row.m.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/clinician/clients/${c.memberId}`}
                          className="font-medium hover:underline"
                        >
                          {row.m.full_name}
                        </Link>
                        <p className="font-data text-sm text-muted-foreground">
                          {formatDateTimeIST(c.at)}
                          {c.mode ? ` · ${c.mode.replace("_", " ")}` : ""}
                        </p>
                      </div>
                      {c.link ? (
                        <a
                          href={c.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
                        >
                          <Video className="size-4" aria-hidden /> Join
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <h2 className="eyebrow flex items-center gap-2">
                {g.key === "needs" ? (
                  <Stethoscope className="size-3.5 text-danger" aria-hidden />
                ) : null}
                {g.label}
                <span className="font-data text-foreground tabular-nums">{g.rows.length}</span>
              </h2>
              <ul className="space-y-2">
                {g.rows.map(({ m, flags, high, due, next, clearance, issues, worst }) => (
                  <li key={m.id}>
                    <Link
                      href={`/clinician/clients/${m.id}${
                        issues[0]?.tab ? `?tab=${issues[0].tab}` : due ? "?tab=form" : clearance ? "?tab=clearance" : ""
                      }`}
                      className={cn(
                        "pressable block rounded-xl border bg-card p-4 shadow-card hover:border-primary/40 hover:bg-secondary/40",
                        worst === "danger" && "border-danger/40",
                        worst === "warning" && "border-warning/50",
                        !worst && due && "border-warning/50",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Monogram name={m.full_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 font-medium">
                            {m.full_name}
                            {m.age ? (
                              <span className="font-normal text-muted-foreground"> · {m.age} yrs</span>
                            ) : null}
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
                            {[
                              cycleByMember.get(m.id),
                              next ? `Next consult ${formatDateTimeIST(next)}` : "No upcoming consult",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {!isDoctor && due ? (
                          <Badge variant="warning">
                            <FileWarning className="size-3.5" aria-hidden /> Form due
                          </Badge>
                        ) : !isDoctor && clearance ? (
                          <Badge variant="danger">
                            <ShieldAlert className="size-3.5" aria-hidden /> Decide
                          </Badge>
                        ) : null}
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </div>

                      {issues.length > 0 ? <IssueChips issues={issues} className="mt-2.5" /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
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

/** Whole days from now until an ISO date (IST), or null. */
function daysUntil(date: string | undefined): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00+05:30`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}
