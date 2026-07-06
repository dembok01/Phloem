-- PHLOEM migration 0001_init.sql — schema per PHLOEM-BUILD-SPEC.md §4 (verbatim)

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
