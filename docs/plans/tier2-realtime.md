# Tier 2 · T2.6 — Realtime notifications

**Goal:** the notification bell updates live when a new row lands, instead of only on mount / when
the dropdown opens. RLS (`notif_own`: `user_id = auth.uid()`) scopes each subscription to the
caller's own rows, so no cross-user leakage. Load-on-open stays as the fallback.

## Steps
- [ ] **Migration `0020_realtime_notifications.sql`** — idempotently add `notifications` to the
  `supabase_realtime` publication (guarded by `pg_publication_tables` so re-apply is a no-op).
- [ ] **`components/notification-bell.tsx`** — on mount, resolve the user id
  (`supabase.auth.getUser()`), then subscribe to `postgres_changes` INSERT on `public.notifications`
  filtered by `user_id=eq.<uid>`; prepend the new row (dedupe by id, cap 15). Clean up the channel on
  unmount. Keep `load()` on mount + open as the fallback path.

## Verify
Migration applied (notifications in `supabase_realtime`); `npx tsc --noEmit && npm run lint` green.
Live delivery itself needs a browser session (RLS-authenticated realtime) — not exercised in the
sandbox, but the subscription is standard supabase-js and RLS-scoped by construction.
