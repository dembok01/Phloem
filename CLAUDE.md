# CLAUDE.md — PHLOEM Chronic-Care Dashboard

**`PHLOEM-BUILD-SPEC.md` is the single source of truth.** Read the relevant § before building anything. This file is only an orientation summary — if it ever disagrees with the spec, the spec wins.

## What this is

Role-based healthcare dashboard for chronic care of elderly members. Caregivers enroll parents; a coordinator assigns a care team (doctor, nutritionist, trainer, psychologist); 30-day program cycles generate clinical forms and immutable PDF reports. Permissions are **database-enforced** (Postgres RLS + security-definer RPCs) — UI checks are cosmetic mirrors, never the boundary.

## Environment Overrides (user-mandated 2026-07-07 — supersede §2 and anything local/Docker in the spec)

1. **No Docker, no `supabase start`, no local Supabase.** All database work targets the **hosted Supabase dev project** (the one `.mcp.json` points at).
2. **Supabase MCP tools are the primary DB interface**: `apply_migration` for migrations, `execute_sql` for queries/inspection/§16 RLS tests, `get_project_url`/`get_publishable_keys` for client config. Never ask the user for URL/keys — fetch via MCP.
3. **Migration discipline:** every schema change exists as a numbered SQL file in `supabase/migrations/` in the repo FIRST, then is applied to the hosted project via MCP `apply_migration`. Never make ad-hoc schema changes through `execute_sql` that aren't captured in a migration file — the repo must always be able to rebuild the database from scratch.
4. **Seeding (§14):** no `supabase db reset` on hosted — the seed is an idempotent `scripts/seed.ts` (safe to re-run; upsert / on-conflict), using the service-role key from `.env.local` for auth users; MCP `execute_sql` available for data rows/verification.
5. **npm, not pnpm**, for everything (`npm run test:rls`, `npm run cron:dev`, …).
6. **`.env.local` is filled in** (Supabase URL/anon/service-role + §2 vars). Never print the service-role key, never commit `.env.local`, never import it in client code.
7. **§16 RLS suite runs via MCP `execute_sql`** against the hosted project; paste results into PROGRESS.md at the phases the spec requires (end of Phases 1, 4, 6, 7).
8. Company logo: `Phloem logo-05.png` at repo root (copied to `public/` for use in UI + PDF branding).

## Stack (§2)

- **Next.js 15+ (App Router) + TypeScript strict** — no `any`, Zod-validate all server action inputs
- **Supabase** (hosted dev project via MCP — see Environment Overrides) — DB / Auth / Storage
- **Tailwind CSS + shadcn/ui**, **npm** (override; spec said pnpm)
- Email: Resend (dev fallback: console-log payload + always write in-app notification row)
- PDF: `puppeteer-core` + `@sparticuz/chromium` (dev fallback: local `puppeteer`)
- Charts (Phase 8): recharts. Timezone: Asia/Kolkata everywhere (`date-fns-tz`)

## Execution rules (§0 — follow always)

1. **Build in phases (§15), strictly in order.** A phase starts only after the previous phase's acceptance checklist passes. Never skip ahead.
2. **Maintain `PROGRESS.md`**: per phase — status, what was built, verification results, assumptions.
3. **Do not invent scope.** Ambiguity → simplest interpretation consistent with the spec, logged in PROGRESS.md under "Assumptions". Do not ask; do not silently invent.
4. **Security non-negotiables:**
   - Service-role key **never** reaches client code — server-only (`lib/supabase/admin.ts`).
   - Enforcement lives in Postgres RLS + security-definer RPCs (§5–§6).
   - Every workflow state transition goes through a §6 RPC — no raw table updates from server actions.
5. TypeScript strict, no `any`; Zod on all server action inputs.
6. **Commit at every milestone** with clear messages (`phase-3: onboarding autosave + red flags`).
7. **Verification is part of the work**: each phase ends by running its §15 acceptance checks and the §16 RLS suite (where applicable), recording results in PROGRESS.md.
8. Spec SQL/JSON is verbatim (fix only genuine syntax errors, logged). Prose tables → translate faithfully.

## Permission matrix (§3 — the law of the system)

Legend: ✅ full · 👁 view · 🔸 partial · ❌ none. "Assigned" = active assignment to that member.

| Data / Action | Admin | Coordinator | Doctor | Nutritionist | Trainer | Psychologist | Caregiver |
|---|---|---|---|---|---|---|---|
| Member contact identifiers (phone, WhatsApp, email, address, PIN, emergency contact) | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ | ✅ own |
| Member demographics (name, age, gender, language, occupation, city) | ✅ | 👁 | 👁 assigned | 👁 assigned | 👁 assigned | 🔸 minimal via RPC | ✅ own |
| Onboarding health answers | ✅ | ❌ | 👁 assigned (full) | 🔸 diet-scoped RPC | 🔸 activity-scoped RPC | 🔸 minimal RPC | ✅ own |
| Onboarding Summary report | ✅ | ❌ | 👁 | 👁 | 👁 | ❌ | ✅ |
| Doctor reports (initial/review) | ✅ | ❌ status only | ✅ own clients | 👁 | 👁 | ❌ | 🔸 if `share_with_caregiver` |
| Nutrition plan/review reports | ✅ | ❌ status only | 👁 | ✅ own clients | 👁 | ❌ | ✅ |
| Training plan/review reports | ✅ | ❌ status only | 👁 | ❌ | ✅ own clients | ❌ | ✅ |
| Wellbeing report + psych form responses | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ own clients | ❌ |
| Performance report (monthly) | ✅ | ❌ status only | 👁 | 👁 | 👁 | ❌ | 🔸 if `share_with_caregiver` |
| Consultation schedule & statuses | ✅ | ✅ all | 👁 own type | 👁 own type | 👁 own type | 👁 own type | 👁 own member |
| Care team contact details | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 🔸 names+roles only |
| Assign care team / schedule / mark meeting done | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Program trigger / pause / resume / package duration | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deactivate/reactivate member, suspend accounts, audit log, invites | ✅ | 🔸 client invites only | ❌ | ❌ | ❌ | ❌ | ❌ |

Anyone who cannot see the wellbeing report sees only *"Wellbeing check-in completed — {date}"* (from the consultation row). Clinicians never see contact identifiers (mechanism: `member_contacts` is a separate table their RLS policies do not cover).

## Current phase

**Phase 7 complete → Phase 8 — Portal & Polish is next** (see `PROGRESS.md` for live status). Phases (§15): 1 Scaffold & DB → 2 Invites & Admin → 3 DynamicForm & Onboarding → 4 Reports & PDF → 5 Coordinator & Consultations → 6 Clinician Shell & Clinical Forms → 7 Cycle Engine → 8 Portal & Polish.

## Dev commands

- `npm run dev` — app on http://localhost:3000
- `npm run seed` — idempotent seed against the hosted project (§14)
- `npm run test:rls` — §16 security test suite against the hosted project (run at end of Phases 1, 4, 6, 7)
- `npm run cron:dev [YYYY-MM-DD]` — fire the §9 daily cron locally (Bearer CRON_SECRET); optional date = dev-only time-travel (`?today=`)
