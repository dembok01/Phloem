-- PHLOEM migration 0024_cases.sql — W1.4 of the care-continuum spec.
--
-- A "case" is a clinical problem carried over time. Today the doctor's problem
-- list lives inside one intake report's JSON and is never seen again: nothing
-- tracks whether a member's diabetes is better or worse three cycles later. These
-- tables give each problem an identity and a chronological thread.
--
-- Authoring stays free: cases are seeded automatically from the doctor's
-- `problem_list` repeat-group at intake, and every monthly review appends an event
-- to each open case. The doctor tags nothing by hand unless they want to.
--
-- Writes go through RPCs only (§0.4). Clinicians get SELECT and nothing else, so
-- the RPC is the sole write path and every change is audited.

create table member_cases (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid not null references members(id) on delete cascade,
  title                text not null,
  detail               text,
  status               text not null default 'open'
                         check (status in ('open','monitoring','resolved')),
  severity             text not null default 'medium'
                         check (severity in ('low','medium','high')),
  -- §3: a caregiver sees a case only when the doctor deliberately shares it,
  -- mirroring reports.share_with_caregiver rather than inventing a second rule.
  share_with_caregiver boolean not null default false,
  opened_at            timestamptz not null default now(),
  opened_by            uuid references profiles(id),
  resolved_at          timestamptz,
  resolved_by          uuid references profiles(id),
  source_report        uuid references reports(id),
  created_at           timestamptz not null default now()
);

create table member_case_events (
  id       uuid primary key default gen_random_uuid(),
  case_id  uuid not null references member_cases(id) on delete cascade,
  at       timestamptz not null default now(),
  kind     text not null check (kind in ('opened','note','med_change','status_change','resolved')),
  summary  text not null,
  ref_type text,          -- 'report' | 'consultation' | 'form_response'
  ref_id   uuid,
  actor_id uuid references profiles(id)
);

create index idx_member_cases_member  on member_cases (member_id, status);
create index idx_case_events_case     on member_case_events (case_id, at desc);

-- One open case per member per title: re-running intake, or a doctor re-entering
-- the same condition, must not fork the same problem into two threads.
create unique index member_cases_one_open_per_title
  on member_cases (member_id, lower(title)) where status <> 'resolved';

alter table member_cases       enable row level security;
alter table member_case_events enable row level security;

-- ============ RLS (§3) ============
-- Note who is ABSENT from every policy: the psychologist (cases carry the medical
-- problem list, which §3 grants them no access to) and the coordinator (no
-- clinical data at all).
create policy case_admin     on member_cases for all    using (auth_role() = 'admin');
create policy case_clinician on member_cases for select
  using (auth_role() in ('doctor','nutritionist','trainer') and is_assigned_to(member_id));
create policy case_caregiver on member_cases for select
  using (share_with_caregiver and (is_caregiver_of(member_id) or is_member_self(member_id)));

-- Events inherit their case's visibility exactly — one rule, no second surface to
-- keep in sync.
create policy case_ev_admin on member_case_events for all
  using (auth_role() = 'admin');
create policy case_ev_read on member_case_events for select
  using (exists (select 1 from member_cases c where c.id = case_id));

-- ============ RPCs ============

create or replace function open_case(
  p_member uuid, p_title text, p_detail text default null,
  p_severity text default 'medium'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_case uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not (auth_role() = 'admin' or (auth_role() = 'doctor' and is_assigned_to(p_member))) then
    raise exception 'not_allowed';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'title_required'; end if;
  if p_severity not in ('low','medium','high') then raise exception 'bad_severity'; end if;

  -- An existing unresolved case with this title is reused, not duplicated.
  select id into v_case from member_cases
   where member_id = p_member and lower(title) = lower(trim(p_title)) and status <> 'resolved';
  if v_case is not null then return v_case; end if;

  insert into member_cases(member_id, title, detail, severity, opened_by)
  values (p_member, trim(p_title), nullif(trim(coalesce(p_detail, '')), ''), p_severity, auth.uid())
  returning id into v_case;

  insert into member_case_events(case_id, kind, summary, actor_id)
  values (v_case, 'opened', 'Case opened: ' || trim(p_title), auth.uid());

  perform _audit(auth.uid(), 'case.opened', 'member_case', v_case,
                 jsonb_build_object('member_id', p_member, 'title', trim(p_title)));
  return v_case;
end $$;

create or replace function set_case_status(p_case uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_old text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if p_status not in ('open','monitoring','resolved') then raise exception 'bad_status'; end if;
  select member_id, status into v_member, v_old from member_cases where id = p_case;
  if v_member is null then raise exception 'not_found'; end if;
  if not (auth_role() = 'admin' or (auth_role() = 'doctor' and is_assigned_to(v_member))) then
    raise exception 'not_allowed';
  end if;
  if v_old = p_status then return; end if;

  update member_cases
     set status      = p_status,
         resolved_at = case when p_status = 'resolved' then now() end,
         resolved_by = case when p_status = 'resolved' then auth.uid() end
   where id = p_case;

  insert into member_case_events(case_id, kind, summary, actor_id)
  values (p_case,
          case when p_status = 'resolved' then 'resolved' else 'status_change' end,
          case when p_status = 'resolved' then 'Case resolved' else 'Status changed to ' || p_status end
            || coalesce(' — ' || nullif(trim(p_note), ''), ''),
          auth.uid());

  perform _audit(auth.uid(), 'case.status_changed', 'member_case', p_case,
                 jsonb_build_object('from', v_old, 'to', p_status));
end $$;

create or replace function add_case_note(p_case uuid, p_summary text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_ev uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'summary_required'; end if;
  select member_id into v_member from member_cases where id = p_case;
  if v_member is null then raise exception 'not_found'; end if;
  if not (auth_role() = 'admin' or (auth_role() = 'doctor' and is_assigned_to(v_member))) then
    raise exception 'not_allowed';
  end if;

  insert into member_case_events(case_id, kind, summary, actor_id)
  values (p_case, 'note', trim(p_summary), auth.uid())
  returning id into v_ev;

  perform _audit(auth.uid(), 'case.note_added', 'member_case', p_case, '{}'::jsonb);
  return v_ev;
end $$;

create or replace function set_case_sharing(p_case uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_member uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  select member_id into v_member from member_cases where id = p_case;
  if v_member is null then raise exception 'not_found'; end if;
  if not (auth_role() = 'admin' or (auth_role() = 'doctor' and is_assigned_to(v_member))) then
    raise exception 'not_allowed';
  end if;
  update member_cases set share_with_caregiver = coalesce(p_shared, false) where id = p_case;
  perform _audit(auth.uid(), 'case.sharing_changed', 'member_case', p_case,
                 jsonb_build_object('shared', coalesce(p_shared, false)));
end $$;

-- ============ automatic seeding ============

-- Turn a doctor_initial `problem_list` repeat-group into cases. Internal: called
-- from submit_clinical_form inside the same transaction as the report, so a member
-- can never end up with a report whose problems produced no cases.
create or replace function _seed_cases_from_problem_list(
  p_member uuid, p_answers jsonb, p_report uuid, p_actor uuid
) returns int language plpgsql security definer set search_path = public as $$
declare item jsonb; v_title text; v_sev text; v_case uuid; n int := 0;
begin
  if p_answers->'problem_list' is null
     or jsonb_typeof(p_answers->'problem_list') <> 'array' then
    return 0;
  end if;

  for item in select jsonb_array_elements(p_answers->'problem_list') loop
    v_title := nullif(trim(coalesce(item->>'condition', '')), '');
    continue when v_title is null;

    -- how well controlled the doctor says it is → the case's severity
    v_sev := case item->>'control'
               when 'well'      then 'low'
               when 'partially' then 'medium'
               when 'poorly'    then 'high'
               else 'medium' end;

    select id into v_case from member_cases
     where member_id = p_member and lower(title) = lower(v_title) and status <> 'resolved';

    if v_case is null then
      insert into member_cases(member_id, title, detail, severity, opened_by, source_report)
      values (p_member, v_title,
              nullif(concat_ws(' · ',
                nullif(trim(coalesce(item->>'duration', '')), ''),
                case when (item->>'specialist') = 'true' then 'under specialist care' end), ''),
              v_sev, p_actor, p_report)
      returning id into v_case;

      insert into member_case_events(case_id, kind, summary, ref_type, ref_id, actor_id)
      values (v_case, 'opened', 'Identified at the initial doctor consultation',
              'report', p_report, p_actor);
      n := n + 1;
    else
      -- already tracked: record the re-assessment rather than forking the thread
      update member_cases set severity = v_sev where id = v_case;
      insert into member_case_events(case_id, kind, summary, ref_type, ref_id, actor_id)
      values (v_case, 'note', 'Re-assessed at consultation — control: ' ||
              coalesce(item->>'control', 'not stated'), 'report', p_report, p_actor);
    end if;
  end loop;
  return n;
end $$;

-- Append a review event to every open case, so the case-wise timeline fills in
-- month over month without the doctor tagging anything.
create or replace function _append_review_to_cases(
  p_member uuid, p_answers jsonb, p_report uuid, p_actor uuid, p_cycle_no int
) returns int language plpgsql security definer set search_path = public as $$
declare v_case uuid; v_summary text; n int := 0;
begin
  v_summary := coalesce(
    nullif(trim(coalesce(p_answers->>'condition_changes', '')), ''),
    'Reviewed at the monthly consultation' ||
      coalesce(' (cycle ' || p_cycle_no || ')', ''));

  for v_case in select id from member_cases where member_id = p_member and status <> 'resolved' loop
    insert into member_case_events(case_id, kind, summary, ref_type, ref_id, actor_id)
    values (v_case, 'note', v_summary, 'report', p_report, p_actor);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============ submit_clinical_form: + case seeding ============
-- Body reproduced verbatim from its 0017 definition; the ONLY change is the
-- case-seeding block marked below (same convention 0017 itself used).
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

  -- ============ 0024: cases ============
  -- The doctor's problem list becomes tracked cases at intake; every later review
  -- appends to the open ones. Same transaction as the report, so the two can never
  -- disagree about what problems this member has.
  if v_cons.type = 'doctor' then
    if v_cons.cycle_id is null then
      perform _seed_cases_from_problem_list(v_cons.member_id, p_answers, v_report, auth.uid());
    else
      perform _append_review_to_cases(v_cons.member_id, p_answers, v_report, auth.uid(), v_cycle_no);
    end if;
  end if;
  -- ============ end 0024 ============

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

-- ============ grants ============
revoke execute on function open_case(uuid, text, text, text) from public;
revoke execute on function set_case_status(uuid, text, text) from public;
revoke execute on function add_case_note(uuid, text) from public;
revoke execute on function set_case_sharing(uuid, boolean) from public;
revoke execute on function _seed_cases_from_problem_list(uuid, jsonb, uuid, uuid) from public;
revoke execute on function _append_review_to_cases(uuid, jsonb, uuid, uuid, int) from public;
grant execute on function open_case(uuid, text, text, text) to authenticated;
grant execute on function set_case_status(uuid, text, text) to authenticated;
grant execute on function add_case_note(uuid, text) to authenticated;
grant execute on function set_case_sharing(uuid, boolean) to authenticated;
