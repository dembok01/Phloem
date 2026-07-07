-- PHLOEM migration 0005_account_status_rpc.sql
-- Phase 2: admin suspend / reactivate of any account, as an *audited* state
-- transition through an RPC (§0.4 — no raw table writes for state changes).
-- §6 enumerates no explicit account-status RPC; this is added here and logged
-- as an assumption. auth_role() already returns NULL for a suspended profile,
-- so flipping status='suspended' is an instant, DB-enforced lockout everywhere
-- (RLS + middleware + layout all fail closed). Admin-only; an admin cannot
-- change their own status (self-lockout guard).

create or replace function set_account_status(p_user_id uuid, p_status account_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_change_own_status'; end if;
  update profiles set status = p_status where id = p_user_id;
  if not found then raise exception 'not_found'; end if;
  perform _audit(auth.uid(), 'account.status_set', 'profile', p_user_id,
                 jsonb_build_object('status', p_status));
end $$;

-- Authenticated-facing (the calling admin is `authenticated`; the RPC validates
-- the caller). Drop anon/public, consistent with 0003/0004.
revoke execute on function set_account_status(uuid, account_status) from public, anon;
