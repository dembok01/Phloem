-- PHLOEM §16 security test suite — RLS assertions, fail-loudly.
-- Self-contained: scenario fixtures are created inside the transaction and
-- rolled back at the end (a failed assertion raises and aborts, which also
-- rolls back). Run via `npm run test:rls` (needs SUPABASE_DB_URL) or through
-- the Supabase MCP `execute_sql` tool (environment override). Requires the
-- §14 seed (`npm run seed`).
-- PASS lines accumulate in a temp `results` table selected at the end.

begin;

-- ============ helpers ============
create function pg_temp.assert_eq(label text, actual bigint, expected bigint)
returns text language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'RLS TEST FAILED: % — expected %, got %', label, expected, actual;
  end if;
  return 'PASS  ' || label;
end $$;

create function pg_temp.assert_true(label text, ok boolean)
returns text language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'RLS TEST FAILED: %', label;
  end if;
  return 'PASS  ' || label;
end $$;

-- Seeded ids, resolved as postgres before dropping privileges.
create temp table ids as
  select email, id, role::text as role from profiles;
grant select on ids to authenticated;

create temp table results(line text);
grant insert on results to authenticated;

-- ============ scenario fixtures (rolled back) ============
-- M1 = seeded onboarded member (Meera), M2 = seeded unassigned member (Rajan).
-- Assign all four clinicians to M1; add reports/responses/consultations so
-- every "0 rows" assertion has something real to leak.
insert into assignments(member_id, care_user_id, care_role)
select '11111111-1111-4111-8111-111111111111', id, role::text::care_role
from profiles where role in ('doctor','nutritionist','trainer','psychologist');

insert into reports(id, member_id, type, content, created_by) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'wellbeing', '{"title":"Wellbeing Report — test fixture","sections":[]}',
   (select id from ids where role = 'psychologist')),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'doctor_initial', '{"title":"Doctor Initial — test fixture","clearance":"cleared","sections":[]}',
   (select id from ids where role = 'doctor')),
  ('aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'doctor_initial', '{"title":"Doctor Initial (M2) — test fixture","sections":[]}',
   (select id from ids where role = 'doctor'));

insert into form_responses(id, member_id, template_id, respondent_id, answers, submitted_at) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   (select id from form_templates where key = 'psych_checkin' and version = 1),
   (select id from ids where role = 'psychologist'),
   '{"session_notes":"confidential fixture","who5_1":3}', now());

insert into consultations(id, member_id, cycle_id, type) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', null, 'doctor'),
  ('cccccccc-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', null, 'doctor');

-- Phase 7 fixtures: a compiled performance report + the two monthly feedback
-- responses (so the §9 report/response visibility can be asserted per persona).
insert into reports(id, member_id, type, content, created_by) values
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'performance', '{"title":"Performance Report — test fixture","sections":[]}',
   (select id from ids where role = 'doctor'));
insert into form_responses(id, member_id, template_id, respondent_id, answers, submitted_at) values
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   (select id from form_templates where key = 'feedback_nutrition' and version = 1),
   (select id from ids where role = 'nutritionist'), '{"adherence":"4"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   (select id from form_templates where key = 'feedback_training' and version = 1),
   (select id from ids where role = 'trainer'), '{"adherence":"4"}', now());

-- ============ persona: DOCTOR (assigned to M1) ============
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'doctor@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('doctor: member_contacts is invisible (ever)',
  (select count(*) from member_contacts), 0);
insert into results select pg_temp.assert_eq('doctor: 0 wellbeing reports',
  (select count(*) from reports where type = 'wellbeing'), 0);
insert into results select pg_temp.assert_eq('doctor: 0 psych_checkin responses',
  (select count(*) from form_responses fr
    where fr.template_id in (select id from form_templates where key = 'psych_checkin')), 0);
insert into results select pg_temp.assert_eq('doctor: assigned member visible (control)',
  (select count(*) from members where id = '11111111-1111-4111-8111-111111111111'), 1);
insert into results select pg_temp.assert_eq('doctor: full onboarding answers visible (control)',
  (select count(*) from form_responses fr
    where fr.member_id = '11111111-1111-4111-8111-111111111111'
      and fr.template_id in (select id from form_templates where key = 'onboarding')), 1);
insert into results select pg_temp.assert_true('doctor: onboarding answers hold no contact_number (§4 split)',
  not exists (select 1 from form_responses fr
    where fr.member_id = '11111111-1111-4111-8111-111111111111'
      and fr.answers ? 'contact_number'));
insert into results select pg_temp.assert_eq('doctor: unassigned member invisible',
  (select count(*) from members where id = '22222222-2222-4222-8222-222222222222'), 0);
insert into results select pg_temp.assert_eq('doctor: unassigned member reports invisible',
  (select count(*) from reports where member_id = '22222222-2222-4222-8222-222222222222'), 0);
insert into results select pg_temp.assert_eq('doctor: unassigned member consultations invisible',
  (select count(*) from consultations where member_id = '22222222-2222-4222-8222-222222222222'), 0);
insert into results select pg_temp.assert_eq('doctor: sees the performance report (§9)',
  (select count(*) from reports where type = 'performance'), 1);
insert into results select pg_temp.assert_eq('doctor: sees both monthly feedback responses (fr_feedback_doctor)',
  (select count(*) from form_responses fr where fr.template_id in
     (select id from form_templates where key in ('feedback_nutrition','feedback_training'))), 2);

-- ============ persona: NUTRITIONIST ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'nutritionist@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('nutritionist: member_contacts is invisible (ever)',
  (select count(*) from member_contacts), 0);
insert into results select pg_temp.assert_eq('nutritionist: raw onboarding form_responses invisible',
  (select count(*) from form_responses fr
    where fr.template_id in (select id from form_templates where key = 'onboarding')), 0);
insert into results select pg_temp.assert_true('nutritionist: scoped RPC returns diet keys only',
  (select a ? 'diet_pref' and a ? 'meal_routine'
      and not a ? 'activity_level' and not a ? 'family_history' and not a ? 'contact_number'
   from get_onboarding_scoped('11111111-1111-4111-8111-111111111111') a));
insert into results select pg_temp.assert_eq('nutritionist: 0 wellbeing reports',
  (select count(*) from reports where type = 'wellbeing'), 0);
insert into results select pg_temp.assert_eq('nutritionist: sees the performance report (§9)',
  (select count(*) from reports where type = 'performance'), 1);
insert into results select pg_temp.assert_eq('nutritionist: sees own feedback draft (fr_own_clinical)',
  (select count(*) from form_responses fr where fr.template_id in
     (select id from form_templates where key = 'feedback_nutrition')), 1);

-- ============ persona: TRAINER ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'trainer@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('trainer: member_contacts is invisible (ever)',
  (select count(*) from member_contacts), 0);
insert into results select pg_temp.assert_true('trainer: scoped RPC returns activity keys only',
  (select a ? 'activity_level' and a ? 'limiting_factors'
      and not a ? 'meal_routine' and not a ? 'medications' and not a ? 'contact_number'
   from get_onboarding_scoped('11111111-1111-4111-8111-111111111111') a));
insert into results select pg_temp.assert_eq('trainer: 0 wellbeing reports',
  (select count(*) from reports where type = 'wellbeing'), 0);
insert into results select pg_temp.assert_eq('trainer: sees the performance report (§9)',
  (select count(*) from reports where type = 'performance'), 1);
insert into results select pg_temp.assert_eq('trainer: sees own feedback draft (fr_own_clinical)',
  (select count(*) from form_responses fr where fr.template_id in
     (select id from form_templates where key = 'feedback_training')), 1);

-- ============ persona: PSYCHOLOGIST ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'psychologist@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('psychologist: member_contacts is invisible (ever)',
  (select count(*) from member_contacts), 0);
insert into results select pg_temp.assert_eq('psychologist: sees the wellbeing report',
  (select count(*) from reports where type = 'wellbeing'), 1);
insert into results select pg_temp.assert_eq('psychologist: 0 non-wellbeing reports',
  (select count(*) from reports where type <> 'wellbeing'), 0);
insert into results select pg_temp.assert_true('psychologist: scoped RPC is minimal',
  (select a ? 'reason' and a ? 'condition_names'
      and not a ? 'medications' and not a ? 'meal_routine' and not a ? 'contact_number'
   from get_onboarding_scoped('11111111-1111-4111-8111-111111111111') a));

-- ============ persona: CAREGIVER ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'caregiver@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('caregiver: sees only own member',
  (select count(*) from members), 1);
insert into results select pg_temp.assert_eq('caregiver: other member invisible',
  (select count(*) from members where id = '22222222-2222-4222-8222-222222222222'), 0);
insert into results select pg_temp.assert_eq('caregiver: own member contacts visible (control)',
  (select count(*) from member_contacts), 1);
insert into results select pg_temp.assert_eq('caregiver: onboarding summary visible (control)',
  (select count(*) from reports where type = 'onboarding_summary'), 1);
insert into results select pg_temp.assert_eq('caregiver: 0 wellbeing reports',
  (select count(*) from reports where type = 'wellbeing'), 0);
insert into results select pg_temp.assert_eq('caregiver: doctor report hidden without share_with_caregiver',
  (select count(*) from reports where type = 'doctor_initial'), 0);
insert into results select pg_temp.assert_eq('caregiver: performance report hidden without share_with_caregiver',
  (select count(*) from reports where type = 'performance'), 0);

-- ============ persona: COORDINATOR ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'coordinator@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('coordinator: 0 reports of any type',
  (select count(*) from reports), 0);
insert into results select pg_temp.assert_eq('coordinator: 0 onboarding answers',
  (select count(*) from form_responses fr
    where fr.template_id in (select id from form_templates where key = 'onboarding')), 0);
insert into results select pg_temp.assert_eq('coordinator: sees all members (control)',
  (select count(*) from members), 2);
insert into results select pg_temp.assert_eq('coordinator: sees member contacts (control)',
  (select count(*) from member_contacts), 2);

-- ============ persona: MEMBER (elderly, view-only; linked to M1) ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'elder@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('member: sees own member only',
  (select count(*) from members), 1);
insert into results select pg_temp.assert_eq('member: other member invisible',
  (select count(*) from members where id = '22222222-2222-4222-8222-222222222222'), 0);
insert into results select pg_temp.assert_eq('member: member_contacts invisible (ever)',
  (select count(*) from member_contacts), 0);
insert into results select pg_temp.assert_eq('member: sees only plan-type reports (3)',
  (select count(*) from reports), 3);
insert into results select pg_temp.assert_eq('member: 0 wellbeing reports',
  (select count(*) from reports where type = 'wellbeing'), 0);
insert into results select pg_temp.assert_eq('member: 0 doctor reports',
  (select count(*) from reports where type in ('doctor_initial','doctor_review')), 0);
insert into results select pg_temp.assert_eq('member: 0 performance reports',
  (select count(*) from reports where type = 'performance'), 0);
insert into results select pg_temp.assert_eq('member: raw onboarding form_responses invisible',
  (select count(*) from form_responses fr
    where fr.template_id in (select id from form_templates where key = 'onboarding')), 0);
insert into results select pg_temp.assert_eq('member: sees own consultations (schedule)',
  (select count(*) from consultations), 1);
insert into results select pg_temp.assert_eq('member: care team via RPC = 4 (names+roles)',
  jsonb_array_length(get_care_team('11111111-1111-4111-8111-111111111111')), 4);

-- ============ persona: SUSPENDED DOCTOR ============
reset role;
update profiles set status = 'suspended' where email = 'doctor@phloem.local';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'doctor@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('suspended doctor: 0 members',
  (select count(*) from members), 0);
insert into results select pg_temp.assert_eq('suspended doctor: 0 member_contacts',
  (select count(*) from member_contacts), 0);
insert into results select pg_temp.assert_eq('suspended doctor: 0 reports',
  (select count(*) from reports), 0);
insert into results select pg_temp.assert_eq('suspended doctor: 0 consultations',
  (select count(*) from consultations), 0);
insert into results select pg_temp.assert_eq('suspended doctor: 0 form_responses of others',
  (select count(*) from form_responses
    where respondent_id is distinct from (select id from ids where email = 'doctor@phloem.local')), 0);

reset role;

-- ============ §9 cron RPC is service-only (not client-callable) ============
insert into results select pg_temp.assert_true('run_daily_jobs NOT executable by authenticated',
  not has_function_privilege('authenticated', 'public.run_daily_jobs(date)', 'execute'));
insert into results select pg_temp.assert_true('run_daily_jobs NOT executable by anon',
  not has_function_privilege('anon', 'public.run_daily_jobs(date)', 'execute'));
insert into results select pg_temp.assert_true('_build_performance NOT executable by authenticated',
  not has_function_privilege('authenticated', 'public._build_performance(uuid)', 'execute'));
insert into results select pg_temp.assert_true('get_care_team NOT executable by anon',
  not has_function_privilege('anon', 'public.get_care_team(uuid)', 'execute'));

select line from results;

rollback;
