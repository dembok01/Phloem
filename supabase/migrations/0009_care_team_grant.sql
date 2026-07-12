-- PHLOEM migration 0009_care_team_grant.sql
-- 0008 revoked get_care_team from `anon`, but functions grant EXECUTE to PUBLIC by
-- default and anon inherits it via PUBLIC — so anon could still call it. Revoke from
-- PUBLIC and re-grant to authenticated only (caregiver/member/admin/coordinator use it;
-- the RPC also authorises internally and returns [] to anyone else).
revoke execute on function get_care_team(uuid) from public;
grant execute on function get_care_team(uuid) to authenticated;
