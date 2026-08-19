// §9 — Cycle-engine daily cron. Vercel Cron hits this ~06:00 IST with
// `Authorization: Bearer CRON_SECRET`; `npm run cron:dev` hits it locally.
// All job logic lives in the `run_daily_jobs(p_today)` RPC (offsets from cycle
// end_date, dedupe-keyed, paused packages skipped) so it stays atomic and testable.
//
// Dev-only time-travel: `?today=YYYY-MM-DD` simulates the cron running on a given
// date. Honored ONLY when NODE_ENV !== "production" — in production the query
// param is ignored and the DB's CURRENT_DATE is used.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotificationEmails } from "@/lib/notify";
import { backfillProgressSummaries } from "@/lib/reports/progress";
import { logEvent, logError } from "@/lib/observe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function handle(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Dev-only time-travel.
  let today: string | undefined;
  if (process.env.NODE_ENV !== "production") {
    const q = new URL(req.url).searchParams.get("today");
    if (q) {
      if (!DATE_RE.test(q)) {
        return NextResponse.json({ error: "bad_today", hint: "YYYY-MM-DD" }, { status: 400 });
      }
      today = q;
    }
  }

  const admin = createAdminClient();
  const startedAt = Date.now();
  const { data, error } = await admin.rpc(
    "run_daily_jobs",
    today ? { p_today: today } : {},
  );
  if (error) {
    logError("cron.daily.rpc_failed", error, { simulated: today ?? null });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // W3.4 — tell someone when a family goes quiet. Its own RPC rather than a change
  // to run_daily_jobs, whose ~100 lines of hardened §9 logic are not worth
  // reproducing to add one loop. Deduped per ISO week.
  const { data: quiet, error: quietError } = await admin.rpc(
    "flag_quiet_families",
    today ? { p_today: today } : {},
  );
  if (quietError) logError("cron.daily.quiet_flags_failed", quietError, { simulated: today ?? null });

  // W1.6 — the family's monthly report. Runs AFTER run_daily_jobs so cycles closed
  // in this same run are picked up, and reads the DB rather than the RPC's return
  // value, so anything missed on an earlier day is caught up too.
  const progress = await backfillProgressSummaries(admin);

  // §12 — flush any notification rows (from the jobs above or elsewhere) as email.
  // Runs last so the progress-summary notifications go out in the same pass.
  const email = await dispatchNotificationEmails(admin);
  const summary = (data ?? {}) as Record<string, unknown>;
  // One structured line per run — the observable trace of the time-driven layer.
  logEvent("cron.daily", {
    simulated: today ?? null,
    ...summary,
    progress_summaries: progress.generated,
    progress_failures: progress.failed,
    quiet_families: (quiet as { flagged?: number } | null)?.flagged ?? 0,
    emails_sent: email.sent,
    duration_ms: Date.now() - startedAt,
  });
  return NextResponse.json({
    ok: true,
    simulated: today ?? null,
    summary: data,
    failures: summary.failures ?? 0,
    progress_summaries: progress.generated,
    quiet_families: (quiet as { flagged?: number } | null)?.flagged ?? 0,
    emails_sent: email.sent,
  });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
