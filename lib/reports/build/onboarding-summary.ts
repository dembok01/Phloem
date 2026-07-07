// §8 builder: onboarding answers → `onboarding_summary` report content.
// Sections (per §8): Personal snapshot (NO contact identifiers) / Medical History
// / Medications (table) / Lifestyle & Activity / Diet / Goals / Red Flags (callout).
// Contact identifiers are never read here — the report body is safe to show to
// clinicians who can see the summary but must never see phone/PIN/etc.
import type { RedFlag } from "@/lib/red-flags";
import { textOr, yesNo } from "@/lib/reports/format";
import type { KvData, ReportContent, ReportSection, TableData } from "@/lib/reports/types";

type Answers = Record<string, unknown>;

export type OnboardingSummaryInput = {
  memberName: string;
  answers: Answers;
  redFlags: RedFlag[];
  generatedAt?: string;
};

function repeatRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    : [];
}

function conditionsSummary(value: unknown): string {
  const rows = repeatRows(value);
  const parts = rows
    .map((r) => {
      const name = textOr(r.condition, "");
      const dur = textOr(r.duration, "");
      if (!name) return "";
      return dur ? `${name} (${dur})` : name;
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : "—";
}

function medicationsTable(value: unknown): TableData {
  const rows = repeatRows(value)
    .map((r) => [textOr(r.name, ""), textOr(r.dose, ""), textOr(r.frequency, "")])
    .filter((row) => row.some((c) => c !== ""));
  return {
    columns: ["Medicine", "Dose", "Frequency"],
    rows: rows.length ? rows : [["—", "—", "—"]],
  };
}

function foodFrequencyKv(value: unknown): KvData {
  const out: KvData = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [row, col] of Object.entries(value as Record<string, unknown>)) {
      out[row] = textOr(col);
    }
  }
  return out;
}

export function buildOnboardingSummary(input: OnboardingSummaryInput): ReportContent {
  const a = input.answers;
  const sections: ReportSection[] = [];

  // Personal snapshot — demographics only, never contact identifiers.
  sections.push({
    heading: "Personal Snapshot",
    kind: "kv",
    data: {
      Age: textOr(a.age),
      Gender: textOr(a.gender),
      Language: textOr(a.language),
      Occupation: textOr(a.occupation),
      City: textOr(a.city),
      Country: textOr(a.country),
      "Weight (kg)": textOr(a.weight_kg),
      "Height (cm)": textOr(a.height_cm),
      "Relationship to caregiver": textOr(a.relationship_to_caregiver),
    },
  });

  // Medical History
  sections.push({
    heading: "Medical History",
    kind: "kv",
    data: {
      "Current conditions": conditionsSummary(a.conditions),
      "Surgeries / injuries": textOr(a.surgeries_injuries),
      "Joint pain": yesNo(a.joint_pain, a.painkillers_needed),
      "Cardiac evaluation (past 12 months)": yesNo(a.cardiac_eval_12mo),
      "Vision blurring": yesNo(a.vision_blurring, a.ophthalmologist_consulted),
      "Currently seeing a doctor": yesNo(a.seeing_doctor_currently),
      "Alternative medicine": textOr(a.alt_medicine),
      Hospitalizations: textOr(a.hospitalizations),
      Allergies: textOr(a.allergies),
      "Food allergies": textOr(a.food_allergies),
      "Breathing / stamina": textOr(a.breathing_stamina),
      "Family history": textOr(a.family_history),
    },
  });

  // Medications (table)
  sections.push({ heading: "Medications", kind: "table", data: medicationsTable(a.medications) });

  // Lifestyle & Activity
  sections.push({
    heading: "Lifestyle & Activity",
    kind: "kv",
    data: {
      "Activity level": textOr(a.activity_level),
      "Sitting hours / day": textOr(a.sitting_hours),
      "Current activities": textOr(a.current_activities),
      "Activity minutes / day": textOr(a.activity_minutes),
      "Limiting factors": textOr(a.limiting_factors),
      Smoking: yesNo(a.smoking, a.smoking_freq),
      Alcohol: yesNo(a.alcohol, a.alcohol_freq),
      "Sleep hours / night": textOr(a.sleep_hours),
      "Symptoms during activity": textOr(a.activity_symptoms),
    },
  });

  // Diet
  sections.push({
    heading: "Diet & Nutrition",
    kind: "kv",
    data: {
      "Meal routine": textOr(a.meal_routine),
      "Diet preference": textOr(a.diet_pref),
      "Water (litres / day)": textOr(a.water_liters),
      "Protein (g / day)": textOr(a.protein_grams),
      ...foodFrequencyKv(a.food_frequency),
    },
  });

  // Goals
  sections.push({
    heading: "Goals",
    kind: "kv",
    data: {
      Goals: textOr(a.goals),
      "Reason for joining": textOr(a.reason),
      "Worked with a trainer before": yesNo(a.trainer_before, a.trainer_experience),
      "Preferred time slots": textOr(a.preferred_slots),
      "Preferred focus": textOr(a.focus_area),
      "Other information": textOr(a.other_info),
    },
  });

  // Red Flags (callout, only if any)
  if (input.redFlags.length > 0) {
    const hasHigh = input.redFlags.some((f) => f.severity === "high");
    sections.push({
      heading: "Red Flags",
      kind: "callout",
      data: {
        tone: hasHigh ? "danger" : "warning",
        lead: "These findings require clinical review before the program begins:",
        items: input.redFlags.map((f) => `${f.label} — ${f.severity} priority`),
      },
    });
  }

  return {
    title: `Onboarding Health Summary — ${input.memberName}`,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    cycle: null,
    sections,
  };
}
