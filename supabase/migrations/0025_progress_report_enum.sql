-- PHLOEM migration 0025_progress_report_enum.sql — W1.6 of the care-continuum spec.
--
-- `progress_summary` is the timeline-based report AND the family's monthly
-- artifact. It gets its own migration because Postgres forbids using a new enum
-- value in the same transaction that adds it — the policies and the RPC that
-- reference it live in 0026.
--
-- Additive only: no existing row, policy, or builder changes meaning.

alter type report_type add value if not exists 'progress_summary';
