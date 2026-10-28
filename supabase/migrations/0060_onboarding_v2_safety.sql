-- PHLOEM migration 0060_onboarding_v2_safety.sql — the Emergency & Safety section in
-- onboarding.
--
-- WHY (client item 3, owner approval 2026-10-28). New families give the safety details
-- as the last chapter of onboarding; current families give them on their dashboard or
-- to the coordinator by phone (0059). The client asked for this section, so it is the
-- one exception to "onboarding questions are frozen"; nothing else is re-worded but
-- the consent notice, which stops being true otherwise.
--
-- WHAT.
--   onboarding v2 = the live v1 + section s6 "Emergency & Safety" + one sentence in
--     the consent notice. Versioning, not mutation (the 0023/0052 pattern): v1 stays
--     for the responses that point at it. supabase/templates/onboarding.v2.json is the
--     same document, so scripts/seed.ts keeps v2 active.
--   Unsubmitted v1 drafts move to v2 — the onboarding page finds the draft by
--     template id, so a draft left on v1 would silently start over (the 2026-10-16
--     stranded-draft lesson). Every v1 field id is unchanged, so their answers carry.
--   submit_onboarding (restated from 0017): for a v2 response the s6 answers become the
--     member_safety record (_save_safety, consent from the family's own tick) and are
--     stripped from the answers — like the contact split above them — so they never
--     reach the Onboarding Summary or the answers clinicians read.
--   amend_onboarding (restated from 0040): refuses the s6 keys; the record is
--     corrected in member_safety (save_member_safety), not here.

insert into form_templates (key, version, schema, active)
select 'onboarding', 2,
       jsonb_set(
         jsonb_set(v1.schema, '{version}', '2'::jsonb),
         '{sections}',
         (select jsonb_agg(
                   case when s->>'id' = 's1' then
                     jsonb_set(s, '{fields}', (
                       select jsonb_agg(
                                case when f->>'id' = 'consent_info' then
                                  jsonb_set(f, '{text}', to_jsonb(replace(f->>'text',
                                    'Your contact details are never shared with clinicians.',
                                    'Your contact details are never shared with clinicians, except the Emergency & Safety details, which the trainer and doctor can see so they can act in an emergency.')))
                                else f end order by fi)
                         from jsonb_array_elements(s->'fields') with ordinality fe(f, fi)))
                   else s end order by si)
            from jsonb_array_elements(v1.schema->'sections') with ordinality se(s, si))
         || jsonb_build_array($s6${
  "id": "s6",
  "title": "Emergency & Safety",
  "fields": [
    {
      "id": "local_contact_name",
      "type": "text",
      "label": "Name of a contact person who lives nearby",
      "required": true
    },
    {
      "id": "local_contact_relation",
      "type": "text",
      "label": "Their relation to the member",
      "required": true
    },
    {
      "id": "local_contact_phone",
      "type": "text",
      "label": "Their phone number",
      "required": true
    },
    {
      "id": "local_contact_eta",
      "type": "select",
      "label": "How quickly can they reach the house?",
      "required": true,
      "options": [
        {
          "value": "under_10",
          "label": "Under 10 minutes"
        },
        {
          "value": "10_30",
          "label": "10–30 minutes"
        },
        {
          "value": "over_30",
          "label": "Over 30 minutes"
        }
      ]
    },
    {
      "id": "hospital_name",
      "type": "text",
      "label": "Nearest hospital",
      "required": true
    },
    {
      "id": "hospital_phone",
      "type": "text",
      "label": "Hospital phone number",
      "required": true
    },
    {
      "id": "ambulance_phone",
      "type": "text",
      "label": "Ambulance number",
      "required": true,
      "hint": "108 in India. If the member lives outside India, enter the local ambulance number."
    },
    {
      "id": "private_ambulance_phone",
      "type": "text",
      "label": "Private ambulance number",
      "hint": "Only if they have one — leave blank if not."
    },
    {
      "id": "someone_home",
      "type": "boolean",
      "label": "Is anyone else usually at home during session time?",
      "required": true
    },
    {
      "id": "bp_or_glucometer",
      "type": "boolean",
      "label": "Is there a BP machine or glucometer at home?",
      "required": true
    },
    {
      "id": "emergency_consent",
      "type": "boolean",
      "label": "I agree that PHLOEM's care team may contact the people above in an emergency, and that the member's trainer and doctor may see these details and the home address for that purpose.",
      "required": true
    }
  ]
}$s6$::jsonb)),
       true
  from form_templates v1
 where v1.key = 'onboarding' and v1.version = 1
on conflict (key, version) do update set schema = excluded.schema, active = excluded.active;
update form_templates set active = false where key = 'onboarding' and version < 2;

update form_responses fr
   set template_id = (select id from form_templates where key = 'onboarding' and version = 2),
       answers = case when fr.answers ? 'ambulance_phone' then fr.answers
                      else fr.answers || '{"ambulance_phone": "108"}'::jsonb end
  from form_templates t
 where t.id = fr.template_id and t.key = 'onboarding' and t.version = 1
   and fr.submitted_at is null;

create or replace function submit_onboarding(
  p_member uuid, p_response uuid, p_report_content jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_ans jsonb; v_flags jsonb; v_name text; v_version int;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not is_caregiver_of(p_member) then raise exception 'not_allowed'; end if;
  if (select onboarding_video_watched_at from members where id = p_member) is null then
    raise exception 'video_not_watched';
  end if;
  select fr.answers, t.version into v_ans, v_version
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

  -- 0060: the Emergency & Safety answers become the member_safety record and leave
  -- the answers, the same way the contact details just did.
  if v_version >= 2 then
    -- The family's own answer stands, even over consent the coordinator took on a call.
    if coalesce(v_ans->>'emergency_consent', '') <> 'true' then
      raise exception 'emergency_consent_required';
    end if;
    perform _save_safety(p_member, v_ans, 'family_form');
    v_ans := v_ans - array['local_contact_name','local_contact_relation','local_contact_phone',
                           'local_contact_eta','hospital_name','hospital_phone','ambulance_phone',
                           'private_ambulance_phone','someone_home','bp_or_glucometer',
                           'emergency_consent'];
  end if;
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

create or replace function amend_onboarding(p_member uuid, p_patch jsonb, p_reason text,
                                            p_report_content jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
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
      'contact_number','pin_code','emergency_contact_name','emergency_contact_phone',
      'full_name','age','gender','language','occupation','city','country','relationship_to_caregiver',
      'consent',
      'local_contact_name','local_contact_relation','local_contact_phone','local_contact_eta',
      'hospital_name','hospital_phone','ambulance_phone','private_ambulance_phone',
      'someone_home','bp_or_glucometer','emergency_consent'
    ]) then
      raise exception 'field_not_allowed';
    end if;
  end loop;

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

  v_flags := _red_flags(v_answers);
  update members set red_flags = v_flags where id = p_member;

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

  perform _audit(auth.uid(), 'onboarding.amended', 'member', p_member,
    jsonb_build_object('reason', btrim(p_reason),
                       'fields', (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k),
                       'response', v_new_resp, 'report', v_new_report));

  return v_new_report;
end $$;

revoke execute on function submit_onboarding(uuid, uuid, jsonb) from public, anon;
grant  execute on function submit_onboarding(uuid, uuid, jsonb) to authenticated;
revoke execute on function amend_onboarding(uuid, jsonb, text, jsonb) from public, anon;
grant  execute on function amend_onboarding(uuid, jsonb, text, jsonb) to authenticated;
