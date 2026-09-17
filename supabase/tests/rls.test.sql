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

select line from results;

rollback;
