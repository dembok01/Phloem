# PHLOEM-BUILD-SPEC.md
## Master Build Specification — PHLOEM Chronic-Care Dashboard
### For execution by Claude Code · v1.0 (all requirements finalized & clinically signed off)

---

## §0 — EXECUTION RULES (read first, follow always)

You are building a production healthcare dashboard from scratch. This spec is the single source of truth. Follow these rules for the entire build:

1. **Build in phases (§15), strictly in order.** Do not begin a phase until the previous phase's acceptance checklist passes. Never skip ahead "while you're in there."
2. **Maintain `PROGRESS.md`** at repo root: per phase — status, what was built, verification results, and any assumption you had to make (log assumptions; do not silently invent features).
3. **Do not invent scope.** If something is ambiguous, choose the simplest interpretation consistent with this spec, and log it in PROGRESS.md under "Assumptions."
4. **Security is non-negotiable:**
   - The Supabase **service-role key never reaches client code** — server-only (`lib/supabase/admin.ts`, imported only in server contexts).
   - All permission enforcement lives in **Postgres RLS + security-definer RPCs** (§5–§6). UI checks (`lib/permissions.ts`) are cosmetic mirrors, never the boundary.
   - Every state transition goes through an RPC (§6) — no raw table updates from server actions for workflow state.
5. **TypeScript strict mode, no `any`.** Zod-validate all server action inputs.
6. **Commit at every milestone** listed inside each phase, with clear messages (`phase-3: onboarding autosave + red flags`).
7. **Verification is part of the work:** each phase ends by running its acceptance checks (§15) and the security test suite (§16) where applicable, and recording results in PROGRESS.md.
8. Where this spec includes SQL/JSON verbatim, use it verbatim (fixing only genuine syntax errors, logged). Where it describes fields/screens in prose tables, translate faithfully.

---

## §1 — PRODUCT OVERVIEW

**PHLOEM** provides personalized chronic care for elderly members. Adult children (caregivers) enroll their parents. The platform replaces WhatsApp + Google Sheets with one role-based system.

**Core loop:** caregiver invited → signs up → onboarding video → onboarding questionnaire → auto-generated Onboarding Health Summary → coordinator assigns care team (Doctor, Nutritionist, Trainer, Psychologist) → initial consultations in sequence (Doctor gates Nutritionist & Trainer; Psychologist parallel) → each professional submits a clinical form generating a report → **Start Program trigger** → program begins **the next day** → repeating 30-day cycles (Day 27: feedback forms for Nutritionist & Trainer → performance report auto-compiled for the Doctor → Day 30: review consultations, checklist resets) → package ends (default 3 months) → member inactive → reactivation preserves full history.

**Seven experiences:** Admin, Care Coordinator, Doctor, Nutritionist, Trainer, Psychologist, Caregiver portal (with optional elderly view-only member login).

**Non-negotiable product principles:**
- Least-privilege data access per the matrix in §3, enforced in the database.
- Clinicians never see contact identifiers. Psychologist output visible to Admin + Psychologist only.
- Every clinical form leads with a required free-text professional assessment; structured fields standardize reports, never replace judgment.
- All reports: standardized, branded, readable, **PDF-downloadable**, immutable once submitted (amendments create versions).
- Elderly-friendly UX: large type, minimal steps, autosave everywhere, conditional questions.

---

## §2 — STACK & PROJECT SETUP

| Layer | Choice |
|---|---|
| Framework | Next.js 15+ (App Router) + TypeScript strict |
| DB / Auth / Storage | Supabase (local dev via Supabase CLI; `supabase start`) |
| Styling / UI | Tailwind CSS + shadcn/ui |
| Validation | Zod |
| Email | Resend (dev fallback: log full email payload to console + always write the in-app notification row) |
| PDF | `puppeteer-core` + `@sparticuz/chromium` in a Node runtime route (dev fallback: local `puppeteer`) |
| Charts (Phase 8) | recharts |
| Package manager | pnpm |

**Setup tasks (Phase 1):** `pnpm create next-app`, Tailwind + shadcn init, `supabase init`, migrations under `supabase/migrations/`, seed under `supabase/seed.sql` + `supabase/templates/*.json`.

**Environment (`.env.local.example` — create it):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only
RESEND_API_KEY=                   # optional in dev
EMAIL_FROM=care@phloem.example
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
ONBOARDING_VIDEO_URL_CLIENT=      # placeholder mp4/YouTube ok in dev
ONBOARDING_VIDEO_URL_CARETEAM=
SEED_ADMIN_EMAIL=admin@phloem.local
SEED_ADMIN_PASSWORD=admin12345!
```

---

## §3 — ROLES & PERMISSION MATRIX (the law of the system)

Legend: ✅ full · 👁 view · 🔸 partial (rule stated) · ❌ none. "Assigned" = active assignment to that member.

| Data / Action | Admin | Coordinator | Doctor | Nutritionist | Trainer | Psychologist | Caregiver |
|---|---|---|---|---|---|---|---|
| Member contact identifiers (phone, WhatsApp, email, address, PIN, emergency contact) | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ | ✅ own |
| Member demographics (name, age, gender, language, occupation, city) | ✅ | 👁 | 👁 assigned | 👁 assigned | 👁 assigned | 🔸 minimal via RPC | ✅ own |
| Onboarding health answers | ✅ | ❌ | 👁 assigned (full health answers) | 🔸 diet-scoped RPC | 🔸 activity-scoped RPC | 🔸 minimal RPC | ✅ own |
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
| Deactivate / reactivate member, suspend accounts, audit log, invites | ✅ | 🔸 client invites only | ❌ | ❌ | ❌ | ❌ | ❌ |

Everyone who cannot see the wellbeing report sees only: *"Wellbeing check-in completed — {date}"* (driven by the consultation row).

---

## §4 — DATABASE SCHEMA (migration `0001_init.sql` — use verbatim)

```sql
-- ============ ENUMS ============
create type user_role      as enum ('admin','coordinator','doctor','nutritionist',
                                    'trainer','psychologist','caregiver','member');
create type care_role      as enum ('doctor','nutritionist','trainer','psychologist');
create type account_status as enum ('active','suspended');
create type member_status  as enum ('invited','signed_up','onboarding','onboarded',
                                    'assigned','initial_consults','ready_to_start',
                                    'active','renewal_due','inactive');
create type meeting_status as enum ('to_schedule','scheduled','done','cancelled');
create type submit_status  as enum ('pending','submitted');
create type package_status as enum ('not_started','active','paused','completed');
create type cycle_status   as enum ('upcoming','active','closed');
create type consult_mode   as enum ('video','phone','in_person');
create type report_type    as enum ('onboarding_summary','doctor_initial','doctor_review',
                                    'nutrition_plan','nutrition_review','training_plan',
                                    'training_review','wellbeing','performance');

-- ============ PEOPLE ============
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  role           user_role not null,
  full_name      text not null,
  email          text not null,
  phone          text,
  whatsapp       text,
  specialization text,
  status         account_status not null default 'active',
  created_at     timestamptz not null default now()
);

create table members (
  id                          uuid primary key default gen_random_uuid(),
  caregiver_id                uuid references profiles(id),
  member_user_id              uuid references profiles(id),  -- optional elderly view-only login
  full_name                   text not null,
  age                         int,
  gender                      text,
  language                    text,
  occupation                  text,
  city                        text,
  country                     text,
  relationship_to_caregiver   text,
  status                      member_status not null default 'invited',
  red_flags                   jsonb not null default '[]',
  onboarding_video_watched_at timestamptz,
  created_at                  timestamptz not null default now()
);

-- Sensitive contact identifiers: separate table = the mechanism by which
-- clinicians can NEVER see them (their RLS policies do not cover this table).
create table member_contacts (
  member_id               uuid primary key references members(id) on delete cascade,
  phone                   text,
  whatsapp                text,
  email                   text,
  address                 text,
  pin_code                text,
  emergency_contact_name  text,
  emergency_contact_phone text
);

create table invites (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  role       user_role not null,
  member_id  uuid references members(id),
  token      uuid not null unique default gen_random_uuid(),
  invited_by uuid references profiles(id),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ============ CARE STRUCTURE ============
create table assignments (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  care_user_id  uuid not null references profiles(id),
  care_role     care_role not null,
  active        boolean not null default true,
  assigned_by   uuid references profiles(id),
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz
);
create unique index one_active_per_role on assignments(member_id, care_role) where active;

create table packages (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members(id) on delete cascade,
  duration_months   int not null default 3,
  start_date        date,            -- set by activate_program(): CURRENT_DATE + 1
  end_date          date,            -- start + months + total_paused_days (maintained by RPCs)
  status            package_status not null default 'not_started',
  paused_at         timestamptz,
  total_paused_days int not null default 0,
  psych_override    boolean not null default false,  -- trigger fired with psych pending
  created_at        timestamptz not null default now()
);

create table cycles (
  id         uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  number     int not null,
  start_date date not null,
  end_date   date not null,          -- start_date + 29
  status     cycle_status not null default 'upcoming',
  unique (package_id, number)
);

create table consultations (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members(id) on delete cascade,
  cycle_id          uuid references cycles(id),   -- NULL = initial (pre-trigger) round
  type              care_role not null,
  mode              consult_mode,
  meeting_status    meeting_status not null default 'to_schedule',
  scheduled_at      timestamptz,
  meeting_link      text,
  completed_at      timestamptz,
  marked_done_by    uuid references profiles(id),
  report_status     submit_status not null default 'pending',
  coordinator_notes text
);

-- ============ FORMS & REPORTS ============
create table form_templates (
  id      uuid primary key default gen_random_uuid(),
  key     text not null,
  version int not null,
  schema  jsonb not null,
  active  boolean not null default true,
  unique (key, version)
);

create table form_responses (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references members(id) on delete cascade,
  template_id     uuid not null references form_templates(id),
  consultation_id uuid references consultations(id),
  cycle_id        uuid references cycles(id),
  respondent_id   uuid references profiles(id),
  answers         jsonb not null default '{}',
  submitted_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table reports (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid not null references members(id) on delete cascade,
  cycle_id             uuid references cycles(id),
  type                 report_type not null,
  content              jsonb not null,
  pdf_path             text,
  version              int not null default 1,
  supersedes           uuid references reports(id),
  share_with_caregiver boolean not null default false,
  created_by           uuid references profiles(id),
  created_at           timestamptz not null default now()
);

-- ============ OPS ============
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  type          text not null,
  title         text not null,
  body          text,
  link          text,
  dedupe_key    text unique,
  read_at       timestamptz,
  email_sent_at timestamptz,
  created_at    timestamptz not null default now()
);

create table audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
```

**Onboarding data-split rule (critical):** the onboarding submission handler splits the questionnaire — contact fields (`contact_number`, `pin_code`, emergency contact) → `member_contacts`; demographics (name, age, gender, language, occupation, city, country, weight/height go into answers AND age/gender/etc. into `members`) → `members`; **all remaining health/lifestyle/diet/goal answers** → `form_responses.answers`. This is why the doctor's "full onboarding access" still never includes a phone number.

---

## §5 — ROW-LEVEL SECURITY (migration `0002_rls.sql`)

### 5.1 Helper functions (security definer; owned by postgres → bypass RLS, no recursion)

```sql
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active'
$$;
-- Suspended user ⇒ NULL ⇒ every policy fails closed. Suspend switch = instant lockout.

create or replace function is_assigned_to(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments
                 where member_id = m and care_user_id = auth.uid() and active)
$$;

create or replace function is_caregiver_of(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where id = m and caregiver_id = auth.uid())
$$;
```

### 5.2 Policies — enable RLS on **every** table, then:

```sql
-- profiles
create policy prof_own_read   on profiles for select using (id = auth.uid());
create policy prof_admin      on profiles for all    using (auth_role() = 'admin');
create policy prof_coord_read on profiles for select
  using (auth_role() = 'coordinator');           -- coordinator sees care-team contacts

-- members
create policy mem_admin      on members for all    using (auth_role() = 'admin');
create policy mem_coord      on members for select using (auth_role() = 'coordinator');
create policy mem_clinician  on members for select
  using (auth_role() in ('doctor','nutritionist','trainer','psychologist')
         and is_assigned_to(id));
create policy mem_caregiver  on members for select using (caregiver_id = auth.uid());

-- member_contacts  (note who is ABSENT: all four clinical roles)
create policy con_admin      on member_contacts for all    using (auth_role() = 'admin');
create policy con_coord      on member_contacts for select using (auth_role() = 'coordinator');
create policy con_caregiver  on member_contacts for select using (is_caregiver_of(member_id));
create policy con_cg_update  on member_contacts for update using (is_caregiver_of(member_id));

-- reports (per-type, mirrors §3 exactly)
create policy rep_admin   on reports for all using (auth_role() = 'admin');
create policy rep_doctor  on reports for select
  using (auth_role()='doctor' and is_assigned_to(member_id) and type <> 'wellbeing');
create policy rep_nutri   on reports for select
  using (auth_role()='nutritionist' and is_assigned_to(member_id)
         and type in ('onboarding_summary','doctor_initial','doctor_review',
                      'nutrition_plan','nutrition_review','performance'));
create policy rep_trainer on reports for select
  using (auth_role()='trainer' and is_assigned_to(member_id)
         and type in ('onboarding_summary','doctor_initial','doctor_review',
                      'nutrition_plan','nutrition_review','training_plan',
                      'training_review','performance'));
create policy rep_psych   on reports for select
  using (auth_role()='psychologist' and is_assigned_to(member_id) and type='wellbeing');
create policy rep_cg      on reports for select
  using (is_caregiver_of(member_id)
         and (type in ('onboarding_summary','nutrition_plan','nutrition_review',
                       'training_plan','training_review')
              or share_with_caregiver));
create policy rep_insert  on reports for insert
  with check (created_by = auth.uid()
              and (auth_role()='admin' or is_assigned_to(member_id)));
-- NO update/delete for clinicians ⇒ immutability; amendments insert with supersedes.

-- consultations
create policy cons_admin_coord on consultations for all
  using (auth_role() in ('admin','coordinator'));
create policy cons_clinician on consultations for select
  using (auth_role()::text = type::text and is_assigned_to(member_id));
create policy cons_caregiver on consultations for select using (is_caregiver_of(member_id));

-- form_responses (raw rows). Scoped access for nutri/trainer/psych = RPC only (§5.3).
create policy fr_admin on form_responses for all using (auth_role()='admin');
create policy fr_cg    on form_responses for all
  using (is_caregiver_of(member_id));            -- own onboarding draft/submit
create policy fr_doctor_onboarding on form_responses for select
  using (auth_role()='doctor' and is_assigned_to(member_id)
         and template_id in (select id from form_templates where key='onboarding'));
create policy fr_own_clinical on form_responses for all
  using (respondent_id = auth.uid());            -- professionals: their own drafts/submissions
create policy fr_feedback_doctor on form_responses for select
  using (auth_role()='doctor' and is_assigned_to(member_id)
         and template_id in (select id from form_templates
                             where key in ('feedback_nutrition','feedback_training')));

-- notifications / audit / templates / invites / packages / cycles / assignments
create policy notif_own   on notifications for all    using (user_id = auth.uid());
create policy audit_admin on audit_log     for select using (auth_role()='admin');
create policy tmpl_read   on form_templates for select using (auth_role() is not null);
create policy inv_admin   on invites for all using (auth_role()='admin');
create policy inv_coord   on invites for all
  using (auth_role()='coordinator' and role='caregiver');
create policy pkg_admin_coord on packages for select using (auth_role() in ('admin','coordinator'));
create policy pkg_cg          on packages for select using (is_caregiver_of(member_id));
create policy cyc_read on cycles for select using (
  auth_role() in ('admin','coordinator')
  or exists (select 1 from packages p where p.id = package_id
             and (is_caregiver_of(p.member_id) or is_assigned_to(p.member_id))));
create policy asg_admin_coord on assignments for select using (auth_role() in ('admin','coordinator'));
create policy asg_own         on assignments for select using (care_user_id = auth.uid());
create policy asg_cg          on assignments for select using (is_caregiver_of(member_id));
-- All workflow WRITES to packages/cycles/assignments/consultations happen via §6 RPCs.
```

### 5.3 Scoped onboarding RPC (RLS can't split a row)

```sql
create or replace function get_onboarding_scoped(m uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r user_role := auth_role(); a jsonb;
begin
  if r is null then return null; end if;
  select fr.answers into a
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.member_id = m and t.key = 'onboarding' and fr.submitted_at is not null
   order by fr.submitted_at desc limit 1;
  if a is null then return null; end if;

  if r = 'admin' or is_caregiver_of(m) or (r = 'doctor' and is_assigned_to(m)) then
    return a;
  elsif r = 'nutritionist' and is_assigned_to(m) then
    return jsonb_build_object(
      'conditions',a->'conditions','allergies',a->'allergies',
      'food_allergies',a->'food_allergies','medications',a->'medications',
      'meal_routine',a->'meal_routine','diet_pref',a->'diet_pref',
      'food_frequency',a->'food_frequency','water_liters',a->'water_liters',
      'protein_grams',a->'protein_grams','goals',a->'goals','reason',a->'reason');
  elsif r = 'trainer' and is_assigned_to(m) then
    return jsonb_build_object(
      'activity_level',a->'activity_level','sitting_hours',a->'sitting_hours',
      'current_activities',a->'current_activities','activity_minutes',a->'activity_minutes',
      'limiting_factors',a->'limiting_factors','activity_symptoms',a->'activity_symptoms',
      'joint_pain',a->'joint_pain','sleep_hours',a->'sleep_hours',
      'goals',a->'goals','focus_area',a->'focus_area','preferred_slots',a->'preferred_slots',
      'trainer_before',a->'trainer_before','trainer_experience',a->'trainer_experience');
  elsif r = 'psychologist' and is_assigned_to(m) then
    return jsonb_build_object(
      'reason',a->'reason','goals',a->'goals','sleep_hours',a->'sleep_hours',
      'condition_names',(select jsonb_agg(c->'condition') from jsonb_array_elements(coalesce(a->'conditions','[]'::jsonb)) c));
  end if;
  return null;
end $$;
```

---

## §6 — BUSINESS-LOGIC RPCs (migration `0003_rpcs.sql`)

All are `security definer`, validate caller role via `auth_role()`, write `audit_log`, and create `notifications` (with `dedupe_key` where time-driven). Implement each; exact rules:

| RPC | Callers | Rules (implement exactly) |
|---|---|---|
| `create_member_with_invite(name, demographics…, contacts…, caregiver_email, duration_months default 3)` | admin, coordinator | Insert member (status `invited`) + member_contacts + package (`not_started`) + caregiver invite row. Return invite token. |
| `accept_invite(token, password, full_name, phone?)` | public (token-gated; runs via service client from server action) | Validate token unused & unexpired → create auth user + profile with **the invite's role** (never client-supplied) → if `member_id` set: link `members.caregiver_id`, member → `signed_up` → burn token. |
| `mark_video_watched(member_id)` | caregiver of member | Stamp `onboarding_video_watched_at`; member → `onboarding`. |
| `submit_onboarding(member_id, response_id)` | caregiver | Require video watched. Apply the **data-split rule** (§4). Run red-flag engine (§13) → `members.red_flags`. Build + insert `onboarding_summary` report (§8). Member → `onboarded`. Notify coordinator+admin. |
| `assign_care_team(member_id, role, user_id)` | admin, coordinator | Target profile role must match & be active. Deactivate existing active assignment for that role (keep history). Create initial `consultations` row (cycle_id NULL) for that role if none pending. Member → `assigned` (first time). Notify professional. |
| `set_consultation_schedule(cons_id, at, mode, link?)` | admin, coordinator | Set fields, meeting_status → `scheduled`. Notify professional + caregiver. |
| `mark_meeting_done(cons_id)` | admin, coordinator | `scheduled → done`, stamp `completed_at`, `marked_done_by`. Notify professional to submit form. |
| `submit_clinical_form(cons_id, answers)` | the assigned professional of that consultation's type | Meeting must be `done`. **Trainer gate:** if type=`trainer`, member's latest doctor report must exist with `clearance ∈ {cleared, cleared_with_restrictions}` — else raise exception `'awaiting_doctor_clearance'`. Save form_response (submitted), build report of the matching type (§8), set `report_status='submitted'`. If psych escalation flag set → notify admin. Member → `initial_consults` while in initial round. |
| `activate_program(member_id)` | admin, coordinator | **The trigger.** Require initial (cycle_id NULL) doctor+nutritionist+trainer consultations at `report_status='submitted'`. If psych not submitted: allowed, set `packages.psych_override=true`, log override in audit. Then: `start_date := CURRENT_DATE + 1` *(program begins tomorrow — confirmed requirement)*; `end_date := start_date + (duration_months * interval '1 month')`; status `active`; generate cycles: cycle n = [start_date + (n−1)*30 days, +29], count = ceil(months*30/30) = duration_months; cycle 1 `active`, rest `upcoming`; member → `active`. Notify care team + caregiver ("Program starts tomorrow"). |
| `pause_program(package_id)` / `resume_program(package_id)` | admin, coordinator | Pause: only when `active`; set `paused_at`, status `paused`. Resume: `d := GREATEST(1, days between paused_at and now)`; `total_paused_days += d`; shift **current cycle end_date and all upcoming cycles' start/end** by `d` days; shift `packages.end_date` by `d`; clear `paused_at`; status `active`. Do **not** auto-shift manually scheduled consultations (coordinator reschedules externally); flag them in coordinator UI. Notify care team + caregiver on both actions. |
| `close_cycle_open_next(cycle_id)` | cron/service | Cycle → `closed`; next cycle (if any) → `active` and create 4 review consultation rows (doctor/nutritionist/trainer/psychologist, that cycle_id, `to_schedule`). If none left: package `completed`, member → `inactive`, notify admin+coordinator. |
| `compile_performance_report(cycle_id)` | trigger/service | Fires when the **second** of the two feedback responses for the cycle is submitted (call from `submit_feedback`). Build `performance` report (§8). Notify assigned doctor: "Performance report ready — review before your call." |
| `submit_feedback(response_id)` | assigned nutritionist/trainer | Marks submitted; if counterpart already submitted → `compile_performance_report`. |
| `deactivate_member(member_id)` / `reactivate_member(member_id, duration_months)` | admin | Reactivate: new package (`not_started`), member → `assigned` (prior team suggested in UI, editable), create fresh initial consultation rows, full history untouched. |
| `set_package_duration(package_id, months)` | admin, coordinator | Only while `not_started` (else admin-only, recompute end_date & regenerate `upcoming` cycles). |
| `log_report_view(report_id)` | any | Insert audit row `report.viewed` (call from report page load, server-side). |

---

## §7 — FORM TEMPLATES v1 (clinically signed off — seed verbatim intent)

### 7.1 Template JSON format (author these as `supabase/templates/{key}.v1.json`; seed loads them)

```json
{
  "key": "feedback_training", "version": 1, "title": "Monthly Training Feedback",
  "sections": [
    { "id": "s1", "title": "This Month", "fields": [
      { "id": "sessions_planned",   "type": "number",   "label": "Sessions planned", "required": true },
      { "id": "sessions_completed", "type": "number",   "label": "Sessions completed", "required": true },
      { "id": "adherence",          "type": "scale_1_5","label": "Adherence & effort", "required": true },
      { "id": "progress_by_area",   "type": "textarea", "label": "Progress vs this month's goals (per focus area)", "required": true },
      { "id": "sit_to_stand",       "type": "number",   "label": "Re-assessment: 30-sec sit-to-stand (reps)" },
      { "id": "balance_seconds",    "type": "number",   "label": "Re-assessment: balance hold (seconds)" },
      { "id": "adverse_events",     "type": "boolean",  "label": "Any pain, discomfort, falls or near-falls?", "required": true },
      { "id": "adverse_detail",     "type": "textarea", "label": "Describe (include falls/near-falls explicitly)", "required": true, "showIf": { "field": "adverse_events", "equals": true } },
      { "id": "modifications",      "type": "textarea", "label": "Plan modifications made / proposed" },
      { "id": "doctor_flags",       "type": "textarea", "label": "Anything the doctor should know before the review call" },
      { "id": "next_focus",         "type": "textarea", "label": "Next month's focus", "required": true }
    ]}
  ]
}
```

**Field types the renderer must support:** `text, textarea, number, boolean, date, select, multiselect, scale_1_5, scale_0_5, scale_1_10, repeat_group (subfields), frequency_grid (rows × cols), info (read-only callout)`. `showIf: {field, equals}` conditions. `scale_*` render as tappable segmented buttons.

### 7.2 All templates (author full JSON from these field specs; `*` = required)

**`onboarding`** — 5 sections, one per screen, autosaved:
- *Personal:* full_name*, age* (number), gender* (select M/F/Other+text), occupation*, city*, country*, language*, weight_kg*, height_cm, contact_number* (→member_contacts), pin_code (→member_contacts), relationship_to_caregiver* (select Self/Father/Mother/Father-in-law/Mother-in-law/Uncle/Aunt/Wife/Husband/Other), emergency_contact_name, emergency_contact_phone (→member_contacts), scheduling_contact (select member/caregiver), consent* (boolean; plain-language data-consent notice as `info` above it).
- *Medical History:* conditions* (repeat_group: condition, duration); surgeries_injuries*; joint_pain* (bool); painkillers_needed (text, showIf joint_pain); cardiac_eval_12mo* (bool); vision_blurring* (bool); ophthalmologist_consulted (text, showIf vision_blurring); medications* (repeat_group: name, dose, frequency) — **single deduplicated list**; seeing_doctor_currently* (bool); alt_medicine (textarea); hospitalizations; allergies; food_allergies; breathing_stamina*; family_history* (textarea; hint: stroke, heart attack, cancer, sudden deaths).
- *Lifestyle & Activity:* activity_level* (select Sedentary/Lightly active/Moderately active/Very active — **single deduplicated question**); sitting_hours (number); current_activities*; activity_minutes (number); limiting_factors*; smoking* (bool) + smoking_freq (showIf); alcohol* (bool) + alcohol_freq (showIf) — **split questions**; sleep_hours* (number); activity_symptoms* (multiselect: Exertional chest pain / Breathlessness / Easy fatigue / Worsening aches / Joint pain / Dizziness / None).
- *Diet & Nutrition:* meal_routine*; diet_pref (multiselect Veg/Non-veg/Vegan/Keto/Low-carb/Intermittent fasting/Other+text); food_frequency (frequency_grid rows Fruits/Vegetables/Dairy/Protein/Processed foods/Sweets × cols Daily/Few times a week/Rarely/Never — **deduplicated rows**); water_liters*; protein_grams*.
- *Goals:* goals (multiselect: Weight loss/Muscle strength/Mobility & flexibility/Reduce joint pain/Cardiovascular health/Manage chronic condition/Energy & vitality/Posture & balance/Stress relief); reason*; trainer_before (bool); trainer_experience (scale_1_10, showIf trainer_before); preferred_slots*; focus_area* (select Strength/Mobility/Mix); other_info.

**`doctor_initial`** — sections: *Consultation* (date*, mode*, duration_min, attendees* select member/member+caregiver/caregiver only); *Clinical Summary* (clinical_summary* textarea — labeled "Your assessment leads the report"); *Problem List* (problem_list repeat: condition, duration, control select well/partially/poorly controlled, specialist bool); *Medications* (med_recon repeat: drug, dose, frequency, action select continue/modify/stop/flag, note; polypharmacy_concern bool + polypharmacy_note showIf; adherence_concerns text); *Vitals & Investigations* (bp, pulse, weight_kg, sugar_hba1c, recent_labs textarea, tests_advised textarea); *Function & Safety* (mobility_aid bool+text, falls_12mo number, fear_of_falling bool, adl select independent/needs some help/dependent, sensory_issues text); *Exercise Clearance* (clearance* select cleared/cleared_with_restrictions/on_hold; intensity_ceiling, avoid_movements, supervision_required bool, stop_signs — all showIf cleared_with_restrictions); *Nutrition Directives* (diet_restrictions multiselect diabetic/low sodium/renal/low fat/fluid restriction/texture-modified/none; supplement_guidance; weight_direction select lose/maintain/gain); *Monitoring* (monitoring repeat: parameter, frequency, target); *Risk & Plan* (risk_level* select low/moderate/high + risk_rationale*; referrals; goals_3mo repeat max 3: goal text); *Team Flags* (team_flags textarea — propagated verbatim to nutritionist & trainer views); notes.

**`doctor_review`** — Consultation record; review_summary*; condition_changes; med_changes (repeat as above); performance_response* (textarea: "Response to this month's performance report"); clearance_change (select unchanged/updated + clearance fields showIf updated); directive_changes; next_month_goals (repeat); team_flags; notes.

**`nutritionist_initial`** — Consultation record; assessment_summary*; *Current Intake* (typical_day*, meals_per_day number, outside_food select rarely/weekly/several times a week/daily, appetite select good/variable/poor, chew_swallow bool + chew_note showIf, who_cooks*, kitchen_help); *Concerns* (concerns multiselect: inadequate protein/low hydration/low fiber/undernutrition risk/excess sugar/excess sodium/irregular meals/other + concern_notes); directives_ack* (boolean; UI shows doctor's directives read-only above); *Plan* (approach*, kcal_target number, protein_target_g number, meal_structure* textarea, hydration_l number, texture_mod); foods_emphasize*, foods_limit, foods_avoid; supplements; adherence_risks*; month1_goals* (repeat); flags_for_team; notes.

**`nutritionist_review`** — record; review_summary*; adherence_observations; target_updates (kcal/protein/hydration numbers); plan_changes*; next_month_goals (repeat); flags_for_team; notes.

**`trainer_initial`** — record; assessment_summary*; clearance_ack* (boolean; doctor's clearance shown read-only above; **form disabled entirely if clearance = on_hold or missing**); *Baseline* (sit_to_stand number, balance_seconds number, tug_seconds number, flexibility_notes, exertion_tolerance select can climb stairs/can walk 10 min/limited/very limited + note); *Environment* (training_mode select home visit/online/gym, space, equipment, hazards); *Prescription* (sessions_per_week* number, minutes_per_session* number, supervised_split text, focus_strength_pct/focus_mobility_pct/focus_balance_pct/focus_cardio_pct numbers, progression* textarea); *Safety* (excluded_exercises, fall_precautions, stop_signs_educated* bool); month1_goals* (repeat); flags_for_team; notes.

**`trainer_review`** — record; review_summary*; program_adjustments*; reassessment (sit_to_stand, balance_seconds, tug_seconds numbers); next_month_goals (repeat); flags_for_team; notes.

**`psych_checkin`** (same template every cycle; response + report visible to admin+psychologist only) — record; session_notes* (textarea, marked Confidential); *WHO-5 Well-Being (last 2 weeks, 0–5 each)*: who5_1 "I have felt cheerful and in good spirits", who5_2 "I have felt calm and relaxed", who5_3 "I have felt active and vigorous", who5_4 "I woke up feeling fresh and rested", who5_5 "My daily life has been filled with things that interest me" (all scale_0_5*; renderer footnote: total ×4 = 0–100, auto-computed and stored as who5_score); *Domains* (each scale_1_5 + optional note): mood, sleep_quality, stress_level, social_connection ("social connection & loneliness"), engagement_purpose, motivation_program; cognitive_obs (textarea only — "general observations, non-diagnostic"); *Support* (family_involvement textarea, isolation_risk select low/medium/high); recommendations textarea; escalation bool ("Needs admin attention / earlier follow-up?") + escalation_note showIf; next_checkin select routine/earlier advised.

**`feedback_nutrition`** — adherence* scale_1_5 + adherence_basis*; weight_change text; worked_well* textarea; challenges* textarea; reported_changes textarea ("energy, digestion, appetite"); modifications textarea; doctor_flags textarea; next_focus* textarea.

**`feedback_training`** — the JSON in §7.1, verbatim.

---

## §8 — REPORTS ENGINE

**`reports.content` shape (uniform):**
```json
{ "title": "Doctor's Initial Report — {member name}",
  "generated_at": "...", "cycle": 1,
  "sections": [
    { "heading": "Doctor's Assessment", "kind": "text",  "data": "..." },
    { "heading": "Problem List",        "kind": "table", "data": { "columns": [...], "rows": [...] } },
    { "heading": "Exercise Clearance",  "kind": "kv",    "data": { "Status": "Cleared with restrictions", ... } },
    { "heading": "…",                   "kind": "list",  "data": ["...", "..."] }
  ] }
```
Kinds: `text | kv | table | list | callout` (callout = highlighted box: red flags, adverse events, clearance restrictions).

**Builders (`lib/reports/build/{type}.ts`)** map a submitted form response → content. Rules:
- The professional's free-text assessment is **always the first section**.
- `onboarding_summary`: sections Personal snapshot (no contact identifiers in report body) / Medical History / Medications (table) / Lifestyle & Activity / Diet / Goals / **Red Flags (callout, if any)**.
- `performance` (compiled): Overview kv (cycle n, dates) / **Adverse Events callout if any** / Training (sessions n/n, adherence, progress, re-assessments incl. deltas vs prior cycle if available) / Nutrition (adherence, weight change, worked well, challenges) / Flags for Doctor (merged from both) / Proposed Adjustments / Adherence trend vs previous cycles (simple table).
- `wellbeing`: assessment first, WHO-5 score prominent (kv with score/100), domain table, recommendations. Restricted type.

**Rendering:** shared React components in `components/reports/` render `content` for BOTH the web view and the PDF (`app/api/reports/[id]/pdf/route.ts`): server checks access via a normal RLS-scoped read → renders the same components to HTML → puppeteer → uploads to private Storage bucket `reports/{member_id}/{report_id}.pdf` → stores `pdf_path` → returns a 10-minute signed URL. Log `report.viewed` via `log_report_view` on every report page load. **PDF styling:** PHLOEM header band, member name + report title, generous 16px+ base font, page numbers, print-clean (no nav).

---

## §9 — CYCLE-ENGINE CRON (`/api/cron/daily`, Authorization: Bearer CRON_SECRET; Vercel cron ~06:00 IST; also add `pnpm cron:dev` script hitting it locally)

All offsets computed from **cycle `end_date`** (so pause-shifted dates just work). Skip all time-based jobs for `paused` packages. Every notification uses a `dedupe_key` → reruns are no-ops.

1. `end_date − 7` → coordinator: "Reviews due for {member} on {date}".
2. `end_date − 3` → create draft feedback `form_responses` (feedback_nutrition → assigned nutritionist, feedback_training → assigned trainer) if absent; notify both.
3. `end_date − 1` → re-nudge unsubmitted feedback owners; escalate to coordinator.
4. `date > end_date` and cycle still `active` → `close_cycle_open_next(cycle)`. If a feedback form is still unsubmitted: **soft block** — performance report compiles with a "Feedback pending: {role}" callout; coordinator gets an overdue flag.
5. Package `end_date − 14` → member → `renewal_due`; notify admin + coordinator ("renewal conversation").
6. Hygiene: consultations `to_schedule` > 48h after creation → coordinator; `done` but report `pending` > 72h → professional + coordinator; expired unused invites → admin.

---

## §10 — APP STRUCTURE & SCREENS

```
app/
├─ (auth)/login · invite/[token]            # accept invite → set password → role video → land
├─ (app)/layout.tsx                         # session guard, suspended check, role nav
│  ├─ admin/            overview (pipeline stats, renewal radar) · members · members/[id]
│  │                    (full record, package controls incl. duration/pause/reactivate,
│  │                     share_with_caregiver toggles) · care-team (CRUD, invite, suspend)
│  │                    · invites · audit
│  ├─ coordinator/      today (task queue: Today/This week/Overdue) · pipeline (board)
│  │                    · members/[id] (checklist, contacts + wa.me links, trigger, pause)
│  ├─ clinician/        clients · clients/[id]   # ONE shell for all 4 clinical roles
│  └─ portal/           home (member switcher, status, next consults, care team names)
│                       · members/[id]/{plans,reports,schedule} · elderly mode
├─ api/cron/daily · api/reports/[id]/pdf
middleware.ts | lib/{supabase,permissions,red-flags,reports,notify}.ts
components/{forms/DynamicForm.tsx, reports/*, ui/*}
```

**Role → landing:** middleware reads `profiles.role` → `/admin`, `/coordinator`, `/clinician/clients`, `/portal`. Suspended → signed out with notice.

**Coordinator pipeline board columns** = member_status: Invited → Onboarding → Onboarded (ready to assign) → Initial Consults (chip "2/4") → Active (chip "Cycle 2 · Day 14") → Renewal Due → Inactive. Cards: name, red-flag dot, next action.

**Coordinator member page:** consultation checklist rows with **two status chips** (Meeting: To schedule/Scheduled {date}/Done · Report: Pending/Submitted); schedule dialog (datetime + mode + optional link); Mark meeting done; contact card (member + caregiver phone/WhatsApp with `https://wa.me/{E.164 digits}` links); assigned team with contacts; **Start Program** button — enabled per §6 rule; if psych pending shows amber "Start with psychologist pending?" confirm (override); after activation shows "Program starts {tomorrow's date}"; Pause/Resume with day-count preview; cycle calendar strip; paused banner listing scheduled consults needing manual reschedule.

**Clinician shell (config-driven per role):** clients list (name, age, cycle, next consult, pending-form badge, red-flag dot). Client page tabs by role — Doctor: Overview(+red-flag callout) / Onboarding (full health answers) / Consult Form / Reports / Performance. Nutritionist: Overview / Scoped Onboarding (via RPC) / Doctor's Directives (extracted read-only) / Consult Form / My Reports / Feedback (Day 27+ banner). Trainer: adds Doctor's Clearance card pinned top (locked form state if on_hold) + Nutrition reports tab. Psychologist: Minimal Context (RPC) / Check-in Form / My Wellbeing Reports — nothing else. Forms open only when meeting=done & report=pending; draft autosave; submit → success + link to generated report.

**Caregiver portal:** big-type cards; nutrition & training plans front and center (print button); reports list (RLS-filtered so only permitted types appear); schedule; package progress bar with cycle markers + paused badge; member switcher; optional elderly mode (`member` role login): view-only, max 3 items (My Plans / My Schedule / My Care Team), 20px+ base font.

---

## §11 — UX REQUIREMENTS

Base font ≥16px (portal ≥18px); large touch targets; visible focus states; loading skeletons; empty states with next-step hints ("No clients yet — the coordinator assigns members to you"). Onboarding: one section per screen, progress bar, autosave indicator ("Saved ✓"), resume-where-left-off. Scales render as segmented buttons. Repeat groups: card rows with add/remove. Red-flag banners: amber, plain language ("Reported chest pain during activity — doctor review required before training"). Every clinical form shows a small persistent note: *"Your own assessment leads the report — structured fields standardize it."* Dates human-readable ("Wed, 15 Jul"). Timezone: Asia/Kolkata everywhere (`date-fns-tz`).

---

## §12 — NOTIFICATIONS (all in-app rows; email via `notify()` helper — Resend or console-log in dev)

| Event | To | dedupe_key pattern |
|---|---|---|
| Onboarding completed | coordinator, admin | onboarded:{member} |
| Assigned to member | professional | assigned:{assignment} |
| Consult scheduled/updated | professional, caregiver | sched:{cons}:{ts} |
| Meeting done → submit form | professional | meetdone:{cons} |
| Report pending 72h | professional, coordinator | reportlate:{cons}:{date} |
| Feedback unlocked (T-3) | nutritionist, trainer | fbopen:{cycle}:{user} |
| Feedback nudge (T-1) / overdue (D30) | owner / coordinator | fbnudge/fblate:{cycle}:{user} |
| Performance report ready | doctor | perf:{cycle} |
| Reviews due T-7 | coordinator | rev7:{cycle} |
| Program activated ("starts tomorrow") | care team, caregiver | start:{package} |
| Paused / resumed | care team, caregiver | pause/resume:{package}:{ts} |
| Renewal T-14 | admin, coordinator | renew:{package} |
| Package completed → inactive | admin, coordinator | done:{package} |
| Psych escalation flag | admin | esc:{response} |

Bell icon + unread count in every shell; notification page with mark-read; each row deep-links.

---

## §13 — RED-FLAG ENGINE (`lib/red-flags.ts`, pure & unit-tested)

Input: onboarding answers → output `{id, label, severity}[]` stored on `members.red_flags`:
- `activity_symptoms` contains Exertional chest pain → **high** "Chest pain on exertion"
- contains Breathlessness → high; Dizziness → high
- `cardiac_eval_12mo` = false → **medium** "No cardiac evaluation in past 12 months"
- `joint_pain` true AND limiting_factors mentions falls/balance (case-insensitive) → medium "Fall-risk indicators"
- breathing_stamina non-empty and not "no/none" → medium
Any **high** flag ⇒ member card dot red; doctor + coordinator banners; trainer view shows "Doctor clearance required" lock state (the RPC in §6 enforces it regardless).

---

## §14 — SEED (`supabase/seed.sql` + loader script)

1. Admin auth user from `SEED_ADMIN_EMAIL/PASSWORD` + profile role `admin`.
2. All §7 templates from `supabase/templates/*.v1.json` (version 1, active).
3. Dev fixtures (guard: only when `NODE_ENV=development`): one profile per care-team role (password `test12345!`), one caregiver + member advanced to `onboarded` with realistic onboarding answers (include one high red flag), so every phase is demo-able immediately.
4. Storage buckets: `reports` (private).

---

## §15 — PHASED BUILD PLAN (execute in order; each phase = milestone commits + acceptance)

**Phase 1 — Scaffold & Database.** Next.js app, Tailwind/shadcn, Supabase local, migrations 0001–0003, seed, Supabase clients (browser/server/admin), middleware skeleton, login page, typed DB definitions.
✔ Accept: `supabase db reset` clean; login as seeded admin lands on `/admin` placeholder; §16 script passes contact-isolation checks.

**Phase 2 — Invites & Admin.** `accept_invite` flow end-to-end (email link or copyable URL in dev), care-team CRUD + invite + suspend, member creation (`create_member_with_invite`) + caregiver invite, invites list with expiry/revoke.
✔ Accept: invite a nutritionist → account created with correct role via token only; suspended user is locked out everywhere; caregiver invite claims and links `caregiver_id`.

**Phase 3 — DynamicForm & Onboarding.** Renderer (all §7.1 field types, showIf, autosave-debounced upsert, resume), video gate (`mark_video_watched`), onboarding wizard, `submit_onboarding` incl. data-split + red flags, status transitions.
✔ Accept: full questionnaire on mobile viewport with autosave/refresh-resume; contact number lands in `member_contacts` and is **absent** from `answers`; seeded chest-pain answers produce high flag + coordinator notification.

**Phase 4 — Reports & PDF.** Content builders (onboarding_summary first), report web view + `log_report_view`, PDF route + Storage + signed URL, branded template.
✔ Accept: onboarding summary renders and downloads as styled PDF; caregiver and doctor can open it; nutritionist sees it too; coordinator gets 404/denied.

**Phase 5 — Coordinator & Consultations.** Assignments UI (`assign_care_team`), pipeline board, today queue (static rules first), member checklist with dual statuses, schedule dialog, `mark_meeting_done`, wa.me links, notifications bell.
✔ Accept: assign all four roles → four initial consultation rows appear; schedule + mark done flows update chips; professional notified at each step.

**Phase 6 — Clinician Shell & Clinical Forms.** Role-config shell, scoped data (RPC) tabs, all clinical forms via DynamicForm bound to templates, `submit_clinical_form` → report per type, trainer clearance gate, psych confidentiality end-to-end (escalation → admin notification).
✔ Accept: doctor submits initial form → Doctor's Initial Report exists and is visible to nutritionist/trainer, invisible to psychologist; trainer form locked until clearance; psych submits → wellbeing report invisible to doctor (verified via §16), "check-in completed" chip visible to others.

**Phase 7 — Cycle Engine.** `activate_program` (**start = tomorrow**, psych-override dialog), cycles generation, cron route + all §9 jobs (add a dev "time-travel" helper: query param `?today=YYYY-MM-DD` honored only in development to simulate dates), feedback drafts (T-3), `submit_feedback` → performance report compile, `close_cycle_open_next` (checklist reset + new consultation rows), pause/resume with date-shift math, package duration change, renewal/inactive flow, `reactivate_member`.
✔ Accept: simulated month — activate on day 0 (start = day 1), time-travel to end−3 (feedback drafts+notifications), submit both (performance report → doctor notified), time-travel past end (cycle 2 active, 4 fresh consults, checklist reset); pause 5 days mid-cycle → all future dates shift +5 and package end +5; three cycles complete → member `inactive`; reactivation restores with history intact.

**Phase 8 — Portal & Polish.** Caregiver portal (plans-first, reports, schedule, progress bar, member switcher), elderly mode, admin analytics tiles (active members, consults this week, overdue items, renewals 30d), audit views, empty/loading states pass, Resend wiring behind `notify()`, README with full run instructions.
✔ Accept: caregiver sees nutrition/training plans + permitted reports only; elderly login sees exactly 3 items; README `pnpm dev` path works from clone to demo.

---

## §16 — SECURITY TEST SUITE (`supabase/tests/rls.test.sql`, runnable via `pnpm test:rls`)

Pattern (Supabase local): for each seeded user, simulate their JWT and assert:
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','<doctor-uuid>','role','authenticated')::text, true);
-- must be 0:
select count(*) from member_contacts;
select count(*) from reports where type='wellbeing';
-- unassigned member must be invisible:
select count(*) from members where id='<unassigned-member-uuid>';
rollback;
```
Required assertions (fail loudly on violation): doctor/nutritionist/trainer/psychologist → 0 rows from `member_contacts` ever; doctor → 0 `wellbeing` reports and 0 `psych_checkin` responses; psychologist → only `wellbeing` reports, 0 others; unassigned clinician → 0 rows for that member across members/reports/consultations; caregiver → only own member(s); coordinator → 0 rows from reports (any type) and 0 onboarding answers; suspended doctor → 0 rows everywhere; nutritionist raw `form_responses` select for onboarding → 0 (scoped RPC returns diet keys only). Run this suite at the end of Phases 1, 4, 6, 7.

---

*End of spec. Requirements herein are final and clinically signed off; log any deviation in PROGRESS.md.*
