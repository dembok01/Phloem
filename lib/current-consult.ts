/**
 * The consultation the Consult-form tab speaks about when no report is due yet: the
 * one still in progress (report pending, not cancelled) — say this month's review,
 * booked but not yet marked done — else the most recent.
 *
 * Not "the first row". The query is unordered, and Postgres handed back the member's
 * long-finished first consultation, so a doctor waiting on this month's meeting was
 * told "Your report for this consultation is in" (Dr. Riya / Sunitha, 2026-10-01).
 */
export function currentConsult<
  T extends { report_status: string; meeting_status: string; created_at: string },
>(consults: readonly T[]): T | undefined {
  const newestFirst = [...consults].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    newestFirst.find((c) => c.report_status === "pending" && c.meeting_status !== "cancelled") ??
    newestFirst[0]
  );
}
