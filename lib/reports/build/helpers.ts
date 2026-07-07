// Shared helpers for the §8 clinical report builders.
import { textOr } from "@/lib/reports/format";
import type { KvData, TableData } from "@/lib/reports/types";

/** Humanize an answer value for display: booleans → Yes/No, snake_case tokens →
 * "Title case", arrays → comma-joined, blanks → "—". Free-text sentences pass through. */
export function humanize(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    const parts = v.filter((x) => x != null && String(x).trim() !== "").map((x) => humanizeToken(String(x)));
    return parts.length ? parts.join(", ") : "—";
  }
  return humanizeToken(String(v));
}

function humanizeToken(s: string): string {
  const t = s.trim();
  if (t === "") return "—";
  if (/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(t)) {
    const spaced = t.replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return t;
}

/** Build a kv data object from [label, value] pairs (values are humanized). */
export function kv(pairs: Array<[string, unknown]>): KvData {
  const out: KvData = {};
  for (const [k, v] of pairs) out[k] = humanize(v);
  return out;
}

/** Build a table from a repeat_group value and its display columns. */
export function repeatTable(
  value: unknown,
  columns: Array<{ id: string; label: string }>,
): TableData {
  const rows = (Array.isArray(value) ? value : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => columns.map((c) => humanize(r[c.id])))
    .filter((row) => row.some((cell) => cell !== "—"));
  return {
    columns: columns.map((c) => c.label),
    rows: rows.length ? rows : [columns.map(() => "—")],
  };
}

/** Extract a simple goal list from a repeat_group of `{ goal }` rows. */
export function goalList(value: unknown, key = "goal"): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => textOr(r[key], ""))
    .filter((g) => g !== "");
}
