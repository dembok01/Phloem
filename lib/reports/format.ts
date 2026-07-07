// Small, pure formatting helpers for report builders and the renderer.
// Dates use Asia/Kolkata everywhere (§11) via Intl (no extra dependency).

const IST = "Asia/Kolkata";

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Coerce any answer value to a display string; blank/absent → "—". */
export function textOr(value: unknown, fallback = "—"): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim() === "" ? fallback : value.trim();
  if (typeof value === "number") return Number.isNaN(value) ? fallback : String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const parts = value.filter((v) => v != null && String(v).trim() !== "").map((v) => String(v));
    return parts.length ? parts.join(", ") : fallback;
  }
  return fallback;
}

/** Boolean answer → Yes/No, with an optional detail appended when true. */
export function yesNo(value: unknown, detailWhenTrue?: unknown): string {
  const truthy = value === true || value === "true";
  const falsy = value === false || value === "false";
  if (!truthy && !falsy) return "—";
  if (truthy && detailWhenTrue != null && String(detailWhenTrue).trim() !== "") {
    return `Yes — ${String(detailWhenTrue).trim()}`;
  }
  return truthy ? "Yes" : "No";
}
