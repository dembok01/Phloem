# DESIGN-PROPOSALS.md

Design ideas from the UI/UX overhaul that require schema, RLS, or §6 RPC changes.
The overhaul itself was presentation-only; **P-1 through P-6 were subsequently built**
(2026-07-24, migrations `0010`–`0013`), each with its backend change captured as a
numbered migration and verified (tsc + eslint + unit + targeted RLS/RPC checks + build).
**P-7 remains a proposal** (it edits the onboarding template + red-flag inputs, a
larger, higher-risk change kept separate). Each entry below states the experience and
the backend change; those now built carry a **Status: Built** note.

## P-1 · Share-with-caregiver toggle (unblocks a §3 matrix branch)
**Experience:** on `admin/members/[id]`, each doctor/performance report row gets a
"Shared with family" switch; the caregiver's reports page then shows those reports
with a "Shared by your care team" note. Toast: "Report shared" / "Sharing turned off".
**Needs:** audited `set_report_sharing(p_report uuid, p_shared boolean)`
security-definer RPC (clinicians have no UPDATE policy on `reports` — by design), and
the admin UI. This is CODE-REVIEW **H-3**; §10 already specifies the control.
**Status: Built** (`0010_report_sharing_rpc.sql`). Admin-only RPC restricted to the
three shareable types; toggle in the admin member page (`ReportShareToggle`); caregiver
reports page shows the "Shared by your care team" note. Closes H-3.

## P-2 · Pipeline drag-and-drop
**Experience:** dragging a member card between board columns performs the matching
transition (e.g. Onboarded → Initial Consults when dropping onto that column) with an
undo toast. **Needs:** per-transition RPCs — most transitions are side-effect-heavy
(assignment, activation) and are deliberately dialog-driven; a generic
`set_member_status` would bypass §6 invariants.
**Status: Built** (no migration — reuses `activate_program`). The board
(`components/coordinator/pipeline-board.tsx`) is now real HTML5 drag-and-drop: the one
input-free forward transition (a *ready* member dropped on **Active**) is performed on
drop via `activate_program` (eligibility + role still enforced by the RPC); every other
drop hands off to the member page where the dialog-driven steps live. Cards stay links,
so click + keyboard reach the same destinations. Activation is not cleanly reversible,
so it confirms with a success toast rather than an undo (logged).

## P-3 · Member photo / avatar
**Experience:** caregiver uploads a photo of their parent; it heads the care-story
home, member cards, and reports. **Needs:** a `member-photos` storage bucket + RLS
(caregiver own-member write, care-team read), `members.photo_path` column, upload
action.
**Status: Built** (`0011_member_photos.sql`). Private `member-photos` bucket with
path-scoped storage RLS (caregiver write on `<member_id>/…`; read for admin / caregiver
/ assigned care team / the member's own login); `members.photo_path`; audited
`set_member_photo` RPC. `MemberPhoto` renders a short-lived signed URL and falls back to
the Monogram; caregiver upload on the portal (`MemberPhotoUpload`). Surfaced on the
portal care-story home + admin member header. (Reports **PDF** branding still uses the
Monogram — embedding signed bytes into the PDF pipeline is out of scope here; logged.)

## P-4 · Elderly-mode preference persisted server-side
**Experience:** "Larger text & simpler view" toggle in the caregiver portal that also
affects the member's own login, remembered across devices. **Needs:** a
`profiles.display_prefs jsonb` column (or similar).
**Status: Built** (`0012_display_prefs.sql`). `profiles.display_prefs jsonb`; the app
shell now reads it (elderly logins still default ON), so the mode is a persisted
preference not a hard role rule. Caregiver toggle on the portal
(`ElderlyModeToggle`) writes the linked member login's flag via the audited
`set_member_elderly_mode` RPC, read back through `get_member_elderly_mode`; disabled
with a note until the parent has their own login. `set_display_prefs` covers the
self case.

## P-5 · Read receipts on shared plans ("Anita viewed the nutrition plan")
**Experience:** clinicians see whether the family opened a plan/report, closing the
loop on communication. **Needs:** surfacing the `report.viewed` audit rows
(`log_report_view` already writes them) to clinicians — a privacy decision, not a UI
call.
**Status: Built** (`0013_report_view_receipts.sql`). Privacy decision taken and scoped
narrow: `get_report_view_receipts(p_member)` returns, to admin or the clinician who
**authored** the report (`created_by = auth.uid()`), only **family-side** (caregiver /
member) views and only the latest per report — a receipt, never a browsing history or
a colleague's activity. Surfaced as an "Opened by …" line on the clinician's Reports tab.

## P-6 · True adherence sparklines per cycle
**Experience:** portal shows a per-cycle adherence trend from monthly feedback
scores. **Needs:** caregiver-readable access to feedback-derived numbers.
**Status: Built** (no migration — `fr_cg` already grants the caregiver read of their
own member's feedback `form_responses`). The existing `AdherenceCard` (C6) is now also
rendered on the caregiver portal home; it self-hides until a cycle is scored. WHO-5 is
deliberately **not** shown to caregivers (§3 wellbeing is caregiver-❌); only the
nutrition/training adherence trend appears.

## P-7 · Onboarding content-burden reduction (fast-follow to the guided-flow redesign)
**Context:** the 2026-07-24 onboarding redesign made the wizard a guided,
card-at-a-time flow (presentation-only: `components/forms/onboarding-flow.ts`,
`onboarding/*`, `OnboardingWizard.tsx`, `DynamicForm.tsx`). It deliberately did **not**
touch the questions themselves. The remaining real effort is the *typed* content —
`s2` alone has 2 unbounded repeat-groups + 6 required free-text boxes.
**Experience:** cut typing — required free-text medical fields gain quick "None /
Not sure" answers and chip pickers of common options; the conditions/medications lists
sit behind a simple "Any ongoing conditions? / Any regular medications? (Yes/No)" gate;
condition & medication names get autocomplete.
**Needs (why it's not presentation-only):** edits to `supabase/templates/onboarding.v1.json`
(new gate fields + `showIf`, changed field types / requiredness). These flow into
`lib/red-flags.ts` (rules read `activity_symptoms`, `breathing_stamina`, `joint_pain`,
`cardiac_eval_12mo`, `limiting_factors`), `lib/reports/build/onboarding-summary.ts`, and
the role-scoped read `get_onboarding_scoped` (`0002_rls.sql`). Any change here must
re-run `npm run test:unit` (red-flag parity) and the §16 RLS suite, and re-seed the
template. Keep field **ids** stable so downstream key references don't break.
