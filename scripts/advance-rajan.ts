/** Put Rajan Pillai mid-pipeline for the audit: assigned, scheduled, 2 of 4 meetings done, no reports. */
import { createClient } from "@supabase/supabase-js";
import { config as dotenv } from "dotenv";
import path from "node:path";
dotenv({ path: path.resolve(process.cwd(), ".env.local") });

const ROLES = ["doctor", "nutritionist", "trainer", "psychologist"] as const;

async function main() {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: sErr } = await c.auth.signInWithPassword({ email: "coordinator@phloem.local", password: "test12345!" });
  if (sErr) throw sErr;
  const { data: m } = await c.from("members").select("id, status").eq("full_name", "Rajan Pillai").single();
  if (!m) throw new Error("no rajan");
  const { data: pros } = await c.from("profiles").select("id, role").in("role", ROLES as unknown as string[]);
  for (const role of ROLES) {
    const pro = pros!.find((p) => p.role === role)!;
    const { error } = await c.rpc("assign_care_team", { p_member: m.id, p_role: role, p_user: pro.id });
    if (error) throw new Error(`assign ${role}: ${error.message}`);
  }
  const { data: cons } = await c.from("consultations").select("id, type, meeting_status").eq("member_id", m.id).is("cycle_id", null);
  // doctor: earlier today (mark done); nutritionist: later today (scheduled); trainer: +2d; psych: leave to_schedule
  const now = Date.now();
  const at: Record<string, number | null> = {
    doctor: now - 3 * 3600e3,
    nutritionist: now + 4 * 3600e3,
    trainer: now + 2 * 24 * 3600e3,
    psychologist: null,
  };
  for (const cn of cons!) {
    const t = at[cn.type];
    if (t === null) continue;
    if (cn.meeting_status === "to_schedule") {
      const { error } = await c.rpc("set_consultation_schedule", {
        p_cons: cn.id, p_at: new Date(t!).toISOString(), p_mode: cn.type === "doctor" ? "in_person" : "video",
        p_link: cn.type === "doctor" ? null : "https://meet.google.com/phl-oem-care",
      });
      if (error) throw new Error(`sched ${cn.type}: ${error.message}`);
    }
    if (cn.type === "doctor") {
      const { error } = await c.rpc("mark_meeting_done", { p_cons: cn.id });
      if (error && !error.message.includes("not_scheduled")) throw new Error(`done: ${error.message}`);
    }
    console.log(`${cn.type} ok`);
  }
  console.log("rajan mid-pipeline ready");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
