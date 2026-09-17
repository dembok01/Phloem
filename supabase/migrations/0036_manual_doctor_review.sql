-- PHLOEM migration 0036_manual_doctor_review.sql — a doctor records a follow-up
-- review by hand.
--
-- WHY. A review report normally comes from a cycle's review consultation, and
-- cycles only exist once activate_program runs — which needs the nutritionist's
-- and trainer's initial reports too. Members whose nutrition/training reports never
-- arrived therefore sit forever at "initial doctor report only": the doctor holds
-- the 30-day follow-up anyway but has nowhere to record it.
--
-- WHAT. One RPC, add_manual_doctor_review, that files a doctor_review report
-- without a consultation. It deliberately creates NO consultations row: a
-- cycle_id-NULL doctor consultation would read as a second *initial* consult to
-- activate_program, assign_care_team and the clinician form panel. The report and
-- its form_response carry cycle_id NULL; everything that reads doctor reviews
-- (clearance resolution, measures, progress summary, portal sharing) already keys
-- on report type / template key, not on a consultation.
--
-- Stopgap by request (2026-09-17) until the proper fix for stalled initial rounds
-- is decided. Numbered 0036 because 0035 (record correction) is applied to the
-- hosted project from its own branch.

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

  insert into reports(member_id, type, content, created_by)
  values (p_member, 'doctor_review', p_report_content, auth.uid())
  returning id into v_report;

  -- Same case-timeline append a cycle review gets (0024).
  perform _append_review_to_cases(p_member, p_answers, v_report, auth.uid(), null);

  perform _audit(auth.uid(), 'clinical_form.submitted', 'form_response', v_resp,
                 jsonb_build_object('report_id', v_report, 'type', 'doctor_review', 'manual', true));
  return v_report;
end $$;

-- 0033 discipline: nothing inherits PUBLIC.
revoke execute on function add_manual_doctor_review(uuid,jsonb,jsonb) from public, anon;
grant  execute on function add_manual_doctor_review(uuid,jsonb,jsonb) to authenticated;
