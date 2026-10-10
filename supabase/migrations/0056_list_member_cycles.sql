-- PHLOEM migration 0056_list_member_cycles.sql — a member's cycle dates, for the
-- people who may already see that member.
--
-- WHY. cyc_read (0002) grants an assigned clinician their member's cycles, but checks
-- it through `packages`, which only admin, coordinator and the family can read — so a
-- clinician's policy subquery finds no package and they see no cycles at all. The
-- nutritionist's diet reviews (0055) are filed per cycle and need the dates.
--
-- WHAT. A read-only function returning the cycles alone (number, dates, status) to
-- admin, coordinator, an assigned clinician, the caregiver or the member. Nobody gains
-- package rows: duration, pauses and the rest stay where §3 put them.

create or replace function list_member_cycles(p_member uuid)
returns table(id uuid, number int, start_date date, end_date date, status cycle_status)
language sql stable security definer set search_path = public as $$
  select c.id, c.number, c.start_date, c.end_date, c.status
    from cycles c join packages p on p.id = c.package_id
   where p.member_id = p_member
     and (auth_role() in ('admin','coordinator')
          or is_assigned_to(p_member) or is_caregiver_of(p_member) or is_member_self(p_member))
   order by c.number
$$;

revoke execute on function list_member_cycles(uuid) from public, anon;
grant  execute on function list_member_cycles(uuid) to authenticated;
