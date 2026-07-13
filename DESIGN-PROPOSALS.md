# DESIGN-PROPOSALS.md

Design ideas from the UI/UX overhaul that require schema, RLS, or §6 RPC changes.
**None of these are built** — the overhaul is presentation-only. Each entry says what
the experience should be and exactly what backend change it needs.

## P-1 · Share-with-caregiver toggle (unblocks a §3 matrix branch)
**Experience:** on `admin/members/[id]`, each doctor/performance report row gets a
"Shared with family" switch; the caregiver's reports page then shows those reports
with a "Shared by your care team" note. Toast: "Report shared" / "Sharing turned off".
**Needs:** audited `set_report_sharing(p_report uuid, p_shared boolean)`
security-definer RPC (clinicians have no UPDATE policy on `reports` — by design), and
the admin UI. This is CODE-REVIEW **H-3**; §10 already specifies the control.

## P-2 · Pipeline drag-and-drop
**Experience:** dragging a member card between board columns performs the matching
transition (e.g. Onboarded → Initial Consults when dropping onto that column) with an
undo toast. **Needs:** per-transition RPCs — most transitions are side-effect-heavy
(assignment, activation) and are deliberately dialog-driven; a generic
`set_member_status` would bypass §6 invariants. Built instead: drag *affordances* with
click-through to the member page (per §10 "Select a card to manage").

## P-3 · Member photo / avatar
**Experience:** caregiver uploads a photo of their parent; it heads the care-story
home, member cards, and reports. **Needs:** a `member-photos` storage bucket + RLS
(caregiver own-member write, care-team read), `members.photo_path` column, upload
action. Built instead: warm generated initials-monogram tied to the member.

## P-4 · Elderly-mode preference persisted server-side
**Experience:** "Larger text & simpler view" toggle in the caregiver portal that also
affects the member's own login, remembered across devices. **Needs:** a
`profiles.display_prefs jsonb` column (or similar). Built instead: elderly mode stays
role-driven (`member` login) per §10; any in-session toggle uses `localStorage` only.

## P-5 · Read receipts on shared plans ("Anita viewed the nutrition plan")
**Experience:** clinicians see whether the family opened a plan/report, closing the
loop on communication. **Needs:** surfacing `report_views` (which `log_report_view`
already writes) to clinicians — currently no SELECT policy grants them view rows, so
it needs an RLS policy decision (visibility of caregiver behavior to clinicians is a
privacy call, not a UI call).

## P-6 · True adherence sparklines per cycle
**Experience:** portal shows a per-cycle adherence trend from monthly feedback
scores. **Needs:** caregiver-readable access to feedback-derived numbers. Feedback
`form_responses` are respondent-scoped (clinician + admin + member's caregiver via
`fr_cg`? — only for their own member). Performance *reports* are caregiver-visible
only when shared (P-1). Built instead (C6): adherence/WHO-5 trends on surfaces whose
existing policies already allow the data (admin, clinicians for their types,
psychologist for WHO-5), computed read-only from `form_responses`/`reports` already
readable under current RLS.
