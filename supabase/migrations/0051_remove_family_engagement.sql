-- PHLOEM migration 0051_remove_family_engagement.sql — the "family out of contact"
-- feature is removed (owner decision 2026-09-25).
--
-- WHY. It judged a family by portal logins and ticked meetings. Families here talk
-- to the team on WhatsApp and by phone, so nearly every active family read as
-- "quiet" or "out of contact" while perfectly in touch — a weekly false alarm to the
-- coordinators and a chip on every doctor's list.
--
-- WHAT
--   * Drop the readers and the weekly flagger: flag_quiet_families (0030),
--     list_engagement / get_engagement and their two helpers (0028), and
--     record_activity, whose only caller was the portal's visit ping (removed from
--     the app in the same change).
--   * Delete the alerts it already sent (family_quiet, family_at_risk), so they stop
--     sitting in coordinators' bells for a feature that no longer exists.
--
-- KEPT. The family check-in link (0029) stays: it is a tool the coordinator sends,
-- not a judgement. submit_checkin still appends to activity_events and
-- delete_member still clears it; the table is simply no longer read. Dropping it
-- would mean rewriting both RPCs for nothing a user would notice.
--
-- The app that shipped before this change degrades cleanly if this runs first:
-- every call site read these RPCs as `data ?? []` / `?? "engaged"` and ignored the
-- record_activity result, and the cron logs a failed flag call and carries on.

drop function if exists list_engagement();
drop function if exists get_engagement(uuid);
drop function if exists flag_quiet_families(date);
drop function if exists _last_family_activity(uuid);
drop function if exists _missed_consults(uuid);
drop function if exists record_activity(uuid, text, jsonb);

delete from notifications where type in ('family_quiet', 'family_at_risk');
