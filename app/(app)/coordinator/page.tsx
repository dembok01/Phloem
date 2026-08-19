import Link from "next/link";
import {
  AlarmClockOff,
  CalendarClock,
  CalendarPlus,
  CheckCheck,
  FileClock,
  PartyPopper,
  PhoneOff,
  Sunrise,
  UserPlus,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { List, ListRow, ListSection } from "@/components/ui/list";
import { Monogram, toneForRole } from "@/components/monogram";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDateTimeIST, isTodayIST } from "@/lib/datetime";
import type { CareRole } from "@/lib/member-status";
import { ScheduleSheet } from "@/components/coordinator/schedule-sheet";
import type { EngagementRow } from "@/components/engagement";

// §10 Today queue — every row is one clear action on one member (C3).
const ROLE_NAME: Record<CareRole, string> = {
  doctor: "doctor",
  nutritionist: "nutritionist",
  trainer: "trainer",
  psychologist: "psychologist",
};

type Bucket = "overdue" | "today" | "week";
type Kind = "assign" | "start" | "renewal" | "schedule" | "meet" | "markdone" | "report";
type Task = { bucket: Bucket; kind: Kind; action: string; detail?: string; member: string;
  memberId: string; role?: CareRole; href: string;
  /** the action with the care role stripped out — a grouped row already names the
   *  role in its eyebrow, and printing it twice reads as a bug */
  short?: string;
  /** Set only for `schedule` rows, so the queue can act in place. */
  scheduleFor?: { memberId: string; consultationId: string; role: string } };

const KIND_ICON: Record<Kind, React.ReactNode> = {
  assign: <UserPlus className="size-4" aria-hidden />,
  start: <PartyPopper className="size-4" aria-hidden />,
  renewal: <CalendarClock className="size-4" aria-hidden />,
  schedule: <CalendarPlus className="size-4" aria-hidden />,
  meet: <CalendarClock className="size-4" aria-hidden />,
  markdone: <CheckCheck className="size-4" aria-hidden />,
  report: <FileClock className="size-4" aria-hidden />,
};

export default async function CoordinatorTodayPage() {
  const supabase = await createClient();

  const [{ data: members }, { data: consults }] = await Promise.all([
    supabase.from("members").select("id, full_name, status"),
    supabase
      .from("consultations")
      .select("id, member_id, type, meeting_status, report_status, scheduled_at")
      .is("cycle_id", null),
  ]);

  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const tasks: Task[] = [];
  const push = (
    bucket: Bucket, kind: Kind, action: string, memberId: string, detail?: string,
    scheduleFor?: Task["scheduleFor"], role?: CareRole, short?: string,
  ) => {
    const member = nameById.get(memberId);
    if (member) tasks.push({ bucket, kind, action, detail, member, memberId, role, short,
      href: `/coordinator/members/${memberId}`, scheduleFor });
  };

  for (const m of members ?? []) {
    if (m.status === "onboarded") push("today", "assign", "Assign the care team", m.id, "Onboarding is complete");
    if (m.status === "ready_to_start") push("today", "start", "Start the program", m.id, "All initial reports are in");
    if (m.status === "renewal_due") push("today", "renewal", "Have the renewal conversation", m.id, "Package ends soon");
  }

  const now = Date.now();
  for (const c of consults ?? []) {
    const role = ROLE_NAME[c.type];
    if (c.meeting_status === "to_schedule") {
      push("today", "schedule", `Schedule the ${role} consultation`, c.member_id, undefined, {
        memberId: c.member_id, consultationId: c.id, role,
      }, c.type, "Schedule the consultation");
    } else if (c.meeting_status === "scheduled") {
      const t = c.scheduled_at ? new Date(c.scheduled_at).getTime() : NaN;
      if (isTodayIST(c.scheduled_at)) {
        push("today", "meet", `${capitalize(role)} meeting today`, c.member_id, formatDateTimeIST(c.scheduled_at), undefined, c.type, "Meeting today");
      } else if (!Number.isNaN(t) && t < now) {
        push("overdue", "markdone", `Mark the ${role} meeting done`, c.member_id, "The scheduled time has passed", undefined, c.type, "Mark the meeting done");
      } else {
        push("week", "meet", `${capitalize(role)} meeting coming up`, c.member_id, formatDateTimeIST(c.scheduled_at), undefined, c.type, "Meeting coming up");
      }
    } else if (c.meeting_status === "done" && c.report_status === "pending") {
      push("week", "report", `Chase the ${role} report`, c.member_id, "Meeting done, report not yet in", undefined, c.type, "Chase the report");
    }
  }

  const groups: { bucket: Bucket; title: string; tone: "danger" | "none" }[] = [
    { bucket: "overdue", title: "Overdue", tone: "danger" },
    { bucket: "today", title: "Today", tone: "none" },
    { bucket: "week", title: "This week", tone: "none" },
  ];

  const overdueCount = tasks.filter((t) => t.bucket === "overdue").length;
  const todayCount = tasks.filter((t) => t.bucket === "today").length;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Care coordination"
        title="Today"
        description="Your queue across all members — each row is one action."
      />

      {/* M3 — the one hero on this screen. A coordinator's first question is "how
          much is on me today, and is any of it late", and that used to require
          counting rows. */}
      {tasks.length > 0 ? (
        <Card variant="hero" className="hero-glow">
          <CardContent className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="eyebrow">On your plate</p>
              <p className="stat-figure text-foreground">{todayCount + overdueCount}</p>
              <p className="text-sm text-muted-foreground">
                {overdueCount > 0 ? (
                  <span className="font-medium text-danger">{overdueCount} overdue</span>
                ) : (
                  "nothing overdue"
                )}
                {" · "}
                {tasks.filter((t) => t.bucket === "week").length} later this week
              </p>
            </div>
            <div className="min-w-40 flex-1">
              <p className="eyebrow mb-1.5">Across</p>
              <p className="font-display text-lg font-semibold">
                {new Set(tasks.map((t) => t.memberId)).size} members
              </p>
              <p className="text-sm text-muted-foreground">
                {(members ?? []).length} in the programme
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          icon={Sunrise}
          title="All clear"
          description="Nothing needs your attention right now. New onboarding completions, meetings and reports land here as they happen."
        />
      ) : (
        groups.map((g) => {
          const items = tasks.filter((t) => t.bucket === g.bucket);
          if (items.length === 0) return null;

          // M2/M5 — group by member so one family is one block. Dibesh with three
          // actions used to be three unrelated rows repeating his name.
          const byMember = new Map<string, Task[]>();
          for (const t of items) {
            const arr = byMember.get(t.memberId) ?? [];
            arr.push(t);
            byMember.set(t.memberId, arr);
          }

          return (
            <ListSection
              key={g.bucket}
              label={g.title}
              count={items.length}
              tone={g.tone}
              icon={g.bucket === "overdue" ? <AlarmClockOff className="size-3.5 text-danger" aria-hidden /> : null}
            >
              <div className="space-y-3">
                {[...byMember.entries()].map(([memberId, rows]) => (
                  <div key={memberId}>
                    {rows.length > 1 ? (
                      <Link
                        href={`/coordinator/members/${memberId}`}
                        className="mb-1.5 inline-flex items-center gap-2 text-sm font-medium hover:underline"
                      >
                        <Monogram name={rows[0]!.member} size="xs" />
                        {rows[0]!.member}
                        <span className="font-data text-xs text-muted-foreground">
                          {rows.length} actions
                        </span>
                      </Link>
                    ) : null}
                    <List stagger={g.bucket !== "week"}>
                      {rows.map((t, i) => (
                        <ListRow
                          key={i}
                          href={t.scheduleFor ? undefined : t.href}
                          tone={g.tone === "danger" ? "danger" : "none"}
                          leading={
                            rows.length > 1 ? (
                              <span
                                className={cn(
                                  "inline-flex size-9 items-center justify-center rounded-full",
                                  g.tone === "danger"
                                    ? "bg-danger-tint text-danger"
                                    : "bg-secondary text-secondary-foreground",
                                )}
                              >
                                {KIND_ICON[t.kind]}
                              </span>
                            ) : (
                              <Monogram name={t.member} size="sm" tone={toneForRole(t.role)} />
                            )
                          }
                          eyebrow={
                            rows.length > 1 ? (t.role ? ROLE_NAME[t.role] : t.kind) : t.action
                          }
                          title={rows.length > 1 ? (t.short ?? t.action) : t.member}
                          detail={rows.length > 1 ? t.detail : t.detail}
                          action={
                            t.scheduleFor ? (
                              <ScheduleSheet
                                memberId={t.scheduleFor.memberId}
                                memberName={t.member}
                                consultationId={t.scheduleFor.consultationId}
                                role={t.scheduleFor.role}
                              />
                            ) : undefined
                          }
                        />
                      ))}
                    </List>
                  </div>
                ))}
              </div>
            </ListSection>
          );
        })
      )}

      {/* W3 — families who have gone quiet. Separate from the task queue on
          purpose: these are not tasks the system generated, they are people who
          have stopped showing up, and they need a human decision rather than a
          click. */}
      <QuietFamilies />
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


/** The "who needs a call today" list, worst first. Renders nothing when every
 *  family is engaged — an empty section would just be noise on a good day. */
/** The "who needs a call today" list, worst first. Renders nothing when every
 *  family is engaged — an empty section would just be noise on a good day. */
async function QuietFamilies() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_engagement");
  const rows = ((data ?? []) as unknown as EngagementRow[]).filter(
    (r) => r.state === "quiet" || r.state === "at_risk",
  );
  if (rows.length === 0) return null;

  return (
    <ListSection
      label="Families who have gone quiet"
      count={rows.length}
      tone="warning"
      icon={<PhoneOff className="size-3.5 text-warning" aria-hidden />}
    >
      <List>
        {rows.map((r) => (
          <ListRow
            key={r.member_id}
            href={`/coordinator/members/${r.member_id}`}
            tone={r.state === "at_risk" ? "danger" : "warning"}
            leading={<Monogram name={r.full_name ?? "?"} size="sm" tone="caregiver" />}
            eyebrow={r.state === "at_risk" ? "Needs a call" : "Quiet"}
            title={r.full_name ?? "Member"}
            detail={r.reason}
            meta={r.days_quiet > 0 ? `${r.days_quiet}d` : undefined}
          />
        ))}
      </List>
    </ListSection>
  );
}
