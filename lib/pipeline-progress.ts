// Where an Active member is in their program, for the Pipeline card: which 30-day
// cycle, which day of it, and when the program ends. Dates are IST calendar dates
// (`YYYY-MM-DD`), compared as whole days — no time zone arithmetic beyond that.

export type ActiveProgress = {
  cycle: number;
  cycles: number;
  day: number;
  days: number;
  /** "4 Jan" — the program's last day */
  ends: string | null;
  /** whole days from today to the last day (0 = ends today); null when unknown */
  daysLeft: number | null;
  paused: boolean;
};

type Cycle = { number: number; start_date: string; end_date: string; status: string };

const dayNo = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export function activeProgress(
  pkg: { status: string; end_date: string | null },
  cycles: Cycle[],
  today: string,
): ActiveProgress | null {
  const current = cycles.find((c) => c.status === "active");
  if (!current) return null;
  const days = dayNo(current.end_date) - dayNo(current.start_date) + 1;
  const day = Math.min(Math.max(dayNo(today) - dayNo(current.start_date) + 1, 1), days);
  const end = pkg.end_date;
  return {
    cycle: current.number,
    cycles: cycles.length,
    day,
    days,
    ends: end
      ? new Date(`${end}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
      : null,
    daysLeft: end ? dayNo(end) - dayNo(today) : null,
    paused: pkg.status === "paused",
  };
}
