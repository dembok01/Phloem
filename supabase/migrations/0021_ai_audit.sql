-- PHLOEM migration 0021_ai_audit.sql — T3.1 AI foundation.
-- Every AI draft leaves an immutable ai.draft_created audit row (blueprint rule:
-- "every generation audited"). Fail-closed like every §6 RPC (0017 pattern):
-- a suspended/unauthenticated caller cannot log. The RPC only writes audit — it
-- never generates or commits report content (RPCs stay the sole committers; AI
-- output lands in existing draft rows via the unchanged submit RPCs).
create or replace function log_ai_generation(p_member uuid, p_kind text, p_meta jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  perform _audit(auth.uid(), 'ai.draft_created', 'member', p_member,
                 coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('kind', p_kind));
end $$;

revoke execute on function log_ai_generation(uuid, text, jsonb) from public, anon;
