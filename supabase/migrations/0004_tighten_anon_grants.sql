-- PHLOEM migration 0004_tighten_anon_grants.sql
-- Advisor-driven least-privilege pass (Phase 1 verification): nothing in PHLOEM
-- uses the Data API as `anon` — login goes through GoTrue and invite acceptance
-- through the service client — so the broad anon grants from 0002 are revoked.
-- `authenticated` keeps table access (RLS is the row boundary) and RPC execute
-- (§6 RPCs validate the caller internally via auth_role()).

revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke usage on schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
