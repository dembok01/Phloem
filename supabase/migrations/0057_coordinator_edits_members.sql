-- PHLOEM migration 0057_coordinator_edits_members.sql — the coordinator corrects a
-- member's details and contact information.
--
-- WHY (owner decision 2026-10-10, coordinator request "an option to edit information
-- already entered"). Record correction (0035/0042) let admin and the family edit;
-- the coordinator, who enrols members and talks to families daily, could only look.
--
-- WHAT. update_member and update_member_contacts accept a coordinator with exactly
-- admin's field set: name, age, gender, language, occupation, city, country,
-- relationship; phone, WhatsApp, email, address, PIN, emergency contact. This changes
-- the §3 matrix for those two rows from 👁 to ✅ for the coordinator — nothing else:
-- the coordinator still cannot edit professionals, sign-in addresses, transfers or
-- onboarding answers. Both functions are restated from their latest versions (0042
-- and 0035); the only change is the role test. Audit rows already name the actor.

create or replace function update_member(p_member uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
  v_before  jsonb;
  v_after   jsonb;
  v_cg      uuid;
  v_resp    uuid;
  v_age     int;
  v_mirror  jsonb;
begin
  if v_role is null then raise exception 'not_allowed'; end if;

  if v_role in ('admin','coordinator') then
    -- manifest:member:admin
    -- manifest:member:coordinator
    v_allowed := array['full_name','age','gender','language','occupation',
                       'city','country','relationship_to_caregiver'];
  elsif is_caregiver_of(p_member) then
    -- manifest:member:caregiver
    v_allowed := array['language','occupation','city','country'];
  else
    raise exception 'not_allowed';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  select to_jsonb(m) into v_before from members m where id = p_member;
  if v_before is null then raise exception 'not_found'; end if;

  if p_patch ? 'full_name' and btrim(coalesce(p_patch->>'full_name','')) = '' then
    raise exception 'name_required';
  end if;

  if p_patch ? 'age' then
    -- Digits only (or blank, which clears), so the casts below can never raise a
    -- raw Postgres error in place of bad_age.
    if btrim(coalesce(p_patch->>'age','')) !~ '^[0-9]{0,3}$' then raise exception 'bad_age'; end if;
    v_age := nullif(btrim(coalesce(p_patch->>'age','')), '')::int;
    if v_age is not null and (v_age < 1 or v_age > 120) then raise exception 'bad_age'; end if;
  end if;

  -- A rename must not become a back door into the duplicate state 0034 closed.
  -- Narrower than the enrolment guard on purpose: that one can fall back to the
  -- pending invite's email, but a member already has a caregiver row or does not,
  -- and matching on a NULL caregiver would collide every unclaimed member.
  if p_patch ? 'full_name' then
    select caregiver_id into v_cg from members where id = p_member;
    if v_cg is not null and exists (
      select 1 from members m
       where m.id <> p_member
         and m.caregiver_id = v_cg
         and m.status in ('invited','signed_up','onboarding')
         and _norm_name(m.full_name) = _norm_name(p_patch->>'full_name')
    ) then
      raise exception 'duplicate_member';
    end if;
  end if;

  update members set
    full_name = case when p_patch ? 'full_name'
                     then btrim(p_patch->>'full_name') else full_name end,
    age       = case when p_patch ? 'age'
                     then nullif(btrim(coalesce(p_patch->>'age','')), '')::int else age end,
    gender    = case when p_patch ? 'gender'
                     then nullif(btrim(coalesce(p_patch->>'gender','')), '') else gender end,
    language  = case when p_patch ? 'language'
                     then nullif(btrim(coalesce(p_patch->>'language','')), '') else language end,
    occupation= case when p_patch ? 'occupation'
                     then nullif(btrim(coalesce(p_patch->>'occupation','')), '') else occupation end,
    city      = case when p_patch ? 'city'
                     then nullif(btrim(coalesce(p_patch->>'city','')), '') else city end,
    country   = case when p_patch ? 'country'
                     then nullif(btrim(coalesce(p_patch->>'country','')), '') else country end,
    relationship_to_caregiver = case when p_patch ? 'relationship_to_caregiver'
                     then nullif(btrim(coalesce(p_patch->>'relationship_to_caregiver','')), '')
                     else relationship_to_caregiver end
  where id = p_member;

  select to_jsonb(m) into v_after from members m where id = p_member;

  -- Nothing actually moved: fail rather than write a meaningless audit row. The
  -- UPDATE above rolls back with the exception.
  if (select jsonb_object_agg(k, v_before->k) from jsonb_object_keys(p_patch) k)
   = (select jsonb_object_agg(k, v_after->k)  from jsonb_object_keys(p_patch) k) then
    raise exception 'no_changes';
  end if;

  -- §4 keeps demographics in BOTH members and the onboarding answers, and
  -- get_onboarding_scoped hands the whole blob to admin, the caregiver and the
  -- assigned doctor. Editing one copy alone would show a doctor a stale age in
  -- one panel and a fresh one in another.
  select fr.id into v_resp
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.member_id = p_member and t.key = 'onboarding' and fr.submitted_at is not null
   order by fr.submitted_at desc limit 1;
  if v_resp is not null then
    -- Copied from the row as STORED, not from the raw patch: trimmed, blanks as
    -- NULL like members holds them, and age already a JSON number.
    v_mirror := (select jsonb_object_agg(k, v_after->k) from jsonb_object_keys(p_patch) k);
    update form_responses set answers = answers || v_mirror where id = v_resp;
  end if;

  perform _audit(auth.uid(), 'member.updated', 'member', p_member,
    jsonb_build_object(
      'before', (select jsonb_object_agg(k, v_before->k) from jsonb_object_keys(p_patch) k),
      'after',  (select jsonb_object_agg(k, v_after->k)  from jsonb_object_keys(p_patch) k)));
end $$;

create or replace function update_member_contacts(p_member uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
  v_before  jsonb;
  v_after   jsonb;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if not (v_role in ('admin','coordinator') or is_caregiver_of(p_member)) then
    raise exception 'not_allowed';
  end if;

  -- manifest:contacts:admin
  -- manifest:contacts:coordinator
  -- manifest:contacts:caregiver
  v_allowed := array['phone','whatsapp','email','address','pin_code',
                     'emergency_contact_name','emergency_contact_phone'];

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  if not exists (select 1 from members where id = p_member) then raise exception 'not_found'; end if;

  -- Upsert: a member enrolled but not yet onboarded has no contacts row.
  insert into member_contacts(member_id) values (p_member)
  on conflict (member_id) do nothing;

  select to_jsonb(mc) into v_before from member_contacts mc where member_id = p_member;

  update member_contacts set
    phone   = case when p_patch ? 'phone'
                   then nullif(btrim(coalesce(p_patch->>'phone','')), '') else phone end,
    whatsapp= case when p_patch ? 'whatsapp'
                   then nullif(btrim(coalesce(p_patch->>'whatsapp','')), '') else whatsapp end,
    email   = case when p_patch ? 'email'
                   then nullif(btrim(coalesce(p_patch->>'email','')), '') else email end,
    address = case when p_patch ? 'address'
                   then nullif(btrim(coalesce(p_patch->>'address','')), '') else address end,
    pin_code= case when p_patch ? 'pin_code'
                   then nullif(btrim(coalesce(p_patch->>'pin_code','')), '') else pin_code end,
    emergency_contact_name = case when p_patch ? 'emergency_contact_name'
                   then nullif(btrim(coalesce(p_patch->>'emergency_contact_name','')), '')
                   else emergency_contact_name end,
    emergency_contact_phone = case when p_patch ? 'emergency_contact_phone'
                   then nullif(btrim(coalesce(p_patch->>'emergency_contact_phone','')), '')
                   else emergency_contact_phone end
  where member_id = p_member;

  select to_jsonb(mc) into v_after from member_contacts mc where member_id = p_member;

  -- Nothing actually moved: fail rather than write a meaningless audit row. The
  -- UPDATE above rolls back with the exception.
  if (select jsonb_object_agg(k, v_before->k) from jsonb_object_keys(p_patch) k)
   = (select jsonb_object_agg(k, v_after->k)  from jsonb_object_keys(p_patch) k) then
    raise exception 'no_changes';
  end if;

  -- FIELD NAMES ONLY, never values. member_contacts being a table clinicians'
  -- policies do not cover is the structural mechanism behind the §3 rule that
  -- they never see contact identifiers; copying phone numbers into audit_log
  -- would move them right back out of it.
  perform _audit(auth.uid(), 'member.contacts_updated', 'member', p_member,
    jsonb_build_object('fields',
      (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k)));
end $$;

-- 0033 discipline (grants survive create or replace; restated for the record).
revoke execute on function update_member(uuid, jsonb) from public, anon;
grant  execute on function update_member(uuid, jsonb) to authenticated;
revoke execute on function update_member_contacts(uuid, jsonb) from public, anon;
grant  execute on function update_member_contacts(uuid, jsonb) to authenticated;
