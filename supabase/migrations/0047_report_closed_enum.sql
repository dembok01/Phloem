-- PHLOEM migration 0047_report_closed_enum.sql — a third report state: 'closed',
-- the coordinator's manual override for a report that came in outside the dashboard
-- (e.g. on WhatsApp) or is not needed. Used by 0048.
--
-- Its own migration because Postgres cannot use a new enum value inside the
-- transaction that adds it (the 0025/0026 split, for the same reason).
alter type submit_status add value if not exists 'closed';
