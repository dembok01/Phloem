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
  // 0027 threads
  "bad_kind",
  "subject_required",
  "body_required",
  "thread_resolved",
  // 0031 renewals
  "bad_intent",
  "renewal_closed",
  "no_active_package",
  // 0034 member deletion + duplicate guard
  "name_mismatch",
  "duplicate_member",
  // 0036 manual doctor review
  "initial_report_missing",
  // 0045 amend a submitted clinical report
  "no_changes",
  "not_latest_version",
  // 0046 the doctor's initial report starts the program
  "package_elapsed",
  "bad_start",
  // 0048 the coordinator closes a report by hand
  "bad_reason",
  "report_not_pending",
  // 0049 a caregiver can hold more than one member
  "email_not_caregiver",
  "caregiver_suspended",
  // 0054 the coordinator uploads a report sent outside the dashboard
  "doctor_upload_refused",
  "report_not_uploadable",
  "bad_file_type",
  "file_too_large",
  "bad_file_path",
  "file_missing",
  "file_in_use",
  "no_upload",
  // 0055 diet reviews every two weeks
  "bad_review_date",
  // 0035 record correction
  "field_not_allowed",
  "name_required",
  "bad_age",
  // 0037 email change
  "email_mismatch",
  // 0038 caregiver transfer
  "same_caregiver",
  // 0043 replace caregiver invite
  "member_past_invited",
] as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

// Longest first: some codes contain a shorter one (field_not_allowed contains
// not_allowed), and a substring match in registry order would report the shorter.
const CODES_LONGEST_FIRST: readonly RpcErrorCode[] = [...RPC_ERROR_CODES].sort((a, b) => b.length - a.length);

export function rpcErrorCode(
  error: { message: string } | null | undefined
): RpcErrorCode | null {
  if (!error) return null;
  for (const code of CODES_LONGEST_FIRST) if (error.message.includes(code)) return code;
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
    "The doctor's initial report must be submitted before the program can start.",
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
  bad_kind: "That kind of conversation isn't available here.",
  subject_required: "Give the conversation a subject so the team can find it.",
  body_required: "Write a message before sending.",
  thread_resolved: "This conversation is closed. Reopen it to add a message.",
  bad_intent: "Choose whether you'd like to continue or talk it through first.",
  renewal_closed: "This renewal has already been settled — your coordinator can help.",
  no_active_package: "There is no running programme to renew for this member.",
  name_mismatch:
    "The name you typed doesn't match this member. Deletion is cancelled — check you are on the right profile.",
  duplicate_member:
    "A member with this name is already enrolled under this caregiver and hasn't finished onboarding. Open the existing profile instead of enrolling again.",
  initial_report_missing: "The initial doctor consultation report has to be submitted first.",
  package_elapsed: "That start date is so early the whole package would already be over.",
  bad_start: "A program can start tomorrow at the latest.",
  bad_reason: "Choose why the report is being closed.",
  report_not_pending: "That report isn't waiting on anyone — it may already be in or closed.",
  not_latest_version:
    "This report has already been corrected — open the current version and correct that one.",
  email_not_caregiver:
    "That email already belongs to a PHLOEM staff account, so it can't be used for a family. Use the caregiver's own address.",
  caregiver_suspended:
    "That caregiver's account is suspended. Reactivate it before adding another member to it.",
  doctor_upload_refused:
    "Doctor reports can't be uploaded — the doctor files them in the dashboard, because they carry the exercise clearance.",
  report_not_uploadable:
    "That report can't take an upload — it may already have been filed in the dashboard, or closed as not needed.",
  bad_file_type: "Upload a PDF, JPG or PNG file.",
  file_too_large: "That file is over 15 MB. Send a smaller copy.",
  bad_file_path: "The upload went to the wrong place. Please try again.",
  file_missing: "The file didn't finish uploading. Please try again.",
  file_in_use: "That file is already attached to a report. Please choose the file again.",
  no_upload: "There is no uploaded report to remove — it may already have been removed.",
  bad_review_date:
    "Choose the date the review meeting happened — not in the future, and within that cycle.",
  field_not_allowed: "You can't change that field. Ask your coordinator if it needs correcting.",
  name_required: "A name is required.",
  bad_age: "Age must be between 1 and 120.",
  no_changes: "Nothing changed, so there was nothing to save.",
  email_mismatch: "The sign-in address didn't change. Please try again.",
  same_caregiver: "That is already the family member managing this care.",
  member_past_invited:
    "This member is already past sign-up. Inviting a new family member is paused until the invite fix (migration 0041) is approved — move them to an existing family login instead.",
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
