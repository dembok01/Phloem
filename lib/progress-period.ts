// The period an admin's on-demand progress report covers (0061). Whole IST calendar
// days, written YYYY-MM-DD. Shared by the picker, the server action and the report
// builder, so all three agree on where a day starts and ends.

export type Period = { from: string; to: string };
export type PeriodPreset = Period & { key: string; label: string; detail: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** Today's date in India. */
export function todayIST(now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function isDay(s: string): boolean {
  if (!ISO_DAY.test(s)) return false;
  const t = new Date(`${s}T00:00:00Z`);
  // 2026-02-30 parses as 2 Mar: a real day survives the round trip.
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s;
}

/** Why a period can't be used, in the admin's words, or null when it's fine. */
export function checkPeriod(p: Period, today: string): string | null {
  if (!isDay(p.from) || !isDay(p.to)) return "Choose both dates.";
  if (p.from > p.to) return "The start date must come before the end date.";
  if (p.to > today) return "The end date can't be after today.";
  return null;
}

/** Does this instant fall inside the period, by the calendar in India? */
export function inPeriod(iso: string, p: Period): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(`${p.from}T00:00:00+05:30`) && t <= Date.parse(`${p.to}T23:59:59.999+05:30`);
}

export function periodLabel(p: Period): string {
  const day = (s: string) => dayFmt.format(new Date(`${s}T00:00:00+05:30`));
  return p.from === p.to ? day(p.from) : `${day(p.from)} – ${day(p.to)}`;
}

/** The one-tap choices: everything since enrolment, then each cycle that has begun
 * (the running one stops at today). */
export function presetPeriods(args: {
  enrolledOn: string;
  cycles: { number: number; start_date: string; end_date: string }[];
  today: string;
}): PeriodPreset[] {
  const preset = (key: string, label: string, from: string, to: string): PeriodPreset => ({
    key,
    label,
    from,
    to,
    detail: periodLabel({ from, to }),
  });
  const out = [preset("all", "Everything so far", args.enrolledOn, args.today)];
  for (const c of [...args.cycles].sort((a, b) => a.number - b.number)) {
    if (c.start_date > args.today) continue;
    out.push(preset(`cycle-${c.number}`, `Cycle ${c.number}`, c.start_date, c.end_date < args.today ? c.end_date : args.today));
  }
  return out;
}
