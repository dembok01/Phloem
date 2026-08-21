/**
 * Pure list mechanics for the admin tables — search, sort, and the human date
 * label the invite list uses.
 *
 * These live apart from the components for the same reason lib/lens-core.ts
 * does: they are the part that can be wrong in a way you cannot see by looking,
 * so they get unit tests rather than a squint at the screen.
 *
 * All filtering runs client-side over rows the page already fetched. Admin lists
 * are in the hundreds — a round trip per keystroke would be slower and buy
 * nothing, and RLS has already decided what is in the array.
 */

/** Case- and accent-insensitive, so "Menon" finds "Menón" and vice versa. */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Every whitespace-separated token in `query` must appear in at least one field.
 * Token-wise rather than substring-wise so "arjun doctor" matches a row whose
 * name holds one word and whose role holds the other — which is how people
 * actually type into a search box.
 */
export function matchesQuery(
  fields: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.filter(Boolean).map((f) => normalize(f as string));
  return tokens.every((t) => hay.some((h) => h.includes(t)));
}

export type SortDir = "asc" | "desc";

/**
 * Nulls always sort last, in BOTH directions — a missing city is not "smaller
 * than Kochi", it is absent, and flipping the arrow should not march every empty
 * row to the top. Numbers compare numerically, everything else by locale.
 */
export function compareValues(a: unknown, b: unknown, dir: SortDir = "asc"): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  const sign = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b), "en", { numeric: true }) * sign;
}

/** Stable sort by one derived key. Does not mutate the input. */
export function sortRows<T>(rows: readonly T[], get: (row: T) => unknown, dir: SortDir): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => compareValues(get(x.row), get(y.row), dir) || x.i - y.i)
    .map((entry) => entry.row);
}

const DAY_MS = 86_400_000;

/**
 * "in 3 days" / "today" / "expired 2 days ago" — an expiry date is only useful
 * as a distance. Compared on IST calendar days, not elapsed milliseconds, so an
 * invite expiring at 23:00 tonight reads "today" rather than "in 0 days".
 */
export function relativeDayLabel(iso: string, now: number = Date.now()): string {
  const dayOf = (t: number) =>
    Math.floor((t + 5.5 * 3600_000) / DAY_MS); // shift to IST, then truncate
  const days = dayOf(new Date(iso).getTime()) - dayOf(now);
  if (Number.isNaN(days)) return "—";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "expired yesterday";
  if (days > 1) return `in ${days} days`;
  return `expired ${Math.abs(days)} days ago`;
}
