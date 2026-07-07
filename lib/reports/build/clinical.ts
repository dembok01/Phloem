// §8 clinical report builders — one per clinical report type. INVARIANT: every
// report's FIRST section is the professional's free-text assessment (§8/§1). The
// doctor reports also carry a top-level `clearance` so the §6 trainer gate is
// queryable (Assumption 5). Builders map a submitted form response → content.
import type { Database } from "@/lib/supabase/database.types";
import { textOr } from "@/lib/reports/format";
import type { ReportContent, ReportSection } from "@/lib/reports/types";
import { goalList, humanize, kv, repeatTable } from "./helpers";

type ReportType = Database["public"]["Enums"]["report_type"];
type Answers = Record<string, unknown>;

export type ClinicalReportContent = ReportContent & { clearance?: string };

export type ClinicalInput = {
  memberName: string;
  answers: Answers;
  cycle: number | null;
  generatedAt?: string;
};

const TITLES: Record<string, string> = {
  doctor_initial: "Doctor's Initial Report",
  doctor_review: "Doctor's Review Report",
  nutrition_plan: "Nutrition Plan",
  nutrition_review: "Nutrition Review",
  training_plan: "Training Plan",
  training_review: "Training Review",
  wellbeing: "Wellbeing Report",
};

/** Free-text field that leads each report type (§8 first-section invariant). */
export const ASSESSMENT_FIELD: Record<string, string> = {
  doctor_initial: "clinical_summary",
  doctor_review: "review_summary",
  nutrition_plan: "assessment_summary",
  nutrition_review: "review_summary",
  training_plan: "assessment_summary",
  training_review: "review_summary",
  wellbeing: "session_notes",
};

const ASSESSMENT_HEADING: Record<string, string> = {
  doctor_initial: "Doctor's Assessment",
  doctor_review: "Doctor's Review",
  nutrition_plan: "Nutritionist's Assessment",
  nutrition_review: "Nutritionist's Review",
  training_plan: "Trainer's Assessment",
  training_review: "Trainer's Review",
  wellbeing: "Session Notes (Confidential)",
};

function consultationSection(a: Answers): ReportSection {
  return {
    heading: "Consultation",
    kind: "kv",
    data: kv([
      ["Date", a.date],
      ["Mode", a.mode],
      ["Duration (min)", a.duration_min],
      ["Attendees", a.attendees],
    ]),
  };
}

/** Assessment-first section (§8 invariant). */
function assessmentSection(type: string, a: Answers): ReportSection {
  return {
    heading: ASSESSMENT_HEADING[type],
    kind: "text",
    data: textOr(a[ASSESSMENT_FIELD[type]], "No assessment recorded."),
  };
}

export function buildClinicalReport(type: ReportType, input: ClinicalInput): ClinicalReportContent {
  const a = input.answers;
  const base = {
    title: `${TITLES[type] ?? "Report"} — ${input.memberName}`,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    cycle: input.cycle,
  };
  const lead = assessmentSection(type, a);
  const record = consultationSection(a);

  switch (type) {
    case "doctor_initial": {
      const sections: ReportSection[] = [
        lead,
        record,
        {
          heading: "Problem List",
          kind: "table",
          data: repeatTable(a.problem_list, [
            { id: "condition", label: "Condition" },
            { id: "duration", label: "Duration" },
            { id: "control", label: "Control" },
            { id: "specialist", label: "Specialist" },
          ]),
        },
        {
          heading: "Medication Reconciliation",
          kind: "table",
          data: repeatTable(a.med_recon, [
            { id: "drug", label: "Drug" },
            { id: "dose", label: "Dose" },
            { id: "frequency", label: "Frequency" },
            { id: "action", label: "Action" },
            { id: "note", label: "Note" },
          ]),
        },
        {
          heading: "Vitals & Investigations",
          kind: "kv",
          data: kv([
            ["Blood pressure", a.bp],
            ["Pulse", a.pulse],
            ["Weight (kg)", a.weight_kg],
            ["Sugar / HbA1c", a.sugar_hba1c],
            ["Recent labs", a.recent_labs],
            ["Tests advised", a.tests_advised],
          ]),
        },
        {
          heading: "Function & Safety",
          kind: "kv",
          data: kv([
            ["Mobility aid", a.mobility_aid ? textOr(a.mobility_aid_detail, "Yes") : a.mobility_aid],
            ["Falls (12 mo)", a.falls_12mo],
            ["Fear of falling", a.fear_of_falling],
            ["ADL", a.adl],
            ["Sensory issues", a.sensory_issues],
          ]),
        },
        exerciseClearanceSection(a),
        {
          heading: "Nutrition Directives",
          kind: "kv",
          data: kv([
            ["Diet restrictions", a.diet_restrictions],
            ["Supplement guidance", a.supplement_guidance],
            ["Weight direction", a.weight_direction],
          ]),
        },
        {
          heading: "Monitoring",
          kind: "table",
          data: repeatTable(a.monitoring, [
            { id: "parameter", label: "Parameter" },
            { id: "frequency", label: "Frequency" },
            { id: "target", label: "Target" },
          ]),
        },
        {
          heading: "Risk & Plan",
          kind: "kv",
          data: kv([
            ["Risk level", a.risk_level],
            ["Risk rationale", a.risk_rationale],
            ["Referrals", a.referrals],
          ]),
        },
        listSection("3-Month Goals", goalList(a.goals_3mo)),
        teamFlagsSection(a),
      ];
      return { ...base, sections, clearance: textOr(a.clearance, "") };
    }

    case "doctor_review": {
      const sections: ReportSection[] = [
        lead,
        record,
        {
          heading: "Changes",
          kind: "kv",
          data: kv([
            ["Condition changes", a.condition_changes],
            ["Response to performance report", a.performance_response],
            ["Directive changes", a.directive_changes],
            ["Clearance change", a.clearance_change],
          ]),
        },
        {
          heading: "Medication Changes",
          kind: "table",
          data: repeatTable(a.med_changes, [
            { id: "drug", label: "Drug" },
            { id: "dose", label: "Dose" },
            { id: "frequency", label: "Frequency" },
            { id: "action", label: "Action" },
            { id: "note", label: "Note" },
          ]),
        },
        listSection("Next-Month Goals", goalList(a.next_month_goals)),
        teamFlagsSection(a),
      ];
      // Carry the new clearance when the doctor updated it (Phase 7 refines
      // carry-forward of an unchanged clearance across cycles).
      return { ...base, sections, clearance: textOr(a.clearance, "") };
    }

    case "nutrition_plan": {
      const sections: ReportSection[] = [
        lead,
        record,
        {
          heading: "Current Intake",
          kind: "kv",
          data: kv([
            ["Typical day", a.typical_day],
            ["Meals per day", a.meals_per_day],
            ["Outside food", a.outside_food],
            ["Appetite", a.appetite],
            ["Chew / swallow difficulty", a.chew_swallow ? textOr(a.chew_note, "Yes") : a.chew_swallow],
            ["Who cooks", a.who_cooks],
            ["Kitchen help", a.kitchen_help],
          ]),
        },
        {
          heading: "Concerns",
          kind: "kv",
          data: kv([
            ["Concerns", a.concerns],
            ["Notes", a.concern_notes],
            ["Doctor's directives acknowledged", a.directives_ack],
          ]),
        },
        {
          heading: "Plan",
          kind: "kv",
          data: kv([
            ["Approach", a.approach],
            ["Calorie target", a.kcal_target],
            ["Protein target (g)", a.protein_target_g],
            ["Meal structure", a.meal_structure],
            ["Hydration (L)", a.hydration_l],
            ["Texture modification", a.texture_mod],
            ["Foods to emphasize", a.foods_emphasize],
            ["Foods to limit", a.foods_limit],
            ["Foods to avoid", a.foods_avoid],
            ["Supplements", a.supplements],
          ]),
        },
        {
          heading: "Adherence Risks",
          kind: "text",
          data: textOr(a.adherence_risks),
        },
        listSection("Month-1 Goals", goalList(a.month1_goals)),
        flagsForTeamSection(a),
      ];
      return { ...base, sections };
    }

    case "nutrition_review": {
      const sections: ReportSection[] = [
        lead,
        record,
        { heading: "Adherence Observations", kind: "text", data: textOr(a.adherence_observations) },
        {
          heading: "Target Updates",
          kind: "kv",
          data: kv([
            ["Calorie target", a.kcal_target],
            ["Protein target (g)", a.protein_target_g],
            ["Hydration (L)", a.hydration_l],
          ]),
        },
        { heading: "Plan Changes", kind: "text", data: textOr(a.plan_changes) },
        listSection("Next-Month Goals", goalList(a.next_month_goals)),
        flagsForTeamSection(a),
      ];
      return { ...base, sections };
    }

    case "training_plan": {
      const sections: ReportSection[] = [
        lead,
        record,
        {
          heading: "Baseline",
          kind: "kv",
          data: kv([
            ["30-sec sit-to-stand (reps)", a.sit_to_stand],
            ["Balance hold (sec)", a.balance_seconds],
            ["Timed up-and-go (sec)", a.tug_seconds],
            ["Flexibility", a.flexibility_notes],
            ["Exertion tolerance", a.exertion_tolerance],
          ]),
        },
        {
          heading: "Environment",
          kind: "kv",
          data: kv([
            ["Training mode", a.training_mode],
            ["Space", a.space],
            ["Equipment", a.equipment],
            ["Hazards", a.hazards],
          ]),
        },
        {
          heading: "Prescription",
          kind: "kv",
          data: kv([
            ["Sessions / week", a.sessions_per_week],
            ["Minutes / session", a.minutes_per_session],
            ["Supervised split", a.supervised_split],
            ["Focus — strength %", a.focus_strength_pct],
            ["Focus — mobility %", a.focus_mobility_pct],
            ["Focus — balance %", a.focus_balance_pct],
            ["Focus — cardio %", a.focus_cardio_pct],
            ["Progression", a.progression],
          ]),
        },
        {
          heading: "Safety",
          kind: "kv",
          data: kv([
            ["Excluded exercises", a.excluded_exercises],
            ["Fall precautions", a.fall_precautions],
            ["Stop-signs educated", a.stop_signs_educated],
            ["Doctor's clearance acknowledged", a.clearance_ack],
          ]),
        },
        listSection("Month-1 Goals", goalList(a.month1_goals)),
        flagsForTeamSection(a),
      ];
      return { ...base, sections };
    }

    case "training_review": {
      const sections: ReportSection[] = [
        lead,
        record,
        { heading: "Program Adjustments", kind: "text", data: textOr(a.program_adjustments) },
        {
          heading: "Re-assessment",
          kind: "kv",
          data: kv([
            ["30-sec sit-to-stand (reps)", a.sit_to_stand],
            ["Balance hold (sec)", a.balance_seconds],
            ["Timed up-and-go (sec)", a.tug_seconds],
          ]),
        },
        listSection("Next-Month Goals", goalList(a.next_month_goals)),
        flagsForTeamSection(a),
      ];
      return { ...base, sections };
    }

    case "wellbeing": {
      const who5 = ["who5_1", "who5_2", "who5_3", "who5_4", "who5_5"].reduce((sum, k) => {
        const n = a[k];
        return sum + (typeof n === "number" ? n : 0);
      }, 0);
      const sections: ReportSection[] = [
        lead,
        record,
        {
          heading: "WHO-5 Well-Being Index",
          kind: "kv",
          data: { Score: `${who5 * 4} / 100`, "Raw (0–25)": String(who5) },
        },
        {
          heading: "Domains",
          kind: "table",
          data: {
            columns: ["Domain", "Rating (1–5)", "Note"],
            rows: [
              ["Mood", humanize(a.mood), textOr(a.mood_note, "—")],
              ["Sleep quality", humanize(a.sleep_quality), textOr(a.sleep_quality_note, "—")],
              ["Stress level", humanize(a.stress_level), textOr(a.stress_level_note, "—")],
              ["Social connection", humanize(a.social_connection), textOr(a.social_connection_note, "—")],
              ["Engagement & purpose", humanize(a.engagement_purpose), textOr(a.engagement_purpose_note, "—")],
              ["Motivation (program)", humanize(a.motivation_program), textOr(a.motivation_program_note, "—")],
            ],
          },
        },
        {
          heading: "Support",
          kind: "kv",
          data: kv([
            ["Cognitive observations", a.cognitive_obs],
            ["Family involvement", a.family_involvement],
            ["Isolation risk", a.isolation_risk],
          ]),
        },
        { heading: "Recommendations", kind: "text", data: textOr(a.recommendations) },
      ];
      if (a.escalation === true || a.escalation === "true") {
        sections.push({
          heading: "Escalation",
          kind: "callout",
          data: { tone: "danger", lead: "Flagged for admin attention:", text: textOr(a.escalation_note, "Earlier follow-up advised.") },
        });
      }
      return { ...base, sections };
    }

    default:
      return { ...base, sections: [lead, record] };
  }
}

function exerciseClearanceSection(a: Answers): ReportSection {
  const status = textOr(a.clearance, "—");
  const restricted = a.clearance === "cleared_with_restrictions";
  const onHold = a.clearance === "on_hold";
  if (restricted || onHold) {
    return {
      heading: "Exercise Clearance",
      kind: "callout",
      data: {
        tone: onHold ? "danger" : "warning",
        lead: onHold ? "On hold — not cleared for exercise." : "Cleared with restrictions:",
        items: [
          `Status: ${humanize(a.clearance)}`,
          `Intensity ceiling: ${textOr(a.intensity_ceiling)}`,
          `Avoid: ${textOr(a.avoid_movements)}`,
          `Supervision required: ${humanize(a.supervision_required)}`,
          `Stop signs: ${textOr(a.stop_signs)}`,
        ],
      },
    };
  }
  return { heading: "Exercise Clearance", kind: "kv", data: { Status: humanize(status) } };
}

function listSection(heading: string, items: string[]): ReportSection {
  return { heading, kind: "list", data: items.length ? items : ["—"] };
}

function teamFlagsSection(a: Answers): ReportSection {
  return {
    heading: "Team Flags & Notes",
    kind: "kv",
    data: kv([
      ["Team flags", a.team_flags],
      ["Notes", a.notes],
    ]),
  };
}

function flagsForTeamSection(a: Answers): ReportSection {
  return {
    heading: "Flags & Notes",
    kind: "kv",
    data: kv([
      ["Flags for team", a.flags_for_team],
      ["Notes", a.notes],
    ]),
  };
}
