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

/** True when the instant falls on today's date in IST. */
export function isTodayIST(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && fmt(d) === fmt(new Date());
}
