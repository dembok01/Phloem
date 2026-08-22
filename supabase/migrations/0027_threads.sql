-- PHLOEM migration 0027_threads.sql — W2 of the care-continuum spec.
--
-- Until now the system could only talk one way: notification rows nobody can
-- answer. A caregiver with a question had to phone the coordinator, and the care
-- team coordinated off-platform. These tables add conversation — inside the §3
-- permission matrix rather than beside it.
--
-- Two deliberate design decisions:
--
-- 1. ACCESS IS DERIVED, NOT STORED. There is no participants table. Who may read a
--    thread is computed from role + assignment (is_assigned_to / is_caregiver_of),
--    exactly like every other surface. A participants table would be a second
--    source of truth that drifts the moment a clinician is unassigned — and it
--    would keep an unassigned clinician reading a member's messages forever.
--
-- 2. THE PSYCHOLOGIST IS EXCLUDED FROM care_team AND family THREADS. This looks
--    harsh and is the safest reading of §3. Those threads will carry onboarding
--    health answers and clinical detail in other people's messages, and the matrix
--    grants the psychologist only 🔸-minimal demographics. No in-thread filter can
--    be trusted to hold that line, so the line is drawn at the thread. They get
--    their own kind ('psych', psychologist ↔ admin), mirroring the existing
--    psych-escalation-to-admin path.
--
-- Writes go through RPCs only (§0.4): no insert/update policy exists for
-- non-admins, so post_message is the sole way a message is created and every one of
-- them notifies and audits.

create table threads (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references members(id) on delete cascade,
  kind            text not null check (kind in ('care_team','family','case','psych')),
  subject         text not null,
  -- family threads only: which care roles the family addressed. NULL = the whole
  -- care team. Never widens access — it only narrows it further.
  audience        care_role[],
  case_id         uuid references member_cases(id) on delete cascade,
  status          text not null default 'open' check (status in ('open','resolved')),
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table thread_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references threads(id) on delete cascade,
  author_id  uuid references profiles(id),
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create table thread_reads (
  thread_id    uuid not null references threads(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index idx_threads_member    on threads (member_id, last_message_at desc);
create index idx_threads_open      on threads (member_id) where status = 'open';
create index idx_thread_messages   on thread_messages (thread_id, created_at desc);
create index idx_thread_reads_user on thread_reads (user_id);

alter table threads        enable row level security;
alter table thread_messages enable row level security;
alter table thread_reads   enable row level security;

-- ============ the visibility rule, in ONE place ============
-- Both the RLS policy and the RPC guards call this, so "who can see this thread"
-- cannot drift between the read path and the write path.
create or replace function _thread_visible(
  p_kind text, p_member uuid, p_audience care_role[]
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth_role() is null then false          -- suspended ⇒ fails closed
    when auth_role() = 'admin' then true
    when p_kind = 'care_team' then
      auth_role() = 'coordinator'
      or (auth_role() in ('doctor','nutritionist','trainer') and is_assigned_to(p_member))
    when p_kind = 'family' then
      coalesce(is_caregiver_of(p_member), false)
      or coalesce(is_member_self(p_member), false)
      or auth_role() = 'coordinator'
      or (auth_role() in ('doctor','nutritionist','trainer')
          and is_assigned_to(p_member)
          and (p_audience is null or auth_role()::text = any (p_audience::text[])))
    when p_kind = 'case' then
      auth_role() in ('doctor','nutritionist','trainer') and is_assigned_to(p_member)
    when p_kind = 'psych' then
      auth_role() = 'psychologist' and is_assigned_to(p_member)
    else false
  end
$$;

create or replace function can_access_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select _thread_visible(t.kind, t.member_id, t.audience)
    from threads t where t.id = p_thread
  ), false)
$$;

-- ============ RLS ============
create policy thr_admin on threads for all using (auth_role() = 'admin');
create policy thr_read  on threads for select
  using (_thread_visible(kind, member_id, audience));

-- Messages inherit their thread's visibility exactly — one rule, no second
-- surface to keep in sync. The subquery is itself RLS-filtered.
create policy thr_msg_admin on thread_messages for all using (auth_role() = 'admin');
create policy thr_msg_read  on thread_messages for select
  using (exists (select 1 from threads t where t.id = thread_id));

-- Read receipts are personal bookkeeping: your own rows, on threads you can see.
create policy thr_read_own on thread_reads for all
  using (auth_role() is not null and user_id = auth.uid())
  with check (auth_role() is not null and user_id = auth.uid()
              and can_access_thread(thread_id));

-- ============ RPCs ============

create or replace function start_thread(
  p_member uuid, p_kind text, p_subject text,
  p_audience care_role[] default null, p_case uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_thread uuid; v_role user_role := auth_role();
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if p_kind not in ('care_team','family','case','psych') then raise exception 'bad_kind'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'subject_required'; end if;
  if not exists (select 1 from members where id = p_member) then raise exception 'not_found'; end if;

  -- You may only open a thread you would be able to read.
  if not _thread_visible(p_kind, p_member, p_audience) then raise exception 'not_allowed'; end if;

  -- A family cannot open an internal thread, and a clinician cannot open one on a
  -- family's behalf: the kind must match who is asking.
  if p_kind = 'family' and v_role in ('caregiver','member') then
    null;                                     -- the family asking their care team
  elsif p_kind = 'family' and v_role in ('admin','coordinator','doctor','nutritionist','trainer') then
    null;                                     -- the care team reaching the family
  elsif p_kind in ('care_team','case') and v_role in ('caregiver','member') then
    raise exception 'not_allowed';
  elsif p_kind = 'psych' and v_role not in ('admin','psychologist') then
    raise exception 'not_allowed';
  end if;

  insert into threads(member_id, kind, subject, audience, case_id, created_by)
  values (p_member, p_kind, trim(p_subject),
          case when p_kind = 'family' then p_audience end,
          case when p_kind = 'case' then p_case end,
          auth.uid())
  returning id into v_thread;

  perform _audit(auth.uid(), 'thread.started', 'thread', v_thread,
                 jsonb_build_object('member_id', p_member, 'kind', p_kind));
  return v_thread;
end $$;

-- Post a message and tell the other side. "The other side" depends on the kind,
-- which is why this is a single function rather than a table insert.
create or replace function post_message(p_thread uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_t threads%rowtype; v_msg uuid; v_role user_role := auth_role();
  v_author text; v_member_name text; v_link text; v_preview text; r record;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required'; end if;
  select * into v_t from threads where id = p_thread;
  if not found then raise exception 'not_found'; end if;
  if not _thread_visible(v_t.kind, v_t.member_id, v_t.audience) then raise exception 'not_allowed'; end if;
  if v_t.status = 'resolved' then raise exception 'thread_resolved'; end if;

  insert into thread_messages(thread_id, author_id, body)
  values (p_thread, auth.uid(), trim(p_body))
  returning id into v_msg;

  update threads set last_message_at = now() where id = p_thread;

  -- The author has read their own message by definition.
  insert into thread_reads(thread_id, user_id, last_read_at)
  values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();

  select full_name into v_author from profiles where id = auth.uid();
  select full_name into v_member_name from members where id = v_t.member_id;
  v_preview := left(trim(p_body), 140);

  -- Deep link per audience: the family reads in the portal, the team in their shell.
  for r in
    select p.id as user_id, p.role
      from profiles p
     where p.status = 'active'
       and p.id <> auth.uid()
       and (
         -- the family side
         (v_t.kind = 'family' and (
            p.id = (select caregiver_id from members where id = v_t.member_id)
            or p.id = (select member_user_id from members where id = v_t.member_id)))
         -- the care-team side: assigned clinicians (respecting audience) + coordinator
         or (v_t.kind in ('family','care_team') and (
              p.role = 'coordinator'
              or exists (select 1 from assignments a
                          where a.member_id = v_t.member_id and a.active
                            and a.care_user_id = p.id
                            and a.care_role <> 'psychologist'
                            and (v_t.kind = 'care_team'
                                 or v_t.audience is null
                                 or a.care_role::text = any (v_t.audience::text[])))))
         or (v_t.kind = 'case' and exists (
              select 1 from assignments a
               where a.member_id = v_t.member_id and a.active and a.care_user_id = p.id
                 and a.care_role <> 'psychologist'))
         or (v_t.kind = 'psych' and (
              p.role = 'admin'
              or exists (select 1 from assignments a
                          where a.member_id = v_t.member_id and a.active
                            and a.care_user_id = p.id and a.care_role = 'psychologist')))
       )
  loop
    v_link := case
      when r.role in ('caregiver','member') then '/portal/members/' || v_t.member_id || '/messages'
      when r.role in ('admin') then '/admin/members/' || v_t.member_id
      when r.role = 'coordinator' then '/coordinator/members/' || v_t.member_id
      else '/clinician/clients/' || v_t.member_id || '?tab=messages'
    end;
    perform _notify(r.user_id, 'thread_message',
                    coalesce(v_author, 'Someone') || ' wrote about ' || coalesce(v_member_name, 'a member'),
                    v_preview, v_link, 'msg:' || v_msg || ':' || r.user_id);
  end loop;

  perform _audit(auth.uid(), 'thread.message_posted', 'thread', p_thread,
                 jsonb_build_object('message_id', v_msg, 'kind', v_t.kind));
  return v_msg;
end $$;

create or replace function mark_thread_read(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not can_access_thread(p_thread) then raise exception 'not_allowed'; end if;
  insert into thread_reads(thread_id, user_id, last_read_at)
  values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end $$;

create or replace function resolve_thread(p_thread uuid, p_resolved boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_t threads%rowtype;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  select * into v_t from threads where id = p_thread;
  if not found then raise exception 'not_found'; end if;
  if not _thread_visible(v_t.kind, v_t.member_id, v_t.audience) then raise exception 'not_allowed'; end if;
  -- The family may close their own question; otherwise it is a staff action.
  if not (auth_role() in ('admin','coordinator')
          or v_t.created_by = auth.uid()
          or auth_role() in ('doctor','nutritionist','trainer','psychologist')) then
    raise exception 'not_allowed';
  end if;
  update threads set status = case when coalesce(p_resolved, true) then 'resolved' else 'open' end
   where id = p_thread;
  perform _audit(auth.uid(), 'thread.resolved', 'thread', p_thread,
                 jsonb_build_object('resolved', coalesce(p_resolved, true)));
end $$;

-- Unread count for the signed-in user across every thread they can see. One query
-- for the shell badge rather than N per member.
create or replace function my_unread_threads()
returns table (thread_id uuid, member_id uuid, subject text, kind text, unread bigint, last_message_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.member_id, t.subject, t.kind,
         count(m.id) filter (
           where m.author_id is distinct from auth.uid()
             and (tr.last_read_at is null or m.created_at > tr.last_read_at)
         ) as unread,
         t.last_message_at
    from threads t
    left join thread_messages m on m.thread_id = t.id
    left join thread_reads tr on tr.thread_id = t.id and tr.user_id = auth.uid()
   where auth_role() is not null
     and _thread_visible(t.kind, t.member_id, t.audience)
   group by t.id, tr.last_read_at
  having count(m.id) filter (
           where m.author_id is distinct from auth.uid()
             and (tr.last_read_at is null or m.created_at > tr.last_read_at)
         ) > 0
   order by t.last_message_at desc
$$;

-- ============ realtime (pattern from 0020) ============
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'thread_messages') then
    alter publication supabase_realtime add table thread_messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'threads') then
    alter publication supabase_realtime add table threads;
  end if;
end $$;

-- ============ grants ============
revoke execute on function _thread_visible(text, uuid, care_role[]) from public;
revoke execute on function can_access_thread(uuid) from public;
revoke execute on function start_thread(uuid, text, text, care_role[], uuid) from public;
revoke execute on function post_message(uuid, text) from public;
revoke execute on function mark_thread_read(uuid) from public;
revoke execute on function resolve_thread(uuid, boolean) from public;
revoke execute on function my_unread_threads() from public;
grant execute on function _thread_visible(text, uuid, care_role[]) to authenticated;
grant execute on function can_access_thread(uuid) to authenticated;
grant execute on function start_thread(uuid, text, text, care_role[], uuid) to authenticated;
grant execute on function post_message(uuid, text) to authenticated;
grant execute on function mark_thread_read(uuid) to authenticated;
grant execute on function resolve_thread(uuid, boolean) to authenticated;
grant execute on function my_unread_threads() to authenticated;
