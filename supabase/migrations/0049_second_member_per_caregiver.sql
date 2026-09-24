-- 0049 — one caregiver, more than one member.
--
-- Two orderings led to the same dead end, where a family was told
-- "An account already exists for this email. Try signing in instead."
--
--   A. Both invites minted before either was accepted. The first link creates
--      the account; the second can never be accepted, because acceptInvite
--      always calls the GoTrue admin createUser and it rejects a duplicate
--      address. This is the observed case (arunskumar14199@gmail.com, 17 Sep:
--      two invites five minutes apart, the second stranded).
--   B. The account already exists when the second member is enrolled — the
--      coordinator mints an invite that walks into the same wall.
--
-- Neither the schema nor the portal was the obstacle. members.caregiver_id is a
-- plain FK, mem_caregiver (0002) is a per-row predicate that returns every
-- matching row, and the portal has rendered a member switcher since Phase 8.
-- Only the path that WRITES caregiver_id was single-member, and accept_invite
-- is its sole writer anywhere in the schema.
--
-- A closes inside accept_invite: one accepted link now claims every member
-- invited to the same address. That grants nothing a second token would not
-- have granted — all of those invites were addressed to the same mailbox, which
-- is already the trust boundary accept_invite leans on when it creates the
-- account with email_confirm.
--
-- B closes at enrollment: create_member_with_invite now sees the existing
-- caregiver account and links the member straight to it rather than minting a
-- dead invite. It refuses to do that silently. The first call returns
-- `confirm_link` and writes nothing, so a mistyped address that happens to
-- belong to another family is put in front of the coordinator instead of
-- handing that family a stranger's health record.

-- ============ 1. accept_invite — claim every member sent to this address ============
-- Body reproduced from 0003_rpcs.sql; the only change is the sibling-claim block.
create or replace function accept_invite(
  p_token uuid, p_user_id uuid, p_full_name text, p_phone text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv invites%rowtype; v_sibling uuid[]; v_claimed uuid[];
begin
  if auth.uid() is not null and auth_role() is null then raise exception 'not_allowed'; end if;
  select * into v_inv from invites
   where token = p_token and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'invalid_invite'; end if;

  insert into profiles(id, role, full_name, email, phone)
  values (p_user_id, v_inv.role, p_full_name, v_inv.email, p_phone);

  if v_inv.member_id is not null and v_inv.role = 'caregiver' then
    update members set caregiver_id = p_user_id, status = 'signed_up'
     where id = v_inv.member_id;
  end if;

  update invites set used_at = now() where id = v_inv.id;

  -- Every other member invited to this same address, claimed by this one
  -- acceptance. Without it a member enrolled BEFORE the caregiver signed up is
  -- stranded for good: its invite can never be accepted, because the account it
  -- would create already exists.
  --
  -- `caregiver_id is null` is what makes this safe to run unconditionally — a
  -- member that already belongs to somebody is never re-pointed, so a stale or
  -- concurrently-accepted invite cannot move it.
  if v_inv.role = 'caregiver' then
    select array_agg(i.id) into v_sibling
      from invites i
     where i.role = 'caregiver'
       and i.used_at is null
       and i.expires_at > now()
       and i.id <> v_inv.id
       and i.member_id is not null
       and lower(btrim(i.email)) = lower(btrim(v_inv.email));

    if v_sibling is not null then
      with claimed as (
        update members m set caregiver_id = p_user_id, status = 'signed_up'
         where m.caregiver_id is null
           and m.id in (select member_id from invites where id = any(v_sibling))
        returning m.id
      )
      select array_agg(id) into v_claimed from claimed;

      update invites set used_at = now() where id = any(v_sibling);
    end if;
  end if;

  perform _audit(p_user_id, 'invite.accepted', 'invite', v_inv.id,
                 jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id,
                                    'also_claimed', coalesce(to_jsonb(v_claimed), '[]'::jsonb)));
  return jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id,
                            'also_claimed', coalesce(to_jsonb(v_claimed), '[]'::jsonb));
end $$;

-- ============ 2. create_member_with_invite — link, or ask first ============
-- The return type changes from uuid (the invite token) to jsonb, so the old
-- signature has to go rather than gain an overload: PostgREST resolves rpc()
-- by named arguments and would not know which of the two to call.
drop function if exists create_member_with_invite(
  text, int, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, int);

-- Returns one of three shapes:
--   {mode:'confirm_link', caregiver_name, caregiver_email, existing_members[]}
--       nothing was written; the address already has a caregiver account and
--       the coordinator has to confirm it is the right family.
--   {mode:'invited', member_id, token}      a new caregiver, exactly as before.
--   {mode:'linked',  member_id, caregiver_id, caregiver_name}
--       the member was attached to the account that already exists; no invite
--       is minted, because there is nobody left to invite.
create or replace function create_member_with_invite(
  p_full_name text, p_age int, p_gender text, p_language text, p_occupation text,
  p_city text, p_country text, p_relationship_to_caregiver text,
  p_phone text, p_whatsapp text, p_email text, p_address text, p_pin_code text,
  p_emergency_contact_name text, p_emergency_contact_phone text,
  p_caregiver_email text, p_duration_months int default 3,
  p_link_existing boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member uuid; v_token uuid;
  v_email  text := lower(btrim(p_caregiver_email));
  v_cg_id uuid; v_cg_name text; v_cg_role user_role; v_cg_status account_status;
  v_existing text[];
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;

  -- 0034 duplicate guard, unchanged.
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

  -- Does this address already belong to somebody?
  select p.id, p.full_name, p.role, p.status
    into v_cg_id, v_cg_name, v_cg_role, v_cg_status
    from profiles p
   where lower(btrim(p.email)) = v_email
   order by p.created_at
   limit 1;

  if v_cg_id is not null then
    -- A clinician or coordinator must never be turned into a caregiver by a
    -- typo in this field; the two role sets see different data by design.
    if v_cg_role <> 'caregiver' then raise exception 'email_not_caregiver'; end if;
    if v_cg_status <> 'active'  then raise exception 'caregiver_suspended'; end if;

    if not p_link_existing then
      select array_agg(m.full_name order by m.created_at) into v_existing
        from members m where m.caregiver_id = v_cg_id;
      return jsonb_build_object(
        'mode',             'confirm_link',
        'caregiver_name',   v_cg_name,
        'caregiver_email',  v_email,
        'existing_members', coalesce(to_jsonb(v_existing), '[]'::jsonb));
    end if;
  end if;

  insert into members(full_name, age, gender, language, occupation, city, country,
                      relationship_to_caregiver, caregiver_id, status)
  values (p_full_name, p_age, p_gender, p_language, p_occupation, p_city, p_country,
          p_relationship_to_caregiver, v_cg_id,
          -- Cast required: a bare 'invited' literal coerces to member_status on
          -- its own, but a CASE resolves to text and the insert then fails.
          case when v_cg_id is null then 'invited'::member_status
               else 'signed_up'::member_status end)
  returning id into v_member;

  insert into member_contacts(member_id, phone, whatsapp, email, address, pin_code,
                              emergency_contact_name, emergency_contact_phone)
  values (v_member, p_phone, p_whatsapp, p_email, p_address, p_pin_code,
          p_emergency_contact_name, p_emergency_contact_phone);

  insert into packages(member_id, duration_months, status)
  values (v_member, p_duration_months, 'not_started');

  if v_cg_id is null then
    insert into invites(email, role, member_id, invited_by)
    values (p_caregiver_email, 'caregiver', v_member, auth.uid())
    returning token into v_token;
  else
    -- The family gets no invite email to tell them, so tell them in the portal.
    perform _notify(v_cg_id, 'assigned', 'A new member was added',
                    p_full_name || ' was added to your account.',
                    '/portal?member=' || v_member, 'member_added:' || v_member);
  end if;

  perform _audit(auth.uid(), 'member.created', 'member', v_member,
                 jsonb_build_object('caregiver_email', p_caregiver_email,
                                    'duration_months', p_duration_months,
                                    'linked_to_existing', v_cg_id is not null));

  if v_cg_id is null then
    return jsonb_build_object('mode', 'invited', 'member_id', v_member, 'token', v_token);
  end if;
  return jsonb_build_object('mode', 'linked', 'member_id', v_member,
                            'caregiver_id', v_cg_id, 'caregiver_name', v_cg_name);
end $$;

-- ============ grants (0033 discipline: nothing inherits PUBLIC) ============
revoke execute on function create_member_with_invite(
  text,int,text,text,text,text,text,text,text,text,text,text,text,text,text,text,int,boolean)
  from public, anon;
grant execute on function create_member_with_invite(
  text,int,text,text,text,text,text,text,text,text,text,text,text,text,text,text,int,boolean)
  to authenticated;
