// Date/time helpers — Asia/Kolkata everywhere (§11). India is a fixed +05:30
// offset (no DST), so datetime-local inputs are pinned to it deterministically
// without depending on the server's timezone.
const IST = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

export function formatDateTimeIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
}

/**
 * Convert an `<input type="datetime-local">` value (`YYYY-MM-DDTHH:MM`, no zone)
 * into an absolute IST timestamptz string. Returns null if the value is malformed.
 */
export function datetimeLocalToIST(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const seconds = m[3] ?? ":00";
  return `${m[1]}T${m[2]}${seconds}${IST_OFFSET}`;
}

/**
 * The IST calendar day an instant falls on, as an integer day number. India is a
 * fixed +05:30 offset (no DST), so shifting then truncating is exact whatever the
 * server timezone is. Subtracting two of these gives whole calendar days apart —
 * which is what "expires in 3 days" and "meeting is today" actually mean, and is
 * not the same as dividing elapsed milliseconds.
 *
 * Takes an explicit instant so callers that need to be deterministic (unit tests,
 * the next-actions engine) can pass their own `now`.
 */
export function istDayNumber(ms: number): number {
  return Math.floor((ms + 5.5 * 3600_000) / 86_400_000);
}

/** True when the instant falls on today's date in IST. */
export function isTodayIST(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && fmt(d) === fmt(new Date());
}

/**
 * Whole IST calendar days between an IST date (`YYYY-MM-DD`) and today (IST),
 * non-negative. India is a fixed +05:30 offset (no DST), so the shift is
 * deterministic regardless of the server timezone. (Was duplicated in the portal
 * page, progress bar, and program card — folded here in T2.1.)
 */
export function istDaysSince(startIso: string): number {
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  const today = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const start = new Date(startIso + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((today - start) / 86400_000));
}

/**
 * "Today" / "in 3 days" / "2 months ago" for a timeline's right-hand rail —
 * the reading a person actually does when scanning a year of care ("was that
 * recent?"), which an absolute date makes them compute. Counted in IST calendar
 * days via istDayNumber, so "Yesterday" means yesterday's date and not
 * "somewhere between 24 and 48 hours ago".
 *
 * Intl.RelativeTimeFormat does the wording, including the "yesterday"/"tomorrow"
 * special cases (numeric: "auto") — no phrase table to maintain.
 */
const RELATIVE = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

export function relativeDayIST(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = istDayNumber(d.getTime()) - istDayNumber(now);
  const abs = Math.abs(days);
  if (abs < 7) return RELATIVE.format(days, "day");
  if (abs < 31) return RELATIVE.format(Math.trunc(days / 7), "week");
  if (abs < 365) return RELATIVE.format(Math.trunc(days / 30), "month");
  return RELATIVE.format(Math.trunc(days / 365), "year");
}
