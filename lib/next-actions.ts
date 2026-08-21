/**
 * "What should happen next, for whom, and why" — one answer, every surface.
 *
 * The coordinator's Today queue, the pipeline board and the admin overview all
 * need this, and it has to be the SAME answer on all three. It used to be
 * computed in three separate places (an inline `push()` block in the Today page,
 * a private `nextAction()` in the pipeline, and nothing at all for admin), which
 * is exactly the drift `lib/issues.ts` was extracted to prevent for doctors.
 *
 * Two things are deliberate:
 *
 *   * **`why` and `how` are fields on the action, not copy written elsewhere.**
 *     The tooltip that explains a row is generated from the same object that
 *     produced the row, so guidance and explanation cannot fall out of step.
 *   * **Escalation adds, it never moves.** Work that has rotted past a week
 *     raises an admin row AND keeps the coordinator's — quietly relocating
 *     someone's task is how things get dropped by both people at once.
 *
 * Pure and unit-tested. Every input is something the caller's own RLS already
 * granted, so computing this leaks nothing.
 */
import { istDayNumber } from "@/lib/datetime";
import type { CareRole } from "@/lib/member-status";

export type ActionOwner = "coordinator" | "admin";
export type ActionBucket = "overdue" | "today" | "week";

export type ActionKind =
  // coordinator
  | "assign"
  | "start"
  | "renewal"
  | "schedule"
  | "meet"
  | "markdone"
  | "report"
  // admin-only (the RPCs a coordinator cannot call), plus escalation
  | "renewal_complete"
  | "member_inactive"
  | "clinician_suspended"
  | "stalled";

export type NextAction = {
  kind: ActionKind;
  owner: ActionOwner;
  bucket: ActionBucket;
  /** The imperative shown on the row. */
  verb: string;
  /** Why this is here — one plain sentence. Never empty. */
  why: string;
  /** How to do it, when that is not obvious from the destination. */
  how?: string;
  /** Whom this is about: a member, or a care-team member for `clinician_suspended`. */
  subject: string;
  memberId?: string;
  role?: CareRole;
  href: string;
  /** The verb with the care role stripped, for rows already grouped under one. */
  short?: string;
  /** The instant this action is pinned to (a meeting time), ISO. The engine stays
   *  free of locale formatting — the surface renders it in IST. */
  at?: string;
  /** Set only on `schedule`, so the queue can act without navigating. */
  scheduleFor?: { memberId: string; consultationId: string; role: string };
};

/** Statuses and roles arrive as plain strings so an enum change cannot crash a
 *  dashboard; anything unrecognised simply produces no action. */
export type ActionMember = { id: string; full_name: string; status: string };
export type ActionConsultation = {
  id: string;
  member_id: string;
  type: string;
  meeting_status: string;
  report_status: string;
  scheduled_at: string | null;
  completed_at: string | null;
  cycle_id: string | null;
  /** The cycle's number, so a review reads "month-2" rather than "consultation". */
  cycleNumber: number | null;
};
export type ActionRenewal = { member_id: string; status: string; decided_at: string | null };
export type ActionSuspended = {
  id: string;
  full_name: string;
  role: string;
  /** Members still actively assigned to this suspended account. */
  activeMembers: number;
};

export type NextActionsInput = {
  members: ActionMember[];
  consultations: ActionConsultation[];
  renewals?: ActionRenewal[];
  suspended?: ActionSuspended[];
  now?: number;
};

/** Past this many days, coordinator work stops being late and starts being stuck. */
const STALE_DAYS = 7;

const CARE_ROLES = ["doctor", "nutritionist", "trainer", "psychologist"] as const;
const BUCKET_ORDER: Record<ActionBucket, number> = { overdue: 0, today: 1, week: 2 };

function asCareRole(v: string): CareRole | undefined {
  return (CARE_ROLES as readonly string[]).includes(v) ? (v as CareRole) : undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "doctor consultation" or "month-2 doctor review". */
function consultLabel(role: string, cycleNumber: number | null): string {
  return cycleNumber == null ? `${role} consultation` : `month-${cycleNumber} ${role} review`;
}

export function nextActions(input: NextActionsInput): NextAction[] {
  const now = input.now ?? Date.now();
  const today = istDayNumber(now);
  const out: NextAction[] = [];
  const nameById = new Map(input.members.map((m) => [m.id, m.full_name]));

  const daysAgo = (iso: string | null): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : today - istDayNumber(t);
  };

  // ---- per member: the lifecycle gates ----------------------------------
  for (const m of input.members) {
    const to = `/coordinator/members/${m.id}`;
    if (m.status === "onboarded") {
      out.push({
        kind: "assign", owner: "coordinator", bucket: "today",
        verb: "Assign the care team", subject: m.full_name, memberId: m.id, href: to,
        why: "Onboarding is complete, but nobody is looking after them yet.",
        how: "Pick a doctor, nutritionist and trainer — that creates their first consultations.",
      });
    }
    if (m.status === "ready_to_start") {
      out.push({
        kind: "start", owner: "coordinator", bucket: "today",
        verb: "Start the programme", subject: m.full_name, memberId: m.id, href: to,
        why: "All three initial reports are in, so the 30-day cycles can begin.",
        how: "Starting it schedules cycle 1 from tomorrow.",
      });
    }
    if (m.status === "renewal_due") {
      out.push({
        kind: "renewal", owner: "coordinator", bucket: "today",
        verb: "Have the renewal conversation", subject: m.full_name, memberId: m.id, href: to,
        why: "Their package ends soon and no decision has been recorded.",
        how: "Propose a renewal from their page; the family answers from the portal.",
      });
    }
    if (m.status === "inactive") {
      out.push({
        kind: "member_inactive", owner: "admin", bucket: "week",
        verb: "Decide on a deactivated member", subject: m.full_name, memberId: m.id,
        href: `/admin/members/${m.id}`,
        why: "They are deactivated, so no care is running and no one is being scheduled.",
        how: "Only an admin can reactivate them, which mints a fresh package.",
      });
    }
  }

  // ---- per consultation: scheduling, meeting, reporting -------------------
  for (const c of input.consultations) {
    const subject = nameById.get(c.member_id);
    if (!subject) continue;
    const role = asCareRole(c.type);
    if (!role) continue;
    const to = `/coordinator/members/${c.member_id}`;
    const label = consultLabel(role, c.cycleNumber);
    const round = c.cycleNumber == null ? "first" : `month-${c.cycleNumber}`;

    if (c.meeting_status === "to_schedule") {
      out.push({
        kind: "schedule", owner: "coordinator", bucket: "today",
        verb: `Schedule the ${label}`, short: "Schedule the consultation",
        subject, memberId: c.member_id, role, href: to,
        why: `Their ${round} ${role} appointment has no date yet.`,
        how: "Pick a time and a mode; the family is notified automatically.",
        scheduleFor: { memberId: c.member_id, consultationId: c.id, role },
      });
      continue;
    }

    if (c.meeting_status === "scheduled") {
      const age = daysAgo(c.scheduled_at);
      if (age === 0) {
        out.push({
          kind: "meet", owner: "coordinator", bucket: "today",
          verb: `${capitalize(role)} meeting today`, short: "Meeting today",
          subject, memberId: c.member_id, role, href: to, at: c.scheduled_at ?? undefined,
          why: "The appointment is today — it still needs marking done afterwards.",
        });
      } else if (age !== null && age > 0) {
        out.push({
          kind: "markdone", owner: "coordinator", bucket: "overdue",
          verb: `Mark the ${role} meeting done`, short: "Mark the meeting done",
          subject, memberId: c.member_id, role, href: to,
          why: `The scheduled time passed ${age} day${age === 1 ? "" : "s"} ago and it is still open.`,
          how: "Marking it done is what unlocks the clinician's form.",
        });
        if (age > STALE_DAYS) {
          out.push({
            kind: "stalled", owner: "admin", bucket: "overdue",
            verb: `Chase the ${role} meeting`, subject, memberId: c.member_id, role,
            href: `/admin/members/${c.member_id}`,
            why: `Still unmarked ${age} days after it was scheduled — the cycle cannot move on.`,
            how: "The coordinator still owns this; it is here because it has been waiting a while.",
          });
        }
      } else {
        out.push({
          kind: "meet", owner: "coordinator", bucket: "week",
          verb: `${capitalize(role)} meeting coming up`, short: "Meeting coming up",
          subject, memberId: c.member_id, role, href: to, at: c.scheduled_at ?? undefined,
          why: "Booked and ahead of us — nothing to do until it happens.",
        });
      }
      continue;
    }

    if (c.meeting_status === "done" && c.report_status === "pending") {
      const age = daysAgo(c.completed_at);
      out.push({
        kind: "report", owner: "coordinator", bucket: "week",
        verb: `Chase the ${role} report`, short: "Chase the report",
        subject, memberId: c.member_id, role, href: to,
        why: "The meeting happened but the clinician has not filed their report.",
        how: "The next cycle stage waits on this report.",
      });
      if (age !== null && age > STALE_DAYS) {
        out.push({
          kind: "stalled", owner: "admin", bucket: "overdue",
          verb: `${capitalize(role)} report is ${age} days late`, subject,
          memberId: c.member_id, role, href: `/admin/members/${c.member_id}`,
          why: `The meeting was done ${age} days ago and the report is still not in.`,
        });
      }
    }
  }

  // ---- admin only: the RPCs a coordinator cannot call ---------------------
  for (const r of input.renewals ?? []) {
    if (r.status !== "accepted") continue;
    const subject = nameById.get(r.member_id) ?? "Member";
    const age = daysAgo(r.decided_at);
    out.push({
      kind: "renewal_complete", owner: "admin", bucket: "today",
      verb: "Complete the renewal", subject, memberId: r.member_id,
      href: `/admin/members/${r.member_id}`,
      why:
        age !== null && age > 0
          ? `The family accepted ${age} day${age === 1 ? "" : "s"} ago and the new package is not open yet.`
          : "The family has accepted; the new package is not open yet.",
      how: "Only an admin can complete a renewal.",
    });
  }

  for (const s of input.suspended ?? []) {
    // A suspended account with nobody assigned harms no one — it is tidy-up, not
    // a task. It only reaches this list while members are stranded behind it.
    if (s.activeMembers <= 0) continue;
    out.push({
      kind: "clinician_suspended", owner: "admin", bucket: "today",
      verb: `${s.full_name} is suspended`, subject: s.full_name,
      href: "/admin/care-team",
      why: `${s.activeMembers} member${s.activeMembers === 1 ? " is" : "s are"} still assigned to them and locked out of that care.`,
      how: "Reactivate the account, or reassign those members to someone else.",
    });
  }

  return out.sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]);
}

/** Everything one desk owns, in order. */
export function actionsFor(actions: NextAction[], owner: ActionOwner): NextAction[] {
  return actions.filter((a) => a.owner === owner);
}
