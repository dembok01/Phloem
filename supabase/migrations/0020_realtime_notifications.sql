-- PHLOEM migration 0020_realtime_notifications.sql — T2.6.
-- Add the notifications table to the supabase_realtime publication so the bell can
-- subscribe to postgres_changes. RLS (notif_own: user_id = auth.uid()) still scopes
-- each subscriber to their own rows — Realtime enforces the same policy. Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
