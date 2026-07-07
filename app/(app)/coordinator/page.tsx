import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeIST, isTodayIST } from "@/lib/datetime";
import type { CareRole } from "@/lib/member-status";

// §10 Today queue — a static-rules task list derived from current member statuses
// and initial consultation states (the cron-driven version arrives in Phase 7).
const ROLE_LABEL: Record<CareRole, string> = {
  doctor: "doctor",
  nutritionist: "nutritionist",
  trainer: "trainer",
  psychologist: "psychologist",
};

type Bucket = "overdue" | "today" | "week";
type Task = { bucket: Bucket; label: string; member: string; href: string };

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
  const push = (bucket: Bucket, label: string, memberId: string) => {
    const member = nameById.get(memberId);
    if (member) tasks.push({ bucket, label, member, href: `/coordinator/members/${memberId}` });
  };

  for (const m of members ?? []) {
    if (m.status === "onboarded") push("today", "Assign a care team", m.id);
    if (m.status === "ready_to_start") push("today", "All reports in — ready to start the program", m.id);
    if (m.status === "renewal_due") push("today", "Renewal conversation due", m.id);
  }

  const now = Date.now();
  for (const c of consults ?? []) {
    const role = ROLE_LABEL[c.type];
    if (c.meeting_status === "to_schedule") {
      push("today", `Schedule the ${role} consult`, c.member_id);
    } else if (c.meeting_status === "scheduled") {
      const t = c.scheduled_at ? new Date(c.scheduled_at).getTime() : NaN;
      if (isTodayIST(c.scheduled_at)) {
        push("today", `${role} meeting today (${formatDateTimeIST(c.scheduled_at)})`, c.member_id);
      } else if (!Number.isNaN(t) && t < now) {
        push("overdue", `Mark the ${role} meeting done`, c.member_id);
      } else {
        push("week", `${role} meeting — ${formatDateTimeIST(c.scheduled_at)}`, c.member_id);
      }
    } else if (c.meeting_status === "done" && c.report_status === "pending") {
      push("week", `Awaiting the ${role} report`, c.member_id);
    }
  }

  const groups: { bucket: Bucket; title: string }[] = [
    { bucket: "overdue", title: "Overdue" },
    { bucket: "today", title: "Today" },
    { bucket: "week", title: "This week" },
  ];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-muted-foreground">Your task queue across all members.</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center text-muted-foreground ring-1 ring-foreground/10">
          <CheckCircle2 className="mx-auto mb-2 size-6 text-emerald-600 dark:text-emerald-400" />
          <p>Nothing needs your attention right now.</p>
        </div>
      ) : (
        groups.map((g) => {
          const items = tasks.filter((t) => t.bucket === g.bucket);
          if (items.length === 0) return null;
          return (
            <div key={g.bucket} className="space-y-2">
              <h2 className={`text-sm font-semibold ${g.bucket === "overdue" ? "text-destructive" : ""}`}>
                {g.title} <span className="text-muted-foreground">({items.length})</span>
              </h2>
              <ul className="space-y-2">
                {items.map((t, i) => (
                  <li key={i}>
                    <Link
                      href={t.href}
                      className={`flex items-center gap-3 rounded-lg border p-3 hover:bg-muted ${g.bucket === "overdue" ? "border-destructive/30" : ""}`}
                    >
                      <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t.label}</span>
                        <span className="block text-xs text-muted-foreground">{t.member}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
