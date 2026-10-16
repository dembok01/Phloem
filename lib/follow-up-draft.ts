// A doctor's unfinished follow-up report (0036): a consultation-less `doctor_review`
// draft they started and never submitted. Before 2026-10-16 it could vanish from
// view — the way back in hid once the member's program started, and the panel only
// looked for drafts of the newest form version — so a doctor's note sat unseen.

export type FollowUpDraft = {
  id: string;
  template_id: string;
  answers: unknown;
  created_at: string;
};

/** Whether a draft holds anything the doctor wrote. An untouched draft is `{}`. */
export function hasAnswers(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasAnswers);
  if (typeof value === "object") return Object.values(value).some(hasAnswers);
  return false;
}

/**
 * Which draft the follow-up form opens, from the doctor's drafts newest first: the
 * newest one with writing in it, else the newest. `discard` lists the other EMPTY
 * drafts — add_manual_doctor_review submits the newest draft of the form, so an
 * empty one opened later would otherwise be filed in place of the real one. A draft
 * with writing in it is never on that list.
 */
export function pickFollowUpDraft(drafts: FollowUpDraft[]): {
  open: FollowUpDraft | null;
  discard: string[];
} {
  const open = drafts.find((d) => hasAnswers(d.answers)) ?? drafts[0] ?? null;
  return {
    open,
    discard: drafts.filter((d) => d !== open && !hasAnswers(d.answers)).map((d) => d.id),
  };
}
