import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFormTemplate } from "./schema";
import { requiredMessage, toggleChoice } from "./logic";
import { buildCards, FIELD_HINTS, firstNameOf, voiceOf, withListButtons } from "./onboarding-flow";
import type { FormField } from "./types";

type RawTemplate = { sections: { id: string; title: string; fields: Record<string, unknown>[] }[] };
const raw = (v: number): RawTemplate =>
  JSON.parse(readFileSync(join(process.cwd(), `supabase/templates/onboarding.v${v}.json`), "utf8"));
const template = parseFormTemplate(raw(2));
const byId = new Map(template.sections.flatMap((s) => s.fields).map((f) => [f.id, f]));

// The client asked for this section (items 3–6, 2026-10-21); labels as the owner approved.
const SAFETY_LABELS: Record<string, string> = {
  local_contact_name: "Name of a contact person who lives nearby",
  local_contact_relation: "Their relation to the member",
  local_contact_phone: "Their phone number",
  local_contact_eta: "How quickly can they reach the house?",
  hospital_name: "Nearest hospital",
  hospital_phone: "Hospital phone number",
  ambulance_phone: "Ambulance number",
  private_ambulance_phone: "Private ambulance number",
  someone_home: "Is anyone else usually at home during session time?",
  bp_or_glucometer: "Is there a BP machine or glucometer at home?",
  emergency_consent:
    "I agree that PHLOEM's care team may contact the people above in an emergency, and that the member's trainer and doctor may see these details and the home address for that purpose.",
};

test("None is exclusive in a multiselect", () => {
  assert.deepEqual(toggleChoice(["Breathlessness", "Dizziness"], "None"), ["None"]);
  assert.deepEqual(toggleChoice(["None"], "Dizziness"), ["Dizziness"]);
  assert.deepEqual(toggleChoice(["none"], "renal"), ["renal"]); // doctor_initial's lower-case value
  assert.deepEqual(toggleChoice(["Dizziness"], "Breathlessness"), ["Dizziness", "Breathlessness"]);
  assert.deepEqual(toggleChoice(["None"], "None"), []);
});

test("required messages say how to fix the answer", () => {
  const f = (type: FormField["type"], extra: Partial<FormField> = {}): FormField => ({
    id: "x",
    label: "x",
    type,
    ...extra,
  });
  assert.equal(requiredMessage(f("boolean")), "Choose Yes or No.");
  assert.equal(requiredMessage(f("multiselect")), "Choose at least one.");
  assert.equal(requiredMessage(f("repeat_group", { addLabel: "Add a medicine" })), "Add at least one medicine.");
  assert.equal(requiredMessage(f("repeat_group")), "Add at least one.");
  assert.equal(requiredMessage(f("textarea")), "Type an answer.");
});

test("the configured questions are shown exactly as written", () => {
  // Client requirement: no question is re-worded or added. Only the two list
  // buttons get their own words.
  const all = template.sections.flatMap((sec) => sec.fields);
  const shown = withListButtons(all);
  assert.equal(shown.length, all.length);
  shown.forEach((f, i) => {
    assert.deepEqual({ ...f, addLabel: null }, { ...all[i], addLabel: null }, `${f.id} changed`);
  });
  assert.deepEqual(
    shown.filter((f, i) => f.addLabel !== all[i].addLabel).map((f) => f.id),
    ["conditions", "medications"],
  );

  // Who is answering only drives the wizard's own headings.
  assert.equal(voiceOf({ relationship_to_caregiver: "Self" }, "Leela Varma").self, true);
  assert.equal(voiceOf({ relationship_to_caregiver: "Mother" }, "Leela Varma").name, "Leela");
  assert.equal(firstNameOf("K. V. Gopalan"), "K. V. Gopalan");
});

test("every None shortcut sits on a free-text question in the template", () => {
  for (const [id, hint] of Object.entries(FIELD_HINTS)) {
    assert.ok(byId.has(id), `FIELD_HINTS names unknown field ${id}`);
    if (hint.none) assert.equal(byId.get(id)?.type, "textarea", `${id}: None shortcut needs a textarea`);
  }
});

test("every question is on exactly one card, and each chapter after the first opens with a note", () => {
  const cards = buildCards(template);
  const ids = cards.flatMap((c) => c.fields.map((f) => f.id));
  assert.deepEqual([...ids].sort(), [...byId.keys()].sort());
  assert.ok(cards.every((c) => c.fields.length > 0), "no card without questions");
  const firsts = cards.filter((c, i) => i === 0 || cards[i - 1].sectionIndex !== c.sectionIndex);
  assert.equal(firsts.length, template.sections.length);
  assert.deepEqual(
    cards.filter((c) => c.opener).map((c) => c.id),
    firsts.slice(1).map((c) => c.id),
  );
});

test("v2 keeps every v1 question unchanged except the consent notice", () => {
  const v1 = raw(1);
  const v2 = raw(2);
  v1.sections.forEach((sec, i) => {
    assert.equal(v2.sections[i].id, sec.id);
    assert.equal(v2.sections[i].title, sec.title);
    assert.deepEqual(
      v2.sections[i].fields.map((f) => f.id),
      sec.fields.map((f) => f.id),
    );
    sec.fields.forEach((f, j) => {
      if (f.id !== "consent_info") assert.deepEqual(v2.sections[i].fields[j], f, `${String(f.id)} changed`);
    });
  });
  const info = (t: RawTemplate) => t.sections[0].fields.find((f) => f.id === "consent_info") as { text: string };
  assert.equal(
    info(v2).text,
    info(v1).text.replace(
      "Your contact details are never shared with clinicians.",
      "Your contact details are never shared with clinicians, except the Emergency & Safety details, which the trainer and doctor can see so they can act in an emergency.",
    ),
  );
  assert.notEqual(info(v2).text, info(v1).text);
});

test("v2 adds exactly the Emergency & Safety section", () => {
  assert.equal(template.sections.length, 6);
  const s6 = template.sections[5];
  assert.equal(s6.id, "s6");
  assert.equal(s6.title, "Emergency & Safety");
  assert.deepEqual(s6.fields.map((f) => f.id), Object.keys(SAFETY_LABELS));
  for (const f of s6.fields) assert.equal(f.label, SAFETY_LABELS[f.id], `${f.id} label`);
  assert.deepEqual(s6.fields.filter((f) => !f.required).map((f) => f.id), ["private_ambulance_phone"]);
  assert.deepEqual(byId.get("local_contact_eta")?.options, [
    { value: "under_10", label: "Under 10 minutes" },
    { value: "10_30", label: "10–30 minutes" },
    { value: "over_30", label: "Over 30 minutes" },
  ]);
  assert.deepEqual(
    ["someone_home", "bp_or_glucometer", "emergency_consent"].map((id) => byId.get(id)?.type),
    ["boolean", "boolean", "boolean"],
  );
});

test("the safety chapter comes last, on four cards", () => {
  const cards = buildCards(template).filter((c) => c.sectionId === "s6");
  assert.deepEqual(
    cards.map((c) => c.title),
    ["Someone nearby", "Hospital & ambulance", "At home during sessions", "Your consent"],
  );
  assert.deepEqual(cards[0].opener, {
    title: "One last thing — safety.",
    lead: "Who to call if something happens during a session.",
  });
  assert.equal(buildCards(template).at(-1)?.sectionId, "s6");
});
