-- PHLOEM migration 0031_renewals.sql — W4 of the care-continuum spec.
--
-- Today the programme just... ends. §9 job 5 flips the member to `renewal_due` and
-- notifies staff, and after that the conversation happens entirely off-platform:
-- nothing records that an offer was made, that the family said yes, or that anyone
-- followed up. This adds the missing object.
--
-- NO PAYMENTS (owner decision). A renewal here is an offer, an intent, and an
-- activation — money is handled outside the product.
--
-- WHO DOES WHAT comes straight from §3, not from convenience:
--   propose / record the answer → coordinator or admin (they run the conversation)
--   COMPLETE (create the new package) → ADMIN ONLY, because §3 gives reactivation
--   to admin alone. complete_renewal wraps reactivate_member rather than
--   re-implementing activation, so there is exactly one code path that creates a
--   package and its four fresh consultations.

create table renewals (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members(id) on delete cascade,
  package_id        uuid not null references packages(id) on delete cascade,
  proposed_months   int not null check (proposed_months between 1 and 24),
  status            text not null default 'proposed'
                      check (status in ('proposed','interested','declined','completed','expired')),
  note              text,
  proposed_by       uuid references profiles(id),
  proposed_at       timestamptz not null default now(),
  decided_by        uuid references profiles(id),
  decided_at        timestamptz,
  decision_note     text,
  completed_package uuid references packages(id),
  created_at        timestamptz not null default now()
);

create index idx_renewals_member on renewals (member_id, created_at desc);

-- One live offer per package: two open renewals for the same package is a support
-- call waiting to happen.
create unique index renewals_one_open_per_package
  on renewals (package_id) where status in ('proposed','interested');

alter table renewals enable row level security;

create policy ren_admin_coord on renewals for select
  using (auth_role() in ('admin','coordinator'));
-- The family must see the offer to answer it.
create policy ren_family on renewals for select
  using (coalesce(is_caregiver_of(member_id), false) or coalesce(is_member_self(member_id), false));

-- ============ RPCs ============

create or replace function propose_renewal(
  p_member uuid, p_months int default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_pkg packages%rowtype; v_renewal uuid; v_name text; v_cg uuid;
begin
  -- Cron path (auth.uid() IS NULL) or an active coordinator/admin.
  if auth.uid() is not null then
    if auth_role() is null then raise exception 'not_allowed'; end if;
    if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  end if;

  select * into v_pkg from packages
   where member_id = p_member and status in ('active','paused')
   order by created_at desc limit 1;
  if v_pkg.id is null then raise exception 'no_active_package'; end if;

  -- Idempotent: an open offer for this package is returned, not duplicated.
  select id into v_renewal from renewals
   where package_id = v_pkg.id and status in ('proposed','interested');
  if v_renewal is not null then return v_renewal; end if;

  insert into renewals(member_id, package_id, proposed_months, note, proposed_by)
  values (p_member, v_pkg.id, coalesce(p_months, v_pkg.duration_months),
          nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_renewal;

  select full_name into v_name from members where id = p_member;
  select caregiver_id into v_cg from members where id = p_member;

  if v_cg is not null then
    perform _notify(v_cg, 'renewal_offer',
      'Continuing ' || v_name || '''s care',
      'The current programme is coming to an end. Let the team know whether you''d like to continue.',
      '/portal', 'renewaloffer:' || v_renewal);
  end if;
  perform _notify_roles(array['coordinator','admin']::user_role[], 'renewal_proposed',
    'Renewal to discuss — ' || v_name,
    'The programme ends soon and a renewal offer is open.',
    '/coordinator/members/' || p_member, 'renewalprop:' || v_renewal);

  perform _audit(auth.uid(), 'renewal.proposed', 'renewal', v_renewal,
                 jsonb_build_object('member_id', p_member, 'package_id', v_pkg.id));
  return v_renewal;
end $$;

-- The family's answer. Deliberately two soft options — "yes please" and "let's
-- talk" — because a renewal decision for an elderly parent is rarely a click.
create or replace function respond_to_renewal(
  p_renewal uuid, p_intent text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_r renewals%rowtype; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if p_intent not in ('interested','declined') then raise exception 'bad_intent'; end if;
  select * into v_r from renewals where id = p_renewal;
  if not found then raise exception 'not_found'; end if;
  if v_r.status not in ('proposed','interested') then raise exception 'renewal_closed'; end if;

  -- The family answers their own offer; staff may also record an answer taken by
  -- phone, which is how most of these actually arrive.
  if not (coalesce(is_caregiver_of(v_r.member_id), false)
          or coalesce(is_member_self(v_r.member_id), false)
          or auth_role() in ('admin','coordinator')) then
    raise exception 'not_allowed';
  end if;

  update renewals
     set status = p_intent, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_renewal;

  select full_name into v_name from members where id = v_r.member_id;
  perform _notify_roles(array['coordinator','admin']::user_role[], 'renewal_response',
    v_name || ' — ' || case p_intent when 'interested' then 'would like to continue'
                                      else 'is not continuing for now' end,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Answered from the family portal.'),
    '/coordinator/members/' || v_r.member_id, 'renewalresp:' || p_renewal || ':' || p_intent);

  perform _audit(auth.uid(), 'renewal.answered', 'renewal', p_renewal,
                 jsonb_build_object('intent', p_intent));
end $$;

-- Turn an accepted renewal into a real package. ADMIN ONLY — §3 gives reactivation
-- to admin alone, and this creates a package, so it inherits that rule.
create or replace function complete_renewal(p_renewal uuid, p_months int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_r renewals%rowtype; v_pkg uuid; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  select * into v_r from renewals where id = p_renewal;
  if not found then raise exception 'not_found'; end if;
  if v_r.status = 'completed' then return v_r.completed_package; end if;
  if v_r.status = 'declined' then raise exception 'renewal_closed'; end if;

  -- The one path that creates a package + four fresh initial consultations.
  v_pkg := reactivate_member(v_r.member_id, coalesce(p_months, v_r.proposed_months));

  update renewals
     set status = 'completed', completed_package = v_pkg,
         decided_by = coalesce(decided_by, auth.uid()),
         decided_at = coalesce(decided_at, now())
   where id = p_renewal;

  select full_name into v_name from members where id = v_r.member_id;
  perform _notify_roles(array['coordinator']::user_role[], 'renewal_completed',
    v_name || ' renewed',
    'A new programme has been created. Assign the care team and schedule the first consultations.',
    '/coordinator/members/' || v_r.member_id, 'renewaldone:' || p_renewal);

  perform _audit(auth.uid(), 'renewal.completed', 'renewal', p_renewal,
                 jsonb_build_object('package_id', v_pkg));
  return v_pkg;
end $$;

-- §9 job 8: open a renewal offer 14 days before a package ends, so the coordinator
-- always has something concrete to act on rather than a status change to notice.
create or replace function open_due_renewals(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.uid() is not null and auth_role() is distinct from 'admin' then
    raise exception 'not_allowed';
  end if;

  for r in
    select p.member_id
      from packages p
     where p.status = 'active'
       and p.end_date is not null
       and p.end_date - 14 <= p_today
       and not exists (select 1 from renewals rn
                        where rn.package_id = p.id
                          and rn.status in ('proposed','interested','completed'))
  loop
    perform propose_renewal(r.member_id, null, null);
    n := n + 1;
  end loop;
  return jsonb_build_object('opened', n);
end $$;

revoke execute on function propose_renewal(uuid, int, text) from public;
revoke execute on function respond_to_renewal(uuid, text, text) from public;
revoke execute on function complete_renewal(uuid, int) from public;
revoke execute on function open_due_renewals(date) from public, anon, authenticated;
grant execute on function propose_renewal(uuid, int, text) to authenticated;
grant execute on function respond_to_renewal(uuid, text, text) to authenticated;
grant execute on function complete_renewal(uuid, int) to authenticated;
