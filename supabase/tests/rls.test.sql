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

-- ============ persona: SUSPENDED CAREGIVER (S-2/S-4 fail-closed — 0016/0017) ============
-- "suspend = instant lockout" for the caregiver persona, mirroring the doctor block.
update profiles set status = 'suspended' where email = 'caregiver@phloem.local';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from profiles where email = 'caregiver@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_eq('suspended caregiver: 0 members',
  (select count(*) from members), 0);
insert into results select pg_temp.assert_eq('suspended caregiver: 0 member_contacts',
  (select count(*) from member_contacts), 0);
insert into results select pg_temp.assert_eq('suspended caregiver: 0 reports',
  (select count(*) from reports), 0);
insert into results select pg_temp.assert_eq('suspended caregiver: 0 consultations',
  (select count(*) from consultations), 0);
insert into results select pg_temp.assert_eq('suspended caregiver: 0 form_responses',
  (select count(*) from form_responses), 0);
insert into results select pg_temp.assert_eq('suspended caregiver: 0 notifications',
  (select count(*) from notifications), 0);
-- get_care_team fails closed for the suspended caregiver (0017 null guard).
insert into results select pg_temp.assert_eq('suspended caregiver: get_care_team is empty',
  jsonb_array_length(get_care_team('11111111-1111-4111-8111-111111111111')), 0);

reset role;
update profiles set status = 'active' where email = 'caregiver@phloem.local';  -- restore for later blocks

-- ============ §9 cron RPC is service-only (not client-callable) ============
insert into results select pg_temp.assert_true('run_daily_jobs NOT executable by authenticated',
  not has_function_privilege('authenticated', 'public.run_daily_jobs(date)', 'execute'));
insert into results select pg_temp.assert_true('run_daily_jobs NOT executable by anon',
  not has_function_privilege('anon', 'public.run_daily_jobs(date)', 'execute'));
insert into results select pg_temp.assert_true('_build_performance NOT executable by authenticated',
  not has_function_privilege('authenticated', 'public._build_performance(uuid)', 'execute'));
insert into results select pg_temp.assert_true('get_care_team NOT executable by anon',
  not has_function_privilege('anon', 'public.get_care_team(uuid)', 'execute'));

-- ============ member_documents (0014): doctor + admin only ============
-- One document for M1, uploaded by the caregiver. All four clinicians are assigned
-- to M1 (fixtures above), so "0 documents" for nutritionist/trainer/psychologist
-- proves the read is doctor-scoped, not merely assignment-scoped.
reset role;
update profiles set status = 'active' where email = 'doctor@phloem.local';  -- undo the suspend fixture above
insert into member_documents(member_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_by)
  values ('11111111-1111-4111-8111-111111111111', 'blood_work', 'cbc.pdf',
          '11111111-1111-4111-8111-111111111111/fixture.pdf', 'application/pdf', 1024,
          (select id from ids where email = 'caregiver@phloem.local'));

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'caregiver@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: caregiver sees own member document',
  (select count(*) from member_documents), 1);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'doctor@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: assigned doctor sees the document',
  (select count(*) from member_documents), 1);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'nutritionist@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: nutritionist (assigned) sees 0',
  (select count(*) from member_documents), 0);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'trainer@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: trainer (assigned) sees 0',
  (select count(*) from member_documents), 0);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'psychologist@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: psychologist (assigned) sees 0',
  (select count(*) from member_documents), 0);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'coordinator@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: coordinator sees 0',
  (select count(*) from member_documents), 0);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'elder@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: member (own login) sees own document',
  (select count(*) from member_documents), 1);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'admin@phloem.local'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('doc: admin sees the document',
  (select count(*) from member_documents), 1);

reset role;

-- ============ report sharing toggle (H-3 — set_report_sharing, 0010) ============
-- A doctor report is caregiver-invisible until share_with_caregiver flips true.
-- Fixture aaaa-0002 is M1's doctor_initial; M1's caregiver is caregiver@phloem.local.
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'caregiver@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('share: caregiver 0 doctor reports before sharing',
  (select count(*) from reports where type = 'doctor_initial'), 0);

reset role;
update reports set share_with_caregiver = true where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'caregiver@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('share: caregiver sees the doctor report once shared',
  (select count(*) from reports where type = 'doctor_initial'), 1);

reset role;
update reports set share_with_caregiver = false where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where email = 'caregiver@phloem.local'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('share: hidden again after unsharing',
  (select count(*) from reports where type = 'doctor_initial'), 0);

reset role;
insert into results select pg_temp.assert_true('share: set_report_sharing NOT executable by anon',
  not has_function_privilege('anon', 'public.set_report_sharing(uuid, boolean)', 'execute'));

-- ============ admin desks (god mode): reads widen, writes do NOT ============
-- The admin shell borrows a clinician's desk in the UI (lib/lens.ts). That is a
-- presentation change only, and this section is what makes the claim true: an
-- admin must already SEE at least everything the assigned doctor sees, and must
-- still be REFUSED the two clinical writes. If a migration ever flips either
-- half, this fails loudly.
--
-- Unlike the sections above, this one resolves its own doctor/member pair from
-- whatever assignments exist rather than hard-coding M1, so it stays meaningful
-- on a project whose data has drifted from the §14 seed.
reset role;
create temp table desk_ctx(doctor_id uuid, member_id uuid, cons_id uuid, fb_id uuid);
insert into desk_ctx(doctor_id, member_id)
select a.care_user_id, a.member_id
  from assignments a join profiles p on p.id = a.care_user_id
 where p.role = 'doctor' and p.status = 'active' and a.active
 limit 1;

do $$
declare v_doc uuid; v_mem uuid; v_cons uuid; v_fb uuid; v_nutri uuid;
begin
  select doctor_id, member_id into v_doc, v_mem from desk_ctx;
  if v_doc is null then
    raise exception 'RLS TEST FAILED: no active doctor assignment to borrow a desk from';
  end if;

  select id into v_cons from consultations where member_id = v_mem and type = 'doctor' limit 1;
  if v_cons is null then
    insert into consultations(member_id, cycle_id, type) values (v_mem, null, 'doctor')
    returning id into v_cons;
  end if;

  select fr.id into v_fb from form_responses fr join form_templates t on t.id = fr.template_id
   where t.key = 'feedback_nutrition' limit 1;
  if v_fb is null then
    select id into v_nutri from profiles where role = 'nutritionist' and status = 'active' limit 1;
    insert into form_responses(member_id, template_id, respondent_id, answers, submitted_at)
    values (v_mem, (select id from form_templates where key = 'feedback_nutrition' and active
                     order by version desc limit 1),
            v_nutri, '{"adherence":"4"}', now())
    returning id into v_fb;
  end if;

  update desk_ctx set cons_id = v_cons, fb_id = v_fb;
end $$;

grant select on desk_ctx to authenticated;
create temp table desk(members bigint, reports bigint, consults bigint,
                       responses bigint, cases bigint, onboarding_keys bigint);
grant insert, select on desk to authenticated;

-- what the ASSIGNED DOCTOR can see
select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from desk_ctx), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into desk select
  (select count(*) from members),
  (select count(*) from reports        where member_id = (select member_id from desk_ctx)),
  (select count(*) from consultations  where member_id = (select member_id from desk_ctx)),
  (select count(*) from form_responses where member_id = (select member_id from desk_ctx)),
  (select count(*) from member_cases   where member_id = (select member_id from desk_ctx)),
  (select count(*) from jsonb_object_keys(
     coalesce(get_onboarding_scoped((select member_id from desk_ctx)), '{}'::jsonb)));

-- what the ADMIN can see, standing at that desk
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'admin' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;

insert into results select pg_temp.assert_true('desk: admin sees >= doctor (members)',
  (select count(*) from members) >= (select members from desk));
insert into results select pg_temp.assert_true('desk: admin sees >= doctor (reports)',
  (select count(*) from reports where member_id = (select member_id from desk_ctx))
    >= (select reports from desk));
insert into results select pg_temp.assert_true('desk: admin sees >= doctor (consultations)',
  (select count(*) from consultations where member_id = (select member_id from desk_ctx))
    >= (select consults from desk));
insert into results select pg_temp.assert_true('desk: admin sees >= doctor (form_responses)',
  (select count(*) from form_responses where member_id = (select member_id from desk_ctx))
    >= (select responses from desk));
insert into results select pg_temp.assert_true('desk: admin sees >= doctor (cases)',
  (select count(*) from member_cases where member_id = (select member_id from desk_ctx))
    >= (select cases from desk));
insert into results select pg_temp.assert_true('desk: admin sees >= doctor (onboarding fields)',
  (select count(*) from jsonb_object_keys(
     coalesce(get_onboarding_scoped((select member_id from desk_ctx)), '{}'::jsonb)))
    >= (select onboarding_keys from desk));
insert into results select pg_temp.assert_true('desk: admin reads assignments (caseload reconstruction)',
  (select count(*) from assignments where active) > 0);

-- The read-only half. Both must refuse with exactly `not_allowed` — the identity
-- gate — not a sequencing error that a fixture change could later mask.
do $$
declare msg text;
begin
  begin
    perform submit_clinical_form((select cons_id from desk_ctx), '{}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: admin must be refused submit_clinical_form — got %', msg;
  end if;
  insert into results values ('PASS  desk: admin REFUSED submit_clinical_form');

  begin
    perform submit_feedback((select fb_id from desk_ctx));
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: admin must be refused submit_feedback — got %', msg;
  end if;
  insert into results values ('PASS  desk: admin REFUSED submit_feedback');
end $$;

-- Regression: widening the admin's shells must not have widened anyone else's.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'coordinator' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_eq('desk: coordinator still sees 0 reports',
  (select count(*) from reports), 0);
insert into results select pg_temp.assert_eq('desk: coordinator still sees 0 clinical form responses',
  (select count(*) from form_responses), 0);

-- ============ 0035 record correction ============
-- Self-fixturing and id-agnostic on purpose. The blocks above this one hardcode
-- the §14 seed UUIDs; this one resolves a real member and caregiver at runtime so
-- it keeps working on a database that has moved on from the seed baseline.
reset role;
create temp table t35 as
with cg1 as (
  select m.id as member_id, m.caregiver_id
    from members m join profiles p on p.id = m.caregiver_id
   where p.role = 'caregiver' and p.status = 'active'
   order by m.created_at limit 1
)
select
  (select member_id    from cg1)                                            as m1,
  (select caregiver_id from cg1)                                            as cg,
  (select m.id from members m join profiles p on p.id = m.caregiver_id
    where p.role = 'caregiver' and p.status = 'active'
      and m.caregiver_id <> (select caregiver_id from cg1)
    order by m.created_at limit 1)                                          as m_other,
  (select id from profiles where role = 'doctor'      and status = 'active' limit 1) as doc,
  (select id from profiles where role = 'coordinator' and status = 'active' limit 1) as coord,
  (select id from profiles where role = 'admin'       and status = 'active' limit 1) as adm;
grant select on t35 to authenticated;
do $$ begin
  if (select m1 is null or cg is null or m_other is null or doc is null or coord is null or adm is null from t35) then
    raise exception 'RLS TEST FAILED: 0035 fixtures missing — %', (select row_to_json(t35) from t35);
  end if;
end $$;

-- A clinician may not edit a member at all.
select set_config('request.jwt.claims',
  json_build_object('sub', (select doc from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  begin
    perform update_member((select m1 from t35), '{"city":"Chennai"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: doctor must be refused update_member — got %', msg;
  end if;
  insert into results values ('PASS  edit: doctor REFUSED update_member');
end $$;

-- A coordinator may VIEW contacts (§3 gives them 👁) but never write them.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select coord from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  begin
    perform update_member_contacts((select m1 from t35), '{"phone":"+910000000001"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: coordinator must be refused update_member_contacts — got %', msg;
  end if;
  insert into results values ('PASS  edit: coordinator REFUSED update_member_contacts');
end $$;

-- The caregiver half of the field split: soft fields yes, identity no, and only
-- ever on their own member.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select cg from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text; v_m uuid; v_old text;
begin
  select m1 into v_m from t35;

  -- Derived from the stored value so it is guaranteed to differ; an edit to the
  -- value already there raises no_changes and would fail this for the wrong reason.
  select city into v_old from members where id = v_m;
  perform update_member(v_m, jsonb_build_object('city', coalesce(v_old, '') || '-RLSTEST'));
  insert into results values ('PASS  edit: caregiver CAN change city on their own member');

  begin
    perform update_member(v_m, '{"full_name":"Someone Else"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'field_not_allowed' then
    raise exception 'RLS TEST FAILED: caregiver must not rename a member — got %', msg;
  end if;
  insert into results values ('PASS  edit: caregiver REFUSED full_name (field_not_allowed)');

  begin
    perform update_member((select m_other from t35), '{"city":"Chennai"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: caregiver must not edit another member — got %', msg;
  end if;
  insert into results values ('PASS  edit: caregiver REFUSED a member that is not theirs');

  begin
    perform update_my_profile('{"role":"admin"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'field_not_allowed' then
    raise exception 'RLS TEST FAILED: update_my_profile must refuse role — got %', msg;
  end if;
  insert into results values ('PASS  edit: update_my_profile REFUSED role (no self-promotion)');
end $$;

-- A rename must not become a back door into the duplicate state 0034 closed.
-- Both sides are created here, so the assertion does not depend on any existing
-- member's name or status.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select adm from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text; v_cg uuid; v_a uuid; v_b uuid;
begin
  select cg into v_cg from t35;
  insert into members(full_name, caregiver_id, status)
  values ('RLS Twin A', v_cg, 'onboarding') returning id into v_a;
  insert into members(full_name, caregiver_id, status)
  values ('RLS Twin B', v_cg, 'onboarding') returning id into v_b;

  begin
    perform update_member(v_b, '{"full_name":"RLS Twin A"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'duplicate_member' then
    raise exception 'RLS TEST FAILED: rename onto an existing member must raise duplicate_member — got %', msg;
  end if;
  insert into results values ('PASS  edit: rename onto an existing member REFUSED (duplicate_member)');

  begin
    perform update_member(v_a, '{"age":"abc"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'bad_age' then
    raise exception 'RLS TEST FAILED: non-numeric age must raise bad_age — got %', msg;
  end if;
  insert into results values ('PASS  edit: non-numeric age REFUSED (bad_age, not a raw cast error)');
end $$;

-- The 0017 regression that matters most: auth_role() is NULL for a suspended
-- profile, and `NULL not in (...)` is NULL — so a guard written that way is
-- SKIPPED and the function proceeds. All four must refuse.
reset role;
update profiles set status = 'suspended' where id = (select adm from t35);
select set_config('request.jwt.claims',
  json_build_object('sub', (select adm from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text; fn text;
begin
  foreach fn in array array['update_member','update_member_contacts',
                            'update_my_profile','admin_update_profile'] loop
    begin
      if fn = 'update_member' then
        perform update_member((select m1 from t35), '{"city":"X"}'::jsonb);
      elsif fn = 'update_member_contacts' then
        perform update_member_contacts((select m1 from t35), '{"phone":"1"}'::jsonb);
      elsif fn = 'update_my_profile' then
        perform update_my_profile('{"full_name":"X"}'::jsonb);
      else
        perform admin_update_profile((select doc from t35), '{"full_name":"X"}'::jsonb);
      end if;
      msg := 'no error';
    exception when others then msg := SQLERRM;
    end;
    if msg <> 'not_allowed' then
      raise exception 'RLS TEST FAILED: suspended admin must be refused % — got %', fn, msg;
    end if;
    insert into results values ('PASS  edit: suspended admin REFUSED ' || fn);
  end loop;
end $$;
reset role;
update profiles set status = 'active' where id = (select adm from t35);

-- ============ 0037-0040 identity operations ============
-- Reuses t35 (resolved at runtime above). Adds a member that has SUBMITTED
-- onboarding, for amend_onboarding. Nothing here depends on seed UUIDs.
reset role;
create temp table tid as
select (select fr.member_id from form_responses fr join form_templates t on t.id = fr.template_id
         where t.key = 'onboarding' and fr.submitted_at is not null
         order by fr.submitted_at desc limit 1) as onboarded_member,
       (select p.id from profiles p where p.role = 'caregiver' and p.status = 'active'
          and p.id <> (select cg from t35) limit 1) as cg_other;
grant select on tid to authenticated;
do $$ begin
  if (select onboarded_member is null or cg_other is null from tid) then
    raise exception 'RLS TEST FAILED: identity-ops fixtures missing — %', (select row_to_json(tid) from tid);
  end if;
end $$;

-- sync_my_email: no identity at all is refused (0017 net for a NULL auth_role).
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
do $$ declare msg text; begin
  begin perform sync_my_email(); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'not_allowed' then raise exception 'RLS TEST FAILED: no identity must be refused sync_my_email — got %', msg; end if;
  insert into results values ('PASS  idops: no identity REFUSED sync_my_email');
end $$;

-- A caregiver may not use the admin email function, nor move a member.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select cg from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare msg text; begin
  begin perform admin_set_profile_email((select doc from t35), 'x@example.test'); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'not_allowed' then raise exception 'RLS TEST FAILED: caregiver must be refused admin_set_profile_email — got %', msg; end if;
  insert into results values ('PASS  idops: caregiver REFUSED admin_set_profile_email');
end $$;

-- A coordinator may not move a member to another family login.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select coord from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare msg text; begin
  begin perform transfer_caregiver((select m1 from t35), (select cg_other from tid)); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'not_allowed' then raise exception 'RLS TEST FAILED: coordinator must be refused transfer_caregiver — got %', msg; end if;
  insert into results values ('PASS  idops: coordinator REFUSED transfer_caregiver');

  begin perform replace_caregiver_invite((select m1 from t35), 'new@example.test'); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'not_allowed' then raise exception 'RLS TEST FAILED: coordinator must be refused replace_caregiver_invite — got %', msg; end if;
  insert into results values ('PASS  idops: coordinator REFUSED replace_caregiver_invite');
end $$;

-- A clinician may not amend onboarding answers.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select doc from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare msg text; begin
  begin perform amend_onboarding((select onboarded_member from tid), '{"sleep_hours":"7"}'::jsonb, 'x'); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'not_allowed' then raise exception 'RLS TEST FAILED: doctor must be refused amend_onboarding — got %', msg; end if;
  insert into results values ('PASS  idops: doctor REFUSED amend_onboarding');
end $$;

-- Even an admin may not put a contact identifier back into the answers a doctor
-- reads (§3), nor amend a family's consent.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select adm from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare msg text; begin
  begin perform amend_onboarding((select onboarded_member from tid), '{"contact_number":"+910000000000"}'::jsonb, 'x'); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'field_not_allowed' then raise exception 'RLS TEST FAILED: contact identifier must be refused by amend_onboarding — got %', msg; end if;
  insert into results values ('PASS  idops: amend_onboarding REFUSED a contact identifier (no PHI back into answers)');

  begin perform amend_onboarding((select onboarded_member from tid), '{"consent":false}'::jsonb, 'x'); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'field_not_allowed' then raise exception 'RLS TEST FAILED: consent must be refused by amend_onboarding — got %', msg; end if;
  insert into results values ('PASS  idops: amend_onboarding REFUSED consent');

  -- m1 has a caregiver, so it is past 'invited': replacing its invite would let the
  -- live accept_invite reset it.
  begin perform replace_caregiver_invite((select m1 from t35), 'new@example.test'); msg := 'no error'; exception when others then msg := SQLERRM; end;
  if msg <> 'member_past_invited' then raise exception 'RLS TEST FAILED: replace_caregiver_invite must refuse a member past invited — got %', msg; end if;
  insert into results values ('PASS  idops: replace_caregiver_invite REFUSED a member past invited');
end $$;

-- 0017 net: a suspended admin is refused every identity operation.
reset role;
update profiles set status = 'suspended' where id = (select adm from t35);
select set_config('request.jwt.claims',
  json_build_object('sub', (select adm from t35), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text; fn text;
begin
  foreach fn in array array['admin_set_profile_email','transfer_caregiver','amend_onboarding','replace_caregiver_invite'] loop
    begin
      if fn = 'admin_set_profile_email' then
        perform admin_set_profile_email((select doc from t35), 'x@example.test');
      elsif fn = 'transfer_caregiver' then
        perform transfer_caregiver((select m1 from t35), (select cg_other from tid));
      elsif fn = 'replace_caregiver_invite' then
        perform replace_caregiver_invite((select m1 from t35), 'x@example.test');
      else
        perform amend_onboarding((select onboarded_member from tid), '{"sleep_hours":"7"}'::jsonb, 'x');
      end if;
      msg := 'no error';
    exception when others then msg := SQLERRM;
    end;
    if msg <> 'not_allowed' then
      raise exception 'RLS TEST FAILED: suspended admin must be refused % — got %', fn, msg;
    end if;
    insert into results values ('PASS  idops: suspended admin REFUSED ' || fn);
  end loop;
end $$;
reset role;
update profiles set status = 'active' where id = (select adm from t35);

reset role;

-- ============ 0036: add_manual_doctor_review ============
-- Only the assigned, active doctor files a manual review; only after an initial
-- doctor report; it submits the page's draft and never invents a consultation.
update profiles set status = 'active' where email in ('doctor@phloem.local', 'nutritionist@phloem.local');
create temp table mdr as select
  (select id from profiles where email = 'doctor@phloem.local')       as doctor_id,
  (select id from profiles where email = 'nutritionist@phloem.local') as nutri_id,
  (select id from profiles where email = 'admin@phloem.local')        as admin_id,
  gen_random_uuid() as m_ok, gen_random_uuid() as m_bare, gen_random_uuid() as m_other,
  gen_random_uuid() as draft_id;
grant select on mdr to authenticated;

insert into members(id, full_name, status)
  select m_ok,    'MDR intake done — test fixture', 'initial_consults'::member_status from mdr union all
  select m_bare,  'MDR no intake — test fixture',   'assigned'::member_status         from mdr union all
  select m_other, 'MDR unassigned — test fixture',  'initial_consults'::member_status from mdr;
insert into assignments(member_id, care_user_id, care_role)
  select m_ok,   doctor_id, 'doctor'::care_role       from mdr union all
  select m_bare, doctor_id, 'doctor'::care_role       from mdr union all
  select m_ok,   nutri_id,  'nutritionist' from mdr;
insert into reports(member_id, type, content, created_by)
  select m_ok,    'doctor_initial'::report_type, '{"title":"t","clearance":"cleared","sections":[]}'::jsonb, doctor_id from mdr union all
  select m_other, 'doctor_initial', '{"title":"t","clearance":"cleared","sections":[]}', doctor_id from mdr;
insert into form_responses(id, member_id, template_id, respondent_id, answers)
  select draft_id, m_ok, (select id from form_templates where key = 'doctor_review' and active
                           order by version desc limit 1), doctor_id, '{}' from mdr;

create function pg_temp.mdr_call(p_member uuid, p_summary text) returns text language plpgsql as $$
begin
  perform add_manual_doctor_review(p_member, jsonb_build_object('review_summary', p_summary),
                                   '{"title":"t","sections":[]}'::jsonb);
  return 'ok';
exception when others then return SQLERRM;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from mdr), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('manual review: doctor refused without an initial report',
  pg_temp.mdr_call((select m_bare from mdr), 'x') = 'initial_report_missing');
insert into results select pg_temp.assert_true('manual review: doctor refused for an unassigned member',
  pg_temp.mdr_call((select m_other from mdr), 'x') = 'not_allowed');
insert into results select pg_temp.assert_true('manual review: empty review summary refused',
  pg_temp.mdr_call((select m_ok from mdr), '  ') = 'bad_content');
insert into results select pg_temp.assert_true('manual review: assigned doctor files it',
  pg_temp.mdr_call((select m_ok from mdr), 'Follow-up held by phone') = 'ok');

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select nutri_id from mdr), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('manual review: assigned nutritionist refused',
  pg_temp.mdr_call((select m_ok from mdr), 'x') = 'not_allowed');

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_id from mdr), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('manual review: admin refused (borrowed desks are read-only)',
  pg_temp.mdr_call((select m_ok from mdr), 'x') = 'not_allowed');

reset role;
update profiles set status = 'suspended' where email = 'doctor@phloem.local';
select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from mdr), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('manual review: suspended doctor refused',
  pg_temp.mdr_call((select m_ok from mdr), 'x') = 'not_allowed');

reset role;
update profiles set status = 'active' where email = 'doctor@phloem.local';
insert into results select pg_temp.assert_true('manual review: NOT executable by anon',
  not has_function_privilege('anon', 'public.add_manual_doctor_review(uuid,jsonb,jsonb)', 'execute'));
insert into results select pg_temp.assert_eq('manual review: exactly one doctor_review report filed',
  (select count(*) from reports where member_id = (select m_ok from mdr) and type = 'doctor_review'), 1);
insert into results select pg_temp.assert_eq('manual review: the page draft was the row submitted',
  (select count(*) from form_responses where id = (select draft_id from mdr)
      and consultation_id is null and submitted_at is not null), 1);
insert into results select pg_temp.assert_eq('manual review: no second doctor_review response row',
  (select count(*) from form_responses fr join form_templates t on t.id = fr.template_id
    where fr.member_id = (select m_ok from mdr) and t.key = 'doctor_review'), 1);
insert into results select pg_temp.assert_eq('manual review: no consultation invented',
  (select count(*) from consultations where member_id = (select m_ok from mdr)), 0);
insert into results select pg_temp.assert_eq('manual review: audited as manual',
  (select count(*) from audit_log where action = 'clinical_form.submitted'
      and entity_id = (select draft_id from mdr) and meta->>'manual' = 'true'), 1);

-- ============ 0045: amend_clinical_report ============
-- The author corrects their own latest version and nobody else does: no other
-- clinician, no admin, no suspended account, no fork of an old version. The
-- original rows are never touched, the trend shows only the corrected reading,
-- and the notification reaches only people who may read the document.
update profiles set status = 'active'
 where email in ('doctor@phloem.local','nutritionist@phloem.local',
                 'trainer@phloem.local','psychologist@phloem.local');
create temp table amd as select
  (select id from profiles where email = 'doctor@phloem.local')       as doctor_id,
  (select id from profiles where email = 'nutritionist@phloem.local') as nutri_id,
  (select id from profiles where email = 'trainer@phloem.local')      as trainer_id,
  (select id from profiles where email = 'psychologist@phloem.local') as psych_id,
  (select id from profiles where email = 'admin@phloem.local')        as admin_id,
  -- Stands in as the family: the caregiver branch notifies members.caregiver_id,
  -- whoever that profile is, and no caregiver login is seeded.
  (select id from profiles where email = 'coordinator@phloem.local')  as family_id,
  gen_random_uuid() as m_ok, gen_random_uuid() as m_other,
  gen_random_uuid() as r_doc, gen_random_uuid() as r_nut, gen_random_uuid() as r_trn,
  gen_random_uuid() as r_psy, gen_random_uuid() as r_foreign, gen_random_uuid() as r_other,
  gen_random_uuid() as f_doc, gen_random_uuid() as f_nut, gen_random_uuid() as f_trn,
  gen_random_uuid() as f_psy, gen_random_uuid() as f_foreign, gen_random_uuid() as f_other;
grant select on amd to authenticated;

insert into members(id, full_name, status, caregiver_id)
  select m_ok,    'AMD assigned — test fixture',   'initial_consults'::member_status, family_id from amd union all
  select m_other, 'AMD unassigned — test fixture', 'initial_consults'::member_status, null      from amd;
insert into assignments(member_id, care_user_id, care_role)
  select m_ok, doctor_id,  'doctor'::care_role from amd union all
  select m_ok, nutri_id,   'nutritionist'      from amd union all
  select m_ok, trainer_id, 'trainer'           from amd union all
  select m_ok, psych_id,   'psychologist'      from amd;

create function pg_temp.tmpl(k text) returns uuid language sql as $$
  select id from form_templates where key = k and active order by version desc limit 1
$$;
insert into form_responses(id, member_id, template_id, respondent_id, answers, submitted_at)
  select f_doc, m_ok, pg_temp.tmpl('doctor_initial'), doctor_id,
         '{"clinical_summary":"Stable","bp":"184/92","clearance":"cleared","date":"2026-09-01"}'::jsonb, now() from amd union all
  select f_nut, m_ok, pg_temp.tmpl('nutritionist_initial'), nutri_id,
         '{"assessment_summary":"Low protein","protein_target_g":"40"}', now() from amd union all
  select f_trn, m_ok, pg_temp.tmpl('trainer_initial'), trainer_id,
         '{"assessment_summary":"Unsteady","sit_to_stand":"6"}', now() from amd union all
  select f_psy, m_ok, pg_temp.tmpl('psych_checkin'), psych_id,
         '{"session_notes":"confidential","mood":"3"}', now() from amd union all
  select f_foreign, m_ok, pg_temp.tmpl('doctor_initial'), admin_id,
         '{"clinical_summary":"By admin","clearance":"cleared"}', now() from amd union all
  select f_other, m_other, pg_temp.tmpl('doctor_initial'), doctor_id,
         '{"clinical_summary":"Elsewhere","clearance":"cleared"}', now() from amd;
insert into reports(id, member_id, type, content, created_by, form_response_id, share_with_caregiver)
  select r_doc, m_ok, 'doctor_initial'::report_type,
         '{"title":"t","clearance":"cleared","sections":[]}'::jsonb, doctor_id, f_doc, true from amd union all
  select r_nut, m_ok, 'nutrition_plan', '{"title":"t","sections":[]}', nutri_id, f_nut, false from amd union all
  select r_trn, m_ok, 'training_plan',  '{"title":"t","sections":[]}', trainer_id, f_trn, false from amd union all
  select r_psy, m_ok, 'wellbeing',      '{"title":"t","sections":[]}', psych_id, f_psy, false from amd union all
  select r_foreign, m_ok, 'doctor_initial',
         '{"title":"t","clearance":"cleared","sections":[]}', admin_id, f_foreign, false from amd union all
  select r_other, m_other, 'doctor_initial',
         '{"title":"t","clearance":"cleared","sections":[]}', doctor_id, f_other, false from amd;

create function pg_temp.amd_call(p_report uuid, p_answers jsonb, p_reason text) returns text
language plpgsql as $$
begin
  -- p_report_content NULL: exercises the _report_stub fallback path in SQL.
  perform amend_clinical_report(p_report, p_answers, p_reason, null);
  return 'ok';
exception when others then return SQLERRM;
end $$;
create function pg_temp.amd_v2() returns uuid language sql as $$
  select id from reports where supersedes = (select r_doc from amd)
$$;

select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from amd), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('amend: doctor refused for an unassigned member',
  pg_temp.amd_call((select r_other from amd), '{"clinical_summary":"x"}', 'r') = 'not_allowed');
insert into results select pg_temp.assert_true('amend: doctor refused another clinician''s report',
  pg_temp.amd_call((select r_nut from amd), '{"assessment_summary":"x"}', 'r') = 'not_allowed');
insert into results select pg_temp.assert_true('amend: doctor refused a doctor report someone else wrote',
  pg_temp.amd_call((select r_foreign from amd), '{"clinical_summary":"x"}', 'r') = 'not_allowed');
insert into results select pg_temp.assert_true('amend: blank reason refused',
  pg_temp.amd_call((select r_doc from amd), '{"clinical_summary":"x"}', '   ') = 'summary_required');
insert into results select pg_temp.assert_true('amend: unchanged answers refused',
  pg_temp.amd_call((select r_doc from amd),
    '{"clinical_summary":"Stable","bp":"184/92","clearance":"cleared","date":"2026-09-01"}', 'r') = 'no_changes');
insert into results select pg_temp.assert_true('amend: author corrects their own report',
  pg_temp.amd_call((select r_doc from amd),
    '{"clinical_summary":"Stable","bp":"148/92","clearance":"cleared","date":"2026-09-01"}', 'BP typo') = 'ok');
insert into results select pg_temp.assert_true('amend: superseded version refused (no fork)',
  pg_temp.amd_call((select r_doc from amd), '{"clinical_summary":"again"}', 'r') = 'not_latest_version');
insert into results select pg_temp.assert_eq('amend: trend carries ONE systolic reading, not two',
  (select count(*) from get_measure_series((select m_ok from amd), 'clinical') where measure_key = 'bp_systolic'), 1);
insert into results select pg_temp.assert_true('amend: and it is the corrected one',
  (select value from get_measure_series((select m_ok from amd), 'clinical') where measure_key = 'bp_systolic') = 148);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_id from amd), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('amend: admin refused (borrowed desks are read-only)',
  pg_temp.amd_call(pg_temp.amd_v2(), '{"clinical_summary":"x"}', 'r') = 'not_allowed');

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select nutri_id from amd), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('amend: nutritionist refused the doctor''s report',
  pg_temp.amd_call(pg_temp.amd_v2(), '{"clinical_summary":"x"}', 'r') = 'not_allowed');
insert into results select pg_temp.assert_true('amend: nutritionist corrects their own plan',
  pg_temp.amd_call((select r_nut from amd), '{"assessment_summary":"Low protein","protein_target_g":"60"}', 'target') = 'ok');

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select trainer_id from amd), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('amend: trainer corrects their own plan (clearance held)',
  pg_temp.amd_call((select r_trn from amd), '{"assessment_summary":"Unsteady","sit_to_stand":"8"}', 'count') = 'ok');

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select psych_id from amd), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('amend: psychologist corrects their own wellbeing report',
  pg_temp.amd_call((select r_psy from amd), '{"session_notes":"confidential","mood":"4"}', 'mood') = 'ok');

reset role;
update profiles set status = 'suspended' where email = 'doctor@phloem.local';
select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from amd), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('amend: suspended doctor refused',
  pg_temp.amd_call(pg_temp.amd_v2(), '{"clinical_summary":"x"}', 'r') = 'not_allowed');

reset role;
update profiles set status = 'active' where email = 'doctor@phloem.local';
insert into results select pg_temp.assert_true('amend: NOT executable by anon',
  not has_function_privilege('anon', 'public.amend_clinical_report(uuid,jsonb,text,jsonb)', 'execute'));
insert into results select pg_temp.assert_eq('amend: v2 supersedes v1, keeps sharing, links its answers',
  (select count(*) from reports r join form_responses fr on fr.id = r.form_response_id
    where r.id = pg_temp.amd_v2() and r.version = 2 and r.share_with_caregiver
      and r.created_by = (select doctor_id from amd)
      and r.content->>'amended_reason' = 'BP typo'
      and fr.supersedes = (select f_doc from amd) and fr.answers->>'bp' = '148/92'), 1);
insert into results select pg_temp.assert_eq('amend: the original report and answers are untouched',
  (select count(*) from reports r join form_responses fr on fr.id = r.form_response_id
    where r.id = (select r_doc from amd) and r.version = 1
      and r.content = '{"title":"t","clearance":"cleared","sections":[]}'::jsonb
      and fr.answers->>'bp' = '184/92'), 1);
insert into results select pg_temp.assert_eq('amend: doctor report notifies its readers + the family it was shared with',
  (select count(*) from notifications where link = '/reports/' || pg_temp.amd_v2()
      and user_id in (select nutri_id from amd union all select trainer_id from amd
                      union all select family_id from amd)), 3);
insert into results select pg_temp.assert_eq('amend: psychologist and the author are not notified of it',
  (select count(*) from notifications where link = '/reports/' || pg_temp.amd_v2()
      and user_id in (select psych_id from amd union all select doctor_id from amd)), 0);
insert into results select pg_temp.assert_eq('amend: nutrition plan correction never reaches the psychologist',
  (select count(*) from notifications n join reports r on n.link = '/reports/' || r.id
    where r.supersedes = (select r_nut from amd) and n.user_id = (select psych_id from amd)), 0);
insert into results select pg_temp.assert_eq('amend: wellbeing correction tells no one outside admin',
  (select count(*) from notifications n join reports r on n.link = '/reports/' || r.id
     join profiles p on p.id = n.user_id
    where r.supersedes = (select r_psy from amd) and p.role <> 'admin'), 0);
insert into results select pg_temp.assert_eq('amend: audited with changed KEYS only, never values',
  (select count(*) from audit_log where action = 'clinical_report.amended'
      and entity_id = pg_temp.amd_v2()
      and meta->'fields' = '["bp"]'::jsonb and meta::text not like '%148%'), 1);

-- ============ 0046: the doctor's initial report starts the program ============
-- The doctor's intake starts it (from the day after the consultation) and nothing
-- else does; it never restarts; only an admin backdates, which rebuilds the cycles
-- as they would have been and files a hand-made review under its cycle; only roles
-- whose plan has started get a review round, monthly feedback, or a "pending" line.
reset role;
select set_config('request.jwt.claims', '', true);
update profiles set status = 'active'
 where email in ('doctor@phloem.local','nutritionist@phloem.local',
                 'admin@phloem.local','coordinator@phloem.local');
create temp table pst as select
  (select id from profiles where email = 'doctor@phloem.local')       as doctor_id,
  (select id from profiles where email = 'nutritionist@phloem.local') as nutri_id,
  (select id from profiles where email = 'admin@phloem.local')        as admin_id,
  -- stands in as the family, as in the 0045 block: no caregiver login is seeded
  (select id from profiles where email = 'coordinator@phloem.local')  as coord_id,
  (now() at time zone 'Asia/Kolkata')::date                           as today,
  gen_random_uuid() as m_auto, gen_random_uuid() as m_nut, gen_random_uuid() as m_back,
  gen_random_uuid() as c_doc, gen_random_uuid() as c_doc2, gen_random_uuid() as c_nut,
  gen_random_uuid() as c_nut_only, gen_random_uuid() as c_back_doc,
  gen_random_uuid() as c_back_stray, gen_random_uuid() as c_back_nut,
  gen_random_uuid() as r_manual;
grant select on pst to authenticated;

insert into members(id, full_name, status, caregiver_id)
  select m_auto, 'PST auto — test fixture',           'assigned'::member_status, coord_id from pst union all
  select m_nut,  'PST nutrition only — test fixture', 'assigned',                coord_id from pst union all
  select m_back, 'PST backdate — test fixture',       'initial_consults',        coord_id from pst;
insert into packages(member_id, duration_months)
  select m_auto, 3 from pst union all select m_nut, 3 from pst union all select m_back, 3 from pst;
insert into assignments(member_id, care_user_id, care_role)
  select m_auto, doctor_id, 'doctor'::care_role from pst union all
  select m_auto, nutri_id,  'nutritionist'      from pst union all
  select m_nut,  nutri_id,  'nutritionist'      from pst union all
  select m_back, doctor_id, 'doctor'            from pst union all
  select m_back, nutri_id,  'nutritionist'      from pst;
insert into consultations(id, member_id, cycle_id, type, meeting_status, completed_at, report_status)
  -- m_auto: the doctor saw them yesterday; the rest held today
  select c_doc,  m_auto, null::uuid, 'doctor'::care_role, 'done'::meeting_status,
         now() - interval '1 day', 'pending'::submit_status from pst union all
  select c_doc2, m_auto, null, 'doctor',       'done', now(), 'pending' from pst union all
  select c_nut,  m_auto, null, 'nutritionist', 'done', now(), 'pending' from pst union all
  select c_nut_only, m_nut, null, 'nutritionist', 'done', now(), 'pending' from pst union all
  -- m_back: intake 51 days ago, never started; a stray re-assignment intake; no nutrition plan
  select c_back_doc,   m_back, null, 'doctor',       'done',        now() - interval '51 days', 'submitted' from pst union all
  select c_back_stray, m_back, null, 'doctor',       'to_schedule', null, 'pending' from pst union all
  select c_back_nut,   m_back, null, 'nutritionist', 'to_schedule', null, 'pending' from pst;
insert into reports(member_id, type, content, created_by)
  select m_back, 'doctor_initial'::report_type,
         '{"title":"t","clearance":"cleared","sections":[]}'::jsonb, doctor_id from pst;
insert into reports(id, member_id, type, content, created_by)  -- a 0036 hand-made review, today
  select r_manual, m_back, 'doctor_review'::report_type, '{"title":"t","sections":[]}'::jsonb, doctor_id from pst;

create function pg_temp.pst_try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return SQLERRM; end $$;
create function pg_temp.pst_pkg(m uuid) returns uuid language sql as $$
  select id from packages where member_id = m $$;
create function pg_temp.pst_cycle(m uuid, n int) returns uuid language sql as $$
  select c.id from cycles c join packages p on p.id = c.package_id where p.member_id = m and c.number = n $$;

-- the doctor submits the intake (and, later, a second one)
select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from pst), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('program: the doctor submits the intake',
  submit_clinical_form((select c_doc from pst), '{"clinical_summary":"Stable","clearance":"cleared"}',
                       '{"title":"t","clearance":"cleared","sections":[]}') is not null);

reset role;
select set_config('request.jwt.claims', '', true);
insert into results select pg_temp.assert_true('program: the intake starts it, the day after the consultation',
  (select status = 'active' and start_date = (select today from pst)
     from packages where member_id = (select m_auto from pst)));
insert into results select pg_temp.assert_eq('program: 3 cycles, cycle 1 active, the rest upcoming',
  (select count(*) from cycles where package_id = pg_temp.pst_pkg((select m_auto from pst))
      and ((number = 1 and status = 'active') or (number > 1 and status = 'upcoming'))), 3);
insert into results select pg_temp.assert_true('program: the member is active',
  (select status = 'active' from members where id = (select m_auto from pst)));
insert into results select pg_temp.assert_true('program: audited as a doctor_initial start, nutrition + training not started',
  exists (select 1 from audit_log
           where action = 'program.activated' and entity_id = pg_temp.pst_pkg((select m_auto from pst))
             and meta->>'source' = 'doctor_initial'
             and meta->'not_started' ? 'nutritionist' and meta->'not_started' ? 'trainer'));
insert into results select pg_temp.assert_eq('program: the family is told it has started',
  (select count(*) from notifications
    where dedupe_key = 'start:' || pg_temp.pst_pkg((select m_auto from pst)) || ':caregiver'), 1);
insert into results select pg_temp.assert_eq('program: coordinators are told it started automatically',
  (select count(*) from notifications
    where dedupe_key = 'start:' || pg_temp.pst_pkg((select m_auto from pst)) || ':staff:' || (select coord_id from pst)), 1);
insert into results select pg_temp.assert_true('program: the new report is linked to its answers (0045 column)',
  (select form_response_id is not null from reports
    where member_id = (select m_auto from pst) and type = 'doctor_initial'));

-- nutritionist reports start nothing
select set_config('request.jwt.claims',
  json_build_object('sub', (select nutri_id from pst), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('program: nutritionist plans submit',
  submit_clinical_form((select c_nut_only from pst), '{"assessment_summary":"x"}', '{"title":"t","sections":[]}') is not null
  and submit_clinical_form((select c_nut from pst), '{"assessment_summary":"x"}', '{"title":"t","sections":[]}') is not null);
reset role;
insert into results select pg_temp.assert_true('program: only the doctor''s intake starts it',
  (select status = 'not_started' from packages where member_id = (select m_nut from pst)));

-- a second doctor intake never restarts it
select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from pst), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('program: a second doctor intake submits',
  submit_clinical_form((select c_doc2 from pst), '{"clinical_summary":"Again","clearance":"cleared"}',
                       '{"title":"t","clearance":"cleared","sections":[]}') is not null);
reset role;
insert into results select pg_temp.assert_true('program: ...and never restarts it',
  (select count(*) = 1 and bool_and(start_date = (select today from pst))
     from packages where member_id = (select m_auto from pst))
  and (select count(*) = 3 from cycles where package_id = pg_temp.pst_pkg((select m_auto from pst))));

-- backdating: admin only, never beyond tomorrow, once
select set_config('request.jwt.claims',
  json_build_object('sub', (select coord_id from pst), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('program: a coordinator cannot backdate',
  pg_temp.pst_try(format('select activate_program(%L, %L::date)',
                         (select m_back from pst), (select today - 50 from pst))) = 'not_allowed');
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_id from pst), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('program: no start later than tomorrow',
  pg_temp.pst_try(format('select activate_program(%L, %L::date)',
                         (select m_back from pst), (select today + 5 from pst))) = 'bad_start');
insert into results select pg_temp.assert_true('program: an admin backdates 50 days',
  pg_temp.pst_try(format('select activate_program(%L, %L::date)',
                         (select m_back from pst), (select today - 50 from pst))) = 'ok');
insert into results select pg_temp.assert_true('program: a running package cannot be started again',
  pg_temp.pst_try(format('select activate_program(%L)', (select m_back from pst))) = 'no_package_to_start');

reset role;
select set_config('request.jwt.claims', '', true);
insert into results select pg_temp.assert_true('backdate: cycle 1 closed, cycle 2 current, cycle 3 upcoming',
  (select string_agg(number || ':' || status, ',' order by number)
     from cycles where package_id = pg_temp.pst_pkg((select m_back from pst))) = '1:closed,2:active,3:upcoming');
insert into results select pg_temp.assert_eq('backdate: nothing compiled for the empty past cycle',
  (select count(*) from reports where member_id = (select m_back from pst) and type = 'performance'), 0);
insert into results select pg_temp.assert_true('backdate: the current review round is the doctor only (no nutrition plan yet)',
  (select array_agg(type::text) = '{doctor}' from consultations
    where cycle_id = pg_temp.pst_cycle((select m_back from pst), 2)));
insert into results select pg_temp.assert_true('backdate: the hand-made review is filed under cycle 2 and IS its doctor report',
  (select cycle_id = pg_temp.pst_cycle((select m_back from pst), 2) from reports where id = (select r_manual from pst))
  and (select meeting_status = 'done' and report_status = 'submitted' from consultations
        where cycle_id = pg_temp.pst_cycle((select m_back from pst), 2) and type = 'doctor'));
insert into results select pg_temp.assert_true('backdate: the stray intake is cancelled, the nutrition intake is not',
  (select meeting_status = 'cancelled' from consultations where id = (select c_back_stray from pst))
  and (select meeting_status = 'to_schedule' from consultations where id = (select c_back_nut from pst)));
insert into results select pg_temp.assert_eq('backdate: the family is not messaged',
  (select count(*) from notifications
    where dedupe_key = 'start:' || pg_temp.pst_pkg((select m_back from pst)) || ':caregiver'), 0);
insert into results select pg_temp.assert_eq('backdate: coordinators are told',
  (select count(*) from notifications
    where dedupe_key = 'start:' || pg_temp.pst_pkg((select m_back from pst)) || ':staff:' || (select coord_id from pst)), 1);

-- the cycle engine: rollover, monthly feedback and the performance report follow the started roles
insert into results select pg_temp.assert_true('cycle: the backdated cycle 2 closes',
  pg_temp.pst_try(format('select close_cycle_open_next(%L)', pg_temp.pst_cycle((select m_back from pst), 2))) = 'ok');
insert into results select pg_temp.assert_true('cycle: the next review round skips the unstarted nutritionist (was all four)',
  (select array_agg(type::text) = '{doctor}' from consultations
    where cycle_id = pg_temp.pst_cycle((select m_back from pst), 3)));
-- Each cron run is its own statement: a statement cannot see rows written by a
-- function it calls, so running and checking in one statement would pass vacuously.
insert into results select pg_temp.assert_true('cron: runs on day 27 of the auto member''s cycle 1',
  pg_temp.pst_try(format('select run_daily_jobs(%L::date)', (select today + 26 from pst))) = 'ok');
insert into results select pg_temp.assert_true('cron: ...and drafts feedback for the started nutritionist only',
  exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
           where fr.cycle_id = pg_temp.pst_cycle((select m_auto from pst), 1) and t.key = 'feedback_nutrition')
  and not exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                   where fr.cycle_id = pg_temp.pst_cycle((select m_auto from pst), 1) and t.key = 'feedback_training'));
insert into results select pg_temp.assert_true('cron: runs on day 27 of the backdated member''s cycle 3',
  pg_temp.pst_try(format('select run_daily_jobs(%L::date)', (select today + 36 from pst))) = 'ok');
insert into results select pg_temp.assert_true('cron: ...and drafts nothing for an assigned nutritionist with no plan',
  exists (select 1 from cycles where id = pg_temp.pst_cycle((select m_back from pst), 3)
           and end_date = (select today + 39 from pst))
  and not exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                   where fr.cycle_id = pg_temp.pst_cycle((select m_back from pst), 3)
                     and t.key = 'feedback_nutrition'));
insert into results select pg_temp.assert_true('cron: rollover opens cycle 2 reviews for doctor + nutritionist only',
  (select array_agg(type::text order by type) = '{doctor,nutritionist}' from consultations
    where cycle_id = pg_temp.pst_cycle((select m_auto from pst), 2)));
insert into results select pg_temp.assert_true('performance: training is "not started", nutrition feedback is "pending"',
  (select content::text like '%Not started yet: training plan.%'
      and content::text like '%Feedback pending: nutritionist.%'
     from reports where type = 'performance'
      and cycle_id = pg_temp.pst_cycle((select m_auto from pst), 1)));
update consultations set meeting_status = 'done', report_status = 'submitted'
 where id = (select c_back_nut from pst);
insert into results select pg_temp.assert_eq('cycle: a nutrition plan submitted mid-programme joins the next round',
  _open_review_consults(pg_temp.pst_pkg((select m_back from pst)), pg_temp.pst_cycle((select m_back from pst), 3)), 1);

insert into results select pg_temp.assert_true('program: _start_program is not client-callable',
  not has_function_privilege('authenticated', 'public._start_program(uuid,date,text)', 'execute')
  and not has_function_privilege('anon', 'public._start_program(uuid,date,text)', 'execute'));
insert into results select pg_temp.assert_true('program: activate_program is not callable by anon',
  not has_function_privilege('anon', 'public.activate_program(uuid,date)', 'execute'));

-- ============ 0048: the coordinator closes a report by hand ============
-- Only admin/coordinator, only a report actually being chased, only the two known
-- reasons. "Received outside" still counts as the plan (the role joins the cycle, a
-- doctor's intake starts the program); "not needed" only closes the item.
reset role;
select set_config('request.jwt.claims', '', true);
update profiles set status = 'active'
 where email in ('doctor@phloem.local','nutritionist@phloem.local','coordinator@phloem.local');
create temp table crp as select
  (select id from profiles where email = 'doctor@phloem.local')       as doctor_id,
  (select id from profiles where email = 'nutritionist@phloem.local') as nutri_id,
  (select id from profiles where email = 'coordinator@phloem.local')  as coord_id,
  gen_random_uuid() as m_a, gen_random_uuid() as m_b,
  gen_random_uuid() as c_doc, gen_random_uuid() as c_nut, gen_random_uuid() as c_nut_b,
  gen_random_uuid() as c_unheld;
grant select on crp to authenticated;
insert into members(id, full_name, status)
  select m_a, 'CRP outside — test fixture', 'initial_consults'::member_status from crp union all
  select m_b, 'CRP not needed — test fixture', 'initial_consults' from crp;
insert into packages(member_id, duration_months)
  select m_a, 3 from crp union all select m_b, 3 from crp;
insert into assignments(member_id, care_user_id, care_role)
  select m_a, doctor_id, 'doctor'::care_role from crp union all
  select m_a, nutri_id,  'nutritionist'      from crp union all
  select m_b, nutri_id,  'nutritionist'      from crp;
insert into consultations(id, member_id, cycle_id, type, meeting_status, completed_at)
  select c_doc,    m_a, null::uuid, 'doctor'::care_role, 'done'::meeting_status, now() from crp union all
  select c_nut,    m_a, null, 'nutritionist', 'done',        now() from crp union all
  select c_nut_b,  m_b, null, 'nutritionist', 'done',        now() from crp union all
  select c_unheld, m_b, null, 'doctor',       'to_schedule', null  from crp;
create function pg_temp.crp_try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return SQLERRM; end $$;

-- clinicians cannot close their own (or anyone's) chased report
select set_config('request.jwt.claims',
  json_build_object('sub', (select nutri_id from crp), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('close report: a nutritionist cannot',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_nut from crp), 'not_needed')) = 'not_allowed');
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select doctor_id from crp), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('close report: a doctor cannot',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_doc from crp), 'received_outside')) = 'not_allowed');

-- the coordinator can, within the rules
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select coord_id from crp), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('close report: an unknown reason is refused',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_nut from crp), 'lost_it')) = 'bad_reason');
insert into results select pg_temp.assert_true('close report: a meeting not held is not a chased report',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_unheld from crp), 'not_needed')) = 'report_not_pending');
insert into results select pg_temp.assert_true('close report: the doctor''s intake, received on WhatsApp',
  pg_temp.crp_try(format('select close_report(%L, %L, %L)', (select c_doc from crp), 'received_outside',
                         'Sent to the family on WhatsApp')) = 'ok');
insert into results select pg_temp.assert_true('close report: the nutrition plan, received outside too',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_nut from crp), 'received_outside')) = 'ok');
insert into results select pg_temp.assert_true('close report: another nutrition report, not needed',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_nut_b from crp), 'not_needed')) = 'ok');
insert into results select pg_temp.assert_true('close report: a closed report cannot be closed again',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_nut from crp), 'not_needed')) = 'report_not_pending');

reset role;
select set_config('request.jwt.claims', '', true);
insert into results select pg_temp.assert_true('close report: recorded with reason, note, who and when',
  (select report_status = 'closed' and report_closed_reason = 'received_outside'
      and report_closed_note = 'Sent to the family on WhatsApp'
      and report_closed_by = (select coord_id from crp) and report_closed_at is not null
     from consultations where id = (select c_doc from crp)));
insert into results select pg_temp.assert_true('close report: a doctor intake received outside starts the program',
  (select status = 'active' from packages where member_id = (select m_a from crp)));
insert into results select pg_temp.assert_true('close report: "received outside" joins the cycle, "not needed" does not',
  _role_started((select id from packages where member_id = (select m_a from crp)), 'nutritionist')
  and not _role_started((select id from packages where member_id = (select m_b from crp)), 'nutritionist'));
insert into results select pg_temp.assert_eq('close report: the clinician is told their form closed',
  (select count(*) from notifications
    where dedupe_key = 'repclosed:' || (select c_nut_b from crp) and user_id = (select nutri_id from crp)), 1);
insert into results select pg_temp.assert_eq('close report: audited',
  (select count(*) from audit_log where action = 'consultation.report_closed'
      and entity_id in ((select c_doc from crp), (select c_nut from crp), (select c_nut_b from crp))), 3);

-- suspended coordinator: refused (0017 fail-closed)
update consultations set report_status = 'pending', report_closed_reason = null
 where id = (select c_nut_b from crp);
update profiles set status = 'suspended' where email = 'coordinator@phloem.local';
select set_config('request.jwt.claims',
  json_build_object('sub', (select coord_id from crp), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select pg_temp.assert_true('close report: a suspended coordinator cannot',
  pg_temp.crp_try(format('select close_report(%L, %L)', (select c_nut_b from crp), 'not_needed')) = 'not_allowed');
reset role;
update profiles set status = 'active' where email = 'coordinator@phloem.local';
insert into results select pg_temp.assert_true('close report: not callable by anon',
  not has_function_privilege('anon', 'public.close_report(uuid,text,text)', 'execute'));


-- ============ 0054/0055: uploading a report as a file ============
-- Admin and coordinator upload nutritionist / trainer / psychologist reports; the
-- assigned nutritionist uploads their own; never a doctor report. A first-
-- consultation upload fulfils that consultation (uploading again replaces it); a
-- diet review is added per review meeting, so a cycle can hold two. Who reads an
-- upload is the existing rep_* policy; a coordinator reads only their own uploads;
-- only the uploader (or admin) can take one back. Self-contained throwaway users.
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email)
select ('0f0f0000-0000-4000-8000-0000000055' || k)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'upl-' || k || '@example.test'
  from unnest(array['c1','a1','d1','b1','b2','e1','61']) k;
insert into profiles (id, role, full_name, email)
select ('0f0f0000-0000-4000-8000-0000000055' || k)::uuid, r::user_role, 'UPL ' || k, 'upl-' || k || '@example.test'
  from (values ('c1','coordinator'),('a1','admin'),('d1','doctor'),('b1','nutritionist'),
               ('b2','nutritionist'),('e1','trainer'),('61','caregiver')) v(k, r);
create temp table upl as select
  (now() at time zone 'Asia/Kolkata')::date as today,
  gen_random_uuid() as m, gen_random_uuid() as pkg,
  gen_random_uuid() as cy1, gen_random_uuid() as cy2, gen_random_uuid() as cy3,
  gen_random_uuid() as c_ni, gen_random_uuid() as c_nr2, gen_random_uuid() as c_ti,
  gen_random_uuid() as c_doc, gen_random_uuid() as c_unheld;
grant select on upl to authenticated;
insert into members(id, full_name, caregiver_id, status)
  select m, 'UPL — test fixture', '0f0f0000-0000-4000-8000-000000005561', 'active'::member_status from upl;
insert into packages(id, member_id, duration_months, status, start_date, end_date)
  select pkg, m, 3, 'active'::package_status, today - 40, today + 50 from upl;
insert into cycles(id, package_id, number, start_date, end_date, status)
  select cy1, pkg, 1, today - 40, today - 11, 'closed'::cycle_status from upl union all
  select cy2, pkg, 2, today - 10, today + 19, 'active'::cycle_status from upl union all
  select cy3, pkg, 3, today + 20, today + 49, 'upcoming'::cycle_status from upl;
insert into assignments(member_id, care_user_id, care_role)
  select m, ('0f0f0000-0000-4000-8000-0000000055' || k)::uuid, r::care_role
    from upl, (values ('d1','doctor'),('b1','nutritionist'),('e1','trainer')) v(k, r);
insert into consultations(id, member_id, cycle_id, type, meeting_status, completed_at)
  select c_ni,     m, null::uuid, 'nutritionist'::care_role, 'done'::meeting_status, now() from upl union all
  select c_nr2,    m, cy2,        'nutritionist'::care_role, 'done'::meeting_status, now() from upl union all
  select c_ti,     m, null::uuid, 'trainer'::care_role,      'done'::meeting_status, now() from upl union all
  select c_doc,    m, null::uuid, 'doctor'::care_role,       'done'::meeting_status, now() from upl union all
  select c_unheld, m, null::uuid, 'nutritionist'::care_role, 'scheduled'::meeting_status, null from upl;
create function pg_temp.upl_p(n int) returns text language sql as $$
  select (select m from upl)::text || '/uploads/0f0f0000-0000-4000-8000-' || lpad(n::text, 12, '0') || '.pdf' $$;
insert into storage.objects(bucket_id, name) select 'reports', pg_temp.upl_p(n) from generate_series(1, 6) n;
create function pg_temp.upl_try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return SQLERRM; end $$;
create function pg_temp.upl_as(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',
    ('0f0f0000-0000-4000-8000-0000000055' || k)::uuid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.upl_up(cons uuid, n int, mime text default 'application/pdf') returns text language sql as $$
  select pg_temp.upl_try(format('select upload_report(%L, %L, %L, %L, 1000)', cons, pg_temp.upl_p(n), 'plan.pdf', mime)) $$;
create function pg_temp.upl_rev(cy uuid, d date, n int) returns text language sql as $$
  select pg_temp.upl_try(format('select upload_diet_review(%L, %L, %L, %L, %L, %L, 1000)',
    (select m from upl), cy, d, pg_temp.upl_p(n), 'review.pdf', 'application/pdf')) $$;
create function pg_temp.upl_rm(n int) returns text language sql as $$
  select pg_temp.upl_try(format('select remove_uploaded_report(%L)',
    (select id from reports where pdf_path = pg_temp.upl_p(n)))) $$;
create function pg_temp.upl_types() returns text language sql as $$
  select coalesce(string_agg(distinct type::text, ',' order by type::text), '')
    from reports where member_id = (select m from upl) $$;

set local role authenticated;
select pg_temp.upl_as('b2');
insert into results select pg_temp.assert_true('upload: a nutritionist not assigned to the member cannot',
  pg_temp.upl_up((select c_ni from upl), 1) = 'not_allowed');
select pg_temp.upl_as('e1');
insert into results select pg_temp.assert_true('upload: a trainer cannot',
  pg_temp.upl_up((select c_ti from upl), 1) = 'not_allowed');
select pg_temp.upl_as('b1');
insert into results select pg_temp.assert_true('upload: a nutritionist cannot upload the doctor''s report',
  pg_temp.upl_up((select c_doc from upl), 1) = 'not_allowed');
select pg_temp.upl_as('c1');
insert into results select pg_temp.assert_true('upload: only for a meeting that was held',
  pg_temp.upl_up((select c_unheld from upl), 1) = 'meeting_not_done');
insert into results select pg_temp.assert_true('upload: only PDF, JPG or PNG',
  pg_temp.upl_up((select c_ni from upl), 1, 'application/msword') = 'bad_file_type');
insert into results select pg_temp.assert_true('upload: the file has to be there',
  pg_temp.upl_up((select c_ni from upl), 9) = 'file_missing');
insert into results select pg_temp.assert_true('upload: a training plan waits for the doctor''s clearance',
  pg_temp.upl_up((select c_ti from upl), 1) = 'awaiting_doctor_clearance');
insert into results select pg_temp.assert_true('upload: a nutritionist''s cycle review is a diet review, not a slot',
  pg_temp.upl_up((select c_nr2 from upl), 1) = 'report_not_uploadable');
insert into results select pg_temp.assert_true('upload: no diet review for a cycle that has not begun',
  pg_temp.upl_rev((select cy3 from upl), (select today from upl), 1) = 'not_found');
insert into results select pg_temp.assert_true('upload: no diet review dated tomorrow',
  pg_temp.upl_rev((select cy2 from upl), (select today + 1 from upl), 1) = 'bad_review_date');
insert into results select pg_temp.assert_true('upload: no diet review far outside its cycle',
  pg_temp.upl_rev((select cy2 from upl), (select today - 30 from upl), 1) = 'bad_review_date');
select pg_temp.upl_as('b1');
insert into results select pg_temp.assert_true('upload: the assigned nutritionist uploads their plan',
  pg_temp.upl_up((select c_ni from upl), 1) = 'ok');
insert into results select pg_temp.assert_true('upload: one file is one report',
  pg_temp.upl_up((select c_ni from upl), 1) = 'file_in_use');
select pg_temp.upl_as('c1');
insert into results select pg_temp.assert_true('upload: the coordinator adds the first diet review of the cycle',
  pg_temp.upl_rev((select cy2 from upl), (select today - 7 from upl), 2) = 'ok');
select pg_temp.upl_as('b1');
insert into results select pg_temp.assert_true('upload: the nutritionist adds the second, two weeks on',
  pg_temp.upl_rev((select cy2 from upl), (select today from upl), 3) = 'ok');
reset role;
insert into results select pg_temp.assert_true('upload: the first diet review answered the waiting review',
  (select report_status = 'submitted' from consultations where id = (select c_nr2 from upl)));
select pg_temp.upl_as('c1');
set local role authenticated;
insert into results select pg_temp.assert_eq('upload: the coordinator sees both review dates',
  (select count(*) from list_diet_reviews((select m from upl))), 2);
insert into results select pg_temp.assert_true('upload: but opens only the review they uploaded',
  pg_temp.upl_types() = 'nutrition_review'
  and (select count(*) from reports where member_id = (select m from upl)) = 1);
select pg_temp.upl_as('61');
insert into results select pg_temp.assert_eq('upload: the family is not given the review list',
  (select count(*) from list_diet_reviews((select m from upl))), 0);
insert into results select pg_temp.assert_true('upload: the family reads the plan and the reviews',
  pg_temp.upl_types() = 'nutrition_plan,nutrition_review');

-- Taking it back
select pg_temp.upl_as('b1');
insert into results select pg_temp.assert_true('upload: the nutritionist cannot remove the coordinator''s review',
  pg_temp.upl_rm(2) = 'not_allowed');
select pg_temp.upl_as('c1');
insert into results select pg_temp.assert_true('upload: the coordinator removes their own',
  pg_temp.upl_rm(2) = 'ok');
reset role;
insert into results select pg_temp.assert_true('upload: the second review still answers the cycle',
  (select report_status = 'submitted' from consultations where id = (select c_nr2 from upl)));
select pg_temp.upl_as('b1');
set local role authenticated;
insert into results select pg_temp.assert_true('upload: the nutritionist removes theirs',
  pg_temp.upl_rm(3) = 'ok');
reset role;
insert into results select pg_temp.assert_true('upload: with no review left, the cycle review is waiting again',
  (select report_status = 'pending' and report_uploaded_by is null from consultations where id = (select c_nr2 from upl)));
select pg_temp.upl_as('c1');
set local role authenticated;
insert into results select pg_temp.assert_true('upload: the coordinator replaces the nutritionist''s plan',
  pg_temp.upl_up((select c_ni from upl), 4) = 'ok');
select pg_temp.upl_as('b1');
insert into results select pg_temp.assert_true('upload: an older version cannot be removed on its own',
  pg_temp.upl_rm(1) = 'not_latest_version');
select pg_temp.upl_as('a1');
insert into results select pg_temp.assert_true('upload: admin removes the plan, every version',
  pg_temp.upl_rm(4) = 'ok');
reset role;
select set_config('request.jwt.claims', '', true);
insert into results select pg_temp.assert_true('upload: the plan is waiting again, nothing left behind',
  (select report_status = 'pending' from consultations where id = (select c_ni from upl))
  and not exists (select 1 from reports where consultation_id = (select c_ni from upl)));
-- 0058: the doctor's report too, with the clearance it gives
select pg_temp.upl_as('c1');
set local role authenticated;
insert into results select pg_temp.assert_true('upload: a clearance only goes with a doctor''s report',
  pg_temp.upl_try(format('select upload_report(%L, %L, %L, %L, 1000, null, %L)',
    (select c_ti from upl), pg_temp.upl_p(5), 'x.pdf', 'application/pdf', 'cleared')) = 'bad_clearance');
insert into results select pg_temp.assert_true('upload: the coordinator files the doctor''s intake, cleared',
  pg_temp.upl_try(format('select upload_report(%L, %L, %L, %L, 1000, null, %L)',
    (select c_doc from upl), pg_temp.upl_p(5), 'intake.pdf', 'application/pdf', 'cleared')) = 'ok');
insert into results select pg_temp.assert_true('upload: and the training plan unlocks',
  pg_temp.upl_up((select c_ti from upl), 6) = 'ok');
reset role;
select set_config('request.jwt.claims', '', true);
insert into results select pg_temp.assert_true('upload: none of it callable by anon; helpers internal',
  not has_function_privilege('anon', 'public.upload_report(uuid,text,text,text,bigint,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.upload_diet_review(uuid,uuid,date,text,text,text,bigint,text)', 'execute')
  and not has_function_privilege('anon', 'public.remove_uploaded_report(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public._may_upload_for(uuid,care_role)', 'execute')
  and not has_function_privilege('authenticated', 'public._check_upload_file(uuid,text,text,bigint)', 'execute'));

-- ============ 0059: emergency & safety ============
-- The Emergency & Safety record and the session log. The assigned trainer and doctor
-- read the record (and the address, through emergency_card); the nutritionist, the
-- psychologist and an unassigned trainer read nothing. The family fills it in or the
-- coordinator does on a call; an incident holds sessions until the assigned doctor
-- clears it. Self-contained throwaway users.
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email)
select ('0f0f0000-0000-4000-8000-0000000059' || k)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'saf-' || k || '@example.test'
  from unnest(array['c1','a1','d1','e1','e2','b1','f1','61','62']) k;
insert into profiles (id, role, full_name, email)
select ('0f0f0000-0000-4000-8000-0000000059' || k)::uuid, r::user_role, 'SAF ' || k, 'saf-' || k || '@example.test'
  from (values ('c1','coordinator'),('a1','admin'),('d1','doctor'),('e1','trainer'),('e2','trainer'),
               ('b1','nutritionist'),('f1','psychologist'),('61','caregiver'),('62','caregiver')) v(k, r);
create temp table saf as select gen_random_uuid() as m1, gen_random_uuid() as m2;
grant select on saf to authenticated;
insert into members(id, full_name, caregiver_id, status)
  select m1, 'SAF one — test fixture', '0f0f0000-0000-4000-8000-000000005961'::uuid, 'active'::member_status from saf union all
  select m2, 'SAF two — test fixture', null, 'active'::member_status from saf;
insert into member_contacts(member_id, address, pin_code, emergency_contact_name, emergency_contact_phone)
  select m1, '12 Test Road, Kochi', '682001', 'Anil', '+91 90000 00001' from saf;
insert into assignments(member_id, care_user_id, care_role)
  select m1, ('0f0f0000-0000-4000-8000-0000000059' || k)::uuid, r::care_role
    from saf, (values ('d1','doctor'),('e1','trainer'),('b1','nutritionist'),('f1','psychologist')) v(k, r);
insert into form_responses(member_id, template_id, respondent_id, answers, submitted_at)
  select m1, (select id from form_templates where key = 'onboarding' and active order by version desc limit 1),
         '0f0f0000-0000-4000-8000-000000005961',
         '{"conditions":[{"condition":"Diabetes","duration":"5 years"}],
           "medications":[{"name":"Metformin","dose":"500 mg","frequency":"twice daily"}]}'::jsonb,
         now() from saf;
create function pg_temp.saf_try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return SQLERRM; end $$;
create function pg_temp.saf_as(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',
    ('0f0f0000-0000-4000-8000-0000000059' || k)::uuid, 'role', 'authenticated')::text, true) $$;
-- The answers as the form sends them; a patch varies one.
create function pg_temp.saf_save(m uuid, patch jsonb default '{}') returns text language sql as $$
  select pg_temp.saf_try(format('select save_member_safety(%L, %L)', m,
    '{"local_contact_name":"Suma","local_contact_relation":"Neighbour","local_contact_phone":"+91 98470 12345",
      "local_contact_eta":"under_10","hospital_name":"Lakeshore Hospital","hospital_phone":"0484-2345678",
      "ambulance_phone":"108","private_ambulance_phone":"","someone_home":true,"bp_or_glucometer":false,
      "emergency_consent":true}'::jsonb || patch)) $$;
create function pg_temp.saf_ask(m uuid) returns text language sql as $$
  select pg_temp.saf_try(format('select request_safety_details(%L)', m)) $$;
create function pg_temp.saf_event(kind text, reasons text, detail text) returns text language sql as $$
  select pg_temp.saf_try(format('select report_safety_event(%L, %L, %L, %L)',
    (select m1 from saf), kind, reasons, detail)) $$;
create function pg_temp.saf_card() returns jsonb language sql as $$
  select emergency_card((select m1 from saf)) $$;
create function pg_temp.saf_notified(k text, t text) returns boolean language sql as $$
  select exists (select 1 from notifications
                  where user_id = ('0f0f0000-0000-4000-8000-0000000059' || k)::uuid and type = t) $$;

set local role authenticated;
select pg_temp.saf_as('e1');
insert into results select pg_temp.assert_true('safety: the trainer''s card before any record — no details, address shown',
  pg_temp.saf_card()->'safety' = 'null'::jsonb
  and pg_temp.saf_card()->>'address' = '12 Test Road, Kochi'
  and pg_temp.saf_card()->'family_contact'->>'phone' = '+91 90000 00001');

-- The family path (m1)
select pg_temp.saf_as('c1');
insert into results select pg_temp.assert_true('safety: the coordinator asks the family',
  pg_temp.saf_ask((select m1 from saf)) = 'ok');
insert into results select pg_temp.assert_true('safety: no one to ask',
  pg_temp.saf_ask((select m2 from saf)) = 'no_family_login');
select pg_temp.saf_as('62');
insert into results select pg_temp.assert_true('safety: another family cannot',
  pg_temp.saf_save((select m1 from saf)) = 'not_allowed');
select pg_temp.saf_as('61');
insert into results select pg_temp.assert_true('safety: the family must tick consent',
  pg_temp.saf_save((select m1 from saf), '{"emergency_consent":false}') = 'emergency_consent_required');
insert into results select pg_temp.assert_true('safety: the family fills it in',
  pg_temp.saf_save((select m1 from saf)) = 'ok');
insert into results select pg_temp.assert_true('safety: the family reads it back as theirs; blank private ambulance is none',
  (select consent_source = 'family_form' and private_ambulance_phone is null and ambulance_phone = '108'
     from member_safety where member_id = (select m1 from saf)));
select pg_temp.saf_as('c1');
insert into results select pg_temp.assert_true('safety: asking once it''s filled',
  pg_temp.saf_ask((select m1 from saf)) = 'already_filled');
reset role;
insert into results select pg_temp.assert_true('safety: the family was asked and the coordinator told when they filled it',
  (select safety_requested_at is not null from members where id = (select m1 from saf))
  and pg_temp.saf_notified('61', 'safety_request')
  and pg_temp.saf_notified('c1', 'safety_family_saved'));

-- The coordinator's call (m2)
select pg_temp.saf_as('c1');
set local role authenticated;
insert into results select pg_temp.assert_true('safety: saving without consent is refused',
  pg_temp.saf_save((select m2 from saf), '{"emergency_consent":false}') = 'emergency_consent_required');
insert into results select pg_temp.assert_true('safety: a blank hospital phone is refused',
  pg_temp.saf_save((select m2 from saf), '{"hospital_phone":"  "}') = 'safety_incomplete');
insert into results select pg_temp.assert_true('safety: a yes/no left out is refused',
  pg_temp.saf_save((select m2 from saf), '{"someone_home":null}') = 'safety_incomplete');
insert into results select pg_temp.assert_true('safety: an unknown reach time is refused',
  pg_temp.saf_save((select m2 from saf), '{"local_contact_eta":"soon"}') = 'bad_eta');
insert into results select pg_temp.assert_true('safety: the coordinator saves it from the call',
  pg_temp.saf_save((select m2 from saf), '{"ambulance_phone":"999"}') = 'ok');
insert into results select pg_temp.assert_true('safety: a second save keeps the consent and needs no tick',
  pg_temp.saf_save((select m2 from saf), '{"emergency_consent":false,"ambulance_phone":"999","hospital_name":"Amrita"}') = 'ok');
insert into results select pg_temp.assert_true('safety: recorded as a call, with the local ambulance number',
  (select consent_source = 'coordinator_call' and ambulance_phone = '999' and hospital_name = 'Amrita'
     from member_safety where member_id = (select m2 from saf)));
insert into results select pg_temp.assert_true('safety: nobody writes the table directly',
  pg_temp.saf_try('update member_safety set hospital_name = ''x''') <> 'ok'
  and pg_temp.saf_try('delete from safety_events') <> 'ok');
insert into results select pg_temp.assert_true('safety: the coordinator''s card leaves out health',
  pg_temp.saf_card()->'health' = 'null'::jsonb
  and pg_temp.saf_card()->'safety'->>'hospital_name' = 'Lakeshore Hospital');

-- Who reads it
select pg_temp.saf_as('e1');
insert into results select pg_temp.assert_true('safety: the trainer''s card carries the details and the medicines',
  pg_temp.saf_card()->'safety'->>'local_contact_phone' = '+91 98470 12345'
  and pg_temp.saf_card()->'health'->'medications'->0->>'name' = 'Metformin'
  and not (pg_temp.saf_card()->'safety' ? 'consent_recorded_by'));
select pg_temp.saf_as('e2');
insert into results select pg_temp.assert_true('safety: an unassigned trainer cannot',
  pg_temp.saf_try(format('select emergency_card(%L)', (select m1 from saf))) = 'not_allowed'
  and (select count(*) from member_safety) = 0);
select pg_temp.saf_as('b1');
insert into results select pg_temp.assert_true('safety: the nutritionist cannot',
  pg_temp.saf_try(format('select emergency_card(%L)', (select m1 from saf))) = 'not_allowed'
  and (select count(*) from member_safety) = 0);
select pg_temp.saf_as('f1');
insert into results select pg_temp.assert_true('safety: the psychologist cannot',
  pg_temp.saf_try(format('select emergency_card(%L)', (select m1 from saf))) = 'not_allowed'
  and (select count(*) from member_safety) = 0);

-- No session today, incidents, the hold
select pg_temp.saf_as('e1');
insert into results select pg_temp.assert_true('safety: a skipped session needs a reason',
  pg_temp.saf_event('skipped', '{}', null) = 'reasons_required');
insert into results select pg_temp.assert_true('safety: only the listed reasons',
  pg_temp.saf_event('skipped', '{tired}', null) = 'reasons_required');
insert into results select pg_temp.assert_true('safety: a skipped session is logged',
  pg_temp.saf_event('skipped', '{dizziness}', null) = 'ok');
insert into results select pg_temp.assert_true('safety: an incident says what happened',
  pg_temp.saf_event('incident', '{}', '  ') = 'detail_required');
insert into results select pg_temp.assert_true('safety: a kind that is not one is refused',
  pg_temp.saf_event('fall', '{}', 'x') = 'bad_kind');
insert into results select pg_temp.assert_true('safety: the trainer reports an incident',
  pg_temp.saf_event('incident', '{}', 'Felt faint, sat down, BP 90/60') = 'ok');
insert into results select pg_temp.assert_true('safety: and another before the doctor looks',
  pg_temp.saf_event('incident', '{}', 'Dizzy again next day') = 'ok');
insert into results select pg_temp.assert_true('safety: sessions are on hold for both',
  pg_temp.saf_card()->'hold'->>'open_count' = '2'
  and pg_temp.saf_card()->'hold'->>'detail' = 'Dizzy again next day');
insert into results select pg_temp.assert_true('safety: the trainer cannot clear it',
  pg_temp.saf_try(format('select clear_safety_hold(%L, %L)', (select m1 from saf), 'ok now')) = 'not_allowed');
select pg_temp.saf_as('e2');
insert into results select pg_temp.assert_true('safety: an unassigned trainer cannot report',
  pg_temp.saf_event('incident', '{}', 'x') = 'not_allowed');
reset role;
insert into results select pg_temp.assert_true('safety: the coordinator heard of the skip; the doctor and admin of the incident',
  pg_temp.saf_notified('c1', 'safety_skipped')
  and pg_temp.saf_notified('d1', 'safety_incident')
  and pg_temp.saf_notified('a1', 'safety_incident')
  and not pg_temp.saf_notified('d1', 'safety_skipped'));
select pg_temp.saf_as('d1');
set local role authenticated;
insert into results select pg_temp.assert_true('safety: the doctor must say why',
  pg_temp.saf_try(format('select clear_safety_hold(%L, %L)', (select m1 from saf), '  ')) = 'note_required');
insert into results select pg_temp.assert_eq('safety: the doctor clears both at once',
  clear_safety_hold((select m1 from saf), 'Seen, fine to resume'), 2);
insert into results select pg_temp.assert_true('safety: no longer on hold',
  pg_temp.saf_card()->'hold' = 'null'::jsonb);
insert into results select pg_temp.assert_true('safety: clearing again',
  pg_temp.saf_try(format('select clear_safety_hold(%L, %L)', (select m1 from saf), 'again')) = 'not_on_hold');
select pg_temp.saf_as('e1');
insert into results select pg_temp.assert_eq('safety: the trainer sees the log',
  (select count(*) from safety_events where member_id = (select m1 from saf)), 3);
select pg_temp.saf_as('f1');
insert into results select pg_temp.assert_eq('safety: the psychologist sees no events',
  (select count(*) from safety_events), 0);
reset role;
select set_config('request.jwt.claims', '', true);
insert into results select pg_temp.assert_true('safety: the trainer is told sessions can restart',
  pg_temp.saf_notified('e1', 'safety_cleared'));
insert into results select pg_temp.assert_true('safety: none of it callable by anon; the helper is internal',
  not has_function_privilege('anon', 'public.save_member_safety(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.request_safety_details(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.emergency_card(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.report_safety_event(uuid,text,text[],text)', 'execute')
  and not has_function_privilege('anon', 'public.clear_safety_hold(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public._save_safety(uuid,jsonb,text)', 'execute'));

select line from results;

rollback;
