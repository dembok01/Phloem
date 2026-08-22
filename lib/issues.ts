// W5 — "what is wrong with this member, right now", in one place.
//
// The doctor's dashboard, their member list, and the member page all need the same
// answer, and it must be the same answer on all three. Pure function, unit-tested:
// every input is something the doctor's own RLS already grants, so computing this
// leaks nothing a doctor could not already read.
//
// Two judgement calls encoded here rather than in the UI:
//
//   * A red flag that HAS a clearance decision is not an outstanding issue. The
//     flag stays on the record, but the doctor already did the thing being asked
//     for, and a queue that keeps nagging after the work is done gets ignored.
//   * A `quiet` family is NOT a clinical issue. It is the coordinator's call to
//     make. Only `at_risk` — a month of silence, or two missed consultations —
//     reaches the doctor, because by then it is affecting care.
import type { RedFlag } from "@/lib/red-flags";

export type IssueKind =
  | "clearance"
  | "adverse_event"
  | "report_overdue"
  | "measure_decline"
  | "family_at_risk"
  | "programme_ending"
  | "unread_messages";

export type IssueSeverity = "danger" | "warning" | "info";

export type Issue = {
  kind: IssueKind;
  severity: IssueSeverity;
  label: string;
  detail?: string;
  /** query string appended to the member page, so each issue opens where it is fixed */
  tab?: string;
};

export type IssueInput = {
  flags: Pick<RedFlag, "severity" | "label">[];
  /** the current clearance decision, or null if the doctor has not made one */
  clearance: string | null;
  adverseEvent: boolean;
  /** hours since a done consultation's report went pending, or null */
  reportOverdueHours: number | null;
  /** labels of measures whose latest reading moved the wrong way */
  decliningMeasures: string[];
  engagement: string;
  daysUntilProgrammeEnds: number | null;
  unreadMessages: number;
};

const SEVERITY_ORDER: Record<IssueSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function computeIssues(input: IssueInput): Issue[] {
  const issues: Issue[] = [];

  const hasFlag = input.flags.length > 0;
  const highFlag = input.flags.some((f) => f.severity === "high");
  if (hasFlag && !input.clearance) {
    issues.push({
      kind: "clearance",
      severity: "danger",
      label: "Clearance decision needed",
      detail: highFlag
        ? input.flags.find((f) => f.severity === "high")?.label
        : input.flags[0]?.label,
      tab: "clearance",
    });
  }

  if (input.adverseEvent) {
    issues.push({
      kind: "adverse_event",
      severity: "danger",
      label: "Adverse event reported",
      detail: "The trainer reported an adverse event in this cycle's feedback.",
      tab: "reports",
    });
  }

  if (input.reportOverdueHours !== null && input.reportOverdueHours >= 72) {
    issues.push({
      kind: "report_overdue",
      severity: "warning",
      label: "Your report is overdue",
      detail: `The consultation was marked done ${Math.floor(input.reportOverdueHours / 24)} days ago.`,
      tab: "form",
    });
  }

  if (input.decliningMeasures.length > 0) {
    issues.push({
      kind: "measure_decline",
      severity: "warning",
      label: `${input.decliningMeasures.length} measure${input.decliningMeasures.length === 1 ? "" : "s"} moving the wrong way`,
      detail: input.decliningMeasures.join(", "),
      tab: "trends",
    });
  }

  if (input.engagement === "at_risk") {
    issues.push({
      kind: "family_at_risk",
      severity: "warning",
      label: "Family out of contact",
      detail: "No activity for weeks, or consultations booked and never held.",
    });
  }

  if (
    input.daysUntilProgrammeEnds !== null &&
    input.daysUntilProgrammeEnds >= 0 &&
    input.daysUntilProgrammeEnds <= 14
  ) {
    issues.push({
      kind: "programme_ending",
      severity: "info",
      label:
        input.daysUntilProgrammeEnds === 0
          ? "Programme ends today"
          : `Programme ends in ${input.daysUntilProgrammeEnds} days`,
      detail: "Worth a word about what the next cycle should focus on.",
    });
  }

  if (input.unreadMessages > 0) {
    issues.push({
      kind: "unread_messages",
      severity: "info",
      label: `${input.unreadMessages} unread message${input.unreadMessages === 1 ? "" : "s"}`,
      tab: "messages",
    });
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** The highest severity present, for a single dot on a list row. */
export function worstSeverity(issues: Issue[]): IssueSeverity | null {
  if (issues.length === 0) return null;
  return issues.reduce<IssueSeverity>(
    (worst, i) => (SEVERITY_ORDER[i.severity] < SEVERITY_ORDER[worst] ? i.severity : worst),
    "info",
  );
}
