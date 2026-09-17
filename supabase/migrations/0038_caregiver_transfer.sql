-- PHLOEM migration 0038_caregiver_transfer.sql
-- Moving a member to a different family login (design §9.1).
--
-- Additive only: one new function. The accept_invite status fix the plan bundled
-- here was split out to 0041, because it modifies a live authentication function;
-- see that file.
--
-- members.caregiver_id was written exactly once, by accept_invite. If the wrong
-- sibling signed up, or a son takes over from a daughter, there was no path but
-- delete-and-re-enrol.

-- Access moves the instant caregiver_id flips, because every gate in the system
-- reads is_caregiver_of(). That is correct and it is also abrupt, so both people
-- are notified and the admin UI says so before confirming.
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

  update members set caregiver_id = p_new_user where id = p_member;

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

revoke execute on function transfer_caregiver(uuid,uuid) from public, anon;
grant  execute on function transfer_caregiver(uuid,uuid) to authenticated;
