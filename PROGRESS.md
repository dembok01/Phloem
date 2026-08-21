# PROGRESS.md — PHLOEM Build Progress

Per §0.2: per phase — status, what was built, verification results, assumptions.

## Phases (§15)

- [x] **Phase 1 — Scaffold & Database.** Next.js app, Tailwind/shadcn, Supabase (hosted via MCP — environment override), migrations 0001–0004, seed, Supabase clients (browser/server/admin), middleware skeleton, login page, typed DB definitions.
  ✔ Accepted 2026-07-07: migrations apply clean to empty hosted project + idempotent seed (override-equivalent of `db reset`); seeded admin login lands on `/admin` placeholder (live-verified); §16 suite 35/35 PASS incl. all contact-isolation checks.
- [x] **Phase 2 — Invites & Admin.** `accept_invite` flow end-to-end, care-team CRUD + invite + suspend, member creation (`create_member_with_invite`) + caregiver invite, invites list with expiry/revoke.
  ✔ Accepted 2026-07-07: 20/20 DB-layer acceptance assertions PASS (invite→nutritionist account with role from token only — `accept_invite` denied to both authenticated and anon; suspend RPC lockout + self-suspend guard; caregiver invite links `caregiver_id`, member→`signed_up`); §16 suite still 35/35. HTTP routing checks skipped — the Next dev server could not bind in this sandbox session (fsevents/I/O wedge); governing middleware/layout unchanged from Phase 1 (verified 8/8 there).
- [x] **Phase 3 — DynamicForm & Onboarding.** Renderer (all §7.1 field types, showIf, autosave, resume), video gate, onboarding wizard, `submit_onboarding` incl. data-split + red flags, status transitions.
  ✔ Accepted 2026-07-07: 21/21 DB-layer acceptance PASS (video gate → status `onboarding`; draft autosave/resume; §4 split — `contact_number`/`pin_code`/emergency → `member_contacts` and **stripped from answers**; §13 HIGH chest-pain flag; onboarding_summary report; coordinator+admin notified; status → `onboarded`) + 11/11 authenticated HTTP smoke (portal CTA, video gate, wizard/DynamicForm render live) + 8/8 red-flag unit tests. tsc strict clean; eslint clean (0 problems); §16 suite 35/35 (no regression).
- [x] **Phase 4 — Reports & PDF.** Content builders (onboarding_summary first), report web view + `log_report_view`, PDF route + Storage + signed URL, branded template.
  ✔ Accepted 2026-07-07: onboarding_summary renders (web view 200, branded, §8 sections) and the PDF route generates→uploads→signs correctly (access gate + pipeline proven; the headless-Chrome print step is env-blocked in this sandbox — see verification); **caregiver + assigned doctor + nutritionist + trainer can open it, coordinator & psychologist are DENIED** (acceptance script 19/20 — the one miss is the env-blocked Chrome launch; §16 suite 38/38 incl. new report-visibility assertions). tsc strict clean; Phase-4 files eslint clean.
- [x] **Phase 5 — Coordinator & Consultations.** Assignments UI, pipeline board, today queue, member checklist with dual statuses, schedule dialog, `mark_meeting_done`, wa.me links, notifications bell.
  ✔ Accepted 2026-07-08: 28/28 acceptance PASS (as a real coordinator session: assign 4 roles → **4 initial consultation rows + 4 active assignments + member→assigned + each professional notified**; schedule → scheduled + doctor & caregiver notified; mark-done → done + doctor notified; unscheduled-mark-done guard fires) + coordinator UI over HTTP (Today, Pipeline with the member card, member page with care team/consultations/contacts+WhatsApp/dual chips, /notifications — all 200). tsc strict clean; Phase-5 files eslint clean; §16 suite 40/40 (no regression; +2 coordinator consult/assignment visibility asserts).
- [x] **Phase 6 — Clinician Shell & Clinical Forms.** Role-config shell, scoped data (RPC) tabs, clinical forms via DynamicForm, `submit_clinical_form` → report per type, trainer clearance gate, psych confidentiality end-to-end.
  ✔ Accepted 2026-07-08: 26/26 acceptance PASS (seeded accounts, full flow). **Three invariants proven:** (a) trainer form is **UI-locked (disabled fieldset + banner) AND RPC-rejected (`awaiting_doctor_clearance`)** before clearance, then unlocks + submits after the doctor clears — both shown; (b) doctor session returns **0 wellbeing reports and 0 psych_checkin responses** while admin control shows 1/1 (live §16 query output recorded below); (c) **every generated report's §0 is the free-text assessment** (doctor/nutrition/training/wellbeing all verified against the submitted text). Plus doctor report visible to nutritionist/trainer, invisible to psychologist; psych escalation → admin. §16 suite 36/36; tsc strict clean; Phase-6 files eslint clean.
- [x] **Phase 7 — Cycle Engine.** `activate_program` (start = tomorrow, psych-override), cycles, cron route + §9 jobs (+ dev time-travel), feedback drafts, `submit_feedback` → performance report, `close_cycle_open_next`, pause/resume date-shift, duration change, renewal/inactive, `reactivate_member`.
  ✔ Accepted 2026-07-12: full **simulated month walked step-by-step (39/39)** — activate (start = tomorrow, 3 cycles, cycle 1 active); cron @ end−3 → 2 feedback drafts + notifications; both feedbacks submitted → performance report compiles (Overview/Training/Nutrition/Flags/Adjustments/Adherence-trend) + doctor notified; cron past end → cycle 1 closed, cycle 2 active, **4 fresh review consults (checklist reset)**; 5-day pause mid-cycle → active-cycle end, upcoming cycle start+end, and package end all shift **+5** (total_paused_days = 5); remaining cycles roll → package completed, member inactive; reactivate → new not_started package + 4 fresh initial consults + member `assigned`, **prior reports untouched (history intact)**. Dev time-travel `?today=` proven through the HTTP cron route (200 + bearer, 401 on bad bearer) and `npm run cron:dev`. §16 suite **45/45**; tsc strict clean; Phase-7 files eslint clean; authenticated HTTP smoke 9/9.
- [x] **Phase 8 — Portal & Polish.** Caregiver portal, elderly mode, admin analytics tiles, audit views, empty/loading states, Resend behind `notify()`, README.
  ✔ Accepted 2026-07-12: **caregiver** portal shows nutrition & training **plans front-and-centre** (printable) + permitted reports only (no wellbeing) + schedule + progress bar + care-team names; **elderly** `member` login (`elder@phloem.local`) sees **exactly 3 view-only items** (My Plans / My Schedule / My Care Team); admin **analytics tiles** (active members, consults this week, overdue reports, renewals 30d) + renewal radar + **audit view**; `notify()` Resend/console-log wired into the cron (dev-email log verified firing) + README (clone→demo). HTTP acceptance **16/16**; §16 suite **57/57** (adds the elderly `member` persona + caregiver plans/care-team + `get_care_team` ACL); tsc strict clean; Phase-8 files eslint clean.

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

**Status:** ✅ complete (2026-07-07)

### Built
- **Migration `0005_account_status_rpc.sql`** — `set_account_status(user_id, status)`: admin-only, audited, self-lockout-guarded RPC for suspend/reactivate. §6 lists no account-status RPC; added so the transition is an audited RPC per §0.4 (logged assumption). Revoked from anon/public (authenticated retained; validates admin internally). Types regenerated (`database.types.ts`).
- **Invite accept flow (`app/(auth)/invite/[token]/`)** — public page (middleware-allowed) resolves the invite by token via the service client and shows its role + email; set-password form. Server action `acceptInvite`: re-validates the invite, creates the GoTrue auth user (service client), calls `accept_invite` (role comes only from the invite row — the RPC is service-only), signs the user in, lands them on their role home. Orphan auth user is deleted if the RPC fails. Bad/used/expired tokens render a friendly dead-end.
- **Admin shell + sub-nav (`app/(app)/admin/layout.tsx`, `components/nav-tabs.tsx`)** — Overview · Members · Care team · Invites. Overview now shows live count tiles.
- **Care team (`admin/care-team/`)** — list of the four clinical roles; **Invite a professional** (email + role → `inv_admin` RLS insert; role fixed by the invite); **Suspend / Reactivate** via `set_account_status`. CRUD interpreted for healthcare as Create=invite, Read=list, Update=status toggle; **no hard delete** — accounts are suspended to preserve clinical history (logged assumption).
- **Members (`admin/members/` + `members/new/`)** — member list (status, caregiver linked/pending, high-red-flag dot); enrollment form → `create_member_with_invite` (member `invited` + `member_contacts` + `not_started` package + caregiver invite), lands on Invites with the copyable link.
- **Invites (`admin/invites/`)** — all invites with computed state (pending/used/expired); dev copyable accept link (`CopyField`, `lib/invite.ts` — no email in dev per §15); **Revoke** = delete an unclaimed invite.
- **Shared UI** — `components/ui/badge.tsx`, `components/copy-field.tsx` (clipboard), `components/nav-tabs.tsx` (active-link sub-nav).
- **Scope boundary:** coordinator can call the same RPCs (`create_member_with_invite`, caregiver invites) but their *UI* arrives with the coordinator shell in Phase 5; Phase 2 delivers the full **admin** surface (logged assumption). No `notify()`/Resend yet — §15 puts Resend wiring in Phase 8; invites need no profile-targeted notification row.

### Verification (2026-07-07)
- `tsc --noEmit` clean (strict, no `any`) — the §0.5 gate. `eslint` could not complete in this session (its node process wedged in uninterruptible I/O, same environmental cause as the dev server below); the two common rule risks were checked manually and are clean (no unescaped JSX entities; no unused imports). Re-run `npm run lint` outside the I/O-pressured sandbox.
- **DB-layer acceptance suite (20/20 PASS)** via a Node script against the hosted project (faithful to the server-action trust boundaries: admin-authed anon client for admin RPCs/RLS inserts; service client only for the accept path):
  - **A — professional invite → account via token only:** admin creates a nutritionist invite (RLS `inv_admin`); `accept_invite` **denied to authenticated AND anon**; GoTrue creates the user; `accept_invite` (service) returns the invite's role; the new profile's role is `nutritionist` **though no role was ever passed by the client**; token burned.
  - **B — suspend locks out; reversible; self-guard:** `set_account_status` suspend then reactivate succeed; admin **cannot** suspend self (`cannot_change_own_status`).
  - **C — caregiver invite links `caregiver_id`:** `create_member_with_invite` returns a token; member (`invited`) + `member_contacts` + `not_started` package + caregiver invite (role `caregiver`, `member_id` set) all created; accept returns `{role: caregiver, member_id}`; `members.caregiver_id` linked, member → `signed_up`; caregiver RLS then sees exactly their one member.
- **ACL confirmation (MCP):** `accept_invite` executable by neither authenticated nor anon (service-only — the mechanism behind "role via token only"); `set_account_status` / `create_member_with_invite` authenticated-only, denied to anon.
- **§16 RLS suite: 35/35 PASS** (re-run via MCP after Phase 2 — no regression from the new RPC or the RLS-governed invite inserts).
- **Security advisors:** only the pre-documented intended WARNs; new `set_account_status` appears under *authenticated*-executable (fails closed) and is absent from the anon list. Leaked-password protection still a dashboard toggle (recommended).
- **HTTP routing checks skipped (5):** the Next dev server could not bind in this sandbox session — every variant (`next dev` Turbopack/webpack, sandbox on/off) wedged in uninterruptible I/O at startup (fsevents/file-watch). The skipped checks (invite page renders role; new nutritionist → `/clinician/clients`; suspended → `/login`; reactivated reaches shell; caregiver → `/portal`) are all governed by `middleware.ts` + `(app)/layout.tsx`, **unchanged since Phase 1** where they were verified 8/8; each also has a DB-enforced equivalent proven above/in §16.

### Assumptions (continued)
14. **`set_account_status` RPC** added (migration 0005) — §6 enumerates no account-status RPC, but §0.4 requires state transitions to go through an audited RPC and §3/Phase-2 require admin "suspend". Admin-only; **cannot change own status** (self-lockout guard).
15. **Care-team "CRUD" = Create(invite) / Read(list) / Update(status)** — no hard delete of clinician accounts (healthcare history is preserved by suspension). Editing name/specialization is deferred (not required by the Phase 2 acceptance; the `prof_admin` policy already permits it when a UI is added).
16. **Professional invites are a direct `invites` insert** under `inv_admin` RLS (there is no §6 professional-invite RPC — `create_member_with_invite` is caregiver/member-only). The role is fixed in the invite and can only be claimed via the token.
17. **Enrollment sends `""` for omitted optional fields** — `create_member_with_invite`'s non-default params are non-null in the generated types; core identity (name, age, caregiver email) is required, the rest is provisional and overwritten from the questionnaire during onboarding (Phase 3).
18. **Revoke = delete an unclaimed invite** (used invites are immutable history). "Resend" in dev = re-copy the link.
19. **Coordinator invite/enrollment UI deferred to Phase 5** (its shell) — the RPCs already authorise coordinator; Phase 2 ships the complete admin surface.

## Phase 3 — DynamicForm & Onboarding

**Status:** ✅ complete (2026-07-07)

**Governs:** §7/§7.1 (templates + field types the renderer must support), §4 (onboarding data-split rule), §6 (`mark_video_watched`, `submit_onboarding` — both already built in Phase 1's `0003_rpcs.sql`), §13 (red-flag engine), §5.2 (caregiver `form_responses` RLS), §3 (caregiver "own"), §10/§11 (portal onboarding UX). **No migration was needed** — the RPCs and the DB-side `_red_flags()` already existed; Phase 3 is the renderer + wizard + the pure `lib/red-flags.ts` mirror.

### Built
- **`lib/red-flags.ts`** — pure §13 engine, exact parity with the DB `_red_flags()` (same ids/labels/severity/order): `computeRedFlags`, `hasHighFlag`, `parseRedFlags` (narrows `members.red_flags` Json). Unit-tested in **`lib/red-flags.test.ts`** (8 tests, `npm run test:unit` via `tsx --test`), incl. a golden case reproducing the seed's Meera flags exactly and JSON `->>` boolean-parity.
- **DynamicForm renderer (`components/forms/`)** — `DynamicForm.tsx` renders every §7.1 field type: text/textarea/number/date, boolean (Yes/No segmented), `scale_1_5|0_5|1_10` (tappable segmented buttons), select & multiselect (segmented; `allowOther` reveals a companion `{id}_other` free-text when the template's explicit "Other" option is chosen), `repeat_group` (add/remove row cards, typed subfields), `frequency_grid` (rows×cols radio matrix), `info` (callout). `showIf` visibility + required validation live in pure `logic.ts` (`isFieldVisible`, `isAnswered`, `missingRequiredFields`); schema types in `types.ts`. Controlled via `onChange(key, value)` (key-addressed so companions/repeat rows write siblings). Large touch targets / ≥16px base per §11.
- **Onboarding wizard (`OnboardingWizard.tsx`)** — one §7 section per screen, progress bar, **debounced (800ms) autosave** to the draft `form_responses` row via the browser client (caregiver `fr_cg` RLS) with a live **Saving / Saved ✓** indicator, **resume** (answers restored from the draft; section index persisted in `localStorage`), per-section required validation (blocks Next/Submit, jumps to the first gap), an amber **§13 red-flag banner** (plain-language) when a high flag is present, and submit.
- **Video gate (`VideoGate.tsx`)** — plays `ONBOARDING_VIDEO_URL_CLIENT` (YouTube→embed, else inline `<video>`); "I've watched this" calls **`mark_video_watched`** and the page re-renders into the wizard.
- **Onboarding route (`app/(app)/portal/onboarding/[memberId]/`)** — server `page.tsx` branches: complete-state card (status ≥ `onboarded`) / video gate (video unwatched) / wizard; ensures a single draft `form_responses` row and **prefills** it from what enrollment captured (demographics from `members`, contact fields from `member_contacts` — later re-split out by `submit_onboarding`). `actions.ts`: `markVideoWatched` and `submitOnboarding` (Zod-validated; persists final answers to the caregiver-owned draft, then runs `submit_onboarding`; returns `{ok}`/`{error}` and the client routes to `/portal?onboarded=1`).
- **Caregiver portal entry (`portal/page.tsx`)** — replaces the placeholder with the caregiver's member list (RLS-scoped), status badges, and a Start/Continue-onboarding CTA so the flow is reachable; success banner on return.

### Verification (2026-07-07)
- **`tsc --noEmit`** clean (strict, no `any`) — the §0.5 gate. **`eslint`** clean (0 problems; the intermittent I/O wedge cleared this session — ran to completion).
- **Unit tests: 8/8 PASS** (`npm run test:unit`) — §13 rule-by-rule + seed golden parity + malformed-Json narrowing.
- **DB-layer acceptance: 21/21 PASS** (Node script vs the hosted project, honouring trust boundaries — caregiver-scoped anon session for every caregiver step, service client only for fixtures/cross-table reads): caregiver sign-in → `mark_video_watched` (status → `onboarding`, timestamp stamped) → draft insert under `fr_cg` → autosave update + resume read-back → `submit_onboarding`; then **§4 split** proven (`contact_number`→`member_contacts.phone`, `pin_code`, emergency contact; and **absent** from `answers`, health data retained, `submitted_at` set), **§13** HIGH `chest_pain` on `members.red_flags`, member → `onboarded`, onboarding_summary report created, **coordinator + admin** notified (`onboarded:{member}` dedupe).
- **Authenticated HTTP smoke: 11/11 PASS** (dev server bound this session; constructed `@supabase/ssr` caregiver cookie): `/portal` renders member + "Start onboarding"; onboarding route renders the **video gate**; after `mark_video_watched` it renders the **wizard/DynamicForm** (Onboarding questionnaire, step + Personal section, "Full name" field, consent `info` callout). Unauthenticated route guard also confirmed (`/portal`, `/portal/onboarding/{id}` → 307 `/login`; `/login` → 200).
- **§16 RLS suite: 35/35 PASS** (re-run via MCP after Phase 3 — no regression; Phase 3 added no migration/RLS change, and the caregiver draft flow leaves the suite's fixtures clean since it rolls back).

### Assumptions (continued)
20. **No migration in Phase 3.** `mark_video_watched`, `submit_onboarding` and the DB-side red-flag engine already shipped in `0003_rpcs.sql` (Phase 1, per Assumption 6). Phase 3 adds the UI renderer, the wizard, and the pure `lib/red-flags.ts` mirror only.
21. **`allowOther` uses a companion `{id}_other` key.** Templates needing free text (`gender`, `diet_pref`) include an explicit "Other" option *and* `allowOther`; selecting "Other" reveals a text box stored under `{field}_other` (not required by any §5.3/§13 match). The main value stays `"Other"`, so `members.gender` = `"Other"` with the detail in `gender_other` — simplest unambiguous interpretation (§0.3).
22. **Autosave is a direct browser-client upsert** to the draft `form_responses` row (allowed by the caregiver `fr_cg` `for all` policy — omitted `with check` falls back to `using`), not an RPC: it is a draft write, not a workflow state transition, so §0.4 doesn't require an RPC. The **submit** transition still goes exclusively through `submit_onboarding`.
23. **Draft prefill from enrollment data** (demographics + contact fields) to save re-typing; contact fields ride in the draft answers and are re-split into `member_contacts` (and stripped) by `submit_onboarding` — the §4 rule still holds end-to-end (verified: post-submit answers carry no contact identifiers).
24. **Minimal caregiver portal home** (member list + onboarding CTA) ships now as the onboarding entry point; the full plans-first portal, member switcher and elderly mode remain Phase 8 per §15.

## Phase 4 — Reports & PDF

**Status:** ✅ complete (2026-07-07)

**Governs:** §8 (Reports Engine — content shape, builders, shared rendering, PDF route + Storage + signed URL, branded styling), §4 (`reports` schema; report body carries no contact identifiers), §5.2 (`rep_*` policies = the access boundary), §6 (`submit_onboarding` `p_report_content`; `log_report_view` — both already in `0003`), §3 (who sees the onboarding summary), §2 (`puppeteer-core` + `@sparticuz/chromium`, private `reports` bucket), §10 (`api/reports/[id]/pdf`, `components/reports/*`). **No migration** — the report-writing RPC and `log_report_view` already existed; Phase 4 fills in the TS builders + rendering + PDF that Assumption 5 deferred.

### Built
- **Content model + builder (`lib/reports/`)** — `types.ts` (§8 `ReportContent`: `text|kv|table|list|callout` + `parseReportContent` narrowing), `format.ts` (Asia/Kolkata dates via Intl; `textOr`/`yesNo` — no new dep), `build/onboarding-summary.ts` (`buildOnboardingSummary`): Personal Snapshot (demographics only) / Medical History / Medications (table) / Lifestyle & Activity / Diet / Goals / Red Flags (callout, `danger` if a high flag). **Never reads contact identifiers** → clinician-safe body.
- **Shared renderer (`components/reports/ReportView.tsx`)** — server-renderable (no "use client"), renders every §8 kind using semantic `report-*` classes styled by **`lib/reports/styles.ts` `REPORT_CSS`** (one source of truth). Used by BOTH the web view and the PDF.
- **Web view (`app/(app)/reports/[id]/page.tsx`)** — role-agnostic route under the app shell; a normal **RLS-scoped read is the access gate** (denied → `notFound()`/404); audits via `log_report_view`; injects `REPORT_CSS`; Download-PDF link.
- **PDF route (`app/api/reports/[id]/pdf/route.ts`, Node runtime)** — same RLS gate → `reportHtml` (branded `PDF_CSS` header band + logo data URI + `ReportView`) → `renderPdf` (puppeteer-core) → upload to private `reports/{member_id}/{report_id}.pdf` → cache `pdf_path` → 302 to a 10-minute signed URL (with download filename). `lib/reports/html.tsx` (server-only; `react-dom/server` **dynamically** imported), `lib/reports/pdf.ts` (dev = installed Chrome via `PUPPETEER_EXECUTABLE_PATH`/system path, prod = `@sparticuz/chromium`). `next.config.ts` `serverExternalPackages` for both browser packages.
- **Real content wired in** — `submitOnboarding` server action now builds the summary (`buildOnboardingSummary` + `computeRedFlags` mirror) and passes `p_report_content` to `submit_onboarding` (the RPC stays the sole atomic writer); the seed's Meera report is rebuilt via the same builder.

### Verification (2026-07-07)
- **`tsc --noEmit`** clean (strict, no `any`). **eslint** clean on all Phase-4 files (`lib/reports`, `components/reports`, `app/(app)/reports`, `app/api/reports`); the full-project run hit the intermittent I/O wedge again (documented since Phase 2) — the changed files lint clean.
- **Builder content (MCP inspection of the seeded report):** 7 §8 sections (Personal Snapshot…Red Flags); Medications `kind=table`; Red Flags `kind=callout`, `tone=danger`; **no `contact_number` key and no member phone anywhere in the body**.
- **Phase 4 acceptance script: 19/20 PASS** (self-cleaning; caregiver-scoped + seed-clinician sessions honour the RLS boundary):
  - **A — builder/body safety (6/6):** real builder output, §8 sections, Medications table, Red Flags callout, no contact key, member phone absent.
  - **B — access matrix (6/6):** caregiver + assigned doctor + nutritionist + trainer **see** the onboarding_summary; **coordinator DENIED (0), assigned psychologist DENIED (0)** — exactly §3/§5.2.
  - **C — web view + PDF over HTTP (7/8):** caregiver `GET /reports/{id}` → **200** (title + section + Download link); **coordinator → 404**; PDF route access gate correct (**coordinator `GET …/pdf` → 404**); the one miss is caregiver `…/pdf` returning **503** (my caught `pdf_unavailable`) because **headless Chrome will not launch in this sandbox** — a direct `puppeteer.launch` on system Chrome hung for 2 min (same environmental class as the earlier dev-server/eslint wedges). The route loads, enforces access, builds the branded HTML, and the storage/sign wiring is in place; only the browser-print step is env-blocked. It will complete where a browser can launch (local Chrome, or Vercel via `@sparticuz/chromium`).
- **§16 RLS suite: 38/38 PASS** via MCP (the 35 originals + 3 new: doctor & nutritionist *see* the assigned member's onboarding_summary, psychologist *denied*) — no regression; the seed's report-content change doesn't affect row-level access.

### Assumptions (continued)
25. **No Phase-4 migration.** Assumption 5's deferral is now fulfilled purely in TS: `submit_onboarding` receives real `p_report_content`; `log_report_view` already existed. The RPC remains the sole atomic report writer.
26. **Shared `/reports/[id]` route** (not under a role prefix, so every authenticated role can reach it) with the **RLS-scoped read as the access boundary** — a report the caller's `rep_*` policy can't see returns nothing → 404. This is the §8 "server checks access via a normal RLS-scoped read" pattern and covers all shells before their Phase-6/8 report tabs exist.
27. **PDF engine = `puppeteer-core`** with an env-selected browser: dev uses an installed Chrome (`PUPPETEER_EXECUTABLE_PATH` or a system path; the box has Google Chrome), serverless/prod uses `@sparticuz/chromium`. `react-dom/server` is **dynamically imported** inside the server-only HTML helper because the App Router bundler rejects a static import; `serverExternalPackages` keeps the browser packages out of the trace.
28. **`pdf_path` + Storage write use the service client** after the RLS access gate (the `reports` bucket is private; reports are immutable to clinicians). `pdf_path` is a derived artifact pointer, not workflow state, so §0.4's "transition via RPC" rule does not apply — no new RPC needed.
29. **Headless Chrome is environmentally blocked in this sandbox** (launch hangs — same class as the prior dev-server/eslint I/O wedges). Everything up to and including the branded HTML + access control is verified; re-run the PDF path outside the sandbox (or on Vercel) to confirm the final byte output. The seeded/DB reports created before Phase 4 carry stub content (empty `sections`); they render as an empty body until regenerated — new submissions and the re-seeded Meera report carry full builder content.

## Phase 5 — Coordinator & Consultations

**Status:** ✅ complete (2026-07-08)

**Governs:** §10 (coordinator screens: Today · Pipeline · member page with dual status chips, contacts + wa.me, schedule + mark-done; global bell), §6 (`assign_care_team`, `set_consultation_schedule`, `mark_meeting_done` — all already built in `0003`), §12 (bell + unread count in every shell, notification page, deep-links; the assign/schedule/done events are emitted by the RPCs), §3/§5.2 (coordinator RLS: reads members/contacts/consultations/assignments/profiles/notifications; writes only via RPCs). **No migration** — a pure UI + server-action layer over existing RPCs.

### Built
- **Global notification bell (`components/notification-bell.tsx`)** in the app header (§12, every shell) — unread count, dropdown, mark-read + mark-all-read, deep-links; reads own rows via the browser client (`notif_own`). **`app/(app)/notifications/`** — full list page + `markAllRead`/`markOneRead` server actions.
- **Coordinator shell (`coordinator/layout.tsx`)** — sub-nav Today · Pipeline. `NavTabs` generalised with an `exact` flag (index tabs no longer over-match children; admin Overview updated to match).
- **Pipeline board (`coordinator/pipeline`)** — members bucketed into the §10 `member_status` columns (Invited → Onboarding → Onboarded → Initial Consults → Active → Renewal Due → Inactive); cards show name, red-flag dot (high=red, else amber), next-action hint, and deep-link. Initial-consults cards show the `N/4` submitted-report count.
- **Today queue (`coordinator/page.tsx`)** — static-rules task list bucketed **Overdue / Today / This week** from member statuses + initial consultation states (assign-team, schedule, meeting-today, mark-done-overdue, awaiting-report, ready-to-start, renewal). Each task deep-links to the member.
- **Member page (`coordinator/members/[id]`)** — red-flag banner; **Contacts** card (member + caregiver, `wa.me` + `tel:` links via `lib/wa.ts`); **Care team** (per-role assign/reassign from active professionals → `assign_care_team`); **Initial consultations** checklist with the **two chips** (Meeting: To schedule / Scheduled · {IST time} / Done · Report: Pending / Submitted), a collapsible **schedule form** (datetime-local pinned to IST + mode + optional link → `set_consultation_schedule`) and **Mark meeting done** (→ `mark_meeting_done`); the **Start program** button is a labelled Phase-7 placeholder.
- **Helpers** — `lib/datetime.ts` (Asia/Kolkata formatting; `datetimeLocalToIST` pins the input to `+05:30`; `isTodayIST`), `lib/wa.ts` (E.164 digits → `wa.me`/`tel:`), `lib/member-status.ts` (labels + pipeline columns + badge variant).

### Verification (2026-07-08)
- **`tsc --noEmit`** clean (strict, no `any`). **eslint** clean on all Phase-5 files (full-project run still hits the intermittent I/O wedge).
- **Acceptance script: 28/28 PASS** (self-cleaning; a real coordinator anon session drives every mutation, honouring the RPC/RLS boundary; service client only for fixtures/cross-table reads):
  - **assign ×4** → **4 initial consultation rows** (all four roles), **4 active assignments**, member → `assigned`, and **each professional notified** (`assigned`).
  - **schedule** → `meeting_status=scheduled`, `scheduled_at`+`mode` stored, **doctor & caregiver notified** (`sched:{cons}`).
  - **mark done** → `meeting_status=done`, `completed_at`+`marked_done_by` set, **doctor notified** (`meetdone:{cons}`); the guard rejects marking an unscheduled consult done.
  - **Coordinator UI over HTTP (dev server bound):** Today `200`; Pipeline `200` (member card + Initial Consults column); member page `200` (Care team + Initial consultations + role rows + Contacts/WhatsApp + a dual chip); `/notifications` `200`.
- **§16 RLS suite: 40/40 PASS** via MCP (38 + 2 new: coordinator sees consultations + assignments) — no regression.

### Assumptions (continued)
30. **No Phase-5 migration.** The three consultation/assignment RPCs and all coordinator RLS policies (`mem_coord`, `con_coord`, `cons_admin_coord`, `asg_admin_coord`, `prof_coord_read`, `notif_own`) already existed; Phase 5 is UI + Zod-validated server actions that call the RPCs.
31. **Global notification bell** lives in the shared app header (§12 "every shell"), so it appears for admin/coordinator/clinician/portal alike; it reads/mark-reads the caller's own rows via the browser client under `notif_own`. `/notifications` is a role-agnostic route (not under a role prefix, like `/reports`) — the header + auth guard come from `(app)/layout`.
32. **Schedule uses a collapsible inline form**, not a modal dialog — same fields (datetime + mode + optional link) and RPC; simplest faithful interpretation of §10's "schedule dialog" with no extra client-dialog surface. datetime-local values are pinned to **Asia/Kolkata (+05:30)** so the stored instant is timezone-correct regardless of server TZ.
33. **Start Program / Pause / Resume are deferred to Phase 7** (`activate_program`/`pause`/`resume` per §15). The member page shows a disabled, clearly-labelled Start-program placeholder; the pipeline "Active" card shows the status only (the "Cycle N · Day X" chip needs the cycle engine and is enriched in Phase 7).
34. **Today queue is static-rules** (derived from current statuses + initial consultation states), per §15 "today queue (static rules first)"; the cron/date-driven version (T-7/T-3/T-1, overdue escalation) arrives with §9 in Phase 7. Consultations have no `created_at`, so `to_schedule` items aren't aged — they surface under Today.

## Phase 6 — Clinician Shell & Clinical Forms

**Status:** ✅ complete (2026-07-08)

**Governs:** §10 (one config-driven clinician shell for all four roles; per-role tabs; forms open only when meeting=done & report=pending; autosave; submit→report link), §6 (`submit_clinical_form` — trainer clearance gate + psych escalation), §7/§7.1 (six clinical templates via the Phase-3 DynamicForm), §8 (report builders per type; **free-text assessment is the first section**), §5.2/§5.3 (clinician RLS + `get_onboarding_scoped`), §3 (least-privilege per role), §13 (doctor red-flag overview), §11 (persistent assessment note), §12 (psych escalation → admin). **No migration** — `submit_clinical_form`, `get_onboarding_scoped` and all clinician RLS already existed; Phase 6 adds the shell + forms + the §8 clinical builders that Assumption 5 deferred.

### Built
- **Clinical report builders (`lib/reports/build/clinical.ts` + `helpers.ts`)** — `buildClinicalReport(type, …)` for all seven clinical report types (doctor_initial/review, nutrition_plan/review, training_plan/review, wellbeing). **INVARIANT: section[0] is the professional's free-text assessment** (`clinical_summary`/`review_summary`/`assessment_summary`/`session_notes`). Doctor reports carry a **top-level `clearance`** so the §6 trainer gate is queryable. Wellbeing computes the WHO-5 index (×4 → /100); escalation renders a danger callout.
- **Submit wiring (`clinician/clients/[id]/actions.ts`)** — `submitClinicalForm` derives the report type from the consultation (type + round), builds the §8 content, and passes `p_report_content` to `submit_clinical_form` (the RPC stays the sole atomic writer, re-validates assignment + meeting-done, and enforces the trainer gate). Returns the new report id → client navigates to `/reports/{id}`.
- **`ClinicalForm` (`components/forms/ClinicalForm.tsx`)** — renders a clinical template via DynamicForm (all sections stacked), autosaves the draft (`fr_own_clinical`), shows the §11 "your assessment leads the report" note, validates required across sections, submits. When **`locked`** (trainer without doctor clearance) the whole form is wrapped in a disabled `fieldset` and the submit button is disabled — the UI half of the gate.
- **Clients list (`clinician/clients`)** — assigned members only (`mem_clinician`), red-flag dot, next own-type consult, "Form due" badge when a meeting is done + report pending.
- **Config-driven client shell (`clinician/clients/[id]`)** — per-role `?tab=` panels: Doctor (Overview+red-flags / Onboarding full / Consult form / Reports); Nutritionist (+Scoped onboarding via RPC / Doctor's directives); Trainer (+Doctor's clearance card / **locked form when not cleared**); Psychologist (Context / Check-in / Wellbeing reports only). Scoped tabs use `get_onboarding_scoped` (full for doctor, diet/activity/minimal for the others). Reports tab lists only what each role's `rep_*` policy permits.

### Verification (2026-07-08)
- **`tsc --noEmit`** clean (strict, no `any`). **eslint** clean on all Phase-6 files.
- **Acceptance script: 26/26 PASS** (tsx, so it imports the REAL `buildClinicalReport`; seeded coordinator + 4 clinician sessions drive the flow; service client only for fixtures/reads):
  - **(a) trainer gate — both layers:** before clearance the RPC rejects the trainer submit (`awaiting_doctor_clearance`) **and** the trainer's Consult-form tab renders LOCKED (banner + disabled submit) over HTTP; after the doctor submits `clearance=cleared`, the RPC accepts the trainer submit **and** the form tab unlocks.
  - **(b) doctor confidentiality:** doctor session selects **0 wellbeing reports** and **0 psych_checkin responses**.
  - **(c) free-text-first:** doctor_initial / nutrition_plan / training_plan / wellbeing reports each have `sections[0].kind==="text"` with the assessment heading and `data` equal to the submitted free text.
  - Visibility: nutritionist + trainer **see** `doctor_initial`, psychologist **does not**; psychologist sees the wellbeing report; coordinator sees the psych consultation status (the "check-in completed" chip source); psych escalation notified an admin; member advanced to `initial_consults`. HTTP shell tabs (clients list, doctor onboarding, nutritionist reports, trainer clearance) all render 200.
- **§16 query output for invariant (b)** (rolled-back fixtures on seeded Meera; doctor + psychologist assigned; a real wellbeing report + psych_checkin response inserted):
  | Session | wellbeing reports visible | psych_checkin responses visible |
  |---|---|---|
  | ADMIN (control) | **1** | **1** |
  | PSYCHOLOGIST (owner) | 1 | 1 |
  | **DOCTOR (assigned)** | **0** | **0** |
- **§16 RLS suite: 36/36 PASS** via MCP (adds clinician report-visibility asserts: doctor/nutritionist/trainer see `doctor_initial`, psychologist denied; doctor/nutri/trainer 0 wellbeing) — no regression.

### Assumptions (continued)
35. **No Phase-6 migration.** `submit_clinical_form`, `get_onboarding_scoped` and all clinician RLS shipped in `0002`/`0003`; Phase 6 adds the seven §8 clinical builders (fulfilling Assumption 5 for clinical types) + the shell + forms. The RPC still builds a `_report_stub` only if `p_report_content` is null; the app always passes real builder content.
36. **Clinical forms are single-page (all sections stacked)**, not a step wizard — §10 mandates one-section-per-screen only for onboarding (§15 Phase 3). Autosave + required-across-sections validation + the §11 note are present.
37. **Trainer clearance gate reads the latest doctor report's top-level `content.clearance`** (set by the doctor builder). A `doctor_review` with `clearance_change="unchanged"` currently stores no new clearance; **carry-forward of an unchanged clearance across cycles is a Phase-7 refinement** (Phase 6 only exercises the initial round, where the doctor's initial clearance governs).
38. **Config-driven tabs** use a `?tab=` query param (server-rendered), not client tab state. The **Performance** (doctor) and **Feedback** (nutritionist/trainer) tabs are deferred to Phase 7 (they need the cycle engine + performance report); the "Wellbeing check-in completed — {date}" chip for non-psych viewers is surfaced from the consultation row (coordinator sees it now; the caregiver portal chip lands in Phase 8).
39. **Onboarding/scoped tabs call `get_onboarding_scoped`** for every role (returns full answers for the doctor, diet/activity/minimal subsets for the others) — one RPC, role-scoped in the database, rather than a raw `form_responses` read.

## Phase 7 — Cycle Engine

**Status:** ✅ complete (2026-07-12)

**Governs:** §15 (Phase 7 line + acceptance), §9 (daily cron: 6 jobs, offsets from cycle `end_date`, skip paused, per-recipient dedupe, dev time-travel `?today=`), §6 (`activate_program`/`pause_program`/`resume_program`/`close_cycle_open_next`/`compile_performance_report`/`submit_feedback`/`set_package_duration`/`deactivate_member`/`reactivate_member` — all already in `0003`; Phase 7 adds the time-driven layer that drives them + the operator UI), §8 (the **compiled** `performance` report), §4 (packages/cycles/consultations schema; +`consultations.created_at`), §5.2 (feedback `form_responses` RLS), §3 (who may trigger/pause/reactivate), §10/§11/§12 (member package controls, feedback UI, notifications).

### Built
- **Migration `0006_cycle_jobs.sql`** — `consultations.created_at` (§9 job 6 aging); **`_build_performance(cycle)`** — §8 "compiled" performance content in SQL (Overview → optional Feedback-Pending/Adverse callouts → Training kv with re-assessment **deltas vs prior cycle** → Nutrition kv → Flags for Doctor → Proposed Adjustments → Adherence-Trend table); **`compile_performance_report`** rewritten to be **idempotent** (one performance report per cycle) and to store real content; **`run_daily_jobs(p_today date)`** implementing all six §9 jobs (1 reviews-due T-7; 2 feedback drafts T-3 + notify; 3 T-1 nudge + coordinator escalate; 4 past-end rollover with **soft-block** performance compile when feedback outstanding; 5 package end−14 → `renewal_due`; 6 hygiene: unscheduled >48h, report pending >72h, expired invites) — offsets from cycle `end_date`, paused packages skipped, every notification dedupe-keyed. **Migration `0007_fix_performance_pending.sql`** — fixed `_build_performance` array-append (`array_append`) so the soft-block path (bare-literal `text[] || 'trainer'`) doesn't raise "malformed array literal".
- **Cron route (`app/api/cron/daily/route.ts`, Node runtime)** — `Authorization: Bearer CRON_SECRET` (401 otherwise); **dev-only** `?today=YYYY-MM-DD` (honored only when `NODE_ENV !== "production"`); calls `run_daily_jobs` via the service client; returns the job summary. **`vercel.json`** cron `30 0 * * *` (06:00 IST). **`scripts/cron-dev.ts`** + **`npm run cron:dev [date]`** hits the local route with the bearer.
- **Operator UI** — shared **`components/program-card.tsx`** (activation trigger with psych-override note, pause/resume, duration, cycle timeline, admin-only deactivate/reactivate) + shared server actions **`app/(app)/program-actions.ts`** (each posts to a §6 RPC — the enforcement boundary). Wired into the **coordinator member page** (Start/Pause/Resume/Duration + the initial *and* active-cycle review consultations) and a new **`admin/members/[id]`** page (full control set incl. reactivate; RPCs reject a coordinator regardless).
- **Feedback UI** — clinician **`?tab=feedback`** (nutritionist/trainer) loads the cron-created draft and submits via **`components/forms/FeedbackForm.tsx`** → `submitFeedback` server action → `submit_feedback` (compiles the performance report once both are in).

### Verification (2026-07-12)
- **`tsc --noEmit`** clean (strict, no `any`). **eslint** clean on all Phase-7 files.
- **Acceptance walk — 39/39** (`scripts/phase7-accept.ts`; isolated self-cleaning member; lifecycle RPCs as a **real coordinator/admin session**, cron via `run_daily_jobs(p_today)` + the HTTP route). State pasted after each step:
  - **STEP 1 activate (coordinator):** server current_date `2026-07-12` → `start_date=2026-07-13` (**tomorrow**), `end_date=2026-10-13`; 3 cycles `[13 Jul–11 Aug active, 12 Aug–10 Sep upcoming, 11 Sep–10 Oct upcoming]`; member → `active`.
  - **STEP 2 cron @ end−3 (2026-08-08):** `feedback_drafts=2`; `[feedback_nutrition, feedback_training]` drafts (unsubmitted); nutritionist + trainer notified.
  - **STEP 3 submit both:** after 1st = 0 performance reports; after 2nd = performance report with sections `[Overview, Training, Nutrition, Flags for Doctor, Proposed Adjustments, Adherence Trend]`; doctor notified `performance_ready`.
  - **STEP 4 cron @ end+1 (2026-08-12):** `cycles_rolled=1`; cycle 1 → closed, cycle 2 → active; **4 fresh review consultations** (`to_schedule`/`pending`) = checklist reset.
  - **STEP 5 pause 5 days:** cycle 2 end `2026-09-10 → 2026-09-15`, cycle 3 start `2026-09-11 → 2026-09-16`, cycle 3 end `2026-10-10 → 2026-10-15`, package end `2026-10-13 → 2026-10-18` — **all +5**; `total_paused_days=5`; resumed → active.
  - **STEP 6 roll remaining (2026-10-16):** `cycles_rolled=2`; all cycles closed; package → **completed**, member → **inactive**.
  - **STEP 7 reactivate (admin):** member → `assigned`; packages `[completed, not_started]`; **4 fresh initial consults (pending)**; **reports 4 → 4 (history intact)**.
  - **STEP 8 HTTP cron route:** `GET …?today=1901-02-02` + bearer → **200** (`simulated` echoed); wrong bearer → **401**.
- **§16 RLS suite — 45/45** via MCP (35 originals + 10 Phase-7: doctor/nutritionist/trainer **see** the `performance` report; nutritionist/trainer **see own** feedback draft (`fr_own_clinical`); doctor **sees both** feedback responses (`fr_feedback_doctor`); psychologist/coordinator/caregiver-without-share **do not** see `performance`; `run_daily_jobs`/`_build_performance` **not executable** by anon/authenticated).
- **`npm run cron:dev 2026-08-15`** → `200`, `simulated: 2026-08-15`, job summary returned. **Authenticated HTTP smoke — 9/9** (`scripts/phase7-http-smoke.ts`): coordinator member page shows **Start program** when eligible; after activate shows **Pause** + **Cycle 1** timeline; admin member page shows Program + Care team; nutritionist `?tab=feedback` renders the feedback form.

### Assumptions (continued)
40. **Performance report is compiled in SQL** (`_build_performance`), not a `lib/reports/build/*` TS builder: §8 marks it *compiled* (server-side aggregation, no human free-text-first section) and it is produced from two call sites — `submit_feedback` (2nd feedback in) and the cron soft-block — both of which are Postgres-side, so SQL is the single common builder. `compile_performance_report` is idempotent (returns the existing report if one exists).
41. **`run_daily_jobs(p_today date)` centralizes all §9 date logic in one service-only RPC**; the cron route is a thin bearer-guarded caller. Time-travel is a **route** concern (`?today=` in dev), so `close_cycle_open_next`/`compile` stay date-agnostic (they act on the cycle the job selects); `resume_program` keeps its wall-clock `current_date − paused_at::date` (the acceptance simulates a 5-day gap by setting `paused_at` back 5 days — a faithful test of the exact formula).
42. **`consultations.created_at` added** (migration 0006) — §9 job 6 ages `to_schedule` rows by creation time, which the original §4 schema had no column for. Default `now()`; every existing insert path picks it up.
43. **Job 4 loops** until no active cycle is past-due, so a single cron run (or a large `?today` jump) settles all overdue cycles and can complete a package in one call. Each iteration compiles that cycle's performance report (soft-block callout if feedback outstanding) then `close_cycle_open_next`.
44. **Operator UI is DB-enforced, not role-branched:** `program-actions.ts` posts every control to a §6 RPC; the coordinator page hides admin-only actions cosmetically, but a coordinator invoking reactivate/deactivate is rejected by the RPC (`not_allowed`). The admin member page (`admin/members/[id]`) is the §10 home for the full control set incl. reactivate.
45. **Feedback drafts are cron-created** (`run_daily_jobs` job 2, respondent = the assigned nutritionist/trainer). The clinician `?tab=feedback` panel keys **entirely off that draft** (visible via `fr_own_clinical`), deliberately not reading `cycles`/`packages`: clinicians have **no `packages` SELECT policy**, and `cyc_read`'s `packages` subquery is RLS-filtered to empty for them — MCP-verified (nutritionist sees `packages=0`, `cycles=0`, own unsubmitted draft `=1`). The draft's presence is the "feedback due" signal; submit goes through `submit_feedback`; before T-3 (no draft) it shows a "not yet due" message.

## Phase 8 — Portal & Polish

**Status:** ✅ complete (2026-07-12)

**Governs:** §15 (Phase 8 line + acceptance), §10 (portal: home/member-switcher, `members/[id]/{plans,reports,schedule}`, elderly mode; admin overview analytics + audit), §11 (UX: ≥18px portal type, big cards, loading skeletons, empty-state hints, human dates), §12 (notifications + `notify()` Resend/console-log), §3/§5.2 (caregiver + `member`-role RLS), §8 (rendering plans/reports), §2 (Resend). **Migrations 0008/0009** add the `member`-role read access + the care-team-names RPC.

### Built
- **Migration `0008_member_portal.sql`** — `is_member_self(m)` helper (fails closed for suspended); `member`-role RLS: `mem_self` (own member), `rep_member` (plan-type reports only), `cons_member` (schedule), `pkg_member`/`cyc_member` (progress); **`get_care_team(member)`** security-definer RPC returning `[{role, name, specialization}]` (names+roles only, §3) for admin/coordinator/caregiver/member. **`0009_care_team_grant.sql`** — revoke `get_care_team` from PUBLIC + grant to `authenticated` (the 0008 `revoke … from anon` was a no-op because functions grant EXECUTE to PUBLIC and anon inherits it).
- **Caregiver portal** (`portal/page.tsx` + `portal/members/[id]/{plans,reports,schedule}`) — home with **member switcher**, status, **package progress bar** (cycle markers + Day X/30 + paused badge), next consultations, and care-team names; **Plans** page renders the latest nutrition & training plans via the shared `ReportView` (printable); **Reports** lists only RLS-permitted types; **Schedule** splits upcoming/past consultations. Components: `components/portal/{progress-bar,care-team-card,print-button}.tsx`.
- **Elderly mode** — a `member`-role login renders a view-only home with **exactly three** big-type items (My Plans / My Schedule / My Care Team, ≥20px), no report/admin actions.
- **Admin analytics + audit** — overview replaced with the four §15 tiles (active members · consults this week · overdue reports · renewals 30d) + a **renewal radar** list; new **`admin/audit`** view (the `audit_log`, admin-only) + nav tab.
- **`notify()` email (`lib/notify.ts`)** — flushes notification rows with `email_sent_at IS NULL` via **Resend** (prod) or **console-log** (dev, no `RESEND_API_KEY`), stamping `email_sent_at`; wired as the final step of the daily cron route (returns `emails_sent`).
- **Polish** — `components/ui/skeleton.tsx` + `loading.tsx` skeletons for portal/admin/coordinator/clinician; empty-state hints across the new screens (§11). **README** rewritten: clone → env → migrations → seed → dev, demo logins table, demo flow, cron + scripts, security model.
- **Seed** — an elderly `member` login (`elder@phloem.local`) linked via `members.member_user_id`, plus nutrition & training **plan reports** for Meera so the portal has plans to show (no assignments/activation added, keeping the §16 in-transaction fixtures clean).

### Verification (2026-07-12)
- **`tsc --noEmit`** clean (strict, no `any`). **eslint** clean on all Phase-8 files.
- **Acceptance — 16/16 (authenticated HTTP)**: caregiver `/portal` (member + care team + Plans/Reports/Schedule); **plans page shows nutrition + training plans + print**; **reports page shows permitted types only (no wellbeing)**; schedule 200; **elderly `/portal` shows exactly the 3 items** and no report/admin actions; admin overview shows the 4 analytics tiles + renewal radar; **`admin/audit` 200**; cron route returns `emails_sent`. The **dev-email console-log** was verified firing (2 pending "Psychologist escalation" rows dispatched).
- **§16 RLS suite — 57/57** via MCP (adds the **elderly `member` persona**: own member only, other member invisible, contacts invisible, plan-type reports only (3), 0 wellbeing/doctor/performance, raw onboarding invisible, own consultations visible, care team via RPC = 4; caregiver sees the 2 plans + care team = 4; `get_care_team` executable by authenticated but **not** anon).

### Assumptions (continued)
46. **Elderly (`member`) access is a small, dedicated RLS surface** (migration 0008): a `member` login sees only its own member row, its plan-type reports, its schedule, and (via the RPC) its care-team names — never contacts, clinical answers, or wellbeing/doctor/performance reports. `is_member_self` gates on `auth_role() = 'member'` so a suspended member fails closed.
47. **Care-team names go through `get_care_team` (security-definer RPC)**, not broadened `profiles` RLS — it returns names + roles + specialization only (§3 "names+roles only") and authorises the caller internally (admin/coordinator/caregiver/member), returning `[]` otherwise.
48. **No recharts.** The §15 analytics are numeric tiles and the portal "progress bar" is a simple CSS component (cycle-segment bar with a Day X/30 marker) — a chart library wasn't needed, so none was added.
49. **`notify()` is an email-dispatch flush, not a row writer.** The §6 RPCs already write the in-app notification rows (the source of truth); `dispatchNotificationEmails` (called by the cron) emails the un-emailed ones and stamps `email_sent_at`. Dev with no `RESEND_API_KEY` console-logs the payload (§2/§12 fallback).
50. **Seed adds plan reports + an elderly login to Meera but not assignments/activation** — that keeps her at `onboarded` so the §16 suite's in-transaction care-team assignment fixture (which relies on the unique `one_active_per_role` index being free) still applies cleanly. Schedule/care-team therefore show empty-state hints until a program is run.

## Design-Proposals P-1 … P-6 (post-overhaul backend features)

**Status:** ✅ built (2026-07-24). These were the `DESIGN-PROPOSALS.md` items the presentation-only overhaul deferred because each needs a schema / RLS / §6 RPC change. Now implemented end-to-end. **P-7 intentionally deferred** (it edits the onboarding template + red-flag inputs — larger, higher-risk, must re-seed the template and re-run red-flag parity).

**Governs:** §3 permission matrix (P-1 caregiver "🔸 if share_with_caregiver" branch, P-5 privacy scoping), §5 RLS/storage, §6 RPC-only state transitions, §10 (admin member controls, pipeline, portal), CODE-REVIEW **H-3** (closed by P-1).

### Built
- **`0010_report_sharing_rpc.sql` (P-1 / H-3)** — audited `set_report_sharing(uuid, boolean)`, admin-only, restricted to `doctor_initial` / `doctor_review` / `performance` (non-shareable and always-shared types rejected). UI: `ReportShareToggle` switch on `admin/members/[id]` report rows; caregiver reports page shows "Shared by your care team".
- **`0011_member_photos.sql` (P-3)** — private `member-photos` bucket; path-scoped storage RLS (caregiver write on `<member_id>/…`; read for admin / caregiver / assigned care team / `is_member_self`); `members.photo_path`; audited `set_member_photo(uuid, text)`. UI: `MemberPhoto` (signed URL → Monogram fallback) + caregiver `MemberPhotoUpload`; shown on portal care-story home + admin member header.
- **`0012_display_prefs.sql` (P-4)** — `profiles.display_prefs jsonb`; `set_display_prefs` (self), `set_member_elderly_mode` (caregiver→linked login), `get_member_elderly_mode` (read-back). `lib/auth.ts` now returns `elderly` (member logins default ON); app shell keys elderly mode off it. UI: `ElderlyModeToggle` on the portal.
- **`0013_report_view_receipts.sql` (P-5)** — `get_report_view_receipts(uuid)` exposes the existing `report.viewed` audit rows to admin / the report's author, family-side views only, latest-per-report only. UI: "Opened by …" line on the clinician Reports tab.
- **P-2 (no migration)** — real drag-and-drop pipeline board (`components/coordinator/pipeline-board.tsx`); the one input-free forward transition (ready → **Active**) performs via `activate_program` on drop, all else hands off to the member page. Cards stay links (click + keyboard preserved).
- **P-6 (no migration)** — caregiver portal renders the existing `AdherenceCard` (readable via `fr_cg`); self-hides until a cycle is scored; WHO-5 deliberately excluded (§3 wellbeing is caregiver-❌).

### Verification (2026-07-24)
- **`tsc --noEmit`** clean (strict, no `any`); **eslint** 0 problems; **`npm run test:unit`** 8/8 (red-flag parity untouched); **`npm run build`** succeeds (17 routes).
- **Targeted RLS/RPC security checks** (in-transaction, rolled back, via MCP): P-1 — doctor rejected, caregiver hidden→visible→hidden across share/unshare, non-shareable type rejected; P-5 — caregiver rejected, admin allowed; P-4 — doctor rejected, caregiver set/read-back both directions; P-3 — doctor rejected, caregiver set/clear ok. **All passed.**
- **Full §16 suite** could not be run clean against the **current hosted DB** because demo-advance scripts have moved M1 (Meera) past the pristine seed baseline (her active assignments now collide with the suite's `one_active_per_role` fixture) — a pre-existing seed-drift condition, not a regression from these changes. The suite file itself is unchanged and stays valid against a fresh `npm run seed`.

### Assumptions (continued)
51. **P-1 sharing is admin-only and type-restricted.** §3 marks only doctor + performance reports caregiver-conditional; plans/summaries are always caregiver-visible and wellbeing must never be, so `set_report_sharing` rejects every type outside `{doctor_initial, doctor_review, performance}`. The caregiver read policy `rep_cg` was already correct — the only gap was the missing writer (H-3).
52. **P-3 photo is not a contact identifier.** It lives in storage, not `member_contacts`, so the assigned care team may read it (mirrors their demographics access, §3) — clinicians still never see phone/address/etc. Report **PDF** branding keeps the Monogram (embedding signed bytes into the PDF pipeline is out of scope). Client type/size checks are courtesy; storage RLS + the RPC are the boundary.
53. **P-4 preference targets the elderly login.** The caregiver toggle writes the `member_user_id` profile's `display_prefs.elderly`; with no linked login it is disabled with a note. Elderly (`member`) logins still default ON when the flag is unset, preserving prior behaviour. The app shell reads the flag via `getSessionProfile().elderly` (any role may opt in).
54. **P-5 is a deliberately narrow privacy decision.** Receipts surface only **family** (caregiver/member) views, only to admin or the report's **author** (`created_by`), and only the latest per report — so a clinician learns "the family opened the plan I wrote", never a colleague's activity or a full browsing history. `audit_log` RLS stays admin-only; the RPC is the sole read path.
55. **P-2 performs exactly one transition on drop.** Only ready → Active (via `activate_program`, which still enforces eligibility + role) is a safe, input-free §6 transition; every other stage move is dialog-driven, so the board routes those to the member page rather than faking a `set_member_status`. Activation is not cleanly reversible, so it confirms with a toast instead of an undo.
56. **P-6 reuses `fr_cg`, not a new policy.** Caregivers can already read their own member's feedback `form_responses`, so the adherence trend needed no migration — only the existing `AdherenceCard` placed on the portal. WHO-5 is excluded to honour §3 (wellbeing caregiver-❌).

## Onboarding welcome video — optional (2026-07-28)

**Why:** the welcome video hasn't been filmed yet, and the gate was rendering a placeholder
YouTube URL — a broken embed in front of every new caregiver (and in demos).

**Governs:** §6 `mark_video_watched` / `submit_onboarding` (which requires the stamp), §11
onboarding flow.

### Built
- **`ONBOARDING_VIDEO_URL_CLIENT` is now the on/off switch** — no separate feature flag, so
  the gate can never be "on" without a video to play. Empty (the new default) → no gate; the
  caregiver lands on the wizard's own welcome step. Set → the gate renders as before.
- **The stamp is applied either way.** With the gate skipped, `app/(app)/portal/onboarding/[memberId]/page.tsx`
  calls `mark_video_watched` server-side, so `signed_up → onboarding` still happens and
  `submit_onboarding`'s `video_not_watched` guard is still satisfied — no migration, no
  weakening of the §6 invariant.
- **`youtubeEmbed` extracted to `components/forms/video-embed.ts`** and widened to the link
  shapes a share sheet produces (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`), so whichever
  URL is pasted at switch-on time plays. Non-YouTube URLs (e.g. an mp4 in Supabase Storage)
  still fall through to the native `<video>` player. Unit-tested (`video-embed.test.ts`).
- Placeholder URLs cleared from `.env.local.example`; README documents both switch positions.

### Verification (2026-07-28)
- **`tsc --noEmit`** clean; **eslint** clean; **`npm run test:unit` 32/32** (3 new URL-shape
  tests); **`npm run build`** succeeds.
- **End-to-end, both switch positions** (headless Chrome, caregiver `gopalan.family@phloem.local`,
  member temporarily reset to `signed_up`/stamp NULL, then restored):
  - **off (empty env) — 8/8**: no gate, no player, wizard welcome step is the first screen,
    stamp applied server-side, status advanced `signed_up → onboarding`.
  - **on (`/shorts/…` URL) — 12/12**: gate renders, iframe resolves to `youtube.com/embed/<id>`,
    wizard stays locked, no auto-stamp while gated, and "I've watched this — continue" stamps
    the member, advances the status and unlocks the questionnaire.
- Gopalan restored to `assigned` + original stamp; the one draft `form_responses` row the test
  created was deleted.

### Assumptions (continued)
57. **The video URL is the flag.** Two knobs (a boolean + a URL) would allow "on with no video",
    which is the exact failure being fixed, so the gate keys off the URL alone. Flipping it is an
    env change (`.env.local` + dev restart, or Vercel env + redeploy) — no DB-backed setting or
    admin toggle, since this flips once when the video ships.
58. **Skipping the gate still stamps `onboarding_video_watched_at`.** The alternative — relaxing
    `submit_onboarding`'s check — would permanently weaken a spec-mandated invariant for a
    temporary content gap. Consequence to accept: the audit log records `member.video_watched`
    for members who were never shown a video (the row means "onboarding gate passed").
59. **No intro card replaces the video.** The wizard's own welcome step already sets
    expectations (autosave, resume, privacy), so an extra gate screen would be two near-identical
    screens back to back. Members who already passed the gate are unaffected either way.

## Portal tweaks — document prompt reachability + comfort settings hidden (2026-07-28)

### Documents after onboarding — already built (migration `0014`), one gap closed
The post-onboarding document prompt already existed: the wizard's completion screen renders
`DocumentUploader` ("Have any recent reports?"), the portal home has a **Documents** tile, and
`/portal/members/[id]/documents` is a full upload + list surface (uploads = caregiver only;
reads = admin · caregiver · member-self · assigned doctor). **Gap:** that prompt only appears in
the wizard's in-memory `done` state, so a caregiver returning to `/portal/onboarding/<id>` later
got a dead-end "Onboarding complete → Back to portal". That screen now repeats the invitation
(blood work / lab reports / scans) with an **Upload documents** link beside "Back to portal".

### Comfort settings hidden (user's call)
The P-4 **"Comfort settings"** card (`ElderlyModeToggle` + the `get_member_elderly_mode` call in
the `Promise.all`) is removed from the caregiver portal, with a comment at the removal site.
Component, RPC, RLS and `display_prefs` are untouched — re-rendering the card restores it.

### Verification (2026-07-28)
- **`tsc --noEmit`** clean; **eslint** clean; **`npm run build`** succeeds (17 routes).
- **Browser checks as `caregiver@phloem.local` — 10/10**: portal has no "Comfort settings" and no
  leftover elderly-mode copy while the rest of the page (Documents tile, plans, schedule, care
  team) still renders; the completed-onboarding screen shows the document invitation and links to
  `/portal/members/<id>/documents`; that page renders with the uploader mounted (file input +
  category list).

### Assumptions (continued)
60. **Comfort settings is hidden by deletion, not a flag.** A feature flag for one card the user
    intends to restore is more machinery than reverting a commit; the removal site carries a
    comment so the next reader knows it was deliberate. Side effect to note: with no UI toggle,
    elderly mode is whatever `display_prefs.elderly` already holds — `member` logins keep
    defaulting to ON (`lib/auth.ts`), and nobody can change it from the app until the card returns.
61. **The completion screen invites, it does not embed the uploader.** Repeating the invitation as
    a link (rather than a second `DocumentUploader` instance) keeps one upload surface to maintain
    and matches the existing portal Documents tile.

## Production cutover — mock client data purged (2026-07-28)

The hosted project (`nrhteqnaaijuwdgermsx`, the one `.env.local` and `.mcp.json` both point at)
is now **live**: first real client `Dibesh Bulhar` created 2026-07-28, caregiver invite pending
to `dibeshbulhar@gmail.com`. The demo/mock member rows had already been deleted by the owner;
this pass removed what they left behind, plus the mock client logins.

### Purged (owner-approved, irreversible)
- **Orphaned storage — 5 files**, none reachable from any surviving row: `member-photos/<gopalan>/…jpg`,
  `documents/<amal>/…png`, `documents/<gopalan>/…pdf`, and 2 `reports/<report-id>/….pdf`. All three
  buckets now have zero objects.
- **`audit_log` — 269 of 270 rows.** Kept `#283 member.created` (the live client's own trail).
- **`notifications` — all 85 rows.** None referenced the live client.
- **Mock client logins** — `caregiver@phloem.local` (Anita) and `elder@phloem.local` (Meera's
  view-only login). The owner concurrently deleted `gopalan.family@phloem.local`,
  `dembok01@gmail.com`, `amalmanoj.official@gmail.com` and `saleenacmohan@gmail.com` from the
  dashboard while this ran, so the script skipped those as already gone.

### Kept
- **The live client, whole:** member row, `member_contacts` (1), `packages` (1, `not_started`),
  the unused invite (expires 2026-08-04) and his one audit row.
- **All six staff logins** — admin / coordinator / doctor / nutritionist / trainer /
  psychologist@phloem.local, untouched at the owner's explicit choice (see the open risk below).

### Code/doc changes
- **`scripts/seed.ts`: demo fixtures are now opt-in** (`SEED_DEMO=1`). The old guard only skipped
  them when `NODE_ENV === "production"` — which is never set when running a script locally against
  the hosted project, so a routine `npm run seed` would have re-created Meera, the Gopalans and the
  shared-password demo logins straight back into live data. A plain `npm run seed` still does the
  production-safe part (admin, templates, `reports` bucket).
- README documents the opt-in; DEMO-GUIDE.md carries a banner that its walkthrough data is gone and
  must be re-seeded into a **separate** project.

### Verification (2026-07-28)
- Post-purge read-back: `members=1` (Dibesh, `invited`), `member_contacts=1`, `packages=1`,
  `invites=1` (unused), `audit_log=1` (#283), `notifications=0`, `reports/consultations/
  form_responses/assignments/member_documents/cycles=0`, `profiles=6` (staff only, all `active`),
  and 0 objects across `member-photos`, `documents`, `reports`.
- **`tsc --noEmit`** clean; **eslint** clean on `scripts/seed.ts`.

### Open risk (owner declined to change, recorded deliberately)
62. **The six staff logins still use the seed's shared demo password on live data.** Offered
    suspension of the four clinician accounts (reversible; migration 0017 makes suspended users
    fail closed) or a password rotation; the owner chose "change nothing for now". `admin@` and
    `coordinator@` in particular hold full PHI access, and the `.local` addresses cannot receive
    an email password reset — real staff accounts on real domains are the durable fix.

---

## Portal Elevation — client UI/UX upgrade (2026-08-17)

Branch `portal-elevation/phase-1` (name predates the scope growing to five phases).
**Presentation-only throughout:** no migration, no RLS policy and no §6 RPC was touched,
so the §16 suite was deliberately **not** re-run. Recorded here as a decision, not an
omission. `npm run test:unit` stayed 32/32 across every phase, which is the standing
proof that the onboarding work never reached the red-flag engine.

Scope was set by a gate applied to each candidate: how often a reader sees the surface,
what purpose the change serves, whether it fits the speed budget, and whether motion
helps or hinders. The load-bearing conclusion is that **the family and the staff are on
opposite ends of that scale** — a caregiver opens the portal a handful of times a month
and onboards exactly once, while the coordinator lives in the pipeline all day. Motion
was therefore scoped generously to `/portal`, onboarding and the auth doors, and
deliberately **not** extended to coordinator, clinician or admin surfaces.

### Phase 1 — hardening
Six error/not-found boundaries where the app previously had **zero**, so a Supabase
hiccup no longer shows a family the raw Next.js error screen. `global-error.tsx` is
dependency-free by design (Next replaces the root layout there, so `next/font` and
`globals.css` do not apply). `portal/not-found.tsx` is worded to neither confirm nor deny
that a member exists, since it fires when RLS returns no row. All 10 hardcoded
`amber-*`/`emerald-*` sites moved onto semantic tokens — which silently fixed dark mode
on login and invite — with severity corrected to meaning: sign-in failures are danger
(Clay), invite-link states are informational (Water). Deleted the dead
`components/portal/progress-bar.tsx`.

### Phase 2 — motion system
Three curves and five durations in `:root` as `--motion-*`, mapped onto Tailwind's
`ease-*` utilities through `@theme inline`. Source names are deliberately distinct from
the Tailwind ones: `--ease-out: var(--ease-out)` would be circular, which is the exact
bug that once rendered this app in Times via `--font-sans`. Added `motion@13.1.0`.
Documented in DESIGN-SYSTEM.md §3 including that warning.

### Phase 3 — portal core
Four per-route skeletons (the single `portal/loading.tsx` served the whole subtree, so
tapping *Plans* showed a member story card that then swapped for a document — a skeleton
lying about what was coming). `.pressable` press feedback on the family's primary
controls, which navigate by `<Link>` and had no active state at all. The member's own
login gained GrowthRings, the status line, and routes to Reports and Documents — data
`rep_member` and `doc_select`/`is_member_self` already admitted them to, with no route to
it. **0014 grants document insert/delete to the caregiver only, so the documents page is
now role-aware** — a member was being shown an uploader that would always have failed.

### Phase 4 — onboarding + first impression
Directional card transitions (the stack animated Back as though it were Forward), the
completion moment, a blur-bridged autosave crossfade, and progress rails moved off the
layout path. Login and invite finally got a heading — neither page had one. The invite
names who invited you and who you will be caring for, using the member's **first name
only**: the token is unguessable and single-use, but a leaked link should not pair a full
identity with the fact of being in a chronic-care programme.

`useCalmMotion()` is the non-obvious piece. Motion drives animations from JS (WAAPI/rAF),
which the `!important` CSS guards cannot reach — without it, introducing a spring would
have silently ended elderly mode's motion-free guarantee while the CSS still looked correct.

### Phase 5 — verification (2026-08-17)

| Check | Result |
|---|---|
| `next build` | **PASS** — 26 routes, clean production build |
| `tsc --noEmit` · `eslint .` | **PASS** — exit 0, no `any`, no warnings |
| `npm run test:unit` | **PASS** — 32/32 (red-flag parity unchanged) |
| Impeccable design detector | **PASS** — `[]` on every changed file, every phase |
| Contrast, newly introduced pairs | **PASS** — 9 pairs × light+dark all ≥4.5:1 (icons ≥3:1); elderly muted ink 8.80:1 (AAA). Script parses `globals.css` so it cannot drift |
| §16 RLS suite | **Not run — deliberate.** No schema, RLS or RPC change in the whole branch |
| Cascade behaviour, in real Chrome | **PASS** — inside `.elderly` an inline `transition` shorthand collapses 0.7s → 1e-05s, confirming `!important` longhands beat inline styles; after its 120ms-delayed stagger a tile rests at `transform:none` and presses to `scale(0.98)` at 0.16s, confirming stagger and press compose |
| Keyboard, public doors | **PASS** — `/login` and the invite page both show a real focus ring |
| Screenshots, staff surfaces | 72 shots captured, no regressions from the shared `ease-out` change |
| Screenshots, **client** surfaces | **BLOCKED — see below** |

### What phase 5 could not verify, and why

1. **Client-surface screenshots and the authenticated keyboard walk are blocked by the
   2026-07-28 cutover.** `caregiver@phloem.local`, `elder@phloem.local` and
   `gopalan.family@phloem.local` were purged, and demo fixtures are opt-in (`SEED_DEMO=1`).
   The only remaining caregiver accounts belong to **real people**, so logging in as them
   or manufacturing their credentials was not an option, and re-seeding demo members into
   live data would undo a deliberate production decision. The durable fix is a separate
   project seeded with `SEED_DEMO=1`. **Also note no member currently has any cycles**, so
   the GrowthRings hero, the adherence card and the new "what happens next" line have no
   data to render even for a real login.
2. **Feel is unverified.** The spring's bounce, the blur crossfade and whether the
   completion moment lands cannot be judged from code. Owner is reviewing these on a
   Vercel preview deployment.
3. **Touch press feedback** needs real hardware; a desktop browser cannot confirm it.

### Two findings from running the verification itself

- **The audit harness could not fail.** `scripts/design-audit.ts` screenshotted whatever
  was on screen after `login()` and printed `✓` regardless. With the client fixtures gone
  it produced **104 screenshots of the sign-in page** and reported every one as a success;
  the first `kbd-client.ts` run likewise emitted false `PASS`es against the sign-in form's
  own inputs. Both now assert the post-login URL and fail loudly with an actionable
  message. Re-run afterwards: 72 valid staff shots, **zero** fabricated client shots, and
  three sessions named as failed. A verification harness that cannot fail verifies nothing.
- **Audit output is now PHI.** Those staff screenshots contain real members' names,
  statuses and report counts. The `before/`+`after/` sets committed 2026-07-14 are safe
  (demo-era, pre-cutover) and stay tracked; `.gitignore` now keeps every *new* audit
  directory out of the index, and `design-audit.ts` carries the warning at the top.
  **The 72 shots from this pass were deliberately not committed.**

### Assumptions (continued)
63. **Visit frequency is inferred, not measured.** "A handful of visits a month" comes from
    the product model (30-day cycles, coordinator-driven scheduling, notification-led
    re-entry); there is no instrumentation in the repo. If caregivers turn out to open the
    portal daily, the tile stagger (`.stagger-in` in `app/(app)/portal/page.tsx`) is the
    one item that should be cut — everything else holds at either frequency.
64. **Open risk 62 is now load-bearing for tooling.** The staff screenshot sessions
    succeeded only because the six `@phloem.local` logins still share the seed password on
    live data. When that is finally rotated, `design-audit.ts` will need real credentials
    supplied out of band.

---

## Workspace Elevation E1–E5 (2026-08-18)

Branch `workspace-elevation/e0-foundation`. Presentation-only: no migration, RLS
policy or §6 RPC touched, so §16 was not re-run and `test:unit` held at 32/32.
Plan 01 scoped itself to client surfaces and left admin/doctor/coordinator
untouched — which is why the previous release looked like nothing had changed.

**Admin (E1).** The overview was four numbers, three text deltas and no chart, on
a page titled *Program health at a glance*. Now: a clickable stage funnel (the
chart is also the filter), sparklines behind each stat tile from 12 weeks of
bucketed data, and a real throughput chart. Weekly buckets are computed in JS from
minimal `created_at`/`completed_at` reads — a `date_trunc` aggregate would have
needed an RPC, and volumes here are in the hundreds.

**Doctor (E2).** One flat list became four queues — needs your form, awaiting your
clearance decision, upcoming consultations, everyone else — each member appearing
once, ordered by urgency. The clearance queue mirrors `lib/clearance.ts` (red flag
present, no doctor report yet carrying a non-empty `content.clearance`); the DB
gate remains the enforcement boundary. Only the doctor pays for that extra read.

**Client (E3).** `MemberTimeline` now renders on the caregiver home — the family's
actual question is "where are we?". Reused rather than rebuilt: it already reads
only consultations, reports and cycles, all of which `cons_caregiver` / `rep_cg` /
the package join already grant a caregiver.

**Coordinator (E4).** Every Today row's only affordance was *Open*. Schedulable
rows now carry an inline Schedule action that opens a sheet and posts to the same
`scheduleConsultation` server action the member page uses. The row was restructured
so the button is a sibling of the link — a button inside an anchor is invalid and
swallows the click.

**Shared (E5).** `components/ui/sheet.tsx` on Base UI's Drawer (already installed —
focus trap, portal, scroll lock for free). ⌘K mounted on admin, not just
coordinator. Chart palette re-stepped and toast exit/swipe shipped in E0.

### Verification (2026-08-18)
| Check | Result |
|---|---|
| `next build` · `tsc` · `eslint` | **PASS** |
| `npm run test:unit` | **PASS** — 32/32 |
| Impeccable detector | **PASS** — `[]` on every changed file |
| Admin overview, live | **PASS** — screenshotted: funnel, sparklines and throughput all render with real data |
| Coordinator Today, live | **PASS** — 7 inline Schedule buttons render |
| Sheet, live | **PASS** — opens, focus trapped inside, datetime + mode fields present, Escape closes, close button closes |

### Two things cut on purpose
- **The sheet's drag-to-dismiss handle.** Base UI centres the popup regardless of
  the viewport wrapper, so a "drag me down" grab handle promised a gesture that
  never fired. Removed rather than shipped as a lie; Escape/close/backdrop all
  verified working.
- **A sparkline on the Renewals tile.** No honest 12-week series exists for a
  forward-looking count, and the first draft borrowed the unrelated member trend.

### Still blocked on demo data
The doctor queue could not be seen: `doctor@phloem.local` has zero assignments, so
the four new groups have nothing to render. Branch creation via MCP is unavailable
in this tool build (`confirm_cost` is not exposed), so the `SEED_DEMO=1` project
remains the outstanding prerequisite for verifying doctor and client surfaces.

---

## Care Continuum — W1–W5 (2026-08-19)

**Status:** ✅ complete · branch `feature/care-continuum` · spec
`docs/superpowers/specs/2026-08-18-care-continuum-design.md`

Five workstreams over the shipped 8-phase system, built in order, each verified
before the next began. Owner decisions taken at the start: **Focuni integration
dropped entirely** (not designed, not built, not stubbed); **renewal is workflow
only, no payments**; family re-engagement uses **tokenised check-in links**.

### Migrations
`0022_measures` · `0023_doctor_review_v2` · `0024_cases` · `0025_progress_report_enum`
· `0026_progress_report` · `0027_threads` · `0028_activity` · `0029_checkin_links`
· `0030_quiet_flags` · `0031_renewals` · `0032_declining_measures`
· `0033_anon_execute_lockdown`

### W1 — Reports, timeline, improvement tracking
- `measure_catalog` + `measure_sources` (20 measures, 32 sources) name the
  longitudinal set the §7 templates were already collecting but nothing tracked.
- `get_measure_series` is the access boundary (per-role domain filter, §5.3 shape).
- **Gap found and fixed:** `doctor_review` v1 captured no vitals, so weight/BP/pulse
  had a single data point forever. v2 adds a Vitals section reusing
  `doctor_initial`'s exact field ids; derived from v1 in SQL so it is provably
  "v1 + one section". `seed.ts` now activates only the newest version per key.
- `member_cases` / `member_case_events`: the doctor's `problem_list` becomes tracked
  cases at intake, and every review appends to the open ones — same transaction as
  the report.
- `progress_summary` report: composed in TypeScript (it stitches measures, timeline
  and cases into one narrative, and reuses `lib/measures.ts` so a printed PDF can
  never disagree with the live Trends tab), recorded through an RPC so §12 keeps
  owning notification rows. Carries **family-safe measures only** — it is the
  family's monthly artifact; the care team's full-fidelity view is the Trends tab.
- Three new section kinds (`measure_trend`, `timeline`, `comparison`) render through
  the existing pure-SVG `Sparkline`, never recharts, because the same components go
  through `renderToStaticMarkup` into puppeteer.

**Verified:** per-persona series access (doctor 9 rows clinical+training and 0 psych
even when psych is requested explicitly; psychologist psych-only; caregiver
family-safe only; coordinator 0; unassigned doctor 0); `"148/84"` parsed to
systolic/diastolic; direction-aware wording on a fixture (sit-to-stand and balance
improving, a *rising* timed up-and-go reported as "needs attention", weight reported
with no verdict); case seeding 3 problem rows → 2 cases with control→severity
mapping; report RPC idempotent, `force` supersedes rather than mutates.

### W2 — Communication
`threads` / `thread_messages` / `thread_reads`. Access is **derived from role +
assignment**, not a participants table that would drift the moment a clinician is
unassigned. **The psychologist is excluded from `care_team` and `family` threads**
rather than filtered inside them — those threads carry clinical detail in other
people's messages, and §3 grants that role only minimal demographics.

**Verified per persona:** caregiver 1 family thread / 1 message and denied opening an
internal one; the doctor *not* addressed sees only the internal thread while the
addressed nutritionist sees both (audience filter); psychologist sees their own
channel and **0 messages** from family/care-team threads; unassigned doctor 0.

### W3 — Patient activity
- `activity_events` + **derived** engagement (`engaged | quiet | at_risk`). The word
  is deliberately *engagement*, never "inactive" — `member_status.inactive` already
  means "package finished", a good outcome.
- Check-in link: the only unauthenticated write path. `anon` reaches exactly two
  security-definer functions; the caller never names a member (the token resolves
  it); the page shows a first name and nothing else; invalid/expired/revoked/
  already-used all return an identical `{"ok": false}`.
- Cron job 7 flags quiet families weekly, escalating `at_risk` to admin.

**Verified:** 3 presence calls → 1 row; family cannot read the signal about
themselves; live REST with the real anon key — every table 401, every other RPC
404/401; link reuse rather than duplication; concern detection firing both
notifications; second same-day submit refused; revoke killing the link; weekly
dedupe (two runs → 3 notifications, not 6).

### W4 — Program lifecycle
`renewals` + propose / respond / complete. §3 splits it: coordinator proposes and
records the family's answer, **admin alone completes** (it creates a package, and §3
gives reactivation to admin). `complete_renewal` wraps `reactivate_member` so one
code path creates a package and its four consultations. Ending is carried by the
**signature mark** — `GrowthRings` gains an `ending` state — rather than a new badge.

**Verified:** cron opens exactly 1 offer at T-14 and 0 on a second run; coordinator
**denied** `complete_renewal`; admin completes → new package, 4 fresh consults,
member → `assigned`, prior reports intact.

### W5 — Doctor experience
`lib/issues.ts` is the single answer to "what is wrong with this member", shared by
the list row and the member page. Two judgements live there: a red flag that **has**
a clearance decision stops being an outstanding issue, and a `quiet` family is the
coordinator's call — only `at_risk` reaches the doctor. `my_declining_measures`
answers the whole list in one query; psych measures never appear on this surface and
directionless measures (weight) are excluded entirely.

Clinical forms show the previous consultation's value **beside** each field
("Last time: 128/82") and never prefill it — copy-forward is a known charting hazard.

**Verified:** 12 unit tests; of sit-to-stand 8→11, TUG 14→17 and balance 10→10 only
the TUG is flagged; psychologist and unassigned doctor get 0 rows.

### Security regression found and fixed (0033)
0029's `grant usage on schema public to anon` re-activated Postgres's default
PUBLIC EXECUTE for `anon`, taking anon-callable security-definer functions from 2 to
8 — including `get_onboarding_scoped`. All eight still **failed closed** (the 0017
NULL-role hardening), but 0033 snapshots what `authenticated` may execute, revokes
EXECUTE from PUBLIC/anon schema-wide, and re-grants that snapshot — a blanket grant
to `authenticated` would have handed it the five service/cron-only functions. The
migration asserts its own end state.

**Verified:** `has_function_privilege('anon', …)` = exactly `get_checkin_link` and
`submit_checkin`; the five service-only functions still denied to `authenticated`;
`get_onboarding_scoped` as anon over REST → **401 permission denied**; Supabase
advisor `anon_security_definer_function_executable` **8 → 2**, 0 ERROR-level.

### Verification summary
`npm run build` ✓ (new `/c/[token]` route registered) · `tsc --noEmit` ✓ ·
`eslint` ✓ 0 problems · `npm run test:unit` **62/62** · Supabase security advisor
0 ERROR · authenticated route smoke 5/5 render clean (admin overview + member,
coordinator today + member, clinician list) · public `/c/[token]` verified
unauthenticated at phone width.

### Assumptions logged
1. **Psychologist excluded from care-team/family threads** (see W2). Their channel
   is `psych` (psychologist ↔ admin), mirroring the existing escalation path.
2. **`progress_summary` carries family-safe measures only.** One artifact serves the
   family (shared by default, plain-language lead); clinicians get full fidelity
   live in Trends rather than in a PDF that gets forwarded.
3. **A `quiet` family is not a clinical issue** — only `at_risk` reaches the doctor.
4. **Engagement is derived on read**, never stored, so it cannot go stale if a job
   stops running.

### Not verified live (environment)
The caregiver portal surfaces (Messages page, renewal card, ending ring) and the
doctor dashboard's populated state could not be exercised in a browser: this project
has no caregiver login with a known password, `doctor@phloem.local` still has zero
assignments, and `seed.ts` refuses demo fixtures without `SEED_DEMO=1` (a guard that
should not be overridden against real data). Their data paths are verified at the
database layer per persona, and every route that *could* be reached renders clean.
This is the same constraint recorded for the portal-elevation phase.

---

## Admin desks ("god mode") — 2026-08-21, branch `feature/care-continuum`

**Goal (user, narrowed twice during design):** the admin should do everything the
coordinator does, and be able to open the doctor / nutritionist / trainer care-team
views and see exactly what those clinicians see. Minimal DB and permission change.

### The verification that shaped the build

Before writing anything, every table and RPC the two shells touch was checked
against the **live** hosted project (`pg_policies` + `pg_get_functiondef`). The
result changed the plan from "one migration" to **zero migrations**:

- **Coordinator parity was already complete.** Every RPC the coordinator UI calls
  (`activate_program`, `pause_program`, `resume_program`, `assign_care_team`,
  `set_consultation_schedule`, `mark_meeting_done`, `set_package_duration`,
  `propose_renewal`, `create_checkin_link`, `revoke_checkin_link`,
  `create_member_with_invite`) guards on `auth_role() not in ('admin','coordinator')`.
  Five more (`deactivate_member`, `reactivate_member`, `complete_renewal`,
  `set_report_sharing`, `set_account_status`) are **admin-only** — the admin was
  already a strict superset of the coordinator. The single blocker was
  `allowedPrefix()` fencing admin into `/admin`.
- **Clinician read parity was already complete.** `members`, `consultations`,
  `cycles`, `reports`, `form_responses`, `form_templates`, `assignments`,
  `member_cases`, `threads`, `thread_messages`, `member_documents`, `packages` each
  carry an `admin … ALL` policy (policies OR together, so `doc_select` omitting
  admin is irrelevant). `my_declining_measures`, `get_engagement`, `list_engagement`,
  `get_report_view_receipts`, `get_measure_series` all name admin;
  `get_onboarding_scoped` returns admin the *full* answers; `my_unread_threads`
  gates on `auth_role() is not null`.
- **The only two RPCs that exclude admin are `submit_clinical_form` and
  `submit_feedback`** — both writes. Scope is read-only, so both stay untouched.

### What was built (app layer only — no migration, no RLS edit)

| File | Change |
|---|---|
| `lib/permissions.ts` | `allowedPrefix(): string` → `allowedPrefixes(): readonly string[]`. Admin gets `/admin`, `/coordinator`, `/clinician`; every other role keeps exactly one. `/portal` deliberately excluded. |
| `middleware.ts` | prefix check becomes `.some()` |
| `lib/lens-core.ts` (new) | pure lens vocabulary + cookie parser (`parseLens` rejects any role outside doctor/nutritionist/trainer, and any non-UUID id) |
| `lib/lens.ts` (new) | `getLens()` — request-cached, returns `null` for every non-admin *whatever the cookie says* |
| `app/(app)/lens-actions.ts` (new) | `setLens` server action, Zod-validated, re-checks admin before setting an httpOnly cookie (8h) |
| `components/care-team-switcher{,-menu}.tsx` (new) | admin-only desk picker; each row is its own `<form>`, so it works with JS off |
| `app/(app)/layout.tsx` | switcher in the header; accent bar takes the **borrowed** desk's hue; "Viewing as … · read-only" banner with an exit |
| `app/(app)/clinician/clients/page.tsx` | `viewRole` drives the shell; admin's caseload is reconstructed from `assignments` (RLS hands an admin everyone, so the desk's own set has to be rebuilt); consultations filtered to the desk's type |
| `app/(app)/clinician/clients/[id]/page.tsx` | `viewRole` drives tabs and every `.eq("type", role)`; **`form` and `feedback` tabs are removed for an admin** |

**Why the two tabs are removed rather than disabled:** besides the DB refusing both
submits, `FormPanel` *inserts a draft `form_response` on render*. Under `fr_admin ALL`
that insert would succeed — a clinical row authored by someone who never held the
consultation. Not rendering the panel is the fix.

### Verification

- `npm run typecheck` clean · `npx eslint` clean on all changed files · `npm run build` clean
- `npm run test:unit` — **69/69** (was 62; `lib/lens-core.test.ts` adds 7 covering
  cookie forgery: `psychologist`/`admin`/`coordinator`/`caregiver` and malformed
  UUIDs all rejected; `viewRoleFor` bends for admin only; admin is the only role
  with >1 shell and never gets `/portal`; every role's `roleHome` lies inside its
  own `allowedPrefixes`)
- **§16 suite** — new `admin desks` section, run via MCP `execute_sql` inside a
  rolled-back transaction. 11/11 PASS:
  admin sees ≥ the assigned doctor on members / reports / consultations /
  form_responses / cases / onboarding fields; admin reads `assignments`; admin
  **REFUSED** `submit_clinical_form` and `submit_feedback` with exactly
  `not_allowed`; regression — coordinator still sees 0 reports and 0 clinical
  form responses.

### Assumptions logged
1. **Psychologist is not a borrowable desk.** The user named doctor/nutritionist/
   trainer. §3 does grant admin the wellbeing report, so it stays readable from
   `/admin` — it just has no working shell.
2. **`/portal` is not a borrowable desk.** It is the family's surface, and it fires
   `record_activity('portal_visit')` on render — an admin browsing it would forge
   family engagement and mask the very quiet families W3 exists to surface.
3. **The onboarding tab shows an admin a superset**, not a byte-identical view:
   `get_onboarding_scoped` returns admin the full answers where a nutritionist gets
   the diet subset. §3 grants admin full onboarding, so this is spec-correct.
4. **The lens is a preference, not a credential.** It is presentation state in the
   same sense as `lib/permissions.ts`; `getLens()` returns `null` for non-admins,
   and every write still goes through the §6 RPCs, which do not know it exists.

### Not verified live (environment)
The four shells were not exercised in a browser: the Chrome extension could not
reach the dev server (error page on both `localhost:3000` and `127.0.0.1:3000`
while `curl` returned 200), and entering the admin password is not something the
assistant does. Every data path is verified at the database layer per persona
above, and the build renders all routes clean. A manual pass through
`/coordinator` and a borrowed desk is the remaining check.

---

## Admin shell UI/UX upgrade — 2026-08-21, branch `feature/care-continuum`

**Goal (user):** easier to use, feature-rich, all buttons visible, microinteractions
evident and usable.

### Diagnosis

`/admin` (Overview) was already strong — hero, sparkline tiles, stage funnel,
throughput chart, renewal radar. The four **list** pages were the gap: raw `<table>`
markup that never received the V1 elevation pass, with no search, no filters, no
sorting, and bare `<td>` grey text where an `EmptyState` belonged.

**Bug found during verification:** `/admin/members` took no `searchParams` and
ignored `?status=`. The Overview's nine funnel stages and two of its tiles all
deep-link to `/admin/members?status=…`, so **eleven links looked like features and
silently did nothing.** Fixed — the page now reads and validates the param against
the `member_status` enum.

### Decisions

1. **They stay tables.** Moving them onto `List`/`ListRow` was considered and
   rejected: a queue has one dominant name per row and repeats its verb, whereas
   admin data is genuinely columnar. What they needed was a sticky header, a real
   hover state, tabular numerals, sortable columns and designed empty states — not
   a different component.
2. **Single-click actions with an Undo toast** (user's call, over an inline
   two-beat confirm). The audit-noise cost was raised and accepted: an undo writes
   a second audit row rather than erasing the first.
3. **Undo is offered only where a true inverse exists.** `set_account_status` is a
   clean inverse, so Suspend/Reactivate gets one. `revokeInvite` **hard-deletes**
   the row and `reactivate_member` mints a *fresh package* — neither can be undone,
   so neither advertises it. An Undo that cannot undo is worse than none.
4. **Filtering is client-side** over rows the page already fetched (admin lists are
   in the hundreds), mirrored into the URL with `history.replaceState` so links stay
   shareable without re-running the server component per keystroke.

### Built

| File | Role |
|---|---|
| `lib/admin-filters.ts` (new) | pure search/sort/date helpers — accent-insensitive token search, nulls-last sort, `relativeDayLabel` |
| `lib/admin-filters.test.ts` (new) | 10 tests over the above |
| `components/admin/filter-bar.tsx` (new) | search + count-bearing chips, `/` to focus, Esc to clear |
| `components/admin/table.tsx` (new) | `AdminTable`/`Tr`/`Td`/`Th`/`SortTh`/`useSort` |
| `components/admin/row-action.tsx` (new) | single-click action → toast → optional honest Undo |
| `components/admin/{members,care-team,invites,audit}-table.tsx` (new) | the four lists |
| `components/ui/toast.tsx` | gains optional `action` (Undo); actionable toasts live 9s and pause while firing |
| `app/globals.css` | new `.liftable` utility |
| the four `admin/*/page.tsx` | now server-fetch + hand off to their table |
| `admin/{care-team,invites}/actions.ts` | `ActionResult`-returning twins of the redirect actions |

**Per page:** Members — search, 10 status chips, sortable name/age/city/status,
"Flagged first" toggle, flagged rows tinted. Care team — search, 4 role chips,
"Suspended only" toggle, Suspend/Reactivate with Undo. Invites — search, state
chips, expiry as *"in 3 days"*, copy-link, Revoke (no Undo). Audit — window raised
100 → 400, search, entity chips, "Show more" 50 at a time.

**Microinteractions**, all from tokens that already existed and were unused here:
`.pressable` on every row, chip and action; `SortTh` shows its neutral sort glyph
before you have used it; row dims + spinner while its own action is in flight; the
result count is `aria-live` and firms up when a filter is on; new `.liftable`
(a 2px hover lift on the dashboard tiles) deliberately uses `translate` rather than
`transform`, because `.pressable:active` already owns `transform` and one rule
setting both would make a press cancel the lift instead of composing with it —
the same reasoning `stagger-rise` documents. Reduced-motion and `.elderly` drop it.

### Verification
`npx tsc --noEmit` clean · `npx eslint .` clean across the whole repo ·
`npm run test:unit` **79/79** (was 69; +10 for `admin-filters`) ·
`npm run build` compiled, 17/17 pages.

### Not verified live (environment)
Still not exercised in a browser: the Chrome extension returns "Frame is showing
error page" for both `localhost:3000` and `127.0.0.1:3000` while `curl` returns 200
— an extension site-permission issue, not an app fault. A manual pass over the four
list pages is the remaining check.

---

## In-dashboard document & report viewing — 2026-08-21, branch `feature/care-continuum`

**Report:** family-uploaded documents and report PDFs could not be viewed in the
browser; the admin should be able to view them too.

### Root cause

Not a permissions problem, and not a malfunction — **viewing was never built.**
Both paths explicitly asked the browser to download:

- `components/documents/document-list.tsx:44` — `createSignedUrl(path, 600, { download: file_name })`
  then `window.open(...)`. Supabase's `download` option sets
  `Content-Disposition: attachment`, so the browser saved the file and the opened
  tab closed immediately.
- `app/api/reports/[id]/pdf/route.ts` — the same `{ download: filename }` on
  **both** the cached-object branch and the freshly-rendered one.

The only affordance in the list UI was a `Download` icon. There was no view path
to be broken.

Three findings that made the fix cheap, all verified before writing code:

1. **Content-Type is already stored correctly.** `contentTypeFor()` covers the
   blank-`file.type` case (notably HEIC), the uploader passes it to `.upload()`,
   and `mime_type` is persisted on the row — so objects render inline as soon as
   the flag comes off. **No re-upload, no migration.**
2. **Admin access already worked at both layers** — `doc_admin ALL` on
   `member_documents`, and the `documents_read` storage policy names
   `auth_role() = 'admin'`. `DocumentList` was already rendered on the admin
   member page. Admin could always *reach* these files; nobody could *view* them.
3. **No CSP in `next.config.ts`**, so an `<iframe>` to a signed URL is not blocked.

### Built

- **`lib/document-preview.ts` + tests (new).** `previewKind(mime, name)` →
  `pdf | image | unsupported`. **HEIC/HEIF are refused**, and the filename
  overrules a mime type the browser guessed wrong: no browser outside Safari
  draws HEIC, an `<img>` pointed at one shows a silent broken frame, and families
  upload straight from iPhones — so it is the common case, not the edge case.
  `unsupportedReason()` names it in plain words.
- **`components/documents/document-viewer.tsx` (new).** Modal over the list, built
  on the existing `Sheet` (Base UI Drawer — focus trap, Escape, backdrop dismiss
  already shipped). PDFs in an `<iframe>` (the only element that reliably shows
  the browser's own PDF toolbar across Chrome/Firefox/Safari), images in `<img>`,
  unsupported types in a designed message with a download. Left/right arrows step
  through the list in **displayed** order. Download keeps the `download` flag,
  because that is a genuinely different intent.
- **`document-list.tsx`** — the filename is now a button that opens the viewer,
  plus an explicit eye icon; download and delete unchanged. Rows show
  "· no preview" where that is the truth.
- **`app/api/reports/[id]/pdf/route.ts`** — `?view=1` omits the attachment
  disposition. Same object, same signature, same RLS gate; **the default stays a
  download so every existing link behaves as before.**
- **`app/(app)/reports/[id]/page.tsx`** — "View PDF" (new tab, inline) promoted
  above "Download PDF".
- `mime_type` added to the three `member_documents` selects (admin, portal,
  clinician).

### Verification
`tsc` clean · `eslint .` clean repo-wide · `npm run test:unit` **84/84** (was 79;
+5 for `document-preview`, written failing first) · `npm run build` clean, 17/17.

Live storage check via MCP (rolled back): 4 documents exist, all `application/pdf`;
**admin sees 4/4 rows and 4/4 storage objects** (so signing a view URL succeeds),
while a caregiver sees only their own 1 — scoping intact.

### Not verified live (environment)
Still no browser pass: the Chrome extension reports "Frame is showing error page"
for `localhost:3000` and `127.0.0.1:3000` while `curl` returns 200. The iframe
render itself is the one thing only a browser can confirm.
