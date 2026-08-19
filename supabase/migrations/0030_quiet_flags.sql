-- PHLOEM migration 0030_quiet_flags.sql — W3.4 of the care-continuum spec.
--
-- §9 job 7: tell someone when a family goes quiet. Without this, `get_engagement`
-- is a state a coordinator has to remember to look at; with it, the system reaches
-- out first.
--
-- Its own RPC rather than a change to run_daily_jobs: that function is ~100 lines
-- of hardened §9 logic (0006, patched in 0019), and reproducing it verbatim to add
-- one loop would put every existing job at risk for no benefit. The cron route
-- calls both, in order.
--
-- Deduped per ISO week, so a family that stays quiet for a month produces four
-- nudges rather than thirty.

create or replace function flag_quiet_families(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_week text; v_flagged int := 0; v_escalated int := 0;
begin
  -- Service/cron (auth.uid() IS NULL) or an active admin. Same shape as
  -- run_daily_jobs: `is distinct from` so a suspended admin is denied while the
  -- cron path (no JWT) still runs.
  if auth.uid() is not null and auth_role() is distinct from 'admin' then
    raise exception 'not_allowed';
  end if;

  v_week := to_char(p_today, 'IYYY-"W"IW');

  for r in
    select m.id, m.full_name, e.state, e.reason, e.days_quiet
      from members m
      cross join lateral (
        select * from (
          select
            case
              when m.status in ('invited','signed_up','inactive') then 'engaged'
              when _missed_consults(m.id) >= 2 then 'at_risk'
              when extract(day from now() - coalesce(_last_family_activity(m.id), m.created_at))::int > 28 then 'at_risk'
              when extract(day from now() - coalesce(_last_family_activity(m.id), m.created_at))::int > 14
                   or _missed_consults(m.id) = 1 then 'quiet'
              else 'engaged'
            end as state,
            extract(day from now() - coalesce(_last_family_activity(m.id), m.created_at))::int as days_quiet,
            _missed_consults(m.id) as missed
        ) x
        cross join lateral (
          select case
            when x.missed >= 2 then x.missed || ' consultations booked and never held'
            else 'No activity from the family for ' || x.days_quiet || ' days'
          end as reason
        ) y
      ) e
     where e.state in ('quiet','at_risk')
  loop
    -- The coordinator owns re-engagement; they get every quiet family.
    perform _notify_roles(array['coordinator']::user_role[], 'family_quiet',
      r.full_name || ' has gone quiet',
      r.reason || '. A check-in link is the quickest way to reach them.',
      '/coordinator/members/' || r.id,
      'quiet:' || r.id || ':' || v_week);
    v_flagged := v_flagged + 1;

    -- at_risk escalates to admin as well: two missed consultations or a month of
    -- silence is a retention problem, not just a scheduling one.
    if r.state = 'at_risk' then
      perform _notify_roles(array['admin']::user_role[], 'family_at_risk',
        r.full_name || ' — no contact for ' || r.days_quiet || ' days',
        r.reason || '. Consider a call from the coordinator.',
        '/admin/members/' || r.id,
        'atrisk:' || r.id || ':' || v_week);
      v_escalated := v_escalated + 1;
    end if;
  end loop;

  return jsonb_build_object('flagged', v_flagged, 'escalated', v_escalated, 'week', v_week);
end $$;

revoke execute on function flag_quiet_families(date) from public, anon, authenticated;
