-- PHLOEM migration 0039_amend_onboarding.sql
-- Correcting submitted onboarding answers (design §10).
--
-- Additive only: one new function.
--
-- NOT a wizard re-run: resetting an active member's status to 'onboarding' would
-- fight the §9 lifecycle machine. This supersedes instead of mutating — a new
-- form_responses row and a new versioned report, leaving the original submission
-- intact as the record of what the family first told us.
--
-- get_onboarding_scoped already selects `order by fr.submitted_at desc limit 1`,
-- so every clinician view picks the amendment up with no code change.
--
-- Three things this refuses, each of which the original plan would have allowed:
--   * CONTACT identifiers. submit_onboarding strips contact_number, pin_code and
--     the emergency contact OUT of answers (§4 data-split) because the assigned
--     doctor reads that blob. Merging them back in would expose contact
--     identifiers to clinicians, which §3 forbids. They are edited through
--     update_member_contacts, into member_contacts, where clinicians cannot see.
--   * DEMOGRAPHICS. They live in members AND answers; update_member (0035) edits
--     both at once. Amending them here would change only answers and split the two.
--   * A STUB REPORT. The real summary is built in TypeScript (buildOnboardingSummary)
--     and passed in, exactly as submit_onboarding takes it; a bare _report_stub
--     would replace the doctor's full summary with empty sections.

create or replace function amend_onboarding(
  p_member uuid, p_patch jsonb, p_reason text, p_report_content jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_old_resp   form_responses%rowtype;
  v_answers    jsonb;
  v_flags      jsonb;
  v_name       text;
  v_new_resp   uuid;
  v_old_report reports%rowtype;
  v_new_report uuid;
  v_key        text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'summary_required'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key = any(array[
      -- contact identifiers: never back into answers (see header)
      'contact_number','pin_code','emergency_contact_name','emergency_contact_phone',
      -- demographics: edited via update_member, which keeps both copies in step
      'full_name','age','gender','language','occupation','city','country','relationship_to_caregiver'
    ]) then
      raise exception 'field_not_allowed';
    end if;
  end loop;

  -- fr.* — not * — so the join's form_templates columns cannot bleed into the row.
  select fr.* into v_old_resp
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.member_id = p_member and t.key = 'onboarding' and fr.submitted_at is not null
   order by fr.submitted_at desc limit 1;
  if v_old_resp.id is null then raise exception 'invalid_response'; end if;

  v_answers := v_old_resp.answers || p_patch;
  if v_answers = v_old_resp.answers then raise exception 'no_changes'; end if;

  select full_name into v_name from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;

  insert into form_responses(member_id, template_id, consultation_id, cycle_id,
                             respondent_id, answers, submitted_at)
  values (p_member, v_old_resp.template_id, v_old_resp.consultation_id, v_old_resp.cycle_id,
          auth.uid(), v_answers, now())
  returning id into v_new_resp;

  -- §13 red flags recomputed: a corrected symptom answer changes them.
  v_flags := _red_flags(v_answers);
  update members set red_flags = v_flags where id = p_member;

  -- Superseded, not overwritten. reports.version and reports.supersedes have
  -- existed since 0001; this is their first use.
  select * into v_old_report from reports
   where member_id = p_member and type = 'onboarding_summary'
   order by version desc, created_at desc limit 1;

  insert into reports(member_id, type, content, version, supersedes, created_by)
  values (p_member, 'onboarding_summary',
          coalesce(p_report_content,
                   _report_stub('Onboarding Health Summary — ' || v_name, null,
                                jsonb_build_object('red_flags', v_flags)))
            || jsonb_build_object('amended_reason', btrim(p_reason)),
          coalesce(v_old_report.version, 1) + 1, v_old_report.id, auth.uid())
  returning id into v_new_report;

  perform _notify_care_team(p_member, 'onboarding_amended',
    'Onboarding answers corrected',
    v_name || '''s onboarding answers were corrected and red flags rechecked.',
    '/clinician/clients/' || p_member, 'onb_amended:' || v_new_resp);
  perform _notify_roles(array['coordinator']::user_role[], 'onboarding_amended',
    'Onboarding answers corrected',
    v_name || '''s onboarding answers were corrected.',
    '/coordinator/members/' || p_member, 'onb_amended_c:' || v_new_resp);

  -- Keys and the reason, never values: the answers already live in form_responses.
  perform _audit(auth.uid(), 'onboarding.amended', 'member', p_member,
    jsonb_build_object('reason', btrim(p_reason),
                       'fields', (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k),
                       'response', v_new_resp, 'report', v_new_report));

  return v_new_report;
end $$;

revoke execute on function amend_onboarding(uuid,jsonb,text,jsonb) from public, anon;
grant  execute on function amend_onboarding(uuid,jsonb,text,jsonb) to authenticated;
