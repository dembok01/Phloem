# Tier 2 · T2.7 — Observability floor

**Goal:** make the time-driven layer observable and resilient for the pilot — one bad member must
not abort the whole cron run, cron runs must leave a structured trace, and swallowed errors must
surface. Vendor-free (blueprint non-goal: no vendor lock) — a tiny structured logger, not Sentry.

## Steps
- [ ] `lib/observe.ts` — `logEvent(evt, fields)` / `logError(evt, error, fields)` emit one JSON line
  to stdout/stderr (Vercel/Node captures it) and **return** the record (testable). `lib/observe.test.ts`
  asserts shape; add to `test:unit`.
- [ ] **Cron route** (`app/api/cron/daily/route.ts`) — time the run; on success
  `logEvent("cron.daily", { simulated, ...summary, emails_sent, duration_ms })`; on RPC error
  `logError("cron.daily.rpc_failed", ...)`. Include `failures` from the summary in the JSON response.
- [ ] **`lib/notify.ts`** — stop swallowing the pending-rows query error (`logError`); emit a
  `notify.dispatch` summary (sent / considered).
- [ ] **Migration `0019_cron_resilience.sql`** — reproduce `run_daily_jobs` from 0018 verbatim,
  changing ONLY Job 4: wrap each cycle's compile+close in `begin … exception when others …` (a
  savepoint), append the failed `cycle_id` to a `v_skip uuid[]` and add `and not (c.id = any(v_skip))`
  to the Job-4 select (so a caught failure can't re-select the same cycle → no infinite loop), count
  `v_failed`, notify admin+coordinator (dedupe `cronfail:<cycle>:<today>`), and add `'failures', v_failed`
  to the returned summary.

## Verify
`npx tsc --noEmit && npm run lint && npm run test:unit` green; apply migration via MCP; regen types
(no signature change → no diff); `run_daily_jobs('2020-01-01')` returns a summary that now includes
`failures: 0` and is otherwise a clean no-op.
