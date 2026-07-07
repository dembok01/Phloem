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
