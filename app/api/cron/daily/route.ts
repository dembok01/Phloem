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
  const { data, error } = await admin.rpc(
    "run_daily_jobs",
    today ? { p_today: today } : {},
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, simulated: today ?? null, summary: data });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
