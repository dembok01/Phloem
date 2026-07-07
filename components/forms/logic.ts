// Pure form logic shared by the renderer and the wizard: showIf visibility and
// required-field validation. No React / no "use client" so it stays testable.
import type { FormField, FormValues, RepeatRow } from "./types";

/** Evaluate a field's `showIf` against the current values. Missing showIf ⇒ visible. */
export function isFieldVisible(field: FormField, values: FormValues): boolean {
  const cond = field.showIf;
  if (!cond) return true;
  return valuesEqual(values[cond.field], cond.equals);
}

// Loose equality tolerant of boolean/string serialization (JSON round-trips).
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "boolean" || typeof b === "boolean") {
    return String(a) === String(b);
  }
  return false;
}

/** True when a value counts as "answered" for required validation. */
export function isAnswered(field: FormField, value: unknown): boolean {
  switch (field.type) {
    case "info":
      return true;
    case "boolean":
      return value === true || value === false;
    case "multiselect":
      return Array.isArray(value) && value.length > 0;
    case "repeat_group":
      return Array.isArray(value) && (value as RepeatRow[]).some((row) => rowHasContent(row));
    case "frequency_grid":
      // Required grid ⇒ every row must have a selection.
      return isFilledGrid(field, value);
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    default:
      return typeof value === "string" ? value.trim() !== "" : value != null;
  }
}

function rowHasContent(row: RepeatRow): boolean {
  return Object.values(row).some((v) => (typeof v === "string" ? v.trim() !== "" : v != null));
}

function isFilledGrid(field: FormField, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const grid = value as Record<string, unknown>;
  return (field.rows ?? []).every((r) => typeof grid[r] === "string" && grid[r] !== "");
}

/**
 * Required fields that are visible (per showIf) but not answered. Used to gate
 * "Next" / "Submit" and to surface inline errors.
 */
export function missingRequiredFields(fields: FormField[], values: FormValues): FormField[] {
  return fields.filter(
    (f) => f.required && isFieldVisible(f, values) && !isAnswered(f, values[f.id]),
  );
}
