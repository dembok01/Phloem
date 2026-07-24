/**
 * TS mirror of the §6 trainer-clearance gate as fixed in migration 0015:
 * the LAST NON-EMPTY `content.clearance` across doctor reports (newest first)
 * governs. The DB gate in submit_clinical_form is the enforcement boundary;
 * this mirror only drives UI lock/badge state. Keep the two in lockstep
 * (parity-tested in lib/clearance.test.ts, same convention as lib/red-flags.ts).
 */
export const CLEARED = new Set(["cleared", "cleared_with_restrictions"]);

/** `reports` must be doctor_initial/doctor_review rows ordered created_at DESC. */
export function resolveClearance(reports: { content: unknown }[]): string | null {
  for (const r of reports) {
    const c =
      r.content && typeof r.content === "object"
        ? (r.content as Record<string, unknown>)["clearance"]
        : undefined;
    if (typeof c === "string" && c !== "") return c;
  }
  return null;
}
