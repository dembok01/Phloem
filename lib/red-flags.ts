// §13 red-flag engine — pure, and a faithful mirror of the DB-side `_red_flags()`
// in supabase/migrations/0003_rpcs.sql. The DATABASE is the enforcement boundary:
// `submit_onboarding` computes and writes `members.red_flags` server-side. This
// module is the UI/preview mirror (banners, dots) and is unit-tested for exact
// parity of ids/labels/severity/order with the SQL.

export type RedFlagSeverity = "high" | "medium";

export type RedFlag = {
  id: string;
  label: string;
  severity: RedFlagSeverity;
};

export type OnboardingAnswers = Record<string, unknown>;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** True for a boolean `false` as well as the string `"false"` (JSON `->>` parity). */
function isFalse(v: unknown): boolean {
  return v === false || v === "false";
}

/** True for a boolean `true` as well as the string `"true"` (JSON `->>` parity). */
function isTrue(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * Derive the §13 red flags from a set of onboarding answers. Order matches the
 * SQL builder so the UI preview and the stored `members.red_flags` agree exactly.
 */
export function computeRedFlags(answers: OnboardingAnswers): RedFlag[] {
  const flags: RedFlag[] = [];
  const symptoms = asStringArray(answers.activity_symptoms);
  const limitingFactors = asString(answers.limiting_factors);
  const breathingStamina = asString(answers.breathing_stamina).trim().toLowerCase();

  if (symptoms.includes("Exertional chest pain")) {
    flags.push({ id: "chest_pain", label: "Chest pain on exertion", severity: "high" });
  }
  if (symptoms.includes("Breathlessness")) {
    flags.push({ id: "breathlessness", label: "Breathlessness on exertion", severity: "high" });
  }
  if (symptoms.includes("Dizziness")) {
    flags.push({ id: "dizziness", label: "Dizziness during activity", severity: "high" });
  }
  if (isFalse(answers.cardiac_eval_12mo)) {
    flags.push({
      id: "no_cardiac_eval",
      label: "No cardiac evaluation in past 12 months",
      severity: "medium",
    });
  }
  if (isTrue(answers.joint_pain) && /fall|balance/i.test(limitingFactors)) {
    flags.push({ id: "fall_risk", label: "Fall-risk indicators", severity: "medium" });
  }
  if (breathingStamina !== "" && breathingStamina !== "no" && breathingStamina !== "none") {
    flags.push({
      id: "breathing_stamina",
      label: "Reported breathing/stamina issues",
      severity: "medium",
    });
  }

  return flags;
}

/** Any high-severity flag ⇒ red member dot + doctor-clearance-required UX (§13). */
export function hasHighFlag(flags: readonly RedFlag[]): boolean {
  return flags.some((f) => f.severity === "high");
}

/**
 * Narrow the untyped `members.red_flags` (Json) into `RedFlag[]`, dropping any
 * malformed entries. Safe to call on values read straight from the database.
 */
export function parseRedFlags(value: unknown): RedFlag[] {
  if (!Array.isArray(value)) return [];
  const out: RedFlag[] = [];
  for (const entry of value) {
    if (
      entry &&
      typeof entry === "object" &&
      "id" in entry &&
      "label" in entry &&
      "severity" in entry
    ) {
      const e = entry as Record<string, unknown>;
      if (
        typeof e.id === "string" &&
        typeof e.label === "string" &&
        (e.severity === "high" || e.severity === "medium")
      ) {
        out.push({ id: e.id, label: e.label, severity: e.severity });
      }
    }
  }
  return out;
}
