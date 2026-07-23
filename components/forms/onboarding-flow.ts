// Onboarding flow map — the *presentation* layer that turns the §7 onboarding
// template into a guided series of small cards. This file deliberately holds NO
// question content, required rules, or clinical logic: it only decides how the
// existing template fields are grouped into bite-sized cards, the warm copy that
// wraps them, and soft UI hints (units / steppers). The template
// (`onboarding.v1.json`) stays the single source of truth for the questions
// themselves, so nothing here touches red-flags, reports, or role-scoped reads.
import type { FieldHint, FormField, FormSection, FormTemplateSchema } from "./types";

export type { FieldHint } from "./types";

export type CardKind = "fields" | "review" | "interlude";

/** A single screen in the guided flow. */
export type Card = {
  id: string;
  kind: CardKind;
  sectionId: string;
  sectionTitle: string;
  /** 0-based chapter (section) index. */
  sectionIndex: number;
  /** 1-based position among the section's answerable cards (interludes excluded). */
  indexWithinSection: number;
  /** Count of answerable cards in the section (interludes excluded). */
  cardsInSection: number;
  title?: string;
  lead?: string;
  /** Resolved fields to render (empty for interludes). */
  fields: FormField[];
};

type CardSpec = {
  kind: "fields" | "review";
  title?: string;
  lead?: string;
  fieldIds: string[];
};

type ChapterSpec = {
  sectionId: string;
  /** Shown on the interlude that precedes this chapter (omit for the first). */
  interlude?: { title: string; lead: string };
  cards: CardSpec[];
};

// Soft UI hints (units + stepper affordances). Keys are template field ids.
export const FIELD_HINTS: Record<string, FieldHint> = {
  age: { unit: "yrs", stepper: true, min: 0, max: 120 },
  weight_kg: { unit: "kg", stepper: true, min: 20, max: 250 },
  height_cm: { unit: "cm", stepper: true, min: 80, max: 220 },
  sitting_hours: { unit: "hrs", stepper: true, min: 0, max: 24 },
  activity_minutes: { unit: "min", stepper: true, min: 0, max: 600, step: 5 },
  sleep_hours: { unit: "hrs", stepper: true, min: 0, max: 16, step: 0.5 },
  water_liters: { unit: "L", stepper: true, min: 0, max: 10, step: 0.5 },
  protein_grams: { unit: "g", stepper: true, min: 0, max: 400, step: 5 },
};

// The authored grouping. Order matches the template's sections. Each chapter's
// cards reference field ids; any field the template has but a chapter forgets is
// appended to a trailing card automatically (see `buildCards`), so a future
// template addition can never silently disappear.
const FLOW: ChapterSpec[] = [
  {
    sectionId: "s1",
    cards: [
      {
        kind: "review",
        title: "Let's confirm the basics",
        lead: "We've filled these in from your signup. Just check they're right — tap Edit to change anything.",
        fieldIds: [
          "full_name",
          "age",
          "gender",
          "relationship_to_caregiver",
          "occupation",
          "city",
          "country",
          "language",
          "contact_number",
          "pin_code",
          "emergency_contact_name",
          "emergency_contact_phone",
          "scheduling_contact",
        ],
      },
      { kind: "fields", title: "A couple of measurements", fieldIds: ["weight_kg", "height_cm"] },
      { kind: "fields", title: "One quick consent", fieldIds: ["consent_info", "consent"] },
    ],
  },
  {
    sectionId: "s2",
    interlude: {
      title: "That's the introductions done",
      lead: "Next, a few health details the care team reads before they meet you. Take your time — everything saves as you go.",
    },
    cards: [
      {
        kind: "fields",
        title: "Any ongoing conditions?",
        lead: "List each one and roughly how long. Add as many as you need.",
        fieldIds: ["conditions"],
      },
      {
        kind: "fields",
        title: "Regular medications",
        lead: "Medicine name, dose, and how often. Add each one.",
        fieldIds: ["medications"],
      },
      {
        kind: "fields",
        title: "Joints & past injuries",
        fieldIds: ["joint_pain", "surgeries_injuries"],
      },
      {
        kind: "fields",
        title: "Heart, vision & breathing",
        fieldIds: ["cardiac_eval_12mo", "vision_blurring", "breathing_stamina"],
      },
      {
        kind: "fields",
        title: "A bit more history",
        lead: "Most of these are optional — share what you know.",
        fieldIds: [
          "seeing_doctor_currently",
          "alt_medicine",
          "hospitalizations",
          "allergies",
          "food_allergies",
          "family_history",
        ],
      },
    ],
  },
  {
    sectionId: "s3",
    interlude: {
      title: "Thank you — that's the medical history",
      lead: "Now a little about daily life and movement. About two minutes.",
    },
    cards: [
      {
        kind: "fields",
        title: "Daily movement",
        fieldIds: ["activity_level", "sitting_hours", "activity_minutes", "current_activities"],
      },
      {
        kind: "fields",
        title: "What gets in the way",
        fieldIds: ["limiting_factors", "activity_symptoms"],
      },
      { kind: "fields", title: "Habits & sleep", fieldIds: ["smoking", "alcohol", "sleep_hours"] },
    ],
  },
  {
    sectionId: "s4",
    interlude: {
      title: "Almost there",
      lead: "A quick look at eating and hydration.",
    },
    cards: [
      { kind: "fields", title: "Eating routine", fieldIds: ["meal_routine", "diet_pref"] },
      {
        kind: "fields",
        title: "Food & hydration",
        fieldIds: ["food_frequency", "water_liters", "protein_grams"],
      },
    ],
  },
  {
    sectionId: "s5",
    interlude: {
      title: "Last chapter",
      lead: "What you're hoping for — then you're done.",
    },
    cards: [
      { kind: "fields", title: "What matters most", fieldIds: ["goals", "focus_area", "reason"] },
      {
        kind: "fields",
        title: "Sessions & anything else",
        fieldIds: ["trainer_before", "preferred_slots", "other_info"],
      },
    ],
  },
];

function devWarn(message: string): void {
  if (process.env.NODE_ENV !== "production") console.warn(`[onboarding-flow] ${message}`);
}

/**
 * Resolve a card spec's field ids to real fields from its section, pulling in any
 * same-section `showIf` dependents so a trigger and its follow-up always share a
 * card. Fields already placed on an earlier card are skipped (never duplicated).
 */
function resolveFields(section: FormSection, fieldIds: string[], placed: Set<string>): FormField[] {
  const byId = new Map(section.fields.map((f) => [f.id, f]));
  const ids: string[] = [];
  const take = (id: string) => {
    if (!byId.has(id)) {
      devWarn(`card in section "${section.id}" references unknown field "${id}"`);
      return;
    }
    if (placed.has(id) || ids.includes(id)) return;
    ids.push(id);
    // Bring along any field revealed by this one.
    for (const f of section.fields) {
      if (f.showIf?.field === id) take(f.id);
    }
  };
  for (const id of fieldIds) take(id);
  ids.forEach((id) => placed.add(id));
  return ids.map((id) => byId.get(id) as FormField);
}

/**
 * Flatten the §7 template into an ordered list of guided cards using FLOW.
 * Guarantees every template field appears on exactly one card (unplaced fields
 * land on a trailing "more details" card of their section).
 */
export function buildCards(template: FormTemplateSchema): Card[] {
  const sectionsById = new Map(template.sections.map((s) => [s.id, s]));
  const cards: Card[] = [];

  FLOW.forEach((chapter, chapterIdx) => {
    const section = sectionsById.get(chapter.sectionId);
    if (!section) {
      devWarn(`FLOW references unknown section "${chapter.sectionId}"`);
      return;
    }
    const sectionIndex = template.sections.findIndex((s) => s.id === section.id);

    if (chapter.interlude && chapterIdx > 0) {
      cards.push({
        id: `interlude-${section.id}`,
        kind: "interlude",
        sectionId: section.id,
        sectionTitle: section.title,
        sectionIndex,
        indexWithinSection: 0,
        cardsInSection: 0,
        title: chapter.interlude.title,
        lead: chapter.interlude.lead,
        fields: [],
      });
    }

    const placed = new Set<string>();
    const sectionCards: Card[] = [];
    for (const spec of chapter.cards) {
      sectionCards.push({
        id: `${section.id}-${spec.fieldIds[0] ?? "card"}`,
        kind: spec.kind,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionIndex,
        indexWithinSection: 0, // filled in below
        cardsInSection: 0, // filled in below
        title: spec.title,
        lead: spec.lead,
        fields: resolveFields(section, spec.fieldIds, placed),
      });
    }

    // Safety net: any field FLOW forgot gets its own trailing card.
    const leftover = section.fields.filter((f) => !placed.has(f.id));
    if (leftover.length > 0) {
      devWarn(
        `section "${section.id}" has ${leftover.length} unplaced field(s): ${leftover
          .map((f) => f.id)
          .join(", ")} — appended to a trailing card`,
      );
      leftover.forEach((f) => placed.add(f.id));
      sectionCards.push({
        id: `${section.id}-more`,
        kind: "fields",
        sectionId: section.id,
        sectionTitle: section.title,
        sectionIndex,
        indexWithinSection: 0,
        cardsInSection: 0,
        title: "A few more details",
        fields: leftover,
      });
    }

    // Number the answerable cards within the section.
    sectionCards.forEach((card, i) => {
      card.indexWithinSection = i + 1;
      card.cardsInSection = sectionCards.length;
    });
    cards.push(...sectionCards);
  });

  return cards;
}

/** Index of the first answerable card that contains the given field, or -1. */
export function cardIndexOfField(cards: Card[], fieldId: string): number {
  return cards.findIndex((c) => c.kind !== "interlude" && c.fields.some((f) => f.id === fieldId));
}

const SECONDS_BY_KIND: Record<CardKind, number> = { interlude: 6, review: 45, fields: 18 };

/** Rough "time left" estimate from `fromIndex` inclusive, in seconds. */
export function estimateSecondsRemaining(cards: Card[], fromIndex: number): number {
  let total = 0;
  for (let i = Math.max(fromIndex, 0); i < cards.length; i++) {
    const card = cards[i];
    total += SECONDS_BY_KIND[card.kind];
    if (card.kind === "fields") total += card.fields.length * 10;
  }
  return total;
}

/** Human "~N min left" label; "less than a minute" near the end. */
export function timeLeftLabel(cards: Card[], fromIndex: number): string {
  const sec = estimateSecondsRemaining(cards, fromIndex);
  if (sec <= 45) return "Less than a minute left";
  return `About ${Math.max(1, Math.round(sec / 60))} min left`;
}
