-- PHLOEM migration 0017_rpc_fail_closed.sql — CRITICAL security hardening
-- discovered during Task 4 verification (elevation plan Divergence D-5).
--
-- auth_role() returns NULL for a suspended profile. RLS USING clauses treat NULL
-- as "deny" (fail closed), but security-definer RPC guards of the form
--     if auth_role() not in ('admin','coordinator') then raise 'not_allowed';
-- evaluate `NULL not in (...)` = NULL, so the IF is skipped and the RPC PROCEEDS.
-- A suspended admin/coordinator/clinician therefore bypassed every write-path
-- authorization check within their unexpired-JWT window. Proven empirically:
-- a suspended coordinator got past resume_program's guard (reached 'not_paused').
--
-- Fix, applied uniformly:
--   * every non-service RPC gets an explicit `if auth_role() is null then raise`
--     (or, for the read RPC that returns empty, `if r is null then return ...`)
--     as its first statement — suspended callers now fail closed;
--   * is_caregiver_of / is_member_self return STRICT booleans (coalesce), so the
--     procedural `if not is_caregiver_of(...)` guards can never see NULL;
--   * the two service-callable RPCs (close_cycle_open_next here, run_daily_jobs in
--     0018) use `is distinct from 'admin'` so the cron path (auth.uid() IS NULL)
--     still runs while a suspended admin is denied.
-- Function bodies are reproduced verbatim from their latest definitions; the ONLY
-- change in each is the guard.

-- ============ strict-boolean ownership helpers ============
create or replace function is_caregiver_of(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'caregiver', false)
     and exists (select 1 from members where id = m and caregiver_id = auth.uid())
$$;

create or replace function is_member_self(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'member', false)
     and exists (select 1 from members where id = m and member_user_id = auth.uid())
$$;

-- ============ 0003 RPCs ============
create or replace function create_member_with_invite(
  p_full_name text, p_age int, p_gender text, p_language text, p_occupation text,
  p_city text, p_country text, p_relationship_to_caregiver text,
  p_phone text, p_whatsapp text, p_email text, p_address text, p_pin_code text,
  p_emergency_contact_name text, p_emergency_contact_phone text,
  p_caregiver_email text, p_duration_months int default 3
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_token uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  insert into members(full_name, age, gender, language, occupation, city, country,
                      relationship_to_caregiver, status)
  values (p_full_name, p_age, p_gender, p_language, p_occupation, p_city, p_country,
          p_relationship_to_caregiver, 'invited')
  returning id into v_member;
  insert into member_contacts(member_id, phone, whatsapp, email, address, pin_code,
                              emergency_contact_name, emergency_contact_phone)
  values (v_member, p_phone, p_whatsapp, p_email, p_address, p_pin_code,
          p_emergency_contact_name, p_emergency_contact_phone);
  insert into packages(member_id, duration_months, status)
  values (v_member, p_duration_months, 'not_started');
  insert into invites(email, role, member_id, invited_by)
  values (p_caregiver_email, 'caregiver', v_member, auth.uid())
  returning token into v_token;
  perform _audit(auth.uid(), 'member.created', 'member', v_member,
                 jsonb_build_object('caregiver_email', p_caregiver_email,
                                    'duration_months', p_duration_months));
  return v_token;
end $$;

create or replace function mark_video_watched(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not is_caregiver_of(p_member) then raise exception 'not_allowed'; end if;
  update members
     set onboarding_video_watched_at = coalesce(onboarding_video_watched_at, now()),
         status = case when status in ('invited','signed_up') then 'onboarding'::member_status else status end
   where id = p_member;
  perform _audit(auth.uid(), 'member.video_watched', 'member', p_member, null);
end $$;

create or replace function submit_onboarding(
  p_member uuid, p_response uuid, p_report_content jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_ans jsonb; v_flags jsonb; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not is_caregiver_of(p_member) then raise exception 'not_allowed'; end if;
  if (select onboarding_video_watched_at from members where id = p_member) is null then
    raise exception 'video_not_watched';
  end if;
  select fr.answers into v_ans
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.id = p_response and fr.member_id = p_member and t.key = 'onboarding';
  if v_ans is null then raise exception 'invalid_response'; end if;

  insert into member_contacts(member_id, phone, pin_code,
                              emergency_contact_name, emergency_contact_phone)
  values (p_member, v_ans->>'contact_number', v_ans->>'pin_code',
          v_ans->>'emergency_contact_name', v_ans->>'emergency_contact_phone')
  on conflict (member_id) do update
     set phone                   = coalesce(excluded.phone, member_contacts.phone),
         pin_code                = coalesce(excluded.pin_code, member_contacts.pin_code),
         emergency_contact_name  = coalesce(excluded.emergency_contact_name, member_contacts.emergency_contact_name),
         emergency_contact_phone = coalesce(excluded.emergency_contact_phone, member_contacts.emergency_contact_phone);

  v_ans := v_ans - 'contact_number' - 'pin_code'
                 - 'emergency_contact_name' - 'emergency_contact_phone';
  v_flags := _red_flags(v_ans);

  update members set
    full_name = coalesce(v_ans->>'full_name', full_name),
    age       = coalesce((v_ans->>'age')::int, age),
    gender    = coalesce(v_ans->>'gender', gender),
    language  = coalesce(v_ans->>'language', language),
    occupation= coalesce(v_ans->>'occupation', occupation),
    city      = coalesce(v_ans->>'city', city),
    country   = coalesce(v_ans->>'country', country),
    relationship_to_caregiver = coalesce(v_ans->>'relationship_to_caregiver', relationship_to_caregiver),
    red_flags = v_flags,
    status    = 'onboarded'
  where id = p_member returning full_name into v_name;

  update form_responses set answers = v_ans, submitted_at = now(),
         respondent_id = coalesce(respondent_id, auth.uid())
   where id = p_response;

  insert into reports(member_id, type, content, created_by)
  values (p_member, 'onboarding_summary',
          coalesce(p_report_content,
                   _report_stub('Onboarding Health Summary — ' || v_name, null,
                                jsonb_build_object('red_flags', v_flags))),
          auth.uid());

  perform _notify_roles(array['coordinator','admin']::user_role[], 'onboarded',
                        'Onboarding completed', v_name || ' completed onboarding.',
                        '/coordinator/members/' || p_member, 'onboarded:' || p_member);
  perform _audit(auth.uid(), 'onboarding.submitted', 'member', p_member,
                 jsonb_build_object('red_flags', v_flags));
end $$;

create or replace function assign_care_team(p_member uuid, p_role care_role, p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_asg uuid; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  if not exists (select 1 from profiles
                 where id = p_user and role::text = p_role::text and status = 'active') then
    raise exception 'role_mismatch_or_inactive';
  end if;
  update assignments set active = false, unassigned_at = now()
   where member_id = p_member and care_role = p_role and active;
  insert into assignments(member_id, care_user_id, care_role, assigned_by)
  values (p_member, p_user, p_role, auth.uid()) returning id into v_asg;
  if not exists (select 1 from consultations
                 where member_id = p_member and cycle_id is null and type = p_role
                   and report_status = 'pending' and meeting_status <> 'cancelled') then
    insert into consultations(member_id, cycle_id, type) values (p_member, null, p_role);
  end if;
  update members set status = 'assigned' where id = p_member and status = 'onboarded';
  select full_name into v_name from members where id = p_member;
  perform _notify(p_user, 'assigned', 'New member assigned',
                  'You have been assigned to ' || v_name || '.',
                  '/clinician/clients/' || p_member, 'assigned:' || v_asg);
  perform _audit(auth.uid(), 'care_team.assigned', 'assignment', v_asg,
                 jsonb_build_object('member_id', p_member, 'care_role', p_role, 'care_user_id', p_user));
  return v_asg;
end $$;

create or replace function set_consultation_schedule(
  p_cons uuid, p_at timestamptz, p_mode consult_mode, p_link text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_cons consultations%rowtype; v_pro uuid; v_cg uuid; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  update consultations
     set scheduled_at = p_at, mode = p_mode, meeting_link = p_link, meeting_status = 'scheduled'
   where id = p_cons returning * into v_cons;
  if not found then raise exception 'not_found'; end if;
  select full_name, caregiver_id into v_name, v_cg from members where id = v_cons.member_id;
  select care_user_id into v_pro from assignments
   where member_id = v_cons.member_id and care_role = v_cons.type and active;
  if v_pro is not null then
    perform _notify(v_pro, 'consult_scheduled', 'Consultation scheduled',
                    initcap(v_cons.type::text) || ' consultation for ' || v_name || '.',
                    '/clinician/clients/' || v_cons.member_id,
                    'sched:' || p_cons || ':' || extract(epoch from p_at)::bigint || ':' || v_pro);
  end if;
  if v_cg is not null then
    perform _notify(v_cg, 'consult_scheduled', 'Consultation scheduled',
                    initcap(v_cons.type::text) || ' consultation for ' || v_name || '.',
                    '/portal/members/' || v_cons.member_id || '/schedule',
                    'sched:' || p_cons || ':' || extract(epoch from p_at)::bigint || ':' || v_cg);
  end if;
  perform _audit(auth.uid(), 'consultation.scheduled', 'consultation', p_cons,
                 jsonb_build_object('at', p_at, 'mode', p_mode));
end $$;

create or replace function mark_meeting_done(p_cons uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cons consultations%rowtype; v_pro uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  update consultations
     set meeting_status = 'done', completed_at = now(), marked_done_by = auth.uid()
   where id = p_cons and meeting_status = 'scheduled' returning * into v_cons;
  if not found then raise exception 'not_scheduled'; end if;
  select care_user_id into v_pro from assignments
   where member_id = v_cons.member_id and care_role = v_cons.type and active;
  if v_pro is not null then
    perform _notify(v_pro, 'meeting_done', 'Meeting done — submit your form',
                    'Please submit your clinical form for this consultation.',
                    '/clinician/clients/' || v_cons.member_id, 'meetdone:' || p_cons);
  end if;
  perform _audit(auth.uid(), 'consultation.done', 'consultation', p_cons, null);
end $$;

-- submit_clinical_form: reproduced from 0015 (H-1 gate) + auth_role() null guard.
create or replace function submit_clinical_form(
  p_cons uuid, p_answers jsonb, p_report_content jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cons consultations%rowtype; v_key text; v_rtype report_type; v_tmpl uuid;
  v_resp uuid; v_report uuid; v_clearance text; v_name text; v_cycle_no int;
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

create or replace function activate_program(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pkg packages%rowtype; v_start date; v_end date; v_psych_pending boolean; n int; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  select * into v_pkg from packages
   where member_id = p_member and status = 'not_started'
   order by created_at desc limit 1 for update;
  if not found then raise exception 'no_package_to_start'; end if;
  if (select count(distinct type) from consultations
      where member_id = p_member and cycle_id is null
        and type in ('doctor','nutritionist','trainer')
        and report_status = 'submitted') < 3 then
    raise exception 'initial_reports_incomplete';
  end if;
  v_psych_pending := not exists (select 1 from consultations
    where member_id = p_member and cycle_id is null
      and type = 'psychologist' and report_status = 'submitted');

  v_start := current_date + 1;   -- program begins tomorrow (confirmed requirement)
  v_end   := (v_start + (v_pkg.duration_months || ' months')::interval)::date;
  update packages set start_date = v_start, end_date = v_end, status = 'active',
                      psych_override = v_psych_pending
   where id = v_pkg.id;
  for n in 1..v_pkg.duration_months loop
    insert into cycles(package_id, number, start_date, end_date, status)
    values (v_pkg.id, n, v_start + (n-1)*30, v_start + (n-1)*30 + 29,
            case when n = 1 then 'active'::cycle_status else 'upcoming'::cycle_status end);
  end loop;
  update members set status = 'active' where id = p_member;

  select full_name into v_name from members where id = p_member;
  perform _notify_care_team(p_member, 'program_activated', 'Program starts tomorrow',
                            v_name || '''s program starts ' || to_char(v_start, 'Dy, DD Mon') || '.',
                            '/clinician/clients/' || p_member, 'start:' || v_pkg.id);
  perform _notify((select caregiver_id from members where id = p_member),
                  'program_activated', 'Program starts tomorrow',
                  v_name || '''s program starts ' || to_char(v_start, 'Dy, DD Mon') || '.',
                  '/portal', 'start:' || v_pkg.id || ':caregiver');
  perform _audit(auth.uid(), 'program.activated', 'package', v_pkg.id,
                 jsonb_build_object('start_date', v_start, 'end_date', v_end,
                                    'psych_override', v_psych_pending));
  if v_psych_pending then
    perform _audit(auth.uid(), 'program.psych_override', 'package', v_pkg.id, null);
  end if;
end $$;

create or replace function pause_program(p_package uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pkg packages%rowtype; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  update packages set paused_at = now(), status = 'paused'
   where id = p_package and status = 'active' returning * into v_pkg;
  if not found then raise exception 'not_active'; end if;
  select full_name into v_name from members where id = v_pkg.member_id;
  perform _notify_care_team(v_pkg.member_id, 'program_paused', 'Program paused',
                            v_name || '''s program is paused.', null,
                            'pause:' || p_package || ':' || extract(epoch from now())::bigint);
  perform _notify((select caregiver_id from members where id = v_pkg.member_id),
                  'program_paused', 'Program paused', v_name || '''s program is paused.', null,
                  'pause:' || p_package || ':' || extract(epoch from now())::bigint || ':caregiver');
  perform _audit(auth.uid(), 'program.paused', 'package', p_package, null);
end $$;

-- resume_program: reproduced from 0015 (IST math) + auth_role() null guard.
create or replace function resume_program(p_package uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pkg packages%rowtype; d int; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  select * into v_pkg from packages where id = p_package and status = 'paused' for update;
  if not found then raise exception 'not_paused'; end if;
  d := greatest(1, (now() at time zone 'Asia/Kolkata')::date
                   - (v_pkg.paused_at at time zone 'Asia/Kolkata')::date);
  update cycles set end_date = end_date + d
   where package_id = p_package and status = 'active';
  update cycles set start_date = start_date + d, end_date = end_date + d
   where package_id = p_package and status = 'upcoming';
  update packages set end_date = end_date + d, total_paused_days = total_paused_days + d,
                      paused_at = null, status = 'active'
   where id = p_package;
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

-- close_cycle_open_next: reproduced from 0015 (idempotent) + suspended-admin denial
-- via `is distinct from` (service path with auth.uid() IS NULL still runs).
create or replace function close_cycle_open_next(p_cycle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cyc cycles%rowtype; v_next cycles%rowtype; v_pkg packages%rowtype; r care_role;
begin
  if auth.uid() is not null and auth_role() is distinct from 'admin' then raise exception 'not_allowed'; end if;
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

create or replace function submit_feedback(p_response uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_fr form_responses%rowtype; v_key text; v_other text; v_other_done boolean;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  select fr.* into v_fr from form_responses fr where fr.id = p_response;
  if not found then raise exception 'not_found'; end if;
  select t.key into v_key from form_templates t where t.id = v_fr.template_id;
  if v_fr.respondent_id <> auth.uid()
     or auth_role() not in ('nutritionist','trainer')
     or not is_assigned_to(v_fr.member_id)
     or v_key not in ('feedback_nutrition','feedback_training')
     or (v_key = 'feedback_nutrition' and auth_role() <> 'nutritionist')
     or (v_key = 'feedback_training'  and auth_role() <> 'trainer') then
    raise exception 'not_allowed';
  end if;
  update form_responses set submitted_at = now() where id = p_response and submitted_at is null;
  perform _audit(auth.uid(), 'feedback.submitted', 'form_response', p_response,
                 jsonb_build_object('cycle_id', v_fr.cycle_id));
  v_other := case v_key when 'feedback_nutrition' then 'feedback_training' else 'feedback_nutrition' end;
  select exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                 where fr.cycle_id = v_fr.cycle_id and fr.member_id = v_fr.member_id
                   and t.key = v_other and fr.submitted_at is not null)
    into v_other_done;
  if v_other_done then
    perform compile_performance_report(v_fr.cycle_id);
  end if;
end $$;

create or replace function deactivate_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  update members set status = 'inactive' where id = p_member;
  update packages set status = 'completed', paused_at = null
   where member_id = p_member and status in ('active','paused');
  perform _audit(auth.uid(), 'member.deactivated', 'member', p_member, null);
end $$;

create or replace function reactivate_member(p_member uuid, p_duration_months int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pkg uuid; r care_role;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  insert into packages(member_id, duration_months, status)
  values (p_member, p_duration_months, 'not_started') returning id into v_pkg;
  update members set status = 'assigned' where id = p_member;
  foreach r in array array['doctor','nutritionist','trainer','psychologist']::care_role[] loop
    if not exists (select 1 from consultations
                   where member_id = p_member and cycle_id is null and type = r
                     and report_status = 'pending' and meeting_status <> 'cancelled') then
      insert into consultations(member_id, cycle_id, type) values (p_member, null, r);
    end if;
  end loop;
  perform _audit(auth.uid(), 'member.reactivated', 'member', p_member,
                 jsonb_build_object('package_id', v_pkg, 'duration_months', p_duration_months));
  return v_pkg;
end $$;

create or replace function set_package_duration(p_package uuid, p_months int)
returns void language plpgsql security definer set search_path = public as $$
declare v_pkg packages%rowtype; v_last_no int; v_last_end date; n int;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  select * into v_pkg from packages where id = p_package for update;
  if not found then raise exception 'not_found'; end if;
  if v_pkg.status = 'not_started' then
    update packages set duration_months = p_months where id = p_package;
  else
    if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
    update packages
       set duration_months = p_months,
           end_date = (start_date + (p_months || ' months')::interval)::date + total_paused_days
     where id = p_package;
    delete from cycles where package_id = p_package and status = 'upcoming';
    select coalesce(max(number), 0) into v_last_no from cycles where package_id = p_package;
    select max(end_date) into v_last_end from cycles where package_id = p_package;
    if v_last_end is null then v_last_end := v_pkg.start_date - 1; end if;
    for n in (v_last_no + 1)..p_months loop
      insert into cycles(package_id, number, start_date, end_date, status)
      values (p_package, n, v_last_end + 1 + (n - v_last_no - 1)*30,
              v_last_end + 1 + (n - v_last_no - 1)*30 + 29, 'upcoming');
    end loop;
  end if;
  perform _audit(auth.uid(), 'package.duration_set', 'package', p_package,
                 jsonb_build_object('months', p_months));
end $$;

create or replace function log_report_view(p_report uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_role() is null then raise exception 'not_allowed'; end if;
  perform _audit(auth.uid(), 'report.viewed', 'report', p_report, null);
end $$;

-- ============ 0005 ============
create or replace function set_account_status(p_user_id uuid, p_status account_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_change_own_status'; end if;
  update profiles set status = p_status where id = p_user_id;
  if not found then raise exception 'not_found'; end if;
  perform _audit(auth.uid(), 'account.status_set', 'profile', p_user_id,
                 jsonb_build_object('status', p_status));
end $$;

-- ============ 0008 ============
create or replace function get_care_team(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r user_role := auth_role();
begin
  if r is null then return '[]'::jsonb; end if;  -- suspended/unauth ⇒ fail closed
  if not (r in ('admin','coordinator') or is_caregiver_of(p_member) or is_member_self(p_member)) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'role', a.care_role,
             'name', p.full_name,
             'specialization', p.specialization)
           order by a.care_role)
    from assignments a join profiles p on p.id = a.care_user_id
    where a.member_id = p_member and a.active), '[]'::jsonb);
end $$;

-- ============ 0010 ============
create or replace function set_report_sharing(p_report uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_type report_type; v_member uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  select type, member_id into v_type, v_member from reports where id = p_report;
  if not found then raise exception 'not_found'; end if;
  if v_type not in ('doctor_initial','doctor_review','performance') then
    raise exception 'not_shareable';
  end if;
  update reports set share_with_caregiver = p_shared where id = p_report;
  perform _audit(auth.uid(), 'report.sharing_set', 'report', p_report,
                 jsonb_build_object('shared', p_shared, 'member_id', v_member));
end $$;

-- ============ 0011 ============
create or replace function set_member_photo(p_member uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not (auth_role() = 'admin' or is_caregiver_of(p_member)) then
    raise exception 'not_allowed';
  end if;
  update members set photo_path = p_path where id = p_member;
  if not found then raise exception 'not_found'; end if;
  perform _audit(auth.uid(), 'member.photo_set', 'member', p_member,
                 jsonb_build_object('path', p_path));
end $$;

-- ============ 0012 ============
create or replace function set_member_elderly_mode(p_member uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_login uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not (auth_role() = 'admin' or is_caregiver_of(p_member)) then
    raise exception 'not_allowed';
  end if;
  select member_user_id into v_login from members where id = p_member;
  if v_login is null then raise exception 'no_member_login'; end if;
  update profiles
     set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb),
                                   '{elderly}', to_jsonb(p_enabled))
   where id = v_login;
  perform _audit(auth.uid(), 'member.elderly_mode_set', 'profile', v_login,
                 jsonb_build_object('member_id', p_member, 'enabled', p_enabled));
end $$;

create or replace function get_member_elderly_mode(p_member uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_login uuid; v_prefs jsonb;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not (auth_role() = 'admin' or is_caregiver_of(p_member)) then
    raise exception 'not_allowed';
  end if;
  select member_user_id into v_login from members where id = p_member;
  if v_login is null then return null; end if;
  select display_prefs into v_prefs from profiles where id = v_login;
  return coalesce((v_prefs->>'elderly')::boolean, true);
end $$;

-- ============ 0013 ============
create or replace function get_report_view_receipts(p_member uuid)
returns table(report_id uuid, last_viewed_at timestamptz, viewer_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not (auth_role() = 'admin'
          or (auth_role() in ('doctor','nutritionist','trainer','psychologist')
              and is_assigned_to(p_member))) then
    raise exception 'not_allowed';
  end if;
  return query
    select distinct on (r.id) r.id, a.created_at, p.full_name
      from reports r
      join audit_log a
        on a.entity_type = 'report' and a.entity_id = r.id and a.action = 'report.viewed'
      join profiles p
        on p.id = a.actor_id and p.role in ('caregiver','member')
     where r.member_id = p_member
       and (auth_role() = 'admin' or r.created_by = auth.uid())
     order by r.id, a.created_at desc;
end $$;
