-- PHLOEM migration 0012_display_prefs.sql
-- DESIGN-PROPOSALS P-4 — elderly-mode preference persisted server-side.
--
-- Elderly mode was role-driven only (forced for `member` logins) and any in-session
-- toggle was localStorage. This adds a durable per-profile `display_prefs` bag so
-- the "Larger text & simpler view" preference survives across devices, and lets a
-- caregiver set it on their parent's own login from the portal.

alter table profiles add column if not exists display_prefs jsonb not null default '{}';

-- Self: any active user persists their own presentation preferences.
create or replace function set_display_prefs(p_prefs jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_role() is null then raise exception 'not_allowed'; end if;
  update profiles set display_prefs = coalesce(p_prefs, '{}'::jsonb) where id = auth.uid();
end $$;

-- Caregiver (or admin) sets the linked elderly login's elderly-mode flag. Writes
-- the member_user_id profile, not the caller's — P-4 "affects the member's own
-- login". Fails clearly when no elderly login is linked yet.
create or replace function set_member_elderly_mode(p_member uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_login uuid;
begin
  if not (auth_role() = 'admin' or is_caregiver_of(p_member)) then
    raise exception 'not_allowed';
  end if;
  select member_user_id into v_login from members where id = p_member;
  if v_login is null then raise exception 'no_member_login'; end if;
  update profiles
     set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb),
                                   '{elderly}', to_jsonb(p_enabled))
   where id = v_login;
  perform _audit(auth.uid(), 'member.elderly_mode_set', 'profile', v_login,
                 jsonb_build_object('member_id', p_member, 'enabled', p_enabled));
end $$;

-- Read-back for the portal toggle's current state (caregivers cannot SELECT the
-- linked login's profile row directly). NULL = no elderly login linked.
create or replace function get_member_elderly_mode(p_member uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_login uuid; v_prefs jsonb;
begin
  if not (auth_role() = 'admin' or is_caregiver_of(p_member)) then
    raise exception 'not_allowed';
  end if;
  select member_user_id into v_login from members where id = p_member;
  if v_login is null then return null; end if;
  select display_prefs into v_prefs from profiles where id = v_login;
  -- Elderly logins default to elderly-mode ON when unset (preserves prior behaviour).
  return coalesce((v_prefs->>'elderly')::boolean, true);
end $$;

revoke execute on function set_display_prefs(jsonb)                 from public, anon;
revoke execute on function set_member_elderly_mode(uuid, boolean)   from public, anon;
revoke execute on function get_member_elderly_mode(uuid)            from public, anon;
