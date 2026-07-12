# PHLOEM — Chronic-Care Dashboard

A role-based healthcare dashboard for the chronic care of elderly members. Caregivers
enroll their parents; a coordinator assigns a care team (doctor, nutritionist, trainer,
psychologist); 30-day program cycles generate clinical forms and immutable PDF reports.

**Permissions are database-enforced** — Postgres Row-Level Security + security-definer
RPCs are the boundary; the UI only mirrors them. Clinicians can never see a member's
contact identifiers (they live in a separate `member_contacts` table no clinician policy
covers); the psychologist's wellbeing notes are visible only to the psychologist and admin.

See `PHLOEM-BUILD-SPEC.md` for the full specification and `PROGRESS.md` for build status.

## Stack

- **Next.js 15** (App Router, TypeScript strict) · **Tailwind + shadcn/ui**
- **Supabase** (Postgres / Auth / Storage) — RLS + RPCs
- **Zod** (server-action validation) · **Resend** (email; console-logs in dev)
- **puppeteer-core + @sparticuz/chromium** (report PDFs) · timezone **Asia/Kolkata**

## Prerequisites

- Node.js 20+ and npm
- A Supabase project (hosted or local). You need its URL, anon key, service-role key.

## 1. Install & configure

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=…            # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=…       # anon/publishable key
SUPABASE_SERVICE_ROLE_KEY=…           # service-role key (server-only; never commit)
NEXT_PUBLIC_APP_URL=http://localhost:3000
SEED_ADMIN_EMAIL=admin@phloem.local
SEED_ADMIN_PASSWORD=…                 # your chosen admin password
CRON_SECRET=…                         # any long random string
RESEND_API_KEY=                       # optional in dev (emails console-log without it)
EMAIL_FROM=care@phloem.example
ONBOARDING_VIDEO_URL_CLIENT=…         # any video URL for the onboarding gate
ONBOARDING_VIDEO_URL_CARETEAM=…
```

## 2. Apply the database migrations

The schema lives in `supabase/migrations/` (numbered `0001…0008`). Apply them in order to
your project:

```bash
supabase db push          # with the Supabase CLI linked to your project
```

> This project was developed against a **hosted** Supabase dev project using the Supabase
> MCP tools (no local Docker). In that setup each migration file is applied with the MCP
> `apply_migration` tool, in order. Either way, the repo rebuilds the database from scratch.

## 3. Seed

```bash
npm run seed
```

Idempotent (safe to re-run). Creates the admin, all form templates, the private `reports`
storage bucket, and — unless `NODE_ENV=production` — a full set of demo accounts and a
seeded member (Meera Krishnan, onboarded, with a high red flag, nutrition & training plans,
and an elderly login).

## 4. Run

```bash
npm run dev        # http://localhost:3000
```

### Demo logins (dev seed) — password `test12345!`

| Role | Email | Lands on |
|---|---|---|
| Admin | `admin@phloem.local` (your `SEED_ADMIN_PASSWORD`) | `/admin` |
| Coordinator | `coordinator@phloem.local` | `/coordinator` |
| Doctor | `doctor@phloem.local` | `/clinician/clients` |
| Nutritionist | `nutritionist@phloem.local` | `/clinician/clients` |
| Trainer | `trainer@phloem.local` | `/clinician/clients` |
| Psychologist | `psychologist@phloem.local` | `/clinician/clients` |
| Caregiver | `caregiver@phloem.local` | `/portal` |
| Member (elderly) | `elder@phloem.local` | `/portal` (view-only, 3 items) |

### Demo flow

1. **Caregiver** → `/portal`: see the member, plans, reports, schedule, care team.
2. **Elderly** → `/portal`: the same member in view-only mode — exactly My Plans / My Schedule / My Care Team.
3. **Coordinator** → assign a care team, schedule + mark meetings done, then **Start program**.
4. **Clinicians** → complete their consult forms; the trainer's form stays locked until the doctor clears the member.
5. **Cycle engine** → the daily cron drives feedback drafts, performance reports, cycle rollover, renewals.

## Cron (cycle engine, §9)

Runs daily in production (`vercel.json` → `/api/cron/daily`, ~06:00 IST, `Authorization:
Bearer CRON_SECRET`). Locally:

```bash
npm run cron:dev                 # run "today"
npm run cron:dev 2026-08-15      # dev-only time-travel (?today=) to simulate a date
```

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run seed` | Idempotent seed |
| `npm run cron:dev [YYYY-MM-DD]` | Fire the daily cron locally (optional time-travel) |
| `npm run test:unit` | Red-flag engine unit tests |
| `npm run test:rls` | §16 RLS security suite (needs `SUPABASE_DB_URL`, or run the SQL via MCP) |
| `npm run lint` | ESLint |

## Security model (short version)

- The service-role key is **server-only** (`lib/supabase/admin.ts`, `import "server-only"`).
- Every workflow state transition goes through a **security-definer RPC** (`supabase/migrations/0003_rpcs.sql`); server actions never write workflow tables directly.
- RLS policies (`0002`, `0006`, `0008`) are the read boundary; `lib/permissions.ts` is a cosmetic mirror only.
- `auth_role()` returns NULL for suspended users, so every policy fails closed instantly.
