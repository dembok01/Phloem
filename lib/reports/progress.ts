// W1.6 — generating `progress_summary` reports.
//
// Two callers, one code path: the daily cron backfills every closed cycle that
// has no summary yet, and a doctor/admin can generate one on demand. Both compose
// the document with buildProgressSummary() and record it through the
// record_progress_summary RPC, so the notification rows and the audit entry are
// written by the database in both cases (§12).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildProgressSummary } from "@/lib/reports/build/progress-summary";
import { logError, logEvent } from "@/lib/observe";

type Admin = SupabaseClient<Database>;

/**
 * Compose and record one progress summary.
 *
 * `admin` reads the source data (service role — the builder narrows deliberately);
 * `recorder` performs the RPC. They differ on purpose: on demand, the recorder is
 * the USER's client so the RPC authorises the real caller and stamps created_by,
 * while the cron passes the admin client and takes the service path.
 */
export async function generateProgressSummary(
  admin: Admin,
  recorder: Admin,
  args: { memberId: string; cycleId: string | null; force?: boolean },
): Promise<{ reportId: string } | { error: string }> {
  const content = await buildProgressSummary(admin, {
    memberId: args.memberId,
    cycleId: args.cycleId,
  });

  const { data, error } = await recorder.rpc("record_progress_summary", {
    p_member: args.memberId,
    p_cycle: args.cycleId as string,
    p_content: content as unknown as Database["public"]["Tables"]["reports"]["Row"]["content"],
    p_force: args.force ?? false,
  });
  if (error) {
    logError("progress_summary.record_failed", error, {
      member_id: args.memberId,
      cycle_id: args.cycleId,
    });
    return { error: error.message };
  }
  logEvent("progress_summary.recorded", { member_id: args.memberId, cycle_id: args.cycleId });
  return { reportId: data as unknown as string };
}

/**
 * Backfill: every closed cycle whose performance report exists but whose progress
 * summary does not. Runs from the cron after the state machine has closed cycles,
 * so it needs no changes to run_daily_jobs and naturally catches up on anything
 * missed. Idempotent — record_progress_summary returns the existing report when one
 * is already there.
 */
export async function backfillProgressSummaries(
  admin: Admin,
  limit = 25,
): Promise<{ generated: number; failed: number }> {
  const { data: closed, error } = await admin
    .from("cycles")
    .select("id, number, packages!inner(member_id)")
    .eq("status", "closed")
    .order("end_date", { ascending: false })
    .limit(limit);
  if (error) {
    logError("progress_summary.backfill_query_failed", error);
    return { generated: 0, failed: 0 };
  }
  if (!closed || closed.length === 0) return { generated: 0, failed: 0 };

  const { data: existing } = await admin
    .from("reports")
    .select("cycle_id")
    .eq("type", "progress_summary")
    .in(
      "cycle_id",
      closed.map((c) => c.id),
    );
  const have = new Set((existing ?? []).map((r) => r.cycle_id));

  let generated = 0;
  let failed = 0;
  for (const c of closed) {
    if (have.has(c.id)) continue;
    const pkg = c.packages as { member_id: string } | { member_id: string }[] | null;
    const memberId = Array.isArray(pkg) ? pkg[0]?.member_id : pkg?.member_id;
    if (!memberId) continue;

    const result = await generateProgressSummary(admin, admin, { memberId, cycleId: c.id });
    if ("error" in result) failed += 1;
    else generated += 1;
  }
  if (generated > 0 || failed > 0) logEvent("progress_summary.backfill", { generated, failed });
  return { generated, failed };
}
