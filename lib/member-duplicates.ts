/**
 * Name normalisation, shared by the duplicate marker in the admin member list and
 * by the typed-name confirmation on the delete danger zone.
 *
 * It must stay identical to the SQL side of 0034 — `lower(regexp_replace(trim(x),
 * '\s+', ' ', 'g'))` — because the client enables the delete button on this
 * comparison and `delete_member` re-checks it with that expression. A drift
 * between the two shows up as a button that arms and then a `name_mismatch`.
 */
export function normalizeMemberName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Ids of every row whose normalised name is shared with another row.
 *
 * The observed duplicates ("Deepak Chandramohan" x3, "Anjana shine" x3) all
 * differ only in case or spacing, which is exactly what a re-typed enrolment
 * produces — so the marker keys on the normalised name rather than the raw one.
 */
export function duplicateNameIds(
  rows: readonly { id: string; full_name: string }[],
): Set<string> {
  const seen = new Map<string, string[]>();
  for (const row of rows) {
    const key = normalizeMemberName(row.full_name);
    seen.set(key, [...(seen.get(key) ?? []), row.id]);
  }

  const duplicates = new Set<string>();
  for (const ids of seen.values()) {
    if (ids.length > 1) for (const id of ids) duplicates.add(id);
  }
  return duplicates;
}
