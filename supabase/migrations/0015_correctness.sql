-- PHLOEM migration 0015_correctness.sql — CODE-REVIEW correctness bundle.
-- (Blueprint numbered this 0010; the repo had already reached 0014, so it lands
--  as 0015 — see docs/ELEVATION_EXECUTION_PLAN.md ## Divergences.)
--   H-1  trainer gate reads the LAST NON-EMPTY doctor clearance (an unchanged
--        review no longer revokes clearance).
--   M-1  one performance report per cycle, enforced by the DB (race-proof).
--   M-2  close_cycle_open_next is idempotent (re-calls are no-ops).
--   M-3  resume_program day math computed on Asia/Kolkata calendar days.

-- ============ Part (a) — H-1: clearance carry-forward gate ============
-- Reproduces submit_clinical_form from 0003_rpcs.sql verbatim, changing ONLY the
-- trainer clearance gate.
create or replace function submit_clinical_form(
  p_cons uuid, p_answers jsonb, p_report_content jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cons consultations%rowtype; v_key text; v_rtype report_type; v_tmpl uuid;
  v_resp uuid; v_report uuid; v_clearance text; v_name text; v_cycle_no int;
begin
  select * into v_cons from consultations where id = p_cons;
  if not found then raise exception 'not_found'; end if;
  if auth_role()::text <> v_cons.type::text or not is_assigned_to(v_cons.member_id) then
    raise exception 'not_allowed';
  end if;
  if v_cons.meeting_status <> 'done' then raise exception 'meeting_not_done'; end if;

  -- Trainer gate (H-1 fix): a doctor_review that did not change clearance stores
  -- no clearance key; the gate reads the LAST NON-EMPTY clearance so an
  -- unchanged review carries the prior clearance forward instead of revoking it.
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
  insert into reports(member_id, cycle_id, type, content, created_by)
  values (v_cons.member_id, v_cons.cycle_id, v_rtype,
          coalesce(p_report_content,
                   _report_stub(initcap(replace(v_rtype::text, '_', ' ')) || ' — ' || v_name, v_cycle_no,
                                case when v_cons.type = 'doctor'
                                     then jsonb_build_object('clearance', p_answers->>'clearance')
                                     else '{}'::jsonb end)),
          auth.uid())
  returning id into v_report;

  update consultations set report_status = 'submitted' where id = p_cons;
  if v_cons.cycle_id is null then
    update members set status = 'initial_consults'
     where id = v_cons.member_id and status = 'assigned';
  end if;

  if v_cons.type = 'psychologist' and (p_answers->>'escalation') = 'true' then
    perform _notify_roles(array['admin']::user_role[], 'psych_escalation',
                          'Psychologist escalation', 'Needs admin attention: ' || v_name || '.',
                          '/admin/members/' || v_cons.member_id, 'esc:' || v_resp);
  end if;
  perform _audit(auth.uid(), 'clinical_form.submitted', 'form_response', v_resp,
                 jsonb_build_object('consultation_id', p_cons, 'report_id', v_report, 'type', v_rtype));
  return v_report;
end $$;

-- ============ Part (b) — M-1: one performance report per cycle ============
-- The compile path was check-then-insert; concurrent submit_feedback calls could
-- both pass the check. The partial unique index makes the DB the arbiter.
create unique index reports_one_performance_per_cycle
  on reports (cycle_id) where type = 'performance';

-- Reproduces compile_performance_report from 0006_cycle_jobs.sql verbatim,
-- changing ONLY the insert (on-conflict handles the lost race).
create or replace function compile_performance_report(p_cycle uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cyc cycles%rowtype; v_member uuid; v_report uuid; v_doctor uuid; v_name text;
begin
  select * into v_cyc from cycles where id = p_cycle;
  if not found then raise exception 'not_found'; end if;
  -- One performance report per cycle (submit_feedback and the cron soft-block may both fire).
  select id into v_report from reports where cycle_id = p_cycle and type = 'performance'
   order by created_at limit 1;
  if v_report is not null then return v_report; end if;

  select member_id into v_member from packages where id = v_cyc.package_id;
  select full_name into v_name from members where id = v_member;
  insert into reports(member_id, cycle_id, type, content, created_by)
  values (v_member, p_cycle, 'performance', _build_performance(p_cycle), auth.uid())
  on conflict (cycle_id) where type = 'performance' do nothing
  returning id into v_report;
  if v_report is null then
    -- Lost the race: another transaction compiled it first. Return that one.
    select id into v_report from reports
     where cycle_id = p_cycle and type = 'performance'
     order by created_at limit 1;
    return v_report;
  end if;

  select care_user_id into v_doctor from assignments
   where member_id = v_member and care_role = 'doctor' and active;
  if v_doctor is not null then
    perform _notify(v_doctor, 'performance_ready',
                    'Performance report ready — review before your call',
                    'Cycle ' || v_cyc.number || ' performance report for ' || v_name || '.',
                    '/clinician/clients/' || v_member, 'perf:' || p_cycle);
  end if;
  perform _audit(auth.uid(), 'performance.compiled', 'report', v_report,
                 jsonb_build_object('cycle_id', p_cycle));
  return v_report;
end $$;

-- ============ Part (c) — M-2: idempotent close_cycle_open_next ============
-- Reproduces close_cycle_open_next from 0003_rpcs.sql verbatim, with two edits:
-- an early no-op return when already closed, and a not-exists guard on the
-- consultation inserts (mirrors reactivate_member).
create or replace function close_cycle_open_next(p_cycle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cyc cycles%rowtype; v_next cycles%rowtype; v_pkg packages%rowtype; r care_role;
begin
  if auth.uid() is not null and auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  select * into v_cyc from cycles where id = p_cycle for update;
  if not found then raise exception 'not_found'; end if;
  if v_cyc.status = 'closed' then return; end if;  -- M-2: re-calls are no-ops
  select * into v_pkg from packages where id = v_cyc.package_id;
  update cycles set status = 'closed' where id = p_cycle;
  select * into v_next from cycles
   where package_id = v_cyc.package_id and number = v_cyc.number + 1;
  if found then
    update cycles set status = 'active' where id = v_next.id;
    foreach r in array array['doctor','nutritionist','trainer','psychologist']::care_role[] loop
      if not exists (select 1 from consultations
                     where member_id = v_pkg.member_id and cycle_id = v_next.id and type = r) then
        insert into consultations(member_id, cycle_id, type)
        values (v_pkg.member_id, v_next.id, r);
      end if;
    end loop;
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

-- ============ Part (d) — M-3: IST resume math ============
-- Reproduces resume_program from 0003_rpcs.sql verbatim, changing ONLY the day
-- count so it is computed on Asia/Kolkata calendar days.
create or replace function resume_program(p_package uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pkg packages%rowtype; d int; v_name text;
begin
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  select * into v_pkg from packages where id = p_package and status = 'paused' for update;
  if not found then raise exception 'not_paused'; end if;
  -- M-3: "Asia/Kolkata everywhere" — day counts computed on IST calendar days.
  d := greatest(1, (now() at time zone 'Asia/Kolkata')::date
                   - (v_pkg.paused_at at time zone 'Asia/Kolkata')::date);
  update cycles set end_date = end_date + d
   where package_id = p_package and status = 'active';
  update cycles set start_date = start_date + d, end_date = end_date + d
   where package_id = p_package and status = 'upcoming';
  update packages set end_date = end_date + d, total_paused_days = total_paused_days + d,
                      paused_at = null, status = 'active'
   where id = p_package;
  -- Manually scheduled consultations are NOT auto-shifted (coordinator reschedules;
  -- flagged in coordinator UI).
  select full_name into v_name from members where id = v_pkg.member_id;
  perform _notify_care_team(v_pkg.member_id, 'program_resumed', 'Program resumed',
                            v_name || '''s program resumed; dates shifted by ' || d || ' day(s).', null,
                            'resume:' || p_package || ':' || extract(epoch from now())::bigint);
  perform _notify((select caregiver_id from members where id = v_pkg.member_id),
                  'program_resumed', 'Program resumed',
                  v_name || '''s program resumed; dates shifted by ' || d || ' day(s).', null,
                  'resume:' || p_package || ':' || extract(epoch from now())::bigint || ':caregiver');
  perform _audit(auth.uid(), 'program.resumed', 'package', p_package,
                 jsonb_build_object('shifted_days', d));
end $$;
