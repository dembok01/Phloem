/**
 * §16 lifecycle regression test (Tier-2 T2.5). Drives the real §6 RPC workflow —
 * signed in as the actual seeded users, exactly like the app's server actions —
 * against an EPHEMERAL member, asserting the Tier-1 correctness invariants:
 *   • H-1  an unchanged doctor_review does NOT revoke the trainer's clearance (0015).
 *   • M-1  exactly one performance report per cycle (0015 unique index).
 *   • M-2  close_cycle_open_next is idempotent — re-runs open 4 consults, not 8 (0015).
 *   • 0017 the service client (auth.uid() NULL) cannot call role-guarded RPCs.
 *
 * Rollover is driven by compile/close on THIS member's cycle only (never
 * run_daily_jobs, which would sweep every active member in the shared dev DB).
 * Everything is torn down in `finally`, so the script is safe to re-run.
 *
 *   npm run test:lifecycle
 *
 * Fail-on-revert: reverting the 0015 gate makes the H-1 trainer-review submit raise
 * `awaiting_doctor_clearance`, so this test exits 1 — the regression is caught.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as dotenv } from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildClinicalReport } from "@/lib/reports/build/clinical";
import type { Database } from "@/lib/supabase/database.types";

dotenv({ path: path.resolve(process.cwd(), ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}
const PASSWORD = "test12345!";

type Role = "doctor" | "nutritionist" | "trainer" | "psychologist";
const ROLES: Role[] = ["doctor", "nutritionist", "trainer", "psychologist"];
type ReportType = Database["public"]["Enums"]["report_type"];

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let passed = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
async function throwsWith(fn: () => PromiseLike<{ error: { message: string } | null }>, needle: string, msg: string) {
  const { error } = await fn();
  if (!error) throw new Error(`ASSERT FAIL (expected ${needle}, got success): ${msg}`);
  if (!error.message.includes(needle)) throw new Error(`ASSERT FAIL (expected ${needle}, got "${error.message}"): ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

const pastAt = (hourOffset: number) => new Date(Date.now() - hourOffset * 3600_000).toISOString();

function reportTypeFor(role: Role, isInitial: boolean): ReportType {
  if (role === "doctor") return isInitial ? "doctor_initial" : "doctor_review";
  if (role === "nutritionist") return isInitial ? "nutrition_plan" : "nutrition_review";
  if (role === "trainer") return isInitial ? "training_plan" : "training_review";
  return "wellbeing";
}

function answersFor(role: Role, isInitial: boolean): Record<string, unknown> {
  const base = { date: new Date().toISOString().slice(0, 10), mode: "video", duration_min: 30, attendees: "member" };
  if (role === "doctor") {
    return isInitial
      ? { ...base, clinical_summary: "Lifecycle fixture — stable.", clearance: "cleared" }
      // Unchanged review: builder omits the clearance key (H-1). No `clearance` here.
      : { ...base, review_summary: "No change this cycle.", clearance_change: "unchanged" };
  }
  if (role === "nutritionist") {
    return isInitial
      ? { ...base, assessment_summary: "Baseline diet." }
      : { ...base, adherence_observations: "Good." };
  }
  if (role === "trainer") {
    return isInitial
      ? { ...base, assessment_summary: "Baseline activity.", clearance_ack: true }
      : { ...base, program_adjustments: "Progress reps." };
  }
  return { ...base, session_notes: "Wellbeing fixture.", escalation: false, who5_1: 3, who5_2: 3, who5_3: 3, who5_4: 3, who5_5: 3 };
}

async function submitAs(role: Role, memberName: string, consId: string, isInitial: boolean) {
  const clin = await signIn(`${role}@phloem.local`);
  const answers = answersFor(role, isInitial);
  const content = buildClinicalReport(reportTypeFor(role, isInitial), { memberName, answers, cycle: isInitial ? null : 2 });
  return clin.rpc("submit_clinical_form", {
    p_cons: consId,
    p_answers: answers as never,
    p_report_content: content as never,
  });
}

async function main() {
  const tag = Date.now();
  const memberId = randomUUID();
  const memberName = `Lifecycle Test ${tag}`;
  const cgEmail = `lifecycle-cg-${tag}@phloem.test`;
  let cgUserId: string | null = null;

  try {
    // ---- Setup (service client) ----
    console.log("Setup:");
    const { data: created, error: cuErr } = await svc.auth.admin.createUser({
      email: cgEmail,
      password: PASSWORD,
      email_confirm: true,
    });
    if (cuErr || !created.user) throw new Error(`createUser: ${cuErr?.message}`);
    cgUserId = created.user.id;
    await svc.from("profiles").insert({ id: cgUserId, role: "caregiver", full_name: "Lifecycle Caregiver", email: cgEmail });
    await svc.from("members").insert({ id: memberId, full_name: memberName, status: "onboarded", caregiver_id: cgUserId });
    await svc.from("member_contacts").insert({ member_id: memberId, phone: "+910000000000" });
    await svc.from("packages").insert({ member_id: memberId, duration_months: 2, status: "not_started" });
    console.log(`  ephemeral member ${memberId} + caregiver ${cgEmail}`);

    // ---- 0017: the service client cannot call role-guarded RPCs ----
    console.log("0017 fail-closed:");
    await throwsWith(
      () => svc.rpc("assign_care_team", { p_member: memberId, p_role: "doctor", p_user: cgUserId! }),
      "not_allowed",
      "service client (auth.uid() NULL) is refused by assign_care_team",
    );

    // ---- Initial consults (coordinator + clinicians) ----
    console.log("Initial consults:");
    const coord = await signIn("coordinator@phloem.local");
    const { data: pros, error: pErr } = await svc.from("profiles").select("id, role").in("role", ROLES);
    if (pErr || !pros?.length) throw new Error(`profiles: ${pErr?.message}`);
    for (const role of ROLES) {
      const pro = pros.find((p) => p.role === role)!;
      const { error } = await coord.rpc("assign_care_team", { p_member: memberId, p_role: role, p_user: pro.id });
      if (error) throw new Error(`assign ${role}: ${error.message}`);
    }
    ok(true, "assigned all four clinicians");

    const { data: initial } = await svc
      .from("consultations")
      .select("id, type")
      .eq("member_id", memberId)
      .is("cycle_id", null);
    const byType = new Map((initial ?? []).map((c) => [c.type as Role, c.id]));
    ok(byType.size === 4, "four initial consults created");
    for (const role of ROLES) {
      const id = byType.get(role)!;
      const { error: sErr } = await coord.rpc("set_consultation_schedule", { p_cons: id, p_at: pastAt(24), p_mode: "video" });
      if (sErr) throw new Error(`schedule ${role}: ${sErr.message}`);
      const { error: dErr } = await coord.rpc("mark_meeting_done", { p_cons: id });
      if (dErr) throw new Error(`done ${role}: ${dErr.message}`);
    }
    // Doctor FIRST (trainer gate needs clearance on file), then the rest.
    for (const role of ["doctor", "nutritionist", "trainer", "psychologist"] as Role[]) {
      const { error } = await submitAs(role, memberName, byType.get(role)!, true);
      if (role === "trainer") ok(!error, "trainer initial submit succeeds (clearance on file)");
      else if (error) throw new Error(`submit ${role}: ${error.message}`);
    }

    // ---- Activate ----
    console.log("Activate:");
    const { error: aErr } = await coord.rpc("activate_program", { p_member: memberId });
    if (aErr) throw new Error(`activate: ${aErr.message}`);
    const { data: pkg } = await svc.from("packages").select("id").eq("member_id", memberId).single();
    const { data: cyclesAfterActivate } = await svc
      .from("cycles").select("id, number, status").eq("package_id", pkg!.id).order("number");
    ok(cyclesAfterActivate?.length === 2, "activate created 2 cycles (duration 2)");
    ok(cyclesAfterActivate?.[0].status === "active", "cycle 1 is active");
    ok(cyclesAfterActivate?.[1].status === "upcoming", "cycle 2 is upcoming");
    const cycle1 = cyclesAfterActivate![0].id;
    const cycle2 = cyclesAfterActivate![1].id;

    // ---- M-1: one performance report per cycle (double compile → 1) ----
    console.log("M-1 single performance report:");
    await svc.rpc("compile_performance_report", { p_cycle: cycle1 });
    await svc.rpc("compile_performance_report", { p_cycle: cycle1 });
    const { count: perfCount } = await svc
      .from("reports").select("id", { count: "exact", head: true }).eq("cycle_id", cycle1).eq("type", "performance");
    ok(perfCount === 1, "double compile → exactly 1 performance report");

    // ---- M-2: idempotent rollover (double close → 4 consults, cycle 1 closed) ----
    console.log("M-2 idempotent rollover:");
    await svc.rpc("close_cycle_open_next", { p_cycle: cycle1 });
    await svc.rpc("close_cycle_open_next", { p_cycle: cycle1 });
    const { count: c2cons } = await svc
      .from("consultations").select("id", { count: "exact", head: true }).eq("cycle_id", cycle2);
    ok(c2cons === 4, "double close → cycle 2 has exactly 4 consults (not 8)");
    const { data: c1 } = await svc.from("cycles").select("status").eq("id", cycle1).single();
    ok(c1?.status === "closed", "cycle 1 is closed");
    const { data: c2 } = await svc.from("cycles").select("status").eq("id", cycle2).single();
    ok(c2?.status === "active", "cycle 2 is now active");

    // ---- H-1: unchanged doctor_review must NOT revoke the trainer's clearance ----
    console.log("H-1 clearance carry-forward:");
    const { data: c2consults } = await svc
      .from("consultations").select("id, type").eq("cycle_id", cycle2);
    const c2byType = new Map((c2consults ?? []).map((c) => [c.type as Role, c.id]));
    for (const role of ["doctor", "trainer"] as Role[]) {
      const id = c2byType.get(role)!;
      await coord.rpc("set_consultation_schedule", { p_cons: id, p_at: pastAt(2), p_mode: "video" });
      await coord.rpc("mark_meeting_done", { p_cons: id });
    }
    const { error: drErr } = await submitAs("doctor", memberName, c2byType.get("doctor")!, false);
    if (drErr) throw new Error(`doctor review submit: ${drErr.message}`);
    const { data: reviewRep } = await svc
      .from("reports").select("content").eq("cycle_id", cycle2).eq("type", "doctor_review").single();
    const reviewClearance = (reviewRep?.content as Record<string, unknown> | null)?.clearance;
    ok(reviewClearance === undefined, "unchanged doctor_review stores NO clearance key");
    // The load-bearing check: reverting the 0015 gate makes this raise awaiting_doctor_clearance.
    const { error: trErr } = await submitAs("trainer", memberName, c2byType.get("trainer")!, false);
    ok(!trErr, "trainer review submit SUCCEEDS — prior clearance carried forward (H-1)");

    console.log(`\n§16 lifecycle test: PASS (${passed} assertions)`);
  } finally {
    // ---- Teardown (always) ----
    console.log("Teardown:");
    await svc.from("notifications").delete().like("link", `%${memberId}%`);
    await svc.from("invites").delete().eq("member_id", memberId);
    await svc.from("members").delete().eq("id", memberId); // cascades contacts/assignments/packages→cycles/consultations/reports/responses
    if (cgUserId) await svc.auth.admin.deleteUser(cgUserId); // cascades the caregiver profile
    console.log("  ephemeral data removed");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("\n" + (e instanceof Error ? e.message : String(e)));
    console.error("§16 lifecycle test: FAIL");
    process.exit(1);
  },
);
