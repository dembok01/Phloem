-- PHLOEM migration 0035_record_correction.sql
-- Post-enrolment record correction (design: docs/superpowers/specs/2026-09-10-record-correction-design.md).
--
-- Members, contacts and profiles were write-once at enrolment: fixing a typo in
-- a name meant deleting the member and re-enrolling them, which is the very
-- mis-enrolment path 0034 exists to clean up after.
--
-- Shape: one jsonb-patch RPC per entity. The CALLER'S ROLE chooses the field
-- whitelist inside the function, so the boundary is one readable list rather
-- than a column grant (Postgres column grants are per database role, and every
-- app user is `authenticated`).
--
-- Every function opens with an explicit NULL check on auth_role(): per 0017, a
-- suspended profile yields NULL and `NULL not in (...)` is NULL, so the guard
-- would be skipped and the function would proceed.

-- ============ 1. update_member ============
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
begin
  if v_role is null then raise exception 'not_allowed'; end if;

  if v_role = 'admin' then
    -- manifest:member:admin
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
    update form_responses set answers = answers || p_patch where id = v_resp;
  end if;

  perform _audit(auth.uid(), 'member.updated', 'member', p_member,
    jsonb_build_object(
      'before', (select jsonb_object_agg(k, v_before->k) from jsonb_object_keys(p_patch) k),
      'after',  (select jsonb_object_agg(k, v_after->k)  from jsonb_object_keys(p_patch) k)));
end $$;

-- ============ 2. update_member_contacts ============
create or replace function update_member_contacts(p_member uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if not (v_role = 'admin' or is_caregiver_of(p_member)) then raise exception 'not_allowed'; end if;

  -- manifest:contacts:admin
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

  -- FIELD NAMES ONLY, never values. member_contacts being a table clinicians'
  -- policies do not cover is the structural mechanism behind the §3 rule that
  -- they never see contact identifiers; copying phone numbers into audit_log
  -- would move them right back out of it.
  perform _audit(auth.uid(), 'member.contacts_updated', 'member', p_member,
    jsonb_build_object('fields',
      (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k)));
end $$;

-- ============ 3. update_my_profile ============
create or replace function update_my_profile(p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;

  -- manifest:profile:self
  v_allowed := array['full_name','phone','whatsapp'];

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  if p_patch ? 'full_name' and btrim(coalesce(p_patch->>'full_name','')) = '' then
    raise exception 'name_required';
  end if;

  update profiles set
    full_name = case when p_patch ? 'full_name'
                     then btrim(p_patch->>'full_name') else full_name end,
    phone     = case when p_patch ? 'phone'
                     then nullif(btrim(coalesce(p_patch->>'phone','')), '') else phone end,
    whatsapp  = case when p_patch ? 'whatsapp'
                     then nullif(btrim(coalesce(p_patch->>'whatsapp','')), '') else whatsapp end
  where id = auth.uid();
  if not found then raise exception 'not_found'; end if;

  perform _audit(auth.uid(), 'profile.updated', 'profile', auth.uid(),
    jsonb_build_object('fields',
      (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k), 'self', true));
end $$;

-- ============ 4. admin_update_profile ============
create or replace function admin_update_profile(p_user uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if v_role <> 'admin' then raise exception 'not_allowed'; end if;

  -- manifest:profile:admin
  v_allowed := array['full_name','phone','whatsapp','specialization'];

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  if p_patch ? 'full_name' and btrim(coalesce(p_patch->>'full_name','')) = '' then
    raise exception 'name_required';
  end if;

  update profiles set
    full_name = case when p_patch ? 'full_name'
                     then btrim(p_patch->>'full_name') else full_name end,
    phone     = case when p_patch ? 'phone'
                     then nullif(btrim(coalesce(p_patch->>'phone','')), '') else phone end,
    whatsapp  = case when p_patch ? 'whatsapp'
                     then nullif(btrim(coalesce(p_patch->>'whatsapp','')), '') else whatsapp end,
    specialization = case when p_patch ? 'specialization'
                     then nullif(btrim(coalesce(p_patch->>'specialization','')), '')
                     else specialization end
  where id = p_user;
  if not found then raise exception 'not_found'; end if;

  perform _audit(auth.uid(), 'profile.updated', 'profile', p_user,
    jsonb_build_object('fields',
      (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k), 'self', false));
end $$;

-- ============ grants (0033/0034 discipline: nothing inherits PUBLIC) ============
revoke execute on function update_member(uuid,jsonb)           from public, anon;
grant  execute on function update_member(uuid,jsonb)           to authenticated;
revoke execute on function update_member_contacts(uuid,jsonb)  from public, anon;
grant  execute on function update_member_contacts(uuid,jsonb)  to authenticated;
revoke execute on function update_my_profile(jsonb)            from public, anon;
grant  execute on function update_my_profile(jsonb)            to authenticated;
revoke execute on function admin_update_profile(uuid,jsonb)    from public, anon;
grant  execute on function admin_update_profile(uuid,jsonb)    to authenticated;
