-- PHLOEM migration 0042_record_correction_review_fixes.sql
--
-- Fixes from the final whole-branch review. Additive in effect: it replaces only
-- functions introduced by this branch (0035, 0037, 0038), none of which any code on
-- main calls.
--
--  * update_member — a non-numeric age now raises bad_age instead of a raw cast
--    error; the onboarding mirror copies values from the row as stored (trimmed,
--    blanks as NULL, age a number) rather than from the raw patch.
--  * sync_my_email / admin_set_profile_email — the audit row records from/to.
--    profiles.email is NOT display-only (0037's header was wrong): lib/notify.ts
--    sends notification email to it. An address change is exactly the event
--    someone investigating a takeover needs, and member.created already records an
--    address.
--  * transfer_caregiver — closes the member's other unused caregiver invites, and
--    moves an 'invited' member to 'signed_up' so the new family can begin onboarding.

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

create or replace function sync_my_email()
returns void language plpgsql security definer set search_path = public as $$
declare v_auth_email text; v_old text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;

  select email into v_auth_email from auth.users where id = auth.uid();
  if v_auth_email is null then raise exception 'not_found'; end if;

  select email into v_old from profiles where id = auth.uid();
  if v_old is not distinct from v_auth_email then return; end if;

  update profiles set email = v_auth_email where id = auth.uid();

  perform _audit(auth.uid(), 'profile.email_changed', 'profile', auth.uid(),
                 jsonb_build_object('self', true, 'from', v_old, 'to', v_auth_email));
end $$;

create or replace function admin_set_profile_email(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_auth_email text; v_old text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select email into v_auth_email from auth.users where id = p_user;
  if v_auth_email is null then raise exception 'not_found'; end if;
  if lower(btrim(v_auth_email)) <> lower(btrim(coalesce(p_email, ''))) then
    raise exception 'email_mismatch';
  end if;

  select email into v_old from profiles where id = p_user;
  update profiles set email = v_auth_email where id = p_user;
  if not found then raise exception 'not_found'; end if;

  perform _audit(auth.uid(), 'profile.email_changed', 'profile', p_user,
                 jsonb_build_object('self', false, 'from', v_old, 'to', v_auth_email));
end $$;

create or replace function transfer_caregiver(p_member uuid, p_new_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_name text; v_stamp text := extract(epoch from now())::bigint::text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select caregiver_id, full_name into v_old, v_name from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;
  if v_old is not distinct from p_new_user then raise exception 'same_caregiver'; end if;

  if not exists (
    select 1 from profiles
     where id = p_new_user and role = 'caregiver' and status = 'active'
  ) then
    raise exception 'role_mismatch_or_inactive';
  end if;

  -- A member now linked to a real family login is at least signed_up; left at
  -- 'invited' the new family would never be offered onboarding.
  update members
     set caregiver_id = p_new_user,
         status = case when status = 'invited' then 'signed_up'::member_status else status end
   where id = p_member;

  -- Close every other unused caregiver invite for this member. Left open, a later
  -- click on the original link would run accept_invite and silently point
  -- caregiver_id back at whoever it was sent to.
  update invites set expires_at = now()
   where member_id = p_member and role = 'caregiver' and used_at is null and expires_at > now();

  -- The stamp keeps the dedupe keys unique, so a member moved A→B→A→B still
  -- notifies each time instead of the unique dedupe_key swallowing the repeat.
  perform _notify(p_new_user, 'caregiver_transfer',
                  'You now manage ' || v_name || '''s care',
                  'Their plans, reports and schedule are in your portal.',
                  '/portal', 'cg_transfer_in:' || p_member || ':' || p_new_user || ':' || v_stamp);
  if v_old is not null then
    perform _notify(v_old, 'caregiver_transfer',
                    'You no longer manage ' || v_name || '''s care',
                    'Their record has moved to another family member.',
                    '/portal', 'cg_transfer_out:' || p_member || ':' || v_old || ':' || v_stamp);
  end if;

  perform _audit(auth.uid(), 'member.caregiver_transferred', 'member', p_member,
                 jsonb_build_object('from', v_old, 'to', p_new_user));
end $$;

revoke execute on function update_member(uuid,jsonb)             from public, anon;
grant  execute on function update_member(uuid,jsonb)             to authenticated;
revoke execute on function sync_my_email()                       from public, anon;
grant  execute on function sync_my_email()                       to authenticated;
revoke execute on function admin_set_profile_email(uuid,text)    from public, anon;
grant  execute on function admin_set_profile_email(uuid,text)    to authenticated;
revoke execute on function transfer_caregiver(uuid,uuid)         from public, anon;
grant  execute on function transfer_caregiver(uuid,uuid)         to authenticated;
