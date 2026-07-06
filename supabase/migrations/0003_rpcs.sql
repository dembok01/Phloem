-- PHLOEM migration 0003_rpcs.sql — business-logic RPCs per PHLOEM-BUILD-SPEC.md §6
-- All security definer; validate caller via auth_role(); write audit_log; create
-- notifications (dedupe_key appended with recipient id so fan-outs don't collide
-- on the unique constraint — logged assumption).

-- ============ Internal helpers (not client-callable; revoked below) ============

create or replace function _audit(p_actor uuid, p_action text, p_entity_type text,
                                  p_entity_id uuid, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_log(actor_id, action, entity_type, entity_id, meta)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_meta)
$$;

create or replace function _notify(p_user uuid, p_type text, p_title text,
                                   p_body text, p_link text, p_dedupe text)
returns void language sql security definer set search_path = public as $$
  insert into notifications(user_id, type, title, body, link, dedupe_key)
  values (p_user, p_type, p_title, p_body, p_link, p_dedupe)
  on conflict (dedupe_key) do nothing
$$;

-- Fan out to every active profile holding any of the given roles.
create or replace function _notify_roles(p_roles user_role[], p_type text, p_title text,
                                         p_body text, p_link text, p_dedupe_prefix text)
returns void language sql security definer set search_path = public as $$
  select _notify(p.id, p_type, p_title, p_body, p_link, p_dedupe_prefix || ':' || p.id)
  from profiles p where p.role = any(p_roles) and p.status = 'active'
$$;

-- Active care team of a member.
create or replace function _notify_care_team(p_member uuid, p_type text, p_title text,
                                             p_body text, p_link text, p_dedupe_prefix text)
returns void language sql security definer set search_path = public as $$
  select _notify(a.care_user_id, p_type, p_title, p_body, p_link, p_dedupe_prefix || ':' || a.care_user_id)
  from assignments a where a.member_id = p_member and a.active
$$;

-- Minimal §8-shaped report content stub. Real §8 builders (lib/reports/build/*,
-- Phase 4) pass content into the RPCs; the RPC stays the sole atomic write path.
create or replace function _report_stub(p_title text, p_cycle int, p_extra jsonb default '{}')
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('title', p_title, 'generated_at', now(), 'cycle', p_cycle,
                            'sections', '[]'::jsonb) || coalesce(p_extra, '{}'::jsonb)
$$;

-- §13 red-flag engine, DB-side (mirrored by lib/red-flags.ts for UI/unit tests).
create or replace function _red_flags(a jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare flags jsonb := '[]'; syms jsonb := coalesce(a->'activity_symptoms','[]'::jsonb);
        lim text := coalesce(a->>'limiting_factors',''); bs text := coalesce(a->>'breathing_stamina','');
begin
  if syms ? 'Exertional chest pain' then
    flags := flags || jsonb_build_object('id','chest_pain','label','Chest pain on exertion','severity','high');
  end if;
  if syms ? 'Breathlessness' then
    flags := flags || jsonb_build_object('id','breathlessness','label','Breathlessness on exertion','severity','high');
  end if;
  if syms ? 'Dizziness' then
    flags := flags || jsonb_build_object('id','dizziness','label','Dizziness during activity','severity','high');
  end if;
  if (a->>'cardiac_eval_12mo') = 'false' then
    flags := flags || jsonb_build_object('id','no_cardiac_eval','label','No cardiac evaluation in past 12 months','severity','medium');
  end if;
  if (a->>'joint_pain') = 'true' and lim ~* '(fall|balance)' then
    flags := flags || jsonb_build_object('id','fall_risk','label','Fall-risk indicators','severity','medium');
  end if;
  if bs <> '' and lower(trim(bs)) not in ('no','none') then
    flags := flags || jsonb_build_object('id','breathing_stamina','label','Reported breathing/stamina issues','severity','medium');
  end if;
  return flags;
end $$;

-- ============ §6 RPCs ============

create or replace function create_member_with_invite(
  p_full_name text, p_age int, p_gender text, p_language text, p_occupation text,
  p_city text, p_country text, p_relationship_to_caregiver text,
  p_phone text, p_whatsapp text, p_email text, p_address text, p_pin_code text,
  p_emergency_contact_name text, p_emergency_contact_phone text,
  p_caregiver_email text, p_duration_months int default 3
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_token uuid;
begin
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

-- Token-gated; runs via the service client from a server action. The auth user is
-- created by the GoTrue Admin API in that same action (SQL cannot safely create
-- auth.users rows on hosted projects); this RPC atomically does everything else.
-- Profile role always comes from the invite — never client-supplied.
create or replace function accept_invite(
  p_token uuid, p_user_id uuid, p_full_name text, p_phone text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv invites%rowtype;
begin
  if auth.uid() is not null and auth_role() is null then raise exception 'not_allowed'; end if;
  select * into v_inv from invites
   where token = p_token and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'invalid_invite'; end if;
  insert into profiles(id, role, full_name, email, phone)
  values (p_user_id, v_inv.role, p_full_name, v_inv.email, p_phone);
  if v_inv.member_id is not null and v_inv.role = 'caregiver' then
    update members set caregiver_id = p_user_id, status = 'signed_up'
     where id = v_inv.member_id;
  end if;
  update invites set used_at = now() where id = v_inv.id;
  perform _audit(p_user_id, 'invite.accepted', 'invite', v_inv.id,
                 jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id));
  return jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id);
end $$;

create or replace function mark_video_watched(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
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
  if not is_caregiver_of(p_member) then raise exception 'not_allowed'; end if;
  if (select onboarding_video_watched_at from members where id = p_member) is null then
    raise exception 'video_not_watched';
  end if;
  select fr.answers into v_ans
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.id = p_response and fr.member_id = p_member and t.key = 'onboarding';
  if v_ans is null then raise exception 'invalid_response'; end if;

  -- §4 data-split rule: contact identifiers → member_contacts, and REMOVED from
  -- answers; demographics → members (they also stay in answers per §4).
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

  -- Trainer gate: latest doctor report must carry clearance.
  if v_cons.type = 'trainer' then
    select content->>'clearance' into v_clearance from reports
     where member_id = v_cons.member_id and type in ('doctor_initial','doctor_review')
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

create or replace function resume_program(p_package uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pkg packages%rowtype; d int; v_name text;
begin
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  select * into v_pkg from packages where id = p_package and status = 'paused' for update;
  if not found then raise exception 'not_paused'; end if;
  d := greatest(1, current_date - v_pkg.paused_at::date);
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

-- cron/service only (also admin). Callable neither by anon nor authenticated (revoked below).
create or replace function close_cycle_open_next(p_cycle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cyc cycles%rowtype; v_next cycles%rowtype; v_pkg packages%rowtype; r care_role;
begin
  if auth.uid() is not null and auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  select * into v_cyc from cycles where id = p_cycle for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_pkg from packages where id = v_cyc.package_id;
  update cycles set status = 'closed' where id = p_cycle;
  select * into v_next from cycles
   where package_id = v_cyc.package_id and number = v_cyc.number + 1;
  if found then
    update cycles set status = 'active' where id = v_next.id;
    foreach r in array array['doctor','nutritionist','trainer','psychologist']::care_role[] loop
      insert into consultations(member_id, cycle_id, type)
      values (v_pkg.member_id, v_next.id, r);
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

-- service/internal (called from submit_feedback); also admin.
create or replace function compile_performance_report(p_cycle uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cyc cycles%rowtype; v_pkg packages%rowtype; v_report uuid; v_doctor uuid; v_name text;
begin
  select * into v_cyc from cycles where id = p_cycle;
  if not found then raise exception 'not_found'; end if;
  select * into v_pkg from packages where id = v_cyc.package_id;
  select full_name into v_name from members where id = v_pkg.member_id;
  insert into reports(member_id, cycle_id, type, content, created_by)
  values (v_pkg.member_id, p_cycle, 'performance',
          _report_stub('Performance Report — ' || v_name, v_cyc.number, null),
          auth.uid())
  returning id into v_report;
  select care_user_id into v_doctor from assignments
   where member_id = v_pkg.member_id and care_role = 'doctor' and active;
  if v_doctor is not null then
    perform _notify(v_doctor, 'performance_ready',
                    'Performance report ready — review before your call',
                    'Cycle ' || v_cyc.number || ' performance report for ' || v_name || '.',
                    '/clinician/clients/' || v_pkg.member_id, 'perf:' || p_cycle);
  end if;
  perform _audit(auth.uid(), 'performance.compiled', 'report', v_report,
                 jsonb_build_object('cycle_id', p_cycle));
  return v_report;
end $$;

create or replace function submit_feedback(p_response uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_fr form_responses%rowtype; v_key text; v_other text; v_other_done boolean;
begin
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
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  update members set status = 'inactive' where id = p_member;
  -- Logged assumption: open packages are completed so time-based jobs stop.
  update packages set status = 'completed', paused_at = null
   where member_id = p_member and status in ('active','paused');
  perform _audit(auth.uid(), 'member.deactivated', 'member', p_member, null);
end $$;

create or replace function reactivate_member(p_member uuid, p_duration_months int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pkg uuid; r care_role;
begin
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  insert into packages(member_id, duration_months, status)
  values (p_member, p_duration_months, 'not_started') returning id into v_pkg;
  update members set status = 'assigned' where id = p_member;
  -- Fresh initial consultation rows (prior team suggested in UI, editable). History untouched.
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
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  perform _audit(auth.uid(), 'report.viewed', 'report', p_report, null);
end $$;

-- ============ Execute privileges ============
-- Internal helpers + service-only RPCs must not be callable from the Data API by
-- anon/authenticated (auth.uid() IS NULL would otherwise let anon impersonate the
-- service path). security-definer callers (postgres-owned RPCs) are unaffected.
revoke execute on function _audit(uuid,text,text,uuid,jsonb)                       from public, anon, authenticated;
revoke execute on function _notify(uuid,text,text,text,text,text)                  from public, anon, authenticated;
revoke execute on function _notify_roles(user_role[],text,text,text,text,text)     from public, anon, authenticated;
revoke execute on function _notify_care_team(uuid,text,text,text,text,text)        from public, anon, authenticated;
revoke execute on function _red_flags(jsonb)                                       from public, anon, authenticated;
revoke execute on function _report_stub(text,int,jsonb)                            from public, anon, authenticated;
revoke execute on function accept_invite(uuid,uuid,text,text)                      from public, anon, authenticated;
revoke execute on function close_cycle_open_next(uuid)                             from public, anon, authenticated;
revoke execute on function compile_performance_report(uuid)                        from public, anon, authenticated;
-- Authenticated-facing RPCs: keep authenticated, drop anon (they fail closed anyway).
revoke execute on function create_member_with_invite(text,int,text,text,text,text,text,text,text,text,text,text,text,text,text,text,int) from public, anon;
revoke execute on function mark_video_watched(uuid)                                from public, anon;
revoke execute on function submit_onboarding(uuid,uuid,jsonb)                      from public, anon;
revoke execute on function assign_care_team(uuid,care_role,uuid)                   from public, anon;
revoke execute on function set_consultation_schedule(uuid,timestamptz,consult_mode,text) from public, anon;
revoke execute on function mark_meeting_done(uuid)                                 from public, anon;
revoke execute on function submit_clinical_form(uuid,jsonb,jsonb)                  from public, anon;
revoke execute on function activate_program(uuid)                                  from public, anon;
revoke execute on function pause_program(uuid)                                     from public, anon;
revoke execute on function resume_program(uuid)                                    from public, anon;
revoke execute on function submit_feedback(uuid)                                   from public, anon;
revoke execute on function deactivate_member(uuid)                                 from public, anon;
revoke execute on function reactivate_member(uuid,int)                             from public, anon;
revoke execute on function set_package_duration(uuid,int)                          from public, anon;
revoke execute on function log_report_view(uuid)                                   from public, anon;
