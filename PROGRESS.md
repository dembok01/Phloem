# PROGRESS.md — PHLOEM Build Progress

Per §0.2: per phase — status, what was built, verification results, assumptions.

## Phases (§15)

- [x] **Phase 1 — Scaffold & Database.** Next.js app, Tailwind/shadcn, Supabase (hosted via MCP — environment override), migrations 0001–0004, seed, Supabase clients (browser/server/admin), middleware skeleton, login page, typed DB definitions.
  ✔ Accepted 2026-07-07: migrations apply clean to empty hosted project + idempotent seed (override-equivalent of `db reset`); seeded admin login lands on `/admin` placeholder (live-verified); §16 suite 35/35 PASS incl. all contact-isolation checks.
- [ ] **Phase 2 — Invites & Admin.** `accept_invite` flow end-to-end, care-team CRUD + invite + suspend, member creation (`create_member_with_invite`) + caregiver invite, invites list with expiry/revoke.
- [ ] **Phase 3 — DynamicForm & Onboarding.** Renderer (all §7.1 field types, showIf, autosave, resume), video gate, onboarding wizard, `submit_onboarding` incl. data-split + red flags, status transitions.
- [ ] **Phase 4 — Reports & PDF.** Content builders (onboarding_summary first), report web view + `log_report_view`, PDF route + Storage + signed URL, branded template.
- [ ] **Phase 5 — Coordinator & Consultations.** Assignments UI, pipeline board, today queue, member checklist with dual statuses, schedule dialog, `mark_meeting_done`, wa.me links, notifications bell.
- [ ] **Phase 6 — Clinician Shell & Clinical Forms.** Role-config shell, scoped data (RPC) tabs, clinical forms via DynamicForm, `submit_clinical_form` → report per type, trainer clearance gate, psych confidentiality end-to-end.
- [ ] **Phase 7 — Cycle Engine.** `activate_program` (start = tomorrow, psych-override), cycles, cron route + §9 jobs (+ dev time-travel), feedback drafts, `submit_feedback` → performance report, `close_cycle_open_next`, pause/resume date-shift, duration change, renewal/inactive, `reactivate_member`.
- [ ] **Phase 8 — Portal & Polish.** Caregiver portal, elderly mode, admin analytics tiles, audit views, empty/loading states, Resend behind `notify()`, README.

## Phase 1 — Scaffold & Database

**Status:** ✅ complete (2026-07-07) · commits `10c9e0d`, `19874fd`, + final Phase-1 commit

**Environment override (user, 2026-07-07):** hosted Supabase dev project via MCP tools (no Docker/local stack), npm instead of pnpm, seed as idempotent `scripts/seed.ts`, §16 via MCP `execute_sql`. Full text in CLAUDE.md → "Environment Overrides".

### Built
- **Scaffold:** Next.js 15.x (App Router, TypeScript strict, Tailwind, ESLint) + shadcn/ui (button/input/label/card), Zod, `@supabase/ssr`, `server-only`; `.env.local.example` per §2; logo at `public/phloem-logo.png`.
- **Migrations** (repo files first, then applied to hosted project via MCP `apply_migration`):
  - `0001_init.sql` — §4 schema verbatim (9 enums, 13 tables).
  - `0002_rls.sql` — §5.1 helpers, RLS enabled on all 13 tables, §5.2 policies verbatim, §5.3 `get_onboarding_scoped` verbatim, + explicit Data API grants.
  - `0003_rpcs.sql` — all §6 RPCs (17) + internal `_audit`/`_notify*`/`_red_flags`/`_report_stub` helpers; service-only functions revoked from anon/authenticated.
  - `0004_tighten_anon_grants.sql` — advisor-driven: anon revoked from the entire Data API surface (nothing anon-facing uses it).
- **Templates:** all 10 §7 templates as `supabase/templates/{key}.v1.json` (onboarding 5 sections; doctor/nutritionist/trainer initial+review; psych_checkin WHO-5; feedback_nutrition; feedback_training verbatim §7.1) — every `showIf` and option list included.
- **Seed:** `scripts/seed.ts` (`npm run seed`) — idempotent: admin from env, 10 templates upserted on (key,version), dev fixtures (coordinator/doctor/nutritionist/trainer/psychologist/caregiver @phloem.local, pw `test12345!`; member Meera Krishnan `onboarded` with realistic answers + high red flag; unassigned member Rajan Pillai), private `reports` bucket.
- **App:** `lib/supabase/{client,server,admin}.ts` (admin is `server-only`), `lib/supabase/database.types.ts` (generated from live schema), `lib/permissions.ts` (cosmetic §3/§10 mirror), `middleware.ts` (session refresh, suspended lockout, role landing + section guard), login page with Zod-validated server action, placeholder landings (`/admin`, `/coordinator`, `/clinician/clients`, `/portal`).
- **§16 suite:** `supabase/tests/rls.test.sql` (fixtures created in-transaction, rolled back) + `scripts/test-rls.ts` runner (`npm run test:rls`, needs `SUPABASE_DB_URL`; otherwise run file via MCP `execute_sql`).

### Verification (2026-07-07)
- `apply_migration` 0001/0002/0003/0004 → success on empty project; `list_migrations` shows all; `list_tables` shows the 13 tables.
- Seed run **twice** → identical success output (idempotency proven).
- `tsc --noEmit` clean (strict, no `any`); `eslint` clean.
- **Login acceptance (live, dev server + real GoTrue sessions):** 8/8 PASS — unauthenticated `/admin`→`/login`; `/login` renders; admin `/`→`/admin`; `/admin` renders placeholder; admin blocked from `/coordinator`; coordinator `/`→`/coordinator` and blocked from `/admin`; doctor `/`→`/clinician/clients`.
- **§16 RLS suite via MCP `execute_sql`: 35/35 PASS** —
  doctor: member_contacts invisible (ever) · 0 wellbeing reports · 0 psych_checkin responses · assigned member visible (control) · full onboarding answers visible (control) · answers hold no contact_number (§4 split) · unassigned member/reports/consultations invisible;
  nutritionist: member_contacts invisible · raw onboarding form_responses invisible · scoped RPC diet keys only · 0 wellbeing;
  trainer: member_contacts invisible · scoped RPC activity keys only · 0 wellbeing;
  psychologist: member_contacts invisible · sees the wellbeing report · 0 non-wellbeing reports · scoped RPC minimal;
  caregiver: only own member · other member invisible · own contacts visible (control) · onboarding summary visible (control) · 0 wellbeing · doctor report hidden without share_with_caregiver;
  coordinator: 0 reports of any type · 0 onboarding answers · all members visible (control) · contacts visible (control);
  suspended doctor: 0 members/contacts/reports/consultations/others' form_responses.
  Post-run state check: fixtures fully rolled back (0 assignments, 1 report, 0 consultations, doctor active).
- Anon Data API access after 0004: `permission denied` (verified via REST); authenticated flow re-verified 8/8 after the revoke.
- **Security advisors** (MCP `get_advisors`): remaining WARNs reviewed — (a) §6 RPCs executable by `authenticated` is the spec's architecture; every RPC validates the caller via `auth_role()` and fails closed; (b) §5.1 helpers/`get_onboarding_scoped` executable by `authenticated` is required (RLS policies and scoped reads call them) and they fail closed; (c) *Leaked Password Protection disabled* — auth setting, needs a dashboard toggle (recommended; not schema-controllable).

### Assumptions
1. **Override-adjusted acceptance:** `supabase db reset` unavailable on hosted → interpreted as "migrations apply cleanly to an empty project + seed is idempotent (run twice)".
2. **Next.js pinned to 15.x** (spec says "15+" and names `middleware.ts`; Next 16 renames it to `proxy.ts`) — simplest compliant option.
3. **Data API grants:** Supabase no longer auto-exposes new tables (changelog 2026-04-28), so 0002 adds explicit grants; 0004 then revokes the anon share after advisor review (nothing anon-facing uses the Data API; login = GoTrue, invites = service client).
4. **`accept_invite` takes `p_user_id`:** the auth user is created by the GoTrue Admin API (service client) in the same server action — SQL cannot safely create `auth.users` rows on hosted projects. The profile role still comes exclusively from the invite row.
5. **Report content:** §8 places builders in TS (`lib/reports/build/*`, Phase 4). RPCs accept `p_report_content jsonb` and remain the sole atomic write path; until Phase 4 they store a minimal §8-shaped stub. Doctor report content carries a top-level `clearance` key so the §6 trainer gate is queryable.
6. **Red-flag engine** implemented in SQL inside `submit_onboarding` (`_red_flags`) because the DB is the enforcement boundary; `lib/red-flags.ts` (pure + unit-tested, §13) arrives in Phase 3 as the mirrored UI implementation.
7. **Notification dedupe keys** append the recipient id on multi-recipient fan-outs (`onboarded:{member}:{uid}` etc.) — the unique constraint would otherwise silently drop every recipient after the first.
8. **Seed extras for §16:** a coordinator login and a second unassigned member were added (the suite's "coordinator sees 0 reports" / "unassigned member invisible" assertions need them). Assignments, wellbeing report and psych response are created *inside* the rolled-back test transaction, keeping the §14 member cleanly at `onboarded`.
9. **`deactivate_member`** also marks open packages `completed` (otherwise time-based cron jobs would keep running for an inactive member). **`reactivate_member`** creates initial consultation rows for all four care roles when none are pending.
10. **`mark_video_watched`** only advances `invited`/`signed_up` → `onboarding` (idempotent, never regresses a later status).
11. **Template JSON conventions:** options are `{value,label}` objects — onboarding option values are the exact spec display strings (the §13 engine and §5.3 RPC match on them); clinical forms use the spec's lowercase tokens (`cleared`, `low`, `unchanged`, …). `repeat_group` declares `subfields`; `frequency_grid` declares `rows`/`cols`; `info` fields carry `text`; WHO-5 section carries the ×4 footnote and `who5_score` is renderer-computed (Phase 3/6).
12. **`assign_care_team`** flips member status to `assigned` only from `onboarded` ("first time" per §6); re-assignments never regress status.
13. **§16 runner:** `npm run test:rls` needs a direct `SUPABASE_DB_URL`; per override #7 the suite was executed through MCP `execute_sql` (results above).

## Phase 2 — Invites & Admin

**Status:** not started (next up)
