-- PHLOEM migration 0028_activity.sql — W3 of the care-continuum spec.
--
-- "Flag non-active cases." Nothing in the system knew whether a family was still
-- engaged: a member could go three months without anyone opening a plan, and the
-- only signal was a coordinator's memory.
--
-- VOCABULARY, deliberately: this is `engagement`, never "inactive".
-- member_status.inactive already means "the package finished" — a good outcome.
-- Colliding the two words would make both unreadable on screen, so a disengaged
-- family is `quiet` or `at_risk`, and those states are DERIVED on read rather than
-- stored. Storing them would mean a nightly job that can silently stop running and
-- leave every member frozen in a stale state.

create table activity_events (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  actor_id  uuid references profiles(id) on delete set null,  -- null = anonymous check-in
  kind      text not null check (kind in (
              'portal_visit','report_view','form_submit','document_upload',
              'message_sent','checkin_response','consult_attended')),
  at        timestamptz not null default now(),
  -- The IST calendar day of `at`, written by record_activity. It exists because a
  -- unique index cannot be built on `(at at time zone 'Asia/Kolkata')::date`:
  -- that expression is STABLE, not IMMUTABLE (zone rules can change), so Postgres
  -- refuses it. Computing the day once at insert time is both legal and cheaper.
  day_key   date not null default (now() at time zone 'Asia/Kolkata')::date,
  meta      jsonb not null default '{}'
);

create index idx_activity_member on activity_events (member_id, at desc);

-- Presence events are one-per-day per actor: a caregiver refreshing the portal
-- twenty times is one visit, not twenty rows.
create unique index activity_presence_once_a_day
  on activity_events (member_id, actor_id, kind, day_key)
  where kind in ('portal_visit','report_view');

alter table activity_events enable row level security;

-- Who may see that a family has gone quiet: the people whose job it is to act on
-- it. Not the family themselves — this is an operational signal about them, and
-- surfacing "you have been inactive" to a worried adult child helps nobody.
create policy act_admin_coord on activity_events for select
  using (auth_role() in ('admin','coordinator'));
create policy act_clinician on activity_events for select
  using (auth_role() in ('doctor','nutritionist','trainer') and is_assigned_to(member_id));

-- ============ writing ============

-- Record one activity event. Callable by any signed-in user for a member they can
-- already reach; the unique index above makes presence events idempotent per day,
-- so callers may fire it on every page load without thinking about it.
create or replace function record_activity(
  p_member uuid, p_kind text, p_meta jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is null then return; end if;   -- suspended ⇒ silently no-op
  if p_kind not in ('portal_visit','report_view','form_submit','document_upload',
                    'message_sent','checkin_response','consult_attended') then
    raise exception 'bad_kind';
  end if;
  -- Only for members the caller can actually reach.
  if not (auth_role() in ('admin','coordinator')
          or is_assigned_to(p_member)
          or coalesce(is_caregiver_of(p_member), false)
          or coalesce(is_member_self(p_member), false)) then
    return;
  end if;

  insert into activity_events(member_id, actor_id, kind, meta)
  values (p_member, auth.uid(), p_kind, coalesce(p_meta, '{}'::jsonb))
  on conflict do nothing;                        -- the once-a-day presence index
end $$;

-- ============ reading: engagement, derived ============

-- When did someone from THIS FAMILY last do anything? Care-team activity does not
-- count — the question is whether the family is still with us.
create or replace function _last_family_activity(p_member uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(e.at)
    from activity_events e
    left join members m on m.id = e.member_id
   where e.member_id = p_member
     and (e.actor_id is null                                  -- anonymous check-in
          or e.actor_id = m.caregiver_id
          or e.actor_id = m.member_user_id)
$$;

-- Consultations that were booked, came and went, and were never marked done.
create or replace function _missed_consults(p_member uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from consultations
   where member_id = p_member
     and meeting_status = 'scheduled'
     and scheduled_at < now() - interval '1 day'
$$;

-- engaged | quiet | at_risk. Thresholds live here alone so every surface agrees.
create or replace function get_engagement(p_member uuid)
returns table (
  member_id uuid, last_activity_at timestamptz, days_quiet int,
  missed_consults int, state text, reason text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_last timestamptz; v_days int; v_missed int; v_state text; v_reason text;
  v_since timestamptz; v_status member_status;
begin
  if auth_role() is null then return; end if;
  if not (auth_role() in ('admin','coordinator')
          or is_assigned_to(p_member)) then
    return;                                       -- families do not see this about themselves
  end if;

  select status, created_at into v_status, v_since from members where id = p_member;
  if v_status is null then return; end if;

  v_last   := _last_family_activity(p_member);
  v_missed := _missed_consults(p_member);
  -- Never seen ⇒ measure from when the member was created, so a family that never
  -- engaged at all is caught rather than looking permanently fresh.
  v_days   := greatest(0, extract(day from now() - coalesce(v_last, v_since))::int);

  if v_status in ('invited','signed_up','inactive') then
    v_state := 'engaged';                          -- not yet, or no longer, in the programme
    v_reason := 'Not in an active programme';
  elsif v_missed >= 2 then
    v_state := 'at_risk';
    v_reason := v_missed || ' consultations booked and never held';
  elsif v_days > 28 then
    v_state := 'at_risk';
    v_reason := 'No activity from the family for ' || v_days || ' days';
  elsif v_days > 14 or v_missed = 1 then
    v_state := 'quiet';
    v_reason := case when v_missed = 1 then 'A consultation was booked and never held'
                     else 'No activity from the family for ' || v_days || ' days' end;
  else
    v_state := 'engaged';
    v_reason := case when v_last is null then 'Just joined'
                     else 'Active in the last ' || v_days || ' days' end;
  end if;

  return query select p_member, v_last, v_days, v_missed, v_state, v_reason;
end $$;

-- Every member the caller may see, worst first — the coordinator's "who needs a
-- call today" queue, and the source of the doctor's issue indicator.
create or replace function list_engagement()
returns table (
  member_id uuid, full_name text, status member_status,
  last_activity_at timestamptz, days_quiet int, missed_consults int,
  state text, reason text
)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name, m.status, e.last_activity_at, e.days_quiet,
         e.missed_consults, e.state, e.reason
    from members m
    cross join lateral get_engagement(m.id) e
   where auth_role() is not null
     and (auth_role() in ('admin','coordinator') or is_assigned_to(m.id))
   order by case e.state when 'at_risk' then 0 when 'quiet' then 1 else 2 end,
            e.days_quiet desc
$$;

revoke execute on function record_activity(uuid, text, jsonb) from public;
revoke execute on function _last_family_activity(uuid) from public;
revoke execute on function _missed_consults(uuid) from public;
revoke execute on function get_engagement(uuid) from public;
revoke execute on function list_engagement() from public;
grant execute on function record_activity(uuid, text, jsonb) to authenticated;
grant execute on function get_engagement(uuid) to authenticated;
grant execute on function list_engagement() to authenticated;
