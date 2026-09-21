-- PHLOEM migration 0046_program_starts_with_doctor.sql — the program starts when the
-- doctor submits the initial consultation report.
--
-- WHY (user-mandated 2026-09-22; overrides the §1 core loop and the §6
-- activate_program gate). activate_program required the doctor's, nutritionist's
-- AND trainer's initial reports. In practice families start their plan from the
-- doctor's report, and the nutrition/training reports often never arrive — on the
-- hosted project every member with an initial doctor report (11) had no program,
-- zero cycles existed, and 30-day follow-ups had nowhere to live.
--
-- WHAT
--   1. _role_started(pkg, role)       a role is part of the monthly cycle once it is
--                                     assigned and its initial report for THIS package
--                                     is in. The doctor always is (the doctor starts it).
--   2. _open_review_consults(pkg, cyc) review round for the started roles only.
--   3. _start_program(member, start, source) the one place a package goes live. A
--                                     start in the past builds the cycles as they would
--                                     have been (past closed, current active + its
--                                     review round), files 0036 manual reviews under
--                                     their cycle, and does not message the family.
--   4. activate_program(member, start) gate is the doctor's report only; a start that
--                                     is not in the future (backdating) is admin-only.
--   5. submit_clinical_form           + the doctor's initial report starts the program;
--                                     + links report → form_response (0045 added the
--                                     column but nothing wrote it for new reports).
--   6. add_manual_doctor_review       + the same 0045 link.
--   7. close_cycle_open_next          review round for started roles only (it opened
--                                     all four, even for roles nobody is assigned to).
--   8. run_daily_jobs                 feedback drafts / overdue alerts for started
--                                     roles only.
--   9. _build_performance             "not started yet" instead of "feedback pending"
--                                     for a role with no plan.
--
-- Functions 5–9 are reproduced verbatim from their live definitions; only the blocks
-- marked `0046` differ (the convention 0015/0017/0024 used).

-- ============ 1. which roles are part of the cycle ============
create or replace function _role_started(p_pkg uuid, p_role care_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from packages p
      join assignments a   on a.member_id = p.member_id and a.care_role = p_role and a.active
      join consultations c on c.member_id = p.member_id and c.type = p_role
     where p.id = p_pkg
       and c.cycle_id is null and c.report_status = 'submitted'
       -- this package's initial round: a reactivation opens a new package and a
       -- fresh round, and the previous package's reports do not carry over
       and c.created_at >= p.created_at)
$$;

-- ============ 2. a cycle's review round ============
create or replace function _open_review_consults(p_pkg uuid, p_cycle uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_member uuid; r care_role; n int := 0;
begin
  select member_id into v_member from packages where id = p_pkg;
  foreach r in array array['doctor','nutritionist','trainer','psychologist']::care_role[] loop
    continue when not _role_started(p_pkg, r);
    if not exists (select 1 from consultations
                   where member_id = v_member and cycle_id = p_cycle and type = r) then
      insert into consultations(member_id, cycle_id, type) values (v_member, p_cycle, r);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ============ 3. the one place a package goes live ============
create or replace function _start_program(p_member uuid, p_start date, p_source text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pkg packages%rowtype; v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date; v_cur int; v_cycle uuid; v_active uuid; n int; v_name text;
  v_not_started text[]; v_psych_pending boolean; rep record;
begin
  select * into v_pkg from packages
   where member_id = p_member and status = 'not_started'
   order by created_at desc limit 1 for update;
  if not found then return null; end if;          -- already running: nothing to do

  -- The cycle today falls in. Before the start it is cycle 1, as activate_program
  -- always did for a program beginning tomorrow.
  v_cur := case when v_today < p_start then 1 else (v_today - p_start) / 30 + 1 end;
  if v_cur > v_pkg.duration_months then raise exception 'package_elapsed'; end if;
  v_end := (p_start + (v_pkg.duration_months || ' months')::interval)::date;

  select coalesce(array_agg(r::text), '{}') into v_not_started
    from unnest(array['nutritionist','trainer','psychologist']::care_role[]) r
   where not _role_started(v_pkg.id, r);
  v_psych_pending := 'psychologist' = any(v_not_started);

  update packages set start_date = p_start, end_date = v_end, status = 'active',
                      psych_override = v_psych_pending
   where id = v_pkg.id;
  for n in 1..v_pkg.duration_months loop
    insert into cycles(package_id, number, start_date, end_date, status)
    values (v_pkg.id, n, p_start + (n-1)*30, p_start + (n-1)*30 + 29,
            case when n < v_cur then 'closed'::cycle_status
                 when n = v_cur then 'active'::cycle_status
                 else 'upcoming'::cycle_status end)
    returning id into v_cycle;
    if n = v_cur then v_active := v_cycle; end if;
  end loop;

  -- A backdated start lands mid-programme: open the current cycle's review round,
  -- as close_cycle_open_next would have when it began. Past cycles stay empty —
  -- nothing was recorded in them, so no performance report is compiled for them.
  if v_cur > 1 then perform _open_review_consults(v_pkg.id, v_active); end if;

  -- Doctor reviews filed by hand (0036) before the program existed now belong to a
  -- cycle. One inside the current review round IS that round's doctor report.
  for rep in
    select r.id, r.form_response_id, r.created_at,
           (r.created_at at time zone 'Asia/Kolkata')::date as d
      from reports r
     where r.member_id = p_member and r.type = 'doctor_review' and r.cycle_id is null
     order by r.created_at
  loop
    select id into v_cycle from cycles
     where package_id = v_pkg.id and rep.d between start_date and end_date;
    continue when v_cycle is null;
    update reports set cycle_id = v_cycle where id = rep.id;
    update form_responses set cycle_id = v_cycle where id = rep.form_response_id;
    if v_cycle = v_active then
      update consultations
         set meeting_status = 'done', completed_at = rep.created_at, report_status = 'submitted'
       where member_id = p_member and cycle_id = v_active and type = 'doctor'
         and report_status = 'pending';
    end if;
  end loop;

  -- The intake is done. A second, never-scheduled initial doctor consult (left by a
  -- re-assignment) would otherwise ask the doctor for another intake report.
  update consultations set meeting_status = 'cancelled'
   where member_id = p_member and type = 'doctor' and cycle_id is null
     and report_status = 'pending' and meeting_status = 'to_schedule';

  -- run_daily_jobs flags renewal on the exact day end_date - 14; a backdated start
  -- can already be past it.
  update members
     set status = case when v_end - 14 <= v_today then 'renewal_due' else 'active' end::member_status
   where id = p_member;

  select full_name into v_name from members where id = p_member;
  if p_source <> 'backfill' then
    perform _notify_care_team(p_member, 'program_activated',
      case when p_start > v_today then 'Program starts tomorrow' else 'Program has started' end,
      v_name || '''s program ' || case when p_start > v_today then 'starts ' else 'started ' end
             || to_char(p_start, 'Dy, DD Mon') || '.',
      '/clinician/clients/' || p_member, 'start:' || v_pkg.id);
    -- Guarded: a NULL recipient would fail the insert, and with it the doctor's
    -- report submission this runs inside.
    if (select caregiver_id from members where id = p_member) is not null then
      perform _notify((select caregiver_id from members where id = p_member), 'program_activated',
        case when p_start > v_today then 'Program starts tomorrow' else 'Program has started' end,
        v_name || '''s program ' || case when p_start > v_today then 'starts ' else 'started ' end
               || to_char(p_start, 'Dy, DD Mon') || '.',
        '/portal', 'start:' || v_pkg.id || ':caregiver');
    end if;
  end if;
  if p_source <> 'manual' then
    -- The coordinator no longer presses Start, so tell them it happened.
    perform _notify_roles(array['admin','coordinator']::user_role[], 'program_activated',
      case p_source when 'backfill' then 'Program backdated' else 'Program started automatically' end,
      v_name || '''s program ' ||
        case p_source when 'backfill'
          then 'now runs from ' || to_char(p_start, 'DD Mon') || ' — cycle ' || v_cur || ' is current'
               || case when v_cur > 1 then '; its review consultations are ready to schedule' else '' end
          else 'started with the doctor''s initial report — cycle 1 from ' || to_char(p_start, 'DD Mon') end
        || '.',
      '/coordinator/members/' || p_member, 'start:' || v_pkg.id || ':staff');
  end if;

  perform _audit(auth.uid(), 'program.activated', 'package', v_pkg.id,
                 jsonb_build_object('start_date', p_start, 'end_date', v_end, 'source', p_source,
                                    'current_cycle', v_cur, 'not_started', to_jsonb(v_not_started),
                                    'psych_override', v_psych_pending));
  if v_psych_pending then
    perform _audit(auth.uid(), 'program.psych_override', 'package', v_pkg.id, null);
  end if;
  return v_pkg.id;
end $$;

-- ============ 4. activate_program: the doctor's report is the gate ============
-- The coordinator's Start button stays as the fallback (a package created after the
-- doctor's report, or an auto-start that did not happen). p_start backdates; that
-- rewrites history (closed cycles, a running review round), so it is admin-only.
drop function if exists activate_program(uuid);
create or replace function activate_program(p_member uuid, p_start date default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date; v_start date;
begin
  if auth_role() is null or auth_role() not in ('admin','coordinator') then
    raise exception 'not_allowed';
  end if;
  v_start := coalesce(p_start, v_today + 1);
  if v_start > v_today + 1 then raise exception 'bad_start'; end if;
  if v_start <= v_today and auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  if not exists (select 1 from packages where member_id = p_member and status = 'not_started') then
    raise exception 'no_package_to_start';
  end if;
  if not exists (select 1 from consultations c
                   join packages p on p.member_id = c.member_id and p.status = 'not_started'
                  where c.member_id = p_member and c.type = 'doctor' and c.cycle_id is null
                    and c.report_status = 'submitted' and c.created_at >= p.created_at) then
    raise exception 'initial_reports_incomplete';
  end if;
  perform _start_program(p_member, v_start,
                         case when v_start <= v_today then 'backfill' else 'manual' end);
end $$;

-- ============ 5. submit_clinical_form ============
create or replace function submit_clinical_form(
  p_cons uuid, p_answers jsonb, p_report_content jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cons consultations%rowtype; v_key text; v_rtype report_type; v_tmpl uuid;
  v_resp uuid; v_report uuid; v_clearance text; v_name text; v_cycle_no int;
  v_today date; v_consulted date;  -- 0046
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  select * into v_cons from consultations where id = p_cons;
  if not found then raise exception 'not_found'; end if;
  if auth_role()::text <> v_cons.type::text or not is_assigned_to(v_cons.member_id) then
    raise exception 'not_allowed';
  end if;
  if v_cons.meeting_status <> 'done' then raise exception 'meeting_not_done'; end if;

  if v_cons.type = 'trainer' then
    select content->>'clearance' into v_clearance from reports
     where member_id = v_cons.member_id and type in ('doctor_initial','doctor_review')
       and coalesce(content->>'clearance', '') <> ''
     order by created_at desc limit 1;
    if v_clearance is null or v_clearance not in ('cleared','cleared_with_restrictions') then
      raise exception 'awaiting_doctor_clearance';
    end if;
  end if;

  v_key := case v_cons.type
    when 'doctor'       then case when v_cons.cycle_id is null then 'doctor_initial'       else 'doctor_review'       end
    when 'nutritionist' then case when v_cons.cycle_id is null then 'nutritionist_initial' else 'nutritionist_review' end
    when 'trainer'      then case when v_cons.cycle_id is null then 'trainer_initial'      else 'trainer_review'      end
    when 'psychologist' then 'psych_checkin' end;
  v_rtype := case v_cons.type
    when 'doctor'       then case when v_cons.cycle_id is null then 'doctor_initial'::report_type else 'doctor_review'::report_type end
    when 'nutritionist' then case when v_cons.cycle_id is null then 'nutrition_plan'::report_type else 'nutrition_review'::report_type end
    when 'trainer'      then case when v_cons.cycle_id is null then 'training_plan'::report_type  else 'training_review'::report_type end
    when 'psychologist' then 'wellbeing'::report_type end;
  select id into v_tmpl from form_templates where key = v_key and active
   order by version desc limit 1;
  if v_tmpl is null then raise exception 'template_missing: %', v_key; end if;

  select fr.id into v_resp from form_responses fr
   where fr.consultation_id = p_cons and fr.respondent_id = auth.uid() and fr.submitted_at is null
   limit 1;
  if v_resp is null then
    insert into form_responses(member_id, template_id, consultation_id, cycle_id, respondent_id, answers, submitted_at)
    values (v_cons.member_id, v_tmpl, p_cons, v_cons.cycle_id, auth.uid(), p_answers, now())
    returning id into v_resp;
  else
    update form_responses set answers = p_answers, submitted_at = now() where id = v_resp;
  end if;

  select full_name into v_name from members where id = v_cons.member_id;
  select number into v_cycle_no from cycles where id = v_cons.cycle_id;
  -- 0046: + form_response_id (the 0045 link; amend_clinical_report needs it)
  insert into reports(member_id, cycle_id, type, content, created_by, form_response_id)
  values (v_cons.member_id, v_cons.cycle_id, v_rtype,
          coalesce(p_report_content,
                   _report_stub(initcap(replace(v_rtype::text, '_', ' ')) || ' — ' || v_name, v_cycle_no,
                                case when v_cons.type = 'doctor'
                                     then jsonb_build_object('clearance', p_answers->>'clearance')
                                     else '{}'::jsonb end)),
          auth.uid(), v_resp)
  returning id into v_report;

  if v_cons.type = 'doctor' then
    if v_cons.cycle_id is null then
      perform _seed_cases_from_problem_list(v_cons.member_id, p_answers, v_report, auth.uid());
    else
      perform _append_review_to_cases(v_cons.member_id, p_answers, v_report, auth.uid(), v_cycle_no);
    end if;
  end if;

  update consultations set report_status = 'submitted' where id = p_cons;
  if v_cons.cycle_id is null then
    update members set status = 'initial_consults'
     where id = v_cons.member_id and status = 'assigned';
  end if;

  -- ============ 0046: the doctor's initial report starts the program ============
  -- From the day after the consultation (when the coordinator marked it done). A
  -- report filed more than two weeks late starts from tomorrow instead, which also
  -- keeps the start inside cycle 1, so _start_program can never refuse here and fail
  -- the doctor's submission. An admin can still backdate via activate_program.
  if v_cons.type = 'doctor' and v_cons.cycle_id is null then
    v_today := (now() at time zone 'Asia/Kolkata')::date;
    v_consulted := least(coalesce((v_cons.completed_at at time zone 'Asia/Kolkata')::date, v_today), v_today);
    if v_consulted < v_today - 14 then v_consulted := v_today; end if;
    perform _start_program(v_cons.member_id, v_consulted + 1, 'doctor_initial');
  end if;
  -- ============ end 0046 ============

  if v_cons.type = 'psychologist' and (p_answers->>'escalation') = 'true' then
    perform _notify_roles(array['admin']::user_role[], 'psych_escalation',
                          'Psychologist escalation', 'Needs admin attention: ' || v_name || '.',
                          '/admin/members/' || v_cons.member_id, 'esc:' || v_resp);
  end if;
  perform _audit(auth.uid(), 'clinical_form.submitted', 'form_response', v_resp,
                 jsonb_build_object('consultation_id', p_cons, 'report_id', v_report, 'type', v_rtype));
  return v_report;
end $$;

-- ============ 6. add_manual_doctor_review ============
create or replace function add_manual_doctor_review(
  p_member uuid, p_answers jsonb, p_report_content jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_tmpl uuid; v_resp uuid; v_report uuid;
begin
  -- 0017 discipline: a NULL role (suspended / anon) is a refusal, not a pass.
  if auth_role() is null or auth_role() <> 'doctor' or not is_assigned_to(p_member) then
    raise exception 'not_allowed';
  end if;
  -- A review follows an intake; without one there is nothing to review.
  if not exists (select 1 from reports where member_id = p_member and type = 'doctor_initial') then
    raise exception 'initial_report_missing';
  end if;
  if coalesce(trim(p_answers->>'review_summary'), '') = ''
     or jsonb_typeof(p_report_content->'sections') is distinct from 'array' then
    raise exception 'bad_content';
  end if;

  select id into v_tmpl from form_templates where key = 'doctor_review' and active
   order by version desc limit 1;
  if v_tmpl is null then raise exception 'template_missing: doctor_review'; end if;

  -- The page autosaves into a consultation-less draft; submit that one if present.
  select id into v_resp from form_responses
   where member_id = p_member and respondent_id = auth.uid() and template_id = v_tmpl
     and consultation_id is null and submitted_at is null
   order by created_at desc limit 1;
  if v_resp is null then
    insert into form_responses(member_id, template_id, respondent_id, answers, submitted_at)
    values (p_member, v_tmpl, auth.uid(), p_answers, now())
    returning id into v_resp;
  else
    update form_responses set answers = p_answers, submitted_at = now() where id = v_resp;
  end if;

  -- 0046: + form_response_id (the 0045 link)
  insert into reports(member_id, type, content, created_by, form_response_id)
  values (p_member, 'doctor_review', p_report_content, auth.uid(), v_resp)
  returning id into v_report;

  -- Same case-timeline append a cycle review gets (0024).
  perform _append_review_to_cases(p_member, p_answers, v_report, auth.uid(), null);

  perform _audit(auth.uid(), 'clinical_form.submitted', 'form_response', v_resp,
                 jsonb_build_object('report_id', v_report, 'type', 'doctor_review', 'manual', true));
  return v_report;
end $$;

-- ============ 7. close_cycle_open_next ============
create or replace function close_cycle_open_next(p_cycle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cyc cycles%rowtype; v_next cycles%rowtype; v_pkg packages%rowtype;
begin
  if auth.uid() is not null and auth_role() is distinct from 'admin' then raise exception 'not_allowed'; end if;
  select * into v_cyc from cycles where id = p_cycle for update;
  if not found then raise exception 'not_found'; end if;
  if v_cyc.status = 'closed' then return; end if;
  select * into v_pkg from packages where id = v_cyc.package_id;
  update cycles set status = 'closed' where id = p_cycle;
  select * into v_next from cycles
   where package_id = v_cyc.package_id and number = v_cyc.number + 1;
  if found then
    update cycles set status = 'active' where id = v_next.id;
    -- 0046: the review round is for the roles that have started, not all four
    perform _open_review_consults(v_pkg.id, v_next.id);
  else
    update packages set status = 'completed' where id = v_pkg.id;
    update members set status = 'inactive' where id = v_pkg.member_id;
    perform _notify_roles(array['admin','coordinator']::user_role[], 'package_completed',
                          'Package completed',
                          (select full_name from members where id = v_pkg.member_id) ||
                          '''s package completed; member is now inactive.',
                          '/admin/members/' || v_pkg.member_id, 'done:' || v_pkg.id);
  end if;
  perform _audit(auth.uid(), 'cycle.closed', 'cycle', p_cycle,
                 jsonb_build_object('next_cycle', v_next.id));
end $$;

-- ============ 8. run_daily_jobs ============
create or replace function run_daily_jobs(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; v_pro uuid; v_tmpl uuid; v_report uuid; v_role text;
  j1 int := 0; j2 int := 0; j3 int := 0; j4 int := 0; j5 int := 0; j6 int := 0;
  v_failed int := 0; v_skip uuid[] := '{}';
begin
  if auth.uid() is not null and auth_role() is distinct from 'admin' then raise exception 'not_allowed'; end if;
  perform pg_advisory_xact_lock(hashtext('phloem_run_daily_jobs'));

  for rec in
    select c.id as cycle_id, c.end_date, m.id as member_id, m.full_name
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and c.end_date = p_today + 7
  loop
    perform _notify_roles(array['coordinator']::user_role[], 'reviews_due', 'Reviews due',
      'Reviews due for ' || rec.full_name || ' on ' || to_char(rec.end_date, 'DD Mon') || '.',
      '/coordinator/members/' || rec.member_id, 'rev7:' || rec.cycle_id);
    j1 := j1 + 1;
  end loop;

  for rec in
    select c.id as cycle_id, m.id as member_id, m.full_name, p.id as package_id  -- 0046: + package_id
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and c.end_date = p_today + 3
  loop
    for v_role in select unnest(array['nutritionist', 'trainer']) loop
      v_tmpl := (select id from form_templates
                  where key = case v_role when 'nutritionist' then 'feedback_nutrition' else 'feedback_training' end
                    and active order by version desc limit 1);
      v_pro := (select care_user_id from assignments
                 where member_id = rec.member_id and care_role = v_role::care_role and active);
      if v_pro is not null and v_tmpl is not null
         and _role_started(rec.package_id, v_role::care_role)  -- 0046: no plan, no feedback
         and not exists (select 1 from form_responses
                          where cycle_id = rec.cycle_id and template_id = v_tmpl) then
        insert into form_responses(member_id, template_id, cycle_id, respondent_id, answers)
        values (rec.member_id, v_tmpl, rec.cycle_id, v_pro, '{}'::jsonb);
        perform _notify(v_pro, 'feedback_due', 'Monthly feedback due',
          'Please complete this cycle''s feedback for ' || rec.full_name || '.',
          '/clinician/clients/' || rec.member_id || '?tab=feedback',
          'fbdraft:' || rec.cycle_id || ':' || v_role);
        j2 := j2 + 1;
      end if;
    end loop;
  end loop;

  for rec in
    select fr.id as fr_id, fr.respondent_id, fr.cycle_id, t.key, m.id as member_id, m.full_name
      from form_responses fr
      join form_templates t on t.id = fr.template_id
      join cycles c on c.id = fr.cycle_id
      join packages p on p.id = c.package_id
      join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and c.end_date = p_today + 1
       and t.key in ('feedback_nutrition', 'feedback_training') and fr.submitted_at is null
  loop
    perform _notify(rec.respondent_id, 'feedback_nudge', 'Feedback due tomorrow',
      'Your monthly feedback for ' || rec.full_name || ' is due tomorrow.',
      '/clinician/clients/' || rec.member_id || '?tab=feedback', 'fbnudge:' || rec.fr_id);
    perform _notify_roles(array['coordinator']::user_role[], 'feedback_overdue_soon',
      'Feedback outstanding', rec.full_name || ': ' || replace(rec.key, 'feedback_', '') || ' feedback still pending.',
      '/coordinator/members/' || rec.member_id, 'fbnudgec:' || rec.fr_id);
    j3 := j3 + 1;
  end loop;

  loop
    select c.id as cycle_id, c.end_date, m.id as member_id, m.full_name, p.id as package_id  -- 0046: + package_id
      into rec
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and p_today > c.end_date
       and not (c.id = any(v_skip))
     order by c.end_date, c.number limit 1;
    exit when not found;
    begin
      if exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                  where fr.cycle_id = rec.cycle_id and fr.submitted_at is null
                    and t.key in ('feedback_nutrition', 'feedback_training'))
         or exists (select 1 from assignments a where a.member_id = rec.member_id and a.active
                      and a.care_role in ('nutritionist', 'trainer')
                      and _role_started(rec.package_id, a.care_role)  -- 0046
                      and not exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                                       where fr.cycle_id = rec.cycle_id
                                         and t.key = 'feedback_' || (case a.care_role when 'nutritionist' then 'nutrition' else 'training' end)))
      then
        perform _notify_roles(array['coordinator']::user_role[], 'feedback_overdue', 'Feedback overdue',
          rec.full_name || '''s cycle ended with feedback outstanding — performance report compiled with a pending note.',
          '/coordinator/members/' || rec.member_id, 'fbover:' || rec.cycle_id);
      end if;
      v_report := compile_performance_report(rec.cycle_id);
      perform close_cycle_open_next(rec.cycle_id);
      j4 := j4 + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_skip := v_skip || rec.cycle_id;
      perform _notify_roles(array['admin', 'coordinator']::user_role[], 'cron_error',
        'Cycle rollover failed',
        'Automated rollover for ' || rec.full_name || ' failed and needs manual review.',
        '/admin/members/' || rec.member_id, 'cronfail:' || rec.cycle_id || ':' || p_today);
      raise warning 'run_daily_jobs job4 failed for cycle %: %', rec.cycle_id, sqlerrm;
    end;
  end loop;

  for rec in
    select p.id as package_id, m.id as member_id, m.full_name, p.end_date
      from packages p join members m on m.id = p.member_id
     where p.status = 'active' and p.end_date = p_today + 14
  loop
    update members set status = 'renewal_due' where id = rec.member_id and status = 'active';
    perform _notify_roles(array['admin', 'coordinator']::user_role[], 'renewal_due', 'Renewal conversation',
      rec.full_name || '''s package renews on ' || to_char(rec.end_date, 'DD Mon') || ' — start the renewal conversation.',
      '/admin/members/' || rec.member_id, 'renew:' || rec.package_id);
    j5 := j5 + 1;
  end loop;

  for rec in
    select cn.id as cons_id, cn.member_id, cn.type, m.full_name
      from consultations cn join members m on m.id = cn.member_id
     where cn.meeting_status = 'to_schedule' and cn.created_at::date <= p_today - 2
       and m.status not in ('inactive')
  loop
    perform _notify_roles(array['coordinator']::user_role[], 'consult_unscheduled', 'Consultation needs scheduling',
      rec.full_name || '''s ' || rec.type || ' consultation is still unscheduled.',
      '/coordinator/members/' || rec.member_id, 'hygsched:' || rec.cons_id);
    j6 := j6 + 1;
  end loop;
  for rec in
    select cn.id as cons_id, cn.member_id, cn.type, cn.completed_at, m.full_name
      from consultations cn join members m on m.id = cn.member_id
     where cn.meeting_status = 'done' and cn.report_status = 'pending'
       and cn.completed_at::date <= p_today - 3
  loop
    v_pro := (select care_user_id from assignments
               where member_id = rec.member_id and care_role = rec.type and active);
    if v_pro is not null then
      perform _notify(v_pro, 'report_overdue', 'Report overdue',
        'Your report for ' || rec.full_name || ' is overdue.',
        '/clinician/clients/' || rec.member_id, 'hygrep:' || rec.cons_id);
    end if;
    perform _notify_roles(array['coordinator']::user_role[], 'report_overdue', 'Report overdue',
      rec.full_name || '''s ' || rec.type || ' report is overdue.',
      '/coordinator/members/' || rec.member_id, 'hygrepc:' || rec.cons_id);
    j6 := j6 + 1;
  end loop;
  for rec in
    select i.id as invite_id, i.email from invites i
     where i.used_at is null and i.expires_at < p_today
  loop
    perform _notify_roles(array['admin']::user_role[], 'invite_expired', 'Invite expired',
      'The invite for ' || rec.email || ' has expired unused.', '/admin/invites', 'hyginv:' || rec.invite_id);
    j6 := j6 + 1;
  end loop;

  return jsonb_build_object('today', p_today, 'reviews_due', j1, 'feedback_drafts', j2,
    'feedback_nudges', j3, 'cycles_rolled', j4, 'renewals', j5, 'hygiene', j6, 'failures', v_failed);
end $$;

-- ============ 9. _build_performance ============
create or replace function _build_performance(p_cycle uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cyc cycles%rowtype; v_member uuid; v_name text;
  v_nut jsonb; v_trn jsonb; v_nut_sub boolean := false; v_trn_sub boolean := false;
  v_prev_cycle uuid; v_prev_trn jsonb := '{}'::jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_pending text[] := '{}'; v_flags text[] := '{}'; v_adj text[] := '{}';
  v_trend jsonb; v_sts text; v_bal text; v_kv jsonb;
  v_not_started text[] := '{}';  -- 0046
begin
  select * into v_cyc from cycles where id = p_cycle;
  select member_id into v_member from packages where id = v_cyc.package_id;
  select full_name into v_name from members where id = v_member;

  select fr.answers, fr.submitted_at is not null into v_nut, v_nut_sub
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.cycle_id = p_cycle and fr.member_id = v_member and t.key = 'feedback_nutrition'
   order by fr.submitted_at desc nulls last, fr.created_at desc limit 1;
  select fr.answers, fr.submitted_at is not null into v_trn, v_trn_sub
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.cycle_id = p_cycle and fr.member_id = v_member and t.key = 'feedback_training'
   order by fr.submitted_at desc nulls last, fr.created_at desc limit 1;
  v_nut := coalesce(v_nut, '{}'::jsonb); v_trn := coalesce(v_trn, '{}'::jsonb);
  if v_nut = '{}'::jsonb then v_nut_sub := false; end if;
  if v_trn = '{}'::jsonb then v_trn_sub := false; end if;

  select id into v_prev_cycle from cycles
   where package_id = v_cyc.package_id and number = v_cyc.number - 1;
  if v_prev_cycle is not null then
    select fr.answers into v_prev_trn from form_responses fr join form_templates t on t.id = fr.template_id
     where fr.cycle_id = v_prev_cycle and fr.member_id = v_member and t.key = 'feedback_training'
     order by fr.submitted_at desc nulls last, fr.created_at desc limit 1;
    v_prev_trn := coalesce(v_prev_trn, '{}'::jsonb);
  end if;

  v_sections := v_sections || jsonb_build_array(jsonb_build_object(
    'heading', 'Overview', 'kind', 'kv', 'data', jsonb_build_object(
      'Cycle', v_cyc.number,
      'Dates', to_char(v_cyc.start_date, 'DD Mon') || ' – ' || to_char(v_cyc.end_date, 'DD Mon YYYY'))));

  -- ============ 0046: a role with no plan is "not started", not "pending" ============
  if not v_trn_sub then
    if _role_started(v_cyc.package_id, 'trainer') then v_pending := array_append(v_pending, 'trainer');
    else v_not_started := array_append(v_not_started, 'training plan'); end if;
  end if;
  if not v_nut_sub then
    if _role_started(v_cyc.package_id, 'nutritionist') then v_pending := array_append(v_pending, 'nutritionist');
    else v_not_started := array_append(v_not_started, 'nutrition plan'); end if;
  end if;
  if array_length(v_not_started, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Not Started Yet', 'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'info',
        'text', 'Not started yet: ' || array_to_string(v_not_started, ', ')
              || '. Monthly feedback joins this report once the initial plan is submitted.')));
  end if;
  -- ============ end 0046 ============
  if array_length(v_pending, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Feedback Pending', 'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'warning',
        'text', 'Feedback pending: ' || array_to_string(v_pending, ', ')
              || '. This report will be updated when it arrives.')));
  end if;

  if (v_trn->>'adverse_events') = 'true' then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Adverse Events', 'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'danger', 'lead', 'Reported during training this cycle',
        'text', coalesce(nullif(v_trn->>'adverse_detail', ''), 'See training feedback for detail.'))));
  end if;

  if v_trn <> '{}'::jsonb then
    v_sts := _num_delta(v_trn->>'sit_to_stand', v_prev_trn->>'sit_to_stand');
    v_bal := _num_delta(v_trn->>'balance_seconds', v_prev_trn->>'balance_seconds');
    v_kv := jsonb_strip_nulls(jsonb_build_object(
      'Sessions completed', case when v_trn ? 'sessions_completed'
        then (v_trn->>'sessions_completed') || ' / ' || coalesce(v_trn->>'sessions_planned', '—') else null end,
      'Adherence & effort', case when v_trn ? 'adherence' then (v_trn->>'adherence') || ' / 5' else null end,
      'Progress vs goals', nullif(v_trn->>'progress_by_area', ''),
      'Sit-to-stand (reps)', v_sts,
      'Balance hold (s)', v_bal,
      'Next focus', nullif(v_trn->>'next_focus', '')));
    if v_kv <> '{}'::jsonb then
      v_sections := v_sections || jsonb_build_array(jsonb_build_object(
        'heading', 'Training', 'kind', 'kv', 'data', v_kv));
    end if;
  end if;

  if v_nut <> '{}'::jsonb then
    v_kv := jsonb_strip_nulls(jsonb_build_object(
      'Adherence', case when v_nut ? 'adherence' then (v_nut->>'adherence') || ' / 5' else null end,
      'Adherence basis', nullif(v_nut->>'adherence_basis', ''),
      'Weight change', nullif(v_nut->>'weight_change', ''),
      'Worked well', nullif(v_nut->>'worked_well', ''),
      'Challenges', nullif(v_nut->>'challenges', ''),
      'Reported changes', nullif(v_nut->>'reported_changes', '')));
    if v_kv <> '{}'::jsonb then
      v_sections := v_sections || jsonb_build_array(jsonb_build_object(
        'heading', 'Nutrition', 'kind', 'kv', 'data', v_kv));
    end if;
  end if;

  if nullif(trim(v_trn->>'doctor_flags'), '') is not null then
    v_flags := array_append(v_flags, 'Trainer: ' || trim(v_trn->>'doctor_flags'));
  end if;
  if nullif(trim(v_nut->>'doctor_flags'), '') is not null then
    v_flags := array_append(v_flags, 'Nutritionist: ' || trim(v_nut->>'doctor_flags'));
  end if;
  if array_length(v_flags, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Flags for Doctor', 'kind', 'list', 'data', to_jsonb(v_flags)));
  end if;

  if nullif(trim(v_trn->>'modifications'), '') is not null then
    v_adj := array_append(v_adj, 'Training: ' || trim(v_trn->>'modifications'));
  end if;
  if nullif(trim(v_nut->>'modifications'), '') is not null then
    v_adj := array_append(v_adj, 'Nutrition: ' || trim(v_nut->>'modifications'));
  end if;
  if array_length(v_adj, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Proposed Adjustments', 'kind', 'list', 'data', to_jsonb(v_adj)));
  end if;

  select jsonb_agg(jsonb_build_array(
           'Cycle ' || c.number,
           coalesce(tr.answers->>'adherence', '—'),
           coalesce(nu.answers->>'adherence', '—')) order by c.number)
    into v_trend
    from cycles c
    left join lateral (
      select fr.answers from form_responses fr join form_templates t on t.id = fr.template_id
       where fr.cycle_id = c.id and fr.member_id = v_member and t.key = 'feedback_training'
       order by fr.submitted_at desc nulls last, fr.created_at desc limit 1) tr on true
    left join lateral (
      select fr.answers from form_responses fr join form_templates t on t.id = fr.template_id
       where fr.cycle_id = c.id and fr.member_id = v_member and t.key = 'feedback_nutrition'
       order by fr.submitted_at desc nulls last, fr.created_at desc limit 1) nu on true
   where c.package_id = v_cyc.package_id and c.number <= v_cyc.number;
  if v_trend is not null then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Adherence Trend', 'kind', 'table', 'data', jsonb_build_object(
        'columns', jsonb_build_array('Cycle', 'Training adherence', 'Nutrition adherence'),
        'rows', v_trend)));
  end if;

  return jsonb_build_object(
    'title', 'Performance Report — ' || v_name,
    'generated_at', now(), 'cycle', v_cyc.number, 'sections', v_sections);
end $$;

-- ============ grants (0033 discipline: nothing inherits PUBLIC) ============
revoke execute on function _role_started(uuid, care_role)          from public, anon, authenticated;
revoke execute on function _open_review_consults(uuid, uuid)       from public, anon, authenticated;
revoke execute on function _start_program(uuid, date, text)        from public, anon, authenticated;
revoke execute on function activate_program(uuid, date)            from public, anon;
grant  execute on function activate_program(uuid, date)            to authenticated;
-- CREATE OR REPLACE keeps the existing grants on 5–9; restated so a rebuild from
-- scratch lands in the same place.
revoke execute on function submit_clinical_form(uuid, jsonb, jsonb)     from public, anon;
grant  execute on function submit_clinical_form(uuid, jsonb, jsonb)     to authenticated;
revoke execute on function add_manual_doctor_review(uuid, jsonb, jsonb) from public, anon;
grant  execute on function add_manual_doctor_review(uuid, jsonb, jsonb) to authenticated;
revoke execute on function close_cycle_open_next(uuid)              from public, anon, authenticated;
revoke execute on function run_daily_jobs(date)                     from public, anon, authenticated;
revoke execute on function _build_performance(uuid)                 from public, anon, authenticated;
