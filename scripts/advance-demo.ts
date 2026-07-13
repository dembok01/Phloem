/**
 * Dev-data advancement for the design audit: drives Meera Krishnan through the
 * real §6 RPC lifecycle (assign → schedule → done → clinical submits → activate)
 * signed in as the actual seeded users, exactly like the app's server actions do.
 * No schema changes; no raw workflow writes. Idempotent-ish: skips steps already done.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as dotenv } from "dotenv";
import path from "node:path";
import { buildClinicalReport } from "@/lib/reports/build/clinical";

dotenv({ path: path.resolve(process.cwd(), ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "test12345!";

type Role = "doctor" | "nutritionist" | "trainer" | "psychologist";
const ROLES: Role[] = ["doctor", "nutritionist", "trainer", "psychologist"];

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

function isoYesterday(hourIST: number): string {
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  d.setUTCHours(hourIST - 6, 30, 0, 0); // hourIST:00 IST = (hourIST-5:30) UTC
  return d.toISOString();
}

const ANSWERS: Record<Role, Record<string, unknown>> = {
  doctor: {
    date: new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10),
    mode: "video",
    duration_min: 40,
    attendees: "member_caregiver",
    clinical_summary:
      "72-year-old retired teacher with 12 years of type 2 diabetes and 8 years of hypertension. Reports exertional chest pain and breathlessness on one flight of stairs — needs cardiac work-up before any moderate activity. Knee pain limits walking; fear of falling on stairs. Largely sedentary (9 h sitting) with low protein intake. Cognition intact, well supported by daughter.",
    problem_list: [
      { condition: "Type 2 diabetes", duration: "12 years", control: "partial" },
      { condition: "Hypertension", duration: "8 years", control: "well" },
      { condition: "Exertional chest pain — under evaluation", duration: "new", control: "poor" },
    ],
    med_recon: [
      { drug: "Metformin", dose: "500 mg", frequency: "Twice daily", action: "continue" },
      { drug: "Telmisartan", dose: "40 mg", frequency: "Once daily", action: "continue" },
    ],
    polypharmacy_concern: false,
    adherence_concerns: "Occasionally skips evening metformin when eating out",
    bp: "138/86",
    pulse: 78,
    weight_kg: 68,
    sugar_hba1c: "7.9%",
    recent_labs: "HbA1c 7.9% (3 months ago); lipids borderline",
    tests_advised: "ECG + treadmill test (cardiology referral); repeat HbA1c and fasting lipids in 4 weeks",
    mobility_aid: false,
    falls_12mo: 0,
    fear_of_falling: true,
    adl: "independent",
    sensory_issues: "Post-cataract vision good; mild presbycusis",
    clearance: "cleared_with_restrictions",
    intensity_ceiling: "Light intensity only until cardiac evaluation — RPE ≤ 3/10, seated or supported work",
    avoid_movements: "No stair-climbing drills, no floor-to-stand transitions unsupervised, no isometric holds",
    supervision_required: true,
    stop_signs: "Any chest discomfort, breathlessness at rest, dizziness — stop immediately and inform the doctor",
    diet_restrictions: ["diabetic", "low_sodium"],
    supplement_guidance: "Vitamin D 1000 IU daily; no OTC supplements without review",
    weight_direction: "maintain",
    monitoring: [
      { parameter: "Fasting glucose", frequency: "Weekly", target: "< 130 mg/dL" },
      { parameter: "Blood pressure", frequency: "Twice weekly", target: "< 140/90" },
      { parameter: "Chest pain episodes", frequency: "Every episode", target: "Zero — report immediately" },
    ],
    risk_level: "moderate",
    risk_rationale:
      "Exertional chest pain with no cardiac evaluation in 12 months, on a background of diabetes and hypertension and a strong family history. Fall-risk indicators present but ADL-independent.",
    referrals: "Cardiology — ECG and stress test within 2 weeks",
    goals_3mo: [
      { goal: "Complete cardiac evaluation and confirm safe activity ceiling" },
      { goal: "HbA1c below 7.5%" },
      { goal: "Walk 20 minutes daily without chest symptoms" },
    ],
    team_flags:
      "Trainer: strict light-intensity ceiling until cardiology clears. Nutritionist: diabetic + low-sodium pattern, protein is very low.",
    notes: "Daughter Anita joins calls and manages medicines — keep her in the loop for any change.",
  },
  nutritionist: {
    date: new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10),
    mode: "video",
    duration_min: 35,
    attendees: "member_caregiver",
    assessment_summary:
      "Traditional Kerala vegetarian pattern with good vegetable intake but protein well below need (~30 g/day vs ~68 g target). Long gap between light dinner and breakfast risks morning lows with metformin. Hydration low at 1.5 L. Appetite good; chews and swallows normally. Cook at home is Meera herself with help from daughter on weekends.",
    typical_day: "Tea at 6, idli/dosa breakfast at 8:30, rice lunch at 1 with sambar and thoran, tea + biscuit at 4:30, light dinner at 8.",
    meals_per_day: 3,
    outside_food: "rarely",
    appetite: "good",
    chew_swallow: true,
    who_cooks: "Self, with daughter's help on weekends",
    kitchen_help: "Daughter preps cut vegetables on Sundays",
    concerns: ["inadequate_protein", "low_hydration", "excess_sugar"],
    concern_notes: "Sweets a few times a week — usually payasam at family events; biscuits with evening tea daily.",
    directives_ack: true,
    approach:
      "Keep the familiar Kerala vegetarian frame and add a protein anchor to every meal rather than changing the cuisine. Diabetic + low-sodium pattern per the doctor's directives, with small frequent carbohydrate portions to protect against post-meal spikes.",
    kcal_target: 1500,
    protein_target_g: 65,
    meal_structure:
      "Breakfast: idli with a cup of sambar + 1 boiled egg or moong cheela. Mid-morning: buttermilk. Lunch: 1 cup rice, dal, thoran, curd. Evening: roasted chana instead of biscuits. Dinner: 2 small dosas or oats upma with vegetables + paneer.",
    hydration_l: 2,
    foods_emphasize: "Dal, moong, chana, paneer, curd, buttermilk, eggs if acceptable, leafy vegetables, guava and papaya",
    foods_limit: "White rice portions (measure with the same cup), payasam to festival days only",
    foods_avoid: "Pickles and pappadam daily (sodium), sugar in tea, packaged biscuits",
    supplements: "Continue vitamin D as advised by the doctor",
    adherence_risks: "Evening biscuit habit is strong; daughter will keep roasted chana stocked. Payasam at family gatherings — plan a small portion rather than banning it.",
    month1_goals: [
      { goal: "One protein source at every meal, 6 days a week" },
      { goal: "2 litres of water daily, tracked with a marked bottle" },
      { goal: "Replace evening biscuits with roasted chana 5 days a week" },
    ],
    flags_for_team: "Watch morning glucose once activity increases — long overnight fast with metformin.",
    notes: "Meera enjoys cooking and responded well to 'add, don't remove' framing.",
  },
  trainer: {
    date: new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10),
    mode: "video",
    duration_min: 30,
    attendees: "member_caregiver",
    assessment_summary:
      "Doctor clearance is light-intensity only with supervision until cardiology review — programme built entirely around seated and supported work. Five sit-to-stands in 21 s (below age norm), single-leg balance 6 s with support nearby, TUG 13.5 s indicating elevated fall risk. Knee pain on deep flexion; corridor walking currently 15 min/day. Motivated, apartment has a long corridor and a sturdy dining chair.",
    clearance_ack: true,
    sit_to_stand: 5,
    balance_seconds: 6,
    tug_seconds: 13.5,
    flexibility_notes: "Reduced ankle dorsiflexion; shoulders normal range",
    exertion_tolerance: "limited",
    exertion_note: "Breathless after one flight of stairs — all work stays well below that threshold",
    training_mode: "online",
    space: "Living room 3×4 m with corridor for walking",
    equipment: "Sturdy dining chair, wall space, 0.5 kg water bottles as weights",
    hazards: "Loose rug near sofa — daughter will remove; stairs avoided entirely",
    sessions_per_week: 3,
    minutes_per_session: 25,
    supervised_split: "All 3 sessions supervised online until cardiac clearance",
    focus_strength_pct: 30,
    focus_mobility_pct: 30,
    focus_balance_pct: 30,
    focus_cardio_pct: 10,
    progression: "Hold at RPE ≤ 3 throughout month 1. Progress repetitions (not resistance) only if fully symptom-free for two consecutive weeks. Reassess sit-to-stand and TUG at day 28.",
    excluded_exercises: "Stair drills, floor work, isometric holds, anything unsupervised at higher effort — per doctor's restrictions",
    fall_precautions: "Chair-supported balance work only, footwear on, daughter within earshot during sessions",
    stop_signs_educated: true,
    month1_goals: [
      { goal: "Complete 10 supervised sessions without symptoms" },
      { goal: "Sit-to-stand ×5 under 18 seconds" },
      { goal: "Corridor walk 20 minutes on non-session days" },
    ],
    flags_for_team: "Will hold all progression until the cardiology result is on file.",
    notes: "Prefers weekday mornings; sessions set for Mon/Wed/Fri 10:30.",
  },
  psychologist: {
    date: new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10),
    mode: "video",
    duration_min: 45,
    attendees: "member",
    session_notes:
      "Warm, articulate, and engaged. Mood is generally good but she describes her world as 'smaller' since retiring and losing two close friends — misses feeling useful. Sleep is short (6 h) with early waking. Some worry about being a burden on her daughter; no hopelessness, no cognitive concerns in conversation. Strong motivation for the programme, framed around staying independent.",
    who5_1: 3,
    who5_2: 3,
    who5_3: 2,
    who5_4: 3,
    who5_5: 2,
    mood: 3,
    mood_note: "Content day-to-day; dips in the evenings",
    sleep_quality: 2,
    sleep_quality_note: "Early waking around 4:30, tea at 6 anchors the day",
    stress_level: 2,
    stress_level_note: "Low overall; health worries surface before doctor visits",
    social_connection: 2,
    social_connection_note: "Phone calls with sister; rarely leaves the flat on weekdays",
    engagement_purpose: 2,
    engagement_purpose_note: "Former teacher — lights up talking about teaching; no current outlet",
    motivation_program: 4,
    motivation_program_note: "Wants to 'manage sugar without hospital visits'",
    cognitive_obs: "No observed concerns; sharp recall of dates and medicines",
    family_involvement: "Daughter is closely involved and supportive; relationship is warm",
    isolation_risk: "medium",
    recommendations:
      "Build one small social anchor per week (temple group or tutoring a neighbour's child). Morning light exposure on the balcony to shift early waking. Re-check WHO-5 next cycle; watch the purpose/engagement scores.",
    escalation: false,
    next_checkin: "routine",
  },
};

async function main() {
  // 1) Coordinator: assign, schedule, mark done
  const coord = await signIn("coordinator@phloem.local");
  const { data: member, error: mErr } = await coord
    .from("members")
    .select("id, full_name, status")
    .eq("full_name", "Meera Krishnan")
    .single();
  if (mErr || !member) throw new Error(`member lookup: ${mErr?.message}`);
  console.log(`Member: ${member.full_name} (${member.status})`);

  const { data: pros, error: pErr } = await coord
    .from("profiles")
    .select("id, role, full_name")
    .in("role", ROLES);
  if (pErr || !pros?.length) throw new Error(`profiles lookup: ${pErr?.message}`);

  for (const role of ROLES) {
    const pro = pros.find((p) => p.role === role);
    if (!pro) throw new Error(`no ${role} profile`);
    const { error } = await coord.rpc("assign_care_team", {
      p_member: member.id,
      p_role: role,
      p_user: pro.id,
    });
    if (error) throw new Error(`assign ${role}: ${error.message}`);
    console.log(`assigned ${role}: ${pro.full_name}`);
  }

  const { data: consultations, error: cErr } = await coord
    .from("consultations")
    .select("id, type, meeting_status, report_status")
    .eq("member_id", member.id)
    .is("cycle_id", null);
  if (cErr || !consultations?.length) throw new Error(`consultations: ${cErr?.message}`);

  const hours: Record<Role, number> = { doctor: 10, nutritionist: 11, trainer: 12, psychologist: 15 };
  for (const cons of consultations) {
    if (cons.meeting_status === "to_schedule") {
      const { error } = await coord.rpc("set_consultation_schedule", {
        p_cons: cons.id,
        p_at: isoYesterday(hours[cons.type as Role]),
        p_mode: "video",
        p_link: "https://meet.google.com/phl-oem-care",
      });
      if (error) throw new Error(`schedule ${cons.type}: ${error.message}`);
      console.log(`scheduled ${cons.type}`);
    }
    const { error: dErr } = await coord.rpc("mark_meeting_done", { p_cons: cons.id });
    if (dErr && !dErr.message.includes("not_scheduled")) throw new Error(`done ${cons.type}: ${dErr.message}`);
    console.log(`meeting done ${cons.type}`);
  }

  // 2) Clinicians submit — doctor FIRST (trainer gate needs clearance on file)
  for (const role of ROLES) {
    const clin = await signIn(`${role}@phloem.local`);
    const { data: cons, error } = await clin
      .from("consultations")
      .select("id, type, report_status")
      .eq("member_id", member.id)
      .eq("type", role)
      .is("cycle_id", null)
      .single();
    if (error || !cons) throw new Error(`${role} consultation: ${error?.message}`);
    if (cons.report_status === "submitted") {
      console.log(`${role}: already submitted, skipping`);
      continue;
    }
    const reportType =
      role === "doctor" ? "doctor_initial"
      : role === "nutritionist" ? "nutrition_plan"
      : role === "trainer" ? "training_plan"
      : "wellbeing";
    const content = buildClinicalReport(reportType, {
      memberName: member.full_name,
      answers: ANSWERS[role],
      cycle: null,
    });
    const { data: reportId, error: sErr } = await clin.rpc("submit_clinical_form", {
      p_cons: cons.id,
      p_answers: ANSWERS[role] as never,
      p_report_content: content as never,
    });
    if (sErr) throw new Error(`${role} submit: ${sErr.message}`);
    console.log(`${role} submitted → report ${reportId}`);
  }

  // 3) Activate the program (coordinator)
  const { error: aErr } = await coord.rpc("activate_program", { p_member: member.id });
  if (aErr && !aErr.message.includes("not_ready")) {
    if (aErr.message.includes("already") || aErr.message.includes("not_found")) {
      console.log(`activate: ${aErr.message} (continuing)`);
    } else {
      throw new Error(`activate: ${aErr.message}`);
    }
  } else {
    console.log("program activated — starts tomorrow");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
