/**
 * The §6 RPCs signal failures with uniform snake_case exception codes
 * (`raise exception 'not_allowed'` etc.). This registry is the single,
 * typed home for those codes and their user-facing copy. Postgres surfaces
 * the code inside error.message, so parsing is a substring match — but it
 * happens in exactly one place, and lib/rpc-errors.test.ts asserts the list
 * stays in sync with the migrations.
 */
export const RPC_ERROR_CODES = [
  "not_allowed",
  "not_found",
  "invalid_invite",
  "video_not_watched",
  "invalid_response",
  "role_mismatch_or_inactive",
  "not_scheduled",
  "meeting_not_done",
  "awaiting_doctor_clearance",
  "template_missing",
  "no_package_to_start",
  "initial_reports_incomplete",
  "not_active",
  "not_paused",
  "cannot_change_own_status",
  "not_shareable",
  "no_member_login",
  // 0024 cases + 0026 progress summary
  "title_required",
  "bad_severity",
  "bad_status",
  "summary_required",
  "bad_content",
] as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

export function rpcErrorCode(
  error: { message: string } | null | undefined
): RpcErrorCode | null {
  if (!error) return null;
  for (const code of RPC_ERROR_CODES) if (error.message.includes(code)) return code;
  return null;
}

/** Default user copy per code. Callers may override per-context. */
export const RPC_ERROR_COPY: Record<RpcErrorCode, string> = {
  not_allowed: "You don't have permission to do that.",
  not_found: "That record could not be found.",
  invalid_invite: "This invite link is invalid, expired, or already used.",
  video_not_watched: "Please watch the welcome video first.",
  invalid_response: "We couldn't find your saved answers. Please refresh and try again.",
  role_mismatch_or_inactive: "That professional's role doesn't match, or their account is inactive.",
  not_scheduled: "This consultation hasn't been scheduled yet.",
  meeting_not_done: "This meeting hasn't been marked done by the coordinator yet.",
  awaiting_doctor_clearance:
    "The doctor has not cleared this member for exercise yet — the form stays locked until then.",
  template_missing: "The form template is missing. Please contact support.",
  no_package_to_start: "There is no package ready to start for this member.",
  initial_reports_incomplete:
    "Doctor, nutritionist and trainer reports must all be submitted before starting the program.",
  not_active: "The program isn't active.",
  not_paused: "The program isn't paused.",
  cannot_change_own_status: "You can't change your own account status.",
  not_shareable:
    "Only doctor and performance reports can be shared — plans are always visible to the family.",
  no_member_login: "This member doesn't have their own login yet.",
  title_required: "Give the case a title before saving it.",
  bad_severity: "Severity must be low, medium or high.",
  bad_status: "Status must be open, monitoring or resolved.",
  summary_required: "Write a note before saving it.",
  bad_content: "The report content was malformed and could not be saved.",
};

export function rpcErrorMessage(
  error: { message: string } | null | undefined,
  fallback: string,
  overrides?: Partial<Record<RpcErrorCode, string>>
): string {
  const code = rpcErrorCode(error);
  if (!code) return fallback;
  return overrides?.[code] ?? RPC_ERROR_COPY[code];
}
