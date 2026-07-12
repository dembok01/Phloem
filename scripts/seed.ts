/**
 * PHLOEM seed (§14) — idempotent, safe to re-run (upsert / on-conflict).
 * Targets the hosted Supabase dev project (environment override): run with
 * `npm run seed`. Uses the service-role key from .env.local; never logs it.
 *
 * 1. Admin auth user from SEED_ADMIN_EMAIL/PASSWORD + profile role admin.
 * 2. All §7 templates from supabase/templates/*.v1.json (version 1, active).
 * 3. Dev fixtures (skipped when NODE_ENV=production): one profile per
 *    care-team role (password test12345!), a coordinator (§16 needs one),
 *    one caregiver + member advanced to `onboarded` with realistic answers
 *    including one high red flag, and a second unassigned member (§16).
 * 4. Private storage bucket `reports`.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { RedFlag } from "@/lib/red-flags";
import { buildOnboardingSummary } from "@/lib/reports/build/onboarding-summary";

process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!url || !serviceKey || !adminEmail || !adminPassword) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env.local",
  );
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "test12345!";
// Fixed UUIDs make re-runs upsert instead of duplicating.
const MEMBER_1 = "11111111-1111-4111-8111-111111111111";
const MEMBER_2 = "22222222-2222-4222-8222-222222222222";
const PACKAGE_1 = "33333333-3333-4333-8333-333333333333";
const ONBOARDING_RESPONSE_1 = "44444444-4444-4444-8444-444444444444";
const ONBOARDING_REPORT_1 = "55555555-5555-4555-8555-555555555555";
const NUTRITION_PLAN_1 = "66666666-6666-4666-8666-666666666666";
const TRAINING_PLAN_1 = "77777777-7777-4777-8777-777777777777";

type SeededUser = { id: string; email: string };

async function ensureAuthUser(email: string, password: string): Promise<SeededUser> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) return { id: existing.id, email };
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${email}) failed: ${error?.message}`);
  return { id: data.user.id, email };
}

async function upsertProfile(p: {
  id: string;
  role: string;
  full_name: string;
  email: string;
  phone?: string;
  specialization?: string;
  status?: string;
}): Promise<void> {
  const { error } = await db.from("profiles").upsert(
    { status: "active", ...p },
    { onConflict: "id" },
  );
  if (error) throw new Error(`profiles upsert (${p.email}): ${error.message}`);
}

async function seedTemplates(): Promise<void> {
  const dir = path.join(process.cwd(), "supabase", "templates");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    const schema = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
      key: string;
      version: number;
    };
    const { error } = await db.from("form_templates").upsert(
      { key: schema.key, version: schema.version, schema, active: true },
      { onConflict: "key,version" },
    );
    if (error) throw new Error(`template ${file}: ${error.message}`);
    console.log(`  template ${schema.key} v${schema.version} ✓`);
  }
}

// Realistic onboarding answers AFTER the §4 data-split (contact identifiers
// live in member_contacts, never in answers). Includes one high red flag
// (§13: Exertional chest pain).
const member1Answers = {
  full_name: "Meera Krishnan",
  age: 72,
  gender: "Female",
  occupation: "Retired teacher",
  city: "Kochi",
  country: "India",
  language: "Malayalam",
  weight_kg: 68,
  height_cm: 152,
  relationship_to_caregiver: "Mother",
  scheduling_contact: "caregiver",
  consent: true,
  conditions: [
    { condition: "Type 2 diabetes", duration: "12 years" },
    { condition: "Hypertension", duration: "8 years" },
  ],
  surgeries_injuries: "Cataract surgery (2022)",
  joint_pain: true,
  painkillers_needed: "Occasional paracetamol for knee pain",
  cardiac_eval_12mo: false,
  vision_blurring: false,
  medications: [
    { name: "Metformin", dose: "500 mg", frequency: "Twice daily" },
    { name: "Telmisartan", dose: "40 mg", frequency: "Once daily" },
  ],
  seeing_doctor_currently: true,
  alt_medicine: "",
  hospitalizations: "",
  allergies: "None",
  food_allergies: "None",
  breathing_stamina: "Gets breathless climbing one flight of stairs",
  family_history: "Father had a heart attack at 68. Mother had a stroke at 75.",
  activity_level: "Sedentary",
  sitting_hours: 9,
  current_activities: "Short evening walks in the apartment corridor",
  activity_minutes: 15,
  limiting_factors: "Knee pain; afraid of losing balance on stairs",
  smoking: false,
  alcohol: false,
  sleep_hours: 6,
  activity_symptoms: ["Exertional chest pain", "Easy fatigue"],
  meal_routine: "Tea at 6, breakfast idli/dosa at 8:30, rice lunch at 1, light dinner at 8",
  diet_pref: ["Veg"],
  food_frequency: {
    Fruits: "Few times a week",
    Vegetables: "Daily",
    Dairy: "Daily",
    Protein: "Rarely",
    "Processed foods": "Rarely",
    Sweets: "Few times a week",
  },
  water_liters: 1.5,
  protein_grams: 30,
  goals: ["Manage chronic condition", "Mobility & flexibility", "Energy & vitality"],
  reason: "Family wants amma to stay independent and manage her sugar without hospital visits.",
  trainer_before: false,
  preferred_slots: "Weekday mornings",
  focus_area: "Mix",
  other_info: "",
};

// Must match the §13 rules applied to the answers above (mirrors _red_flags()).
const member1RedFlags = [
  { id: "chest_pain", label: "Chest pain on exertion", severity: "high" },
  { id: "no_cardiac_eval", label: "No cardiac evaluation in past 12 months", severity: "medium" },
  { id: "fall_risk", label: "Fall-risk indicators", severity: "medium" },
  { id: "breathing_stamina", label: "Reported breathing/stamina issues", severity: "medium" },
];

async function main(): Promise<void> {
  console.log("PHLOEM seed → hosted dev project");

  console.log("1) admin user");
  const admin = await ensureAuthUser(adminEmail!, adminPassword!);
  await upsertProfile({ id: admin.id, role: "admin", full_name: "PHLOEM Admin", email: admin.email });

  console.log("2) form templates");
  await seedTemplates();

  if (process.env.NODE_ENV === "production") {
    console.log("3) dev fixtures skipped (NODE_ENV=production)");
  } else {
    console.log("3) dev fixtures");
    const fixtures = [
      { email: "coordinator@phloem.local", role: "coordinator", name: "Divya Coordinator" },
      { email: "doctor@phloem.local", role: "doctor", name: "Dr. Arjun Nair", specialization: "Geriatric medicine" },
      { email: "nutritionist@phloem.local", role: "nutritionist", name: "Lakshmi Menon", specialization: "Clinical nutrition" },
      { email: "trainer@phloem.local", role: "trainer", name: "Vivek Shetty", specialization: "Senior fitness" },
      { email: "psychologist@phloem.local", role: "psychologist", name: "Dr. Sara Thomas", specialization: "Geriatric psychology" },
      { email: "caregiver@phloem.local", role: "caregiver", name: "Anita Krishnan" },
      // Elderly (view-only) login linked to Meera via members.member_user_id (§10).
      { email: "elder@phloem.local", role: "member", name: "Meera Krishnan" },
    ] as const;
    const users: Record<string, string> = {};
    for (const f of fixtures) {
      const u = await ensureAuthUser(f.email, TEST_PASSWORD);
      await upsertProfile({
        id: u.id,
        role: f.role,
        full_name: f.name,
        email: f.email,
        specialization: "specialization" in f ? f.specialization : undefined,
      });
      users[f.role] = u.id;
      console.log(`  ${f.role} ✓`);
    }

    const { data: tmpl, error: tmplErr } = await db
      .from("form_templates")
      .select("id")
      .eq("key", "onboarding")
      .eq("version", 1)
      .single();
    if (tmplErr || !tmpl) throw new Error(`onboarding template lookup: ${tmplErr?.message}`);

    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();
    const oneDayAgo = new Date(Date.now() - 1 * 86400_000).toISOString();

    // Member 1 — advanced to `onboarded`, one high red flag.
    let error = (await db.from("members").upsert({
      id: MEMBER_1,
      caregiver_id: users.caregiver,
      member_user_id: users.member, // elderly view-only login (§10)
      full_name: "Meera Krishnan",
      age: 72,
      gender: "Female",
      language: "Malayalam",
      occupation: "Retired teacher",
      city: "Kochi",
      country: "India",
      relationship_to_caregiver: "Mother",
      status: "onboarded",
      red_flags: member1RedFlags,
      onboarding_video_watched_at: twoDaysAgo,
    }, { onConflict: "id" })).error;
    if (error) throw new Error(`member1: ${error.message}`);

    error = (await db.from("member_contacts").upsert({
      member_id: MEMBER_1,
      phone: "+91 98470 12345",
      whatsapp: "+91 98470 12345",
      email: "meera.krishnan@example.com",
      address: "2B, Lakeview Apartments, Panampilly Nagar",
      pin_code: "682036",
      emergency_contact_name: "Anita Krishnan",
      emergency_contact_phone: "+91 98950 54321",
    }, { onConflict: "member_id" })).error;
    if (error) throw new Error(`member1 contacts: ${error.message}`);

    error = (await db.from("packages").upsert({
      id: PACKAGE_1,
      member_id: MEMBER_1,
      duration_months: 3,
      status: "not_started",
    }, { onConflict: "id" })).error;
    if (error) throw new Error(`package1: ${error.message}`);

    error = (await db.from("form_responses").upsert({
      id: ONBOARDING_RESPONSE_1,
      member_id: MEMBER_1,
      template_id: tmpl.id,
      respondent_id: users.caregiver,
      answers: member1Answers,
      submitted_at: oneDayAgo,
    }, { onConflict: "id" })).error;
    if (error) throw new Error(`onboarding response: ${error.message}`);

    error = (await db.from("reports").upsert({
      id: ONBOARDING_REPORT_1,
      member_id: MEMBER_1,
      type: "onboarding_summary",
      content: buildOnboardingSummary({
        memberName: "Meera Krishnan",
        answers: member1Answers,
        redFlags: member1RedFlags as RedFlag[],
        generatedAt: oneDayAgo,
      }),
      created_by: users.caregiver,
    }, { onConflict: "id" })).error;
    if (error) throw new Error(`onboarding report: ${error.message}`);

    // Nutrition & training plan reports so the caregiver/elderly portal has
    // "plans front and center" to show (§10). No assignments/activation — that
    // keeps the §16 in-transaction fixtures (which assign the care team to M1) clean.
    error = (await db.from("reports").upsert({
      id: NUTRITION_PLAN_1,
      member_id: MEMBER_1,
      type: "nutrition_plan",
      content: {
        title: "Nutrition Plan — Meera Krishnan",
        generated_at: oneDayAgo,
        cycle: null,
        sections: [
          { heading: "Nutritionist's Assessment", kind: "text",
            data: "Adequate appetite with irregular protein intake. Focus on protein at each meal, steady hydration, and lower added sugar." },
          { heading: "Plan", kind: "kv", data: {
            "Approach": "Balanced, protein-forward, low added sugar",
            "Calorie target": "1600 kcal/day",
            "Protein target": "60 g/day",
            "Hydration": "2.0 L/day",
          } },
          { heading: "Foods to emphasise", kind: "list",
            data: ["Dal, eggs, curd, paneer", "Vegetables at lunch & dinner", "Fruit for snacks in place of sweets"] },
          { heading: "This month's goals", kind: "list",
            data: ["Protein at breakfast daily", "Two fruit servings/day", "Cut evening sweets to twice a week"] },
        ],
      },
      share_with_caregiver: true,
      created_by: users.nutritionist,
    }, { onConflict: "id" })).error;
    if (error) throw new Error(`nutrition plan: ${error.message}`);

    error = (await db.from("reports").upsert({
      id: TRAINING_PLAN_1,
      member_id: MEMBER_1,
      type: "training_plan",
      content: {
        title: "Training Plan — Meera Krishnan",
        generated_at: oneDayAgo,
        cycle: null,
        sections: [
          { heading: "Trainer's Assessment", kind: "text",
            data: "Independent and motivated. Begin with supervised strength and balance work, progressing gradually. Stop-signs reviewed." },
          { heading: "Prescription", kind: "kv", data: {
            "Sessions/week": "3",
            "Minutes/session": "30",
            "Focus": "Strength 40% · Balance 30% · Mobility 30%",
          } },
          { heading: "This month's goals", kind: "list",
            data: ["Sit-to-stand: 10 → 14 reps", "Single-leg balance: 10 → 20 s", "Daily 15-minute walk"] },
        ],
      },
      share_with_caregiver: true,
      created_by: users.trainer,
    }, { onConflict: "id" })).error;
    if (error) throw new Error(`training plan: ${error.message}`);
    console.log("  member Meera Krishnan (onboarded, high red flag, plans, elderly login) ✓");

    // Member 2 — unassigned, no caregiver: §16 invisibility fixture.
    error = (await db.from("members").upsert({
      id: MEMBER_2,
      full_name: "Rajan Pillai",
      age: 78,
      gender: "Male",
      city: "Thrissur",
      country: "India",
      status: "onboarded",
    }, { onConflict: "id" })).error;
    if (error) throw new Error(`member2: ${error.message}`);
    error = (await db.from("member_contacts").upsert({
      member_id: MEMBER_2,
      phone: "+91 90000 11111",
    }, { onConflict: "member_id" })).error;
    if (error) throw new Error(`member2 contacts: ${error.message}`);
    console.log("  member Rajan Pillai (unassigned §16 fixture) ✓");
  }

  console.log("4) storage bucket `reports` (private)");
  const { error: bucketErr } = await db.storage.createBucket("reports", { public: false });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) {
    throw new Error(`bucket: ${bucketErr.message}`);
  }
  console.log("Seed complete ✓");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
