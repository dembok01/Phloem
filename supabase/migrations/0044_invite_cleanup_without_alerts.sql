-- PHLOEM migration 0044_invite_cleanup_without_alerts.sql
--
-- Additive in effect: replaces transfer_caregiver (0042) and
-- replace_caregiver_invite (0043), both introduced by this branch and called by no
-- code on main.
--
-- 0042/0043 closed superseded invites by setting expires_at = now(). But
-- run_daily_jobs (0019) notifies — and emails — every admin about each unused
-- invite past its expiry: "The invite for X has expired unused." For an invite that
-- was replaced on purpose, that is misleading and could prompt re-inviting the very
-- address that was dropped. The rows are now deleted instead, with the removed
-- addresses kept in the audit row. A plain delete of an invite never touches the
-- member; the member-deleting logic lives only inside revoke_invite.

create or replace function transfer_caregiver(p_member uuid, p_new_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_name text; v_status member_status; v_closed jsonb;
        v_stamp text := extract(epoch from now())::bigint::text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select caregiver_id, full_name, status into v_old, v_name, v_status from members where id = p_member;
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

  -- Remove every other unused caregiver invite for this member. Left open, a later
  -- click on the original link would run accept_invite and silently point
  -- caregiver_id back at whoever it was sent to. Deleted, not expired: the daily
  -- job emails every admin about each expired unused invite, and "the invite for X
  -- has expired" would prompt someone to re-invite an address deliberately dropped.
  -- A plain delete never touches the member (that logic is revoke_invite's alone),
  -- and the addresses removed are kept in the audit row below.
  with gone as (
    delete from invites
     where member_id = p_member and role = 'caregiver' and used_at is null
    returning email
  )
  select coalesce(jsonb_agg(email), '[]'::jsonb) into v_closed from gone;

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
                 jsonb_build_object('from', v_old, 'to', p_new_user,
                                    'status_before', v_status, 'invites_removed', v_closed));
end $$;

create or replace function replace_caregiver_invite(p_member uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_status member_status; v_email text := lower(btrim(coalesce(p_email, ''))); v_invite uuid;
        v_replaced jsonb;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select status into v_status from members where id = p_member;
  if v_status is null then raise exception 'not_found'; end if;
  if v_status <> 'invited' then raise exception 'member_past_invited'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_invite'; end if;

  -- Deleted, not expired, for the same reason as transfer_caregiver: an expired
  -- unused invite triggers the daily "invite expired" email to every admin.
  with gone as (
    delete from invites
     where member_id = p_member and role = 'caregiver' and used_at is null
    returning email
  )
  select coalesce(jsonb_agg(email), '[]'::jsonb) into v_replaced from gone;

  insert into invites(email, role, member_id, invited_by)
  values (v_email, 'caregiver', p_member, auth.uid())
  returning id into v_invite;

  perform _audit(auth.uid(), 'invite.replaced', 'invite', v_invite,
                 jsonb_build_object('member_id', p_member, 'email', v_email, 'replaced', v_replaced));
  return v_invite;
end $$;

revoke execute on function transfer_caregiver(uuid,uuid)         from public, anon;
grant  execute on function transfer_caregiver(uuid,uuid)         to authenticated;
revoke execute on function replace_caregiver_invite(uuid,text)   from public, anon;
grant  execute on function replace_caregiver_invite(uuid,text)   to authenticated;
