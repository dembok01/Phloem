-- PHLOEM migration 0008_member_portal.sql — §10 elderly (`member` role) portal
-- access + a care-team-names RPC for the caregiver/member portal.
--
-- The elderly login is a view-only `member`-role profile linked to a member via
-- members.member_user_id. It may see: its own member row, its plan reports, and
-- its consultation schedule — nothing else (no contacts, no clinical answers, no
-- wellbeing/doctor reports). Care-team names come through a security-definer RPC
-- (§3: caregiver/member = names+roles only) instead of broadening profiles RLS.

-- ============ helper ============
create or replace function is_member_self(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- auth_role() is NULL for suspended accounts ⇒ fails closed.
  select auth_role() = 'member'
     and exists (select 1 from members where id = m and member_user_id = auth.uid())
$$;

-- ============ member-role RLS (view-only, minimal) ============
create policy mem_self on members for select using (is_member_self(id));

create policy rep_member on reports for select
  using (is_member_self(member_id)
         and type in ('onboarding_summary','nutrition_plan','nutrition_review',
                      'training_plan','training_review'));

create policy cons_member on consultations for select using (is_member_self(member_id));

-- packages/cycles: the member may read their own so the portal can show progress.
create policy pkg_member on packages for select using (is_member_self(member_id));
create policy cyc_member on cycles for select
  using (exists (select 1 from packages p where p.id = package_id and is_member_self(p.member_id)));

-- ============ care-team names RPC (§3 names + roles only) ============
-- Callable by admin/coordinator, the member's caregiver, or the member self.
-- Returns [{role, name, specialization}] — never contact identifiers.
create or replace function get_care_team(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r user_role := auth_role();
begin
  if not (r in ('admin','coordinator') or is_caregiver_of(p_member) or is_member_self(p_member)) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'role', a.care_role,
             'name', p.full_name,
             'specialization', p.specialization)
           order by a.care_role)
    from assignments a join profiles p on p.id = a.care_user_id
    where a.member_id = p_member and a.active), '[]'::jsonb);
end $$;

revoke execute on function is_member_self(uuid) from anon;
revoke execute on function get_care_team(uuid) from anon;
