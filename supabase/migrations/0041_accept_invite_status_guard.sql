-- PHLOEM migration 0041_accept_invite_status_guard.sql
--
-- ⚠ NOT APPLIED. This file is committed but deliberately held for explicit owner
-- approval, because it REPLACES accept_invite — the live function every family and
-- professional signup goes through (app/(auth)/invite/[token]/actions.ts).
--
-- THE BUG. accept_invite runs `status = 'signed_up'` unconditionally. At enrolment
-- that is harmless — the member IS 'invited'. But it is wrong whenever the member
-- has moved on before the link is accepted:
--   * an admin deactivates an invited member, then the family clicks the link:
--     today the member silently flips 'inactive' -> 'signed_up', undoing the
--     deactivation;
--   * design §9.2's "invite a different caregiver" for a running member: accepting
--     would throw an ACTIVE member back to 'signed_up' and derail the lifecycle.
--
-- THE CHANGE. Exactly one expression: the status write becomes conditional on the
-- member still being 'invited'. caregiver_id is still always set. Everything else
-- is byte-for-byte the live definition (which is 0003's; 0017 did not change it).
--
-- IMPACT CHECKED BEFORE WRITING (2026-09-17, live project): exactly two caregiver
-- invites were still acceptable, both for members in 'invited' — the one case where
-- old and new behave identically. Applying this changes the outcome for no current
-- client. Until it is applied, do NOT use "invite a different caregiver" for a
-- member already past 'invited'.
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
    update members
       set caregiver_id = p_user_id,
           status = case when status = 'invited' then 'signed_up'::member_status else status end
     where id = v_inv.member_id;
  end if;
  update invites set used_at = now() where id = v_inv.id;
  perform _audit(p_user_id, 'invite.accepted', 'invite', v_inv.id,
                 jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id));
  return jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id);
end $$;

revoke execute on function accept_invite(uuid,uuid,text,text) from public, anon, authenticated;
