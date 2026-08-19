-- PHLOEM migration 0033_anon_execute_lockdown.sql — fixes a regression introduced
-- by 0029.
--
-- WHAT WENT WRONG. 0029 needed `anon` to call two functions for the family
-- check-in link, so it ran `grant usage on schema public to anon`. 0004 had
-- previously revoked anon's schema USAGE, and that revoke had been doing more work
-- than it looked: Postgres grants EXECUTE on every new function to PUBLIC by
-- default, and `anon` inherits PUBLIC. Without schema USAGE that inheritance was
-- inert; restoring USAGE made it live, and eight security-definer functions became
-- callable by an unauthenticated caller instead of two.
--
-- Every one of them still failed closed — auth_role() returns NULL for anon, and
-- the 0017 hardening made every guard treat NULL as "deny", so
-- get_onboarding_scoped returned null rather than a health record. That is the
-- discipline working, not a reason to leave the door open.
--
-- THE FIX, and why it is shaped this way. The obvious repair — revoke from PUBLIC,
-- then grant to `authenticated` — would be WRONG applied broadly: several functions
-- are deliberately withheld from authenticated (close_cycle_open_next,
-- compile_performance_report, run_daily_jobs, open_due_renewals,
-- flag_quiet_families are service/cron only). A blanket grant would hand those to
-- every signed-in user.
--
-- So this snapshots which functions `authenticated` can execute TODAY, revokes
-- EXECUTE from PUBLIC and anon across the schema, and re-grants to authenticated
-- exactly the snapshot. Net effect: authenticated's privileges are bit-for-bit
-- unchanged; anon loses everything except the two check-in functions.

do $$
declare
  f record;
  kept int := 0;
  cut  int := 0;
begin
  -- 1. Snapshot: which functions can `authenticated` execute right now?
  create temp table _authz_snapshot on commit drop as
    select p.oid,
           p.oid::regprocedure::text as sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as allowed
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f';

  -- 2. Cut the PUBLIC inheritance (and any direct anon grant) for every one.
  for f in select sig from _authz_snapshot loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    cut := cut + 1;
  end loop;

  -- 3. Restore authenticated exactly as it was.
  for f in select sig from _authz_snapshot where allowed loop
    execute format('grant execute on function %s to authenticated', f.sig);
    kept := kept + 1;
  end loop;

  raise notice 'anon lockdown: % functions revoked from PUBLIC/anon, % re-granted to authenticated', cut, kept;
end $$;

-- 4. The two the family check-in genuinely needs, and nothing else.
grant execute on function get_checkin_link(uuid) to anon;
grant execute on function submit_checkin(uuid, jsonb) to anon;

-- 5. Future-proofing: a function added later must not inherit PUBLIC's execute for
--    anon the way these did. (0004 already set this for anon; restated here beside
--    the reasoning so the next person changing anon's grants sees why it matters.)
alter default privileges in schema public revoke execute on functions from anon;

-- 6. Prove it: exactly two anon-executable functions in this schema.
do $$
declare n int; names text;
begin
  select count(*), string_agg(p.oid::regprocedure::text, ', ')
    into n, names
    from pg_proc p
    join pg_namespace nsp on nsp.oid = p.pronamespace
   where nsp.nspname = 'public'
     and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if n <> 2 then
    raise exception 'expected exactly 2 anon-executable functions, found %: %', n, names;
  end if;
end $$;
