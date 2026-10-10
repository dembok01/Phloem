-- PHLOEM migration 0037_email_change.sql
-- Changing the address you sign in with (design §8).
--
-- Additive only: two new functions, no change to any existing object.
--
-- GoTrue owns auth.users.email and the confirmation flow. profiles.email is
-- display and record only — it is never the credential — so these exist to keep
-- that mirror honest and audited, not to perform the change themselves.

-- ============ 1. sync_my_email ============
-- Idempotent self-heal. Called by /account whenever the sign-in address and the
-- profile disagree, and after a confirmation code is accepted. Running as the
-- user is what gives the audit row a real actor. A no-op when they already match.
create or replace function sync_my_email()
returns void language plpgsql security definer set search_path = public as $$
declare v_auth_email text; v_old text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;

  select email into v_auth_email from auth.users where id = auth.uid();
  if v_auth_email is null then raise exception 'not_found'; end if;

  select email into v_old from profiles where id = auth.uid();
  if v_old is not distinct from v_auth_email then return; end if;

  update profiles set email = v_auth_email where id = auth.uid();

  perform _audit(auth.uid(), 'profile.email_changed', 'profile', auth.uid(),
                 jsonb_build_object('self', true));
end $$;

-- ============ 2. admin_set_profile_email ============
-- The admin half, for a family that has lost access to its inbox. The server
-- action moves auth.users.email with the service-role client FIRST; this records
-- the mirror and the audit row with the admin as actor. Refusing when the two
-- disagree keeps this from being an independent way to rewrite an email.
create or replace function admin_set_profile_email(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_auth_email text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select email into v_auth_email from auth.users where id = p_user;
  if v_auth_email is null then raise exception 'not_found'; end if;
  if lower(btrim(v_auth_email)) <> lower(btrim(coalesce(p_email, ''))) then
    raise exception 'email_mismatch';
  end if;

  update profiles set email = v_auth_email where id = p_user;
  if not found then raise exception 'not_found'; end if;

  perform _audit(auth.uid(), 'profile.email_changed', 'profile', p_user,
                 jsonb_build_object('self', false));
end $$;

-- ============ grants (0033 discipline: nothing inherits PUBLIC) ============
revoke execute on function sync_my_email()                     from public, anon;
grant  execute on function sync_my_email()                     to authenticated;
revoke execute on function admin_set_profile_email(uuid,text)  from public, anon;
grant  execute on function admin_set_profile_email(uuid,text)  to authenticated;
