import Link from "next/link";
import {
  AlarmClockOff,
  CalendarClock,
  CalendarPlus,
  CheckCheck,
  FileClock,
  PartyPopper,
  Sunrise,
  UserPlus,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDateTimeIST, isTodayIST } from "@/lib/datetime";
import type { CareRole } from "@/lib/member-status";

// §10 Today queue — every row is one clear action on one member (C3).
const ROLE_NAME: Record<CareRole, string> = {
  doctor: "doctor",
  nutritionist: "nutritionist",
  trainer: "trainer",
  psychologist: "psychologist",
};

type Bucket = "overdue" | "today" | "week";
type Kind = "assign" | "start" | "renewal" | "schedule" | "meet" | "markdone" | "report";
type Task = { bucket: Bucket; kind: Kind; action: string; detail?: string; member: string; href: string };

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
  const push = (bucket: Bucket, kind: Kind, action: string, memberId: string, detail?: string) => {
    const member = nameById.get(memberId);
    if (member) tasks.push({ bucket, kind, action, detail, member, href: `/coordinator/members/${memberId}` });
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
      push("today", "schedule", `Schedule the ${role} consultation`, c.member_id);
    } else if (c.meeting_status === "scheduled") {
      const t = c.scheduled_at ? new Date(c.scheduled_at).getTime() : NaN;
      if (isTodayIST(c.scheduled_at)) {
        push("today", "meet", `${capitalize(role)} meeting today`, c.member_id, formatDateTimeIST(c.scheduled_at));
      } else if (!Number.isNaN(t) && t < now) {
        push("overdue", "markdone", `Mark the ${role} meeting done`, c.member_id, "The scheduled time has passed");
      } else {
        push("week", "meet", `${capitalize(role)} meeting coming up`, c.member_id, formatDateTimeIST(c.scheduled_at));
      }
    } else if (c.meeting_status === "done" && c.report_status === "pending") {
      push("week", "report", `Chase the ${role} report`, c.member_id, "Meeting done, report not yet in");
    }
  }

  const groups: { bucket: Bucket; title: string }[] = [
    { bucket: "overdue", title: "Overdue" },
    { bucket: "today", title: "Today" },
    { bucket: "week", title: "This week" },
  ];

  return (
    <section className="space-y-6">
      <PageHeader title="Today" description="Your queue across all members — each row is one action." />

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
          const overdue = g.bucket === "overdue";
          return (
            <div key={g.bucket} className="space-y-3">
              <h2 className={cn("eyebrow flex items-center gap-2", overdue && "text-danger")}>
                {overdue ? <AlarmClockOff className="size-3.5" aria-hidden /> : null}
                {g.title} · {items.length}
              </h2>
              <ul className="space-y-2">
                {items.map((t, i) => (
                  <li key={i}>
                    <Link
                      href={t.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-card transition-colors hover:border-primary/40 hover:bg-secondary/40",
                        overdue && "border-danger/40 bg-danger-tint/40 hover:border-danger/60 hover:bg-danger-tint",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
                          overdue ? "bg-danger-tint text-danger" : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {KIND_ICON[t.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.action}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {t.member}
                          {t.detail ? ` — ${t.detail}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-secondary-foreground">
                        Open
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
