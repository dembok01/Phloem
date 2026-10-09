import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFormTemplate } from "./schema";
import { requiredMessage, toggleChoice } from "./logic";
import { buildCards, FIELD_HINTS, firstNameOf, voiceOf, withListButtons } from "./onboarding-flow";
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
