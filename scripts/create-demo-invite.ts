/** Create a third member + caregiver invite via §6 RPC (coordinator) for the design audit. */
import { createClient } from "@supabase/supabase-js";
import { config as dotenv } from "dotenv";
import path from "node:path";

dotenv({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: sErr } = await c.auth.signInWithPassword({
    email: "coordinator@phloem.local",
    password: "test12345!",
  });
  if (sErr) throw sErr;

  const caregiverEmail = "gopalan.family@phloem.local";
  const { data: existing } = await c.from("members").select("id").eq("full_name", "K. V. Gopalan").maybeSingle();
  if (existing) {
    console.log("member already exists; fetching open invite token");
    const { data: inv } = await c
      .from("invites")
      .select("token, used_at, expires_at")
      .eq("email", caregiverEmail)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    console.log("TOKEN:", inv?.token ?? "(none open)");
    return;
  }

  const { data: token, error } = await c.rpc("create_member_with_invite", {
    p_full_name: "K. V. Gopalan",
    p_age: 76,
    p_gender: "Male",
    p_language: "Malayalam",
    p_occupation: "Retired bank officer",
    p_city: "Thrissur",
    p_country: "India",
    p_relationship_to_caregiver: "Father",
    p_phone: "+91 98470 22110",
    p_whatsapp: "+91 98470 22110",
    p_email: "kv.gopalan@example.com",
    p_address: "12 Temple Road, Thrissur",
    p_pin_code: "680001",
    p_emergency_contact_name: "Suresh Gopalan (son)",
    p_emergency_contact_phone: "+91 98470 22111",
    p_caregiver_email: caregiverEmail,
    p_duration_months: 3,
  });
  if (error) throw error;
  console.log("TOKEN:", token);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
