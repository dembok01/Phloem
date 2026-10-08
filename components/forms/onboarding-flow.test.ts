import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFormTemplate } from "./schema";
import { requiredMessage, toggleChoice } from "./logic";
import { FIELD_HINTS, fieldCopy, firstNameOf, voiceOf, withCopy } from "./onboarding-flow";
import type { FormField } from "./types";

const template = parseFormTemplate(
  JSON.parse(readFileSync(join(process.cwd(), "supabase/templates/onboarding.v1.json"), "utf8")),
);
const byId = new Map(template.sections.flatMap((s) => s.fields).map((f) => [f.id, f]));

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

test("the questions speak to whoever is answering", () => {
  const self = fieldCopy(voiceOf({ relationship_to_caregiver: "Self" }, "Leela Varma"));
  assert.equal(self.reason.label, "Why are you joining PHLOEM? What matters most?");
  assert.equal(self.painkillers_needed.label, "Do you need painkillers for it? Which ones?");
  assert.equal(self.food_frequency.label, "How often do you eat…");
  assert.equal(self.goals.label, "What are your goals?");

  const named = fieldCopy(voiceOf({ relationship_to_caregiver: "Mother" }, "Leela Varma"));
  assert.equal(named.reason.label, "Why is Leela joining PHLOEM? What matters most?");
  assert.equal(named.painkillers_needed.label, "Does Leela need painkillers for it? Which ones?");
  assert.equal(named.food_frequency.label, "How often does Leela eat…");
  assert.equal(named.goals.label, "What are Leela's goals?");

  const unnamed = fieldCopy(voiceOf({}, null));
  assert.equal(unnamed.reason.label, "Why are they joining PHLOEM? What matters most?");
  assert.equal(unnamed.painkillers_needed.label, "Do they need painkillers for it? Which ones?");
  assert.equal(unnamed.food_frequency.label, "How often do they eat…");

  assert.equal(firstNameOf("K. V. Gopalan"), "K. V. Gopalan");
});

test("every re-voiced field and None shortcut exists in the template", () => {
  for (const id of Object.keys(fieldCopy({ self: false, name: null }))) {
    assert.ok(byId.has(id), `fieldCopy names unknown field ${id}`);
  }
  for (const [id, hint] of Object.entries(FIELD_HINTS)) {
    assert.ok(byId.has(id), `FIELD_HINTS names unknown field ${id}`);
    if (hint.none) assert.equal(byId.get(id)?.type, "textarea", `${id}: None shortcut needs a textarea`);
  }
  // Copy changes words only: ids, types and required rules pass through.
  const [before] = template.sections[1].fields;
  const [after] = withCopy([before], { [before.id]: { label: "changed" } });
  assert.deepEqual({ ...after, label: before.label }, before);
});
