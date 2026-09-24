-- PHLOEM migration 0050_lock_internal_helpers.sql — four internal helpers were
-- callable by every signed-in user.
--
-- WHY (audit 2026-09-24). These are SECURITY DEFINER and check nothing themselves:
-- they trust the RPC that calls them to have authorised the caller. Supabase grants
-- EXECUTE on every new function to anon/authenticated, and 0024 (cases) and the
-- engagement helpers never took it back the way 0003 did for _audit, _notify and
-- the rest. So any account, a caregiver included, could POST /rest/v1/rpc/... and
--   * _seed_cases_from_problem_list — open cases on ANY member, with any title,
--     attributed to any clinician (p_actor is caller-supplied);
--   * _append_review_to_cases       — append a note to every open case of ANY
--     member, again under any actor;
--   * _missed_consults / _last_family_activity — read a count and a timestamp for
--     any member id.
--
-- WHAT
--   Revoke EXECUTE from public, anon and authenticated. Every caller is itself
--   SECURITY DEFINER (submit_clinical_form, add_manual_doctor_review,
--   get_engagement, flag_quiet_families) and runs as the owner, which keeps
--   EXECUTE, so nothing that uses them changes. No app code calls them directly.
--
--   A later migration that DROPs and re-creates any of these gets the default
--   grants back and must repeat the revoke. CREATE OR REPLACE keeps it.

revoke execute on function _append_review_to_cases(uuid, jsonb, uuid, uuid, int)  from public, anon, authenticated;
revoke execute on function _seed_cases_from_problem_list(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function _missed_consults(uuid)                                 from public, anon, authenticated;
revoke execute on function _last_family_activity(uuid)                            from public, anon, authenticated;
