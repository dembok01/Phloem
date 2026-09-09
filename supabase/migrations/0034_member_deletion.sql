-- PHLOEM migration 0034_member_deletion.sql — the admin's undo for a mis-enrolment,
-- plus the two gaps that made mis-enrolments multiply.
--
-- WHAT WENT WRONG. The audit log shows every duplicate member in the dev project
-- is a deliberate second `member.created` by the admin, minutes after the first:
--   * Haseena Haja  — first enrolment carried the wrong caregiver email (the one
--                     belonging to the member enrolled 8 minutes earlier);
--   * Deepak Chandramohan — wrong caregiver email, then a third row purely to
--                     change duration_months from 3 to 1;
--   * Anjana shine  — three enrolments to the same address, the first two invites
--                     never used, one of them revoked yet its member left behind.
-- The cause is not a duplicate insert path. It is that enrolment was a one-way
-- door: no way to remove a member, and `revokeInvite` deleted only the invite —
-- `invites.member_id` is the one FK to members WITHOUT `on delete cascade`, so the
-- member row survived as an orphan. Every correction therefore became a new row,
-- and the coordinator then assigned care teams to the wrong copies.
--
-- THREE PARTS, in the order they close the loop:
--   1. delete_member      — admin-only, name-confirmed, audited hard delete;
--   2. create_member_with_invite — refuses an obvious re-enrolment;
--   3. revoke_invite      — takes the shell member with the invite.
--
-- Why hard delete and not an archive flag: the rows this exists to remove are
-- junk, and an archive leaves them in every raw query, export and count forever.
-- The deletion itself stays in history — audit_log.entity_id has no FK to
-- members, so the `member.deleted` row and its snapshot outlive the member.

-- ============ name normalisation ============
-- Shared by the confirmation check and the duplicate guard, and mirrored exactly
-- by normalizeMemberName() in lib/member-duplicates.ts (the client arms the delete
-- button on that comparison; a drift shows up as `name_mismatch`).
create or replace function _norm_name(p text) returns text
language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

-- ============ 1. delete_member ============
create or replace function delete_member(p_member uuid, p_confirm_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name    text;
  v_status  member_status;
  v_counts  jsonb;
  v_snapshot jsonb;
begin
  -- 0017 discipline: NULL role (suspended / anon) fails closed before anything else.
  if auth_role() is null then raise exception 'not_allowed'; end if;
  -- Admin alone. §3 gives the coordinator client invites, never destruction.
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select full_name, status into v_name, v_status from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;

  -- The guard that makes this safe: the caller must have typed this member's name.
  if _norm_name(p_confirm_name) <> _norm_name(v_name) then
    raise exception 'name_mismatch';
  end if;

  -- Blast radius, counted before anything is removed — this is what the audit row
  -- preserves and what the UI reports back.
  v_counts := jsonb_build_object(
    'invites',          (select count(*) from invites          where member_id = p_member),
    'assignments',      (select count(*) from assignments      where member_id = p_member),
    'consultations',    (select count(*) from consultations    where member_id = p_member),
    'form_responses',   (select count(*) from form_responses   where member_id = p_member),
    'reports',          (select count(*) from reports          where member_id = p_member),
    'member_documents', (select count(*) from member_documents where member_id = p_member),
    'member_cases',     (select count(*) from member_cases     where member_id = p_member),
    'threads',          (select count(*) from threads          where member_id = p_member),
    'checkin_links',    (select count(*) from checkin_links    where member_id = p_member),
    'activity_events',  (select count(*) from activity_events  where member_id = p_member),
    'packages',         (select count(*) from packages         where member_id = p_member),
    'cycles',           (select count(*) from cycles c
                            join packages p on p.id = c.package_id
                           where p.member_id = p_member),
    'renewals',         (select count(*) from renewals         where member_id = p_member),
    'member_contacts',  (select count(*) from member_contacts  where member_id = p_member)
  );

  v_snapshot := jsonb_build_object(
    'full_name', v_name,
    'status',    v_status,
    'deleted',   v_counts
  );

  -- Children are removed explicitly, in dependency order, rather than by leaning on
  -- the cascade chain. Several FKs inside a member's own subtree are NO ACTION
  -- (consultations.cycle_id, form_responses.consultation_id, reports.cycle_id,
  -- member_cases.source_report, renewals.completed_package), and relying on the
  -- order Postgres happens to fire cascaded deletes in is how a delete that works
  -- on a shell member fails on a member with a full history.
  delete from invites        where member_id = p_member;   -- the one FK without cascade
  delete from threads        where member_id = p_member;   -- cascades messages + reads
  delete from member_cases   where member_id = p_member;   -- cascades case events
  delete from form_responses where member_id = p_member;
  delete from reports        where member_id = p_member;
  delete from consultations  where member_id = p_member;
  delete from renewals       where member_id = p_member;
  delete from cycles c using packages p where p.id = c.package_id and p.member_id = p_member;
  delete from packages       where member_id = p_member;
  delete from assignments    where member_id = p_member;
  delete from checkin_links  where member_id = p_member;
  delete from activity_events where member_id = p_member;
  delete from member_documents where member_id = p_member;
  delete from member_contacts  where member_id = p_member;
  delete from members        where id = p_member;

  -- Written after the delete: the member is gone, the record of its going is not.
  perform _audit(auth.uid(), 'member.deleted', 'member', p_member, v_snapshot);
  return v_snapshot;
end $$;

-- ============ 2. create_member_with_invite — duplicate guard ============
-- Body reproduced from 0017_rpc_fail_closed.sql; the ONLY change is the new guard.
--
-- Scoped to members who have not finished onboarding, deliberately. That covers
-- 100% of the observed damage (every duplicate was caught in `invited`), while
-- leaving a genuine second person of the same name enrollable once the first has
-- onboarded — a permanent block on a real name would be the worse bug.
create or replace function create_member_with_invite(
  p_full_name text, p_age int, p_gender text, p_language text, p_occupation text,
  p_city text, p_country text, p_relationship_to_caregiver text,
  p_phone text, p_whatsapp text, p_email text, p_address text, p_pin_code text,
  p_emergency_contact_name text, p_emergency_contact_phone text,
  p_caregiver_email text, p_duration_months int default 3
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_token uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;

  if exists (
    select 1
      from members m
      left join invites  i  on i.member_id  = m.id
      left join profiles cg on cg.id        = m.caregiver_id
     where m.status in ('invited','signed_up','onboarding')
       and _norm_name(m.full_name) = _norm_name(p_full_name)
       and (lower(btrim(i.email))  = lower(btrim(p_caregiver_email))
         or lower(btrim(cg.email)) = lower(btrim(p_caregiver_email)))
  ) then
    raise exception 'duplicate_member';
  end if;

  insert into members(full_name, age, gender, language, occupation, city, country,
                      relationship_to_caregiver, status)
  values (p_full_name, p_age, p_gender, p_language, p_occupation, p_city, p_country,
          p_relationship_to_caregiver, 'invited')
  returning id into v_member;
  insert into member_contacts(member_id, phone, whatsapp, email, address, pin_code,
                              emergency_contact_name, emergency_contact_phone)
  values (v_member, p_phone, p_whatsapp, p_email, p_address, p_pin_code,
          p_emergency_contact_name, p_emergency_contact_phone);
  insert into packages(member_id, duration_months, status)
  values (v_member, p_duration_months, 'not_started');
  insert into invites(email, role, member_id, invited_by)
  values (p_caregiver_email, 'caregiver', v_member, auth.uid())
  returning token into v_token;
  perform _audit(auth.uid(), 'member.created', 'member', v_member,
                 jsonb_build_object('caregiver_email', p_caregiver_email,
                                    'duration_months', p_duration_months));
  return v_token;
end $$;

-- ============ 3. revoke_invite ============
-- Replaces the raw `delete from invites` in app/(app)/admin/invites/actions.ts.
-- An unclaimed caregiver invite is the only thing tying a shell member to anyone,
-- so revoking it took the member with it — otherwise the member is unreachable by
-- design: no caregiver to onboard them, and no invite left to send.
create or replace function revoke_invite(p_invite uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_email text; v_role user_role; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;

  select member_id, email, role into v_member, v_email, v_role
    from invites where id = p_invite and used_at is null;
  if not found then raise exception 'not_found'; end if;   -- used invites are history

  delete from invites where id = p_invite;

  -- Only a shell: still `invited`, nobody attached, nothing recorded against it,
  -- and no other invite outstanding. Anything further along keeps its member row.
  if v_member is not null then
    select m.full_name into v_name
      from members m
     where m.id = v_member
       and m.status = 'invited'
       and m.caregiver_id is null
       and m.member_user_id is null
       and not exists (select 1 from form_responses where member_id = v_member)
       and not exists (select 1 from reports        where member_id = v_member)
       and not exists (select 1 from invites        where member_id = v_member);

    if v_name is not null then
      delete from consultations   where member_id = v_member;
      delete from assignments     where member_id = v_member;
      delete from packages        where member_id = v_member;
      delete from member_contacts where member_id = v_member;
      delete from members         where id = v_member;
      perform _audit(auth.uid(), 'member.deleted', 'member', v_member,
                     jsonb_build_object('full_name', v_name, 'status', 'invited',
                                        'reason', 'invite_revoked'));
    end if;
  end if;

  perform _audit(auth.uid(), 'invite.revoked', 'invite', p_invite,
                 jsonb_build_object('email', v_email, 'role', v_role,
                                    'member_id', v_member,
                                    'member_deleted', v_name is not null));
  return jsonb_build_object('member_deleted', v_name is not null, 'member_name', v_name);
end $$;

-- ============ grants (0033 discipline: nothing inherits PUBLIC) ============
revoke execute on function _norm_name(text)            from public, anon, authenticated;
revoke execute on function delete_member(uuid,text)    from public, anon;
grant  execute on function delete_member(uuid,text)    to authenticated;
revoke execute on function revoke_invite(uuid)         from public, anon;
grant  execute on function revoke_invite(uuid)         to authenticated;

-- Prove the anon surface is still exactly the two check-in functions (0033 §6).
do $$
declare n int;
begin
  select count(*) into n
    from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
   where nsp.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if n <> 2 then
    raise exception '0034 widened the anon surface: % anon-executable functions', n;
  end if;
end $$;
