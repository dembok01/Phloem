# PROGRESS.md — PHLOEM Build Progress

Per §0.2: per phase — status, what was built, verification results, assumptions.

## Phases (§15)

- [ ] **Phase 1 — Scaffold & Database.** Next.js app, Tailwind/shadcn, Supabase local, migrations 0001–0003, seed, Supabase clients (browser/server/admin), middleware skeleton, login page, typed DB definitions.
  ✔ Accept: `supabase db reset` clean; login as seeded admin lands on `/admin` placeholder; §16 script passes contact-isolation checks.
- [ ] **Phase 2 — Invites & Admin.** `accept_invite` flow end-to-end, care-team CRUD + invite + suspend, member creation (`create_member_with_invite`) + caregiver invite, invites list with expiry/revoke.
- [ ] **Phase 3 — DynamicForm & Onboarding.** Renderer (all §7.1 field types, showIf, autosave, resume), video gate, onboarding wizard, `submit_onboarding` incl. data-split + red flags, status transitions.
- [ ] **Phase 4 — Reports & PDF.** Content builders (onboarding_summary first), report web view + `log_report_view`, PDF route + Storage + signed URL, branded template.
- [ ] **Phase 5 — Coordinator & Consultations.** Assignments UI, pipeline board, today queue, member checklist with dual statuses, schedule dialog, `mark_meeting_done`, wa.me links, notifications bell.
- [ ] **Phase 6 — Clinician Shell & Clinical Forms.** Role-config shell, scoped data (RPC) tabs, clinical forms via DynamicForm, `submit_clinical_form` → report per type, trainer clearance gate, psych confidentiality end-to-end.
- [ ] **Phase 7 — Cycle Engine.** `activate_program` (start = tomorrow, psych-override), cycles, cron route + §9 jobs (+ dev time-travel), feedback drafts, `submit_feedback` → performance report, `close_cycle_open_next`, pause/resume date-shift, duration change, renewal/inactive, `reactivate_member`.
- [ ] **Phase 8 — Portal & Polish.** Caregiver portal, elderly mode, admin analytics tiles, audit views, empty/loading states, Resend behind `notify()`, README.

## Phase 1 — Scaffold & Database

**Status:** in progress

### Built
_(recorded as work completes)_

### Verification
_(acceptance checks §15 + §16 RLS suite results recorded here)_

### Assumptions
_(ambiguities resolved with the simplest spec-compliant option are logged here)_
