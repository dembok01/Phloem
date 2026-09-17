-- PHLOEM migration 0043_replace_caregiver_invite.sql
--
-- Additive: one new function.
--
-- Invite a different person to be a member's family login, replacing any invite
-- still outstanding. The previous path inserted a second invite beside the first,
-- so two links were live and whoever accepted LAST silently became the caregiver.
--
-- Old invites are EXPIRED, never deleted. revoke_invite (0034) is deliberately not
-- used: when the member is still an 'invited' shell with no other invite, it
-- DELETES THE MEMBER — calling it before inserting the replacement would wipe out a
-- real client's record.
--
-- Refused for a member past 'invited' while the live accept_invite still writes
-- status = 'signed_up' unconditionally: accepting would reset a running member.
-- 0041 fixes accept_invite; once it is applied this guard can go.
create or replace function replace_caregiver_invite(p_member uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_status member_status; v_email text := lower(btrim(coalesce(p_email, ''))); v_invite uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select status into v_status from members where id = p_member;
  if v_status is null then raise exception 'not_found'; end if;
  if v_status <> 'invited' then raise exception 'member_past_invited'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_invite'; end if;

  update invites set expires_at = now()
   where member_id = p_member and role = 'caregiver' and used_at is null and expires_at > now();

  insert into invites(email, role, member_id, invited_by)
  values (v_email, 'caregiver', p_member, auth.uid())
  returning id into v_invite;

  perform _audit(auth.uid(), 'invite.replaced', 'invite', v_invite,
                 jsonb_build_object('member_id', p_member, 'email', v_email));
  return v_invite;
end $$;

revoke execute on function replace_caregiver_invite(uuid,text) from public, anon;
grant  execute on function replace_caregiver_invite(uuid,text) to authenticated;
