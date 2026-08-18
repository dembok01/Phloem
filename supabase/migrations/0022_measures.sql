-- PHLOEM migration 0022_measures.sql — W1.1/W1.2 of the care-continuum spec
-- (docs/superpowers/specs/2026-08-18-care-continuum-design.md).
--
-- The §7 templates already collect a real longitudinal measure set; nothing names
-- it, so no surface can show whether a member is improving. This migration adds
-- the registry that turns scattered `form_responses.answers` keys into tracked
-- series, plus ONE security-definer read path whose per-role domain filter is the
-- access boundary (same shape as §5.3 get_onboarding_scoped).
--
-- No template changes here and no data migration: every value already exists in
-- submitted answers, and the catalog only says how to read it.

-- ============ catalog ============

create table measure_catalog (
  measure_key      text primary key,
  domain           text not null check (domain in ('clinical','training','nutrition','psych')),
  label            text not null,
  unit             text,
  -- null = neutral (a number worth plotting with no "good" direction, e.g. weight)
  higher_is_better boolean,
  -- may a caregiver / elderly member ever see this measure
  family_safe      boolean not null default false,
  sort             int not null default 0
);

-- One measure can be collected by several templates (sit_to_stand appears in the
-- trainer's initial, their monthly review, AND the monthly feedback form), so the
-- source list is its own table rather than a column.
create table measure_sources (
  measure_key  text not null references measure_catalog(measure_key) on delete cascade,
  template_key text not null,
  field_id     text not null,
  -- how to read the raw answer: a plain number, or one half of a "128/82" string
  parse        text not null default 'number' check (parse in ('number','bp_sys','bp_dia')),
  primary key (measure_key, template_key, field_id, parse)
);

create index idx_measure_sources_template on measure_sources (template_key);

alter table measure_catalog enable row level security;
alter table measure_sources enable row level security;

-- The catalog is reference data (labels and units, no member data). Any signed-in
-- role may read it so the UI can render labels; the member VALUES are gated by the
-- RPC below, never by these tables.
create policy mcat_read on measure_catalog for select using (auth_role() is not null);
create policy msrc_read on measure_sources for select using (auth_role() is not null);

-- ============ seed ============

insert into measure_catalog (measure_key, domain, label, unit, higher_is_better, family_safe, sort) values
  ('weight_kg',          'clinical',  'Weight',                 'kg',       null,  true,  10),
  ('bp_systolic',        'clinical',  'Blood pressure (systolic)','mmHg',   null,  false, 20),
  ('bp_diastolic',       'clinical',  'Blood pressure (diastolic)','mmHg',  null,  false, 21),
  ('pulse',              'clinical',  'Pulse',                  'bpm',      null,  false, 30),
  ('falls_12mo',         'clinical',  'Falls (past 12 months)',  'falls',   false, false, 40),
  ('sit_to_stand',       'training',  '30-second sit-to-stand',  'reps',    true,  true,  10),
  ('balance_seconds',    'training',  'Balance hold',            's',       true,  true,  20),
  ('tug_seconds',        'training',  'Timed up-and-go',         's',       false, true,  30),
  ('training_adherence', 'training',  'Training adherence',      '/5',      true,  true,  40),
  ('sessions_completed', 'training',  'Sessions completed',      'sessions',true,  true,  50),
  ('nutrition_adherence','nutrition', 'Nutrition adherence',     '/5',      true,  true,  10),
  ('kcal_target',        'nutrition', 'Calorie target',          'kcal/day',null,  true,  20),
  ('protein_target_g',   'nutrition', 'Protein target',          'g/day',   null,  true,  30),
  ('hydration_l',        'nutrition', 'Hydration target',        'l/day',   null,  true,  40),
  ('mood',               'psych',     'Mood',                    '/5',      true,  false, 10),
  ('sleep_quality',      'psych',     'Sleep quality',           '/5',      true,  false, 20),
  ('stress_level',       'psych',     'Stress level',            '/5',      false, false, 30),
  ('social_connection',  'psych',     'Social connection',       '/5',      true,  false, 40),
  ('engagement_purpose', 'psych',     'Engagement & purpose',    '/5',      true,  false, 50),
  ('motivation_program', 'psych',     'Motivation for the program','/5',    true,  false, 60);

insert into measure_sources (measure_key, template_key, field_id, parse) values
  -- clinical: onboarding gives the baseline, doctor forms carry it forward.
  ('weight_kg',    'onboarding',       'weight_kg', 'number'),
  ('weight_kg',    'doctor_initial',   'weight_kg', 'number'),
  ('weight_kg',    'doctor_review',    'weight_kg', 'number'),
  ('bp_systolic',  'doctor_initial',   'bp',        'bp_sys'),
  ('bp_systolic',  'doctor_review',    'bp',        'bp_sys'),
  ('bp_diastolic', 'doctor_initial',   'bp',        'bp_dia'),
  ('bp_diastolic', 'doctor_review',    'bp',        'bp_dia'),
  ('pulse',        'doctor_initial',   'pulse',     'number'),
  ('pulse',        'doctor_review',    'pulse',     'number'),
  ('falls_12mo',   'doctor_initial',   'falls_12mo','number'),
  -- training: assessed at intake, re-assessed at each review AND in monthly feedback.
  ('sit_to_stand',       'trainer_initial',   'sit_to_stand',       'number'),
  ('sit_to_stand',       'trainer_review',    'sit_to_stand',       'number'),
  ('sit_to_stand',       'feedback_training', 'sit_to_stand',       'number'),
  ('balance_seconds',    'trainer_initial',   'balance_seconds',    'number'),
  ('balance_seconds',    'trainer_review',    'balance_seconds',    'number'),
  ('balance_seconds',    'feedback_training', 'balance_seconds',    'number'),
  ('tug_seconds',        'trainer_initial',   'tug_seconds',        'number'),
  ('tug_seconds',        'trainer_review',    'tug_seconds',        'number'),
  ('training_adherence', 'feedback_training', 'adherence',          'number'),
  ('sessions_completed', 'feedback_training', 'sessions_completed', 'number'),
  -- nutrition
  ('nutrition_adherence','feedback_nutrition',   'adherence',        'number'),
  ('kcal_target',        'nutritionist_initial', 'kcal_target',      'number'),
  ('kcal_target',        'nutritionist_review',  'kcal_target',      'number'),
  ('protein_target_g',   'nutritionist_initial', 'protein_target_g', 'number'),
  ('protein_target_g',   'nutritionist_review',  'protein_target_g', 'number'),
  ('hydration_l',        'nutritionist_initial', 'hydration_l',      'number'),
  ('hydration_l',        'nutritionist_review',  'hydration_l',      'number'),
  -- psych (confidential: psychologist + admin only, enforced in the RPC)
  ('mood',               'psych_checkin', 'mood',               'number'),
  ('sleep_quality',      'psych_checkin', 'sleep_quality',      'number'),
  ('stress_level',       'psych_checkin', 'stress_level',       'number'),
  ('social_connection',  'psych_checkin', 'social_connection',  'number'),
  ('engagement_purpose', 'psych_checkin', 'engagement_purpose', 'number'),
  ('motivation_program', 'psych_checkin', 'motivation_program', 'number');

-- ============ value extraction ============

-- Read one measure value out of a raw answers blob. Returns NULL for anything that
-- is not a clean number, so a free-text "around 70" never becomes a data point.
create or replace function _measure_value(a jsonb, p_field text, p_parse text)
returns numeric language sql immutable set search_path = public as $$
  with raw as (
    select case p_parse
      when 'bp_sys' then trim(split_part(coalesce(a->>p_field, ''), '/', 1))
      when 'bp_dia' then trim(split_part(coalesce(a->>p_field, ''), '/', 2))
      else trim(coalesce(a->>p_field, ''))
    end as v
  )
  select case when v ~ '^-?[0-9]+(\.[0-9]+)?$' then v::numeric end from raw
$$;

-- ============ §5.3-style scoped read: the access boundary ============

-- Which measure domains may the caller see for this member?
--   admin        → everything
--   doctor       → clinical + training + nutrition (they read every plan report)
--   nutritionist → nutrition + clinical            (§3: no training reports)
--   trainer      → training + clinical + nutrition (§3: reads nutrition reports)
--   psychologist → psych ONLY                      (and never anything else)
--   caregiver /
--   member       → family_safe measures only       (never psych, never vitals)
--   coordinator  → nothing                         (§3: no clinical data at all)
create or replace function _measure_domains(m uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when auth_role() is null then '{}'::text[]
    when auth_role() = 'admin' then array['clinical','training','nutrition','psych']
    when auth_role() = 'doctor'       and is_assigned_to(m) then array['clinical','training','nutrition']
    when auth_role() = 'nutritionist' and is_assigned_to(m) then array['nutrition','clinical']
    when auth_role() = 'trainer'      and is_assigned_to(m) then array['training','clinical','nutrition']
    when auth_role() = 'psychologist' and is_assigned_to(m) then array['psych']
    when is_caregiver_of(m) or is_member_self(m) then array['clinical','training','nutrition']
    else '{}'::text[]
  end
$$;

-- Longitudinal series for one member. Returns facts only — "is this better?" is
-- decided by the caller from higher_is_better, so the judgement lives in one place
-- (lib/measures.ts) rather than being re-derived per surface.
create or replace function get_measure_series(m uuid, p_domain text default null)
returns table (
  measure_key      text,
  label            text,
  unit             text,
  domain           text,
  higher_is_better boolean,
  at               timestamptz,
  cycle_number     int,
  value            numeric,
  source           text
)
language sql stable security definer set search_path = public as $$
  with allowed as (select _measure_domains(m) as domains),
  family_only as (
    -- caregivers and the elderly member see only family-safe measures
    select coalesce(is_caregiver_of(m) or is_member_self(m), false) as yes
  )
  select mc.measure_key,
         mc.label,
         mc.unit,
         mc.domain,
         mc.higher_is_better,
         -- the clinician's own consultation date beats the submission timestamp
         coalesce(
           case when fr.answers->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
                then ((fr.answers->>'date') || 'T00:00:00+05:30')::timestamptz end,
           fr.submitted_at
         ) as at,
         cy.number as cycle_number,
         _measure_value(fr.answers, ms.field_id, ms.parse) as value,
         ms.template_key as source
    from form_responses fr
    join form_templates t   on t.id = fr.template_id
    join measure_sources ms on ms.template_key = t.key
    join measure_catalog mc on mc.measure_key = ms.measure_key
    left join cycles cy     on cy.id = fr.cycle_id
   cross join allowed, family_only
   where fr.member_id = m
     and fr.submitted_at is not null
     and mc.domain = any (allowed.domains)
     and (not family_only.yes or mc.family_safe)
     and (p_domain is null or mc.domain = p_domain)
     and _measure_value(fr.answers, ms.field_id, ms.parse) is not null
   order by mc.domain, mc.sort, mc.measure_key,
            coalesce(
              case when fr.answers->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
                   then ((fr.answers->>'date') || 'T00:00:00+05:30')::timestamptz end,
              fr.submitted_at
            )
$$;

-- Functions grant EXECUTE to PUBLIC by default and anon inherits it via PUBLIC
-- (the 0009 lesson) — revoke, then re-grant to authenticated only.
revoke execute on function _measure_value(jsonb, text, text) from public;
revoke execute on function _measure_domains(uuid) from public;
revoke execute on function get_measure_series(uuid, text) from public;
grant execute on function get_measure_series(uuid, text) to authenticated;
grant execute on function _measure_domains(uuid) to authenticated;
grant execute on function _measure_value(jsonb, text, text) to authenticated;
