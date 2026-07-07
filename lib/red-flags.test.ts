// Unit tests for the §13 red-flag engine (pure). Run: `npm run test:unit`
// (tsx executes node:test's top-level tests automatically and exits non-zero on
// failure). These assert exact parity with the DB `_red_flags()` builder.
import test from "node:test";
import assert from "node:assert/strict";
import { computeRedFlags, hasHighFlag, parseRedFlags, type RedFlag } from "./red-flags";

// The exact answers the seed uses for Meera Krishnan (post data-split) and the
// red_flags the seed asserts the DB produces — the golden parity case.
const seedAnswers = {
  joint_pain: true,
  cardiac_eval_12mo: false,
  limiting_factors: "Knee pain; afraid of losing balance on stairs",
  breathing_stamina: "Gets breathless climbing one flight of stairs",
  activity_symptoms: ["Exertional chest pain", "Easy fatigue"],
};

const seedExpected: RedFlag[] = [
  { id: "chest_pain", label: "Chest pain on exertion", severity: "high" },
  { id: "no_cardiac_eval", label: "No cardiac evaluation in past 12 months", severity: "medium" },
  { id: "fall_risk", label: "Fall-risk indicators", severity: "medium" },
  { id: "breathing_stamina", label: "Reported breathing/stamina issues", severity: "medium" },
];

test("golden: seed answers reproduce the seed's red_flags exactly (order incl.)", () => {
  assert.deepEqual(computeRedFlags(seedAnswers), seedExpected);
  assert.equal(hasHighFlag(computeRedFlags(seedAnswers)), true);
});

test("empty / benign answers ⇒ no flags", () => {
  assert.deepEqual(computeRedFlags({}), []);
  assert.deepEqual(
    computeRedFlags({
      activity_symptoms: ["None"],
      cardiac_eval_12mo: true,
      joint_pain: false,
      limiting_factors: "Nothing in particular",
      breathing_stamina: "None",
    }),
    [],
  );
  assert.equal(hasHighFlag([]), false);
});

test("each high symptom flag fires independently with correct label", () => {
  assert.deepEqual(computeRedFlags({ activity_symptoms: ["Exertional chest pain"] }), [
    { id: "chest_pain", label: "Chest pain on exertion", severity: "high" },
  ]);
  assert.deepEqual(computeRedFlags({ activity_symptoms: ["Breathlessness"] }), [
    { id: "breathlessness", label: "Breathlessness on exertion", severity: "high" },
  ]);
  assert.deepEqual(computeRedFlags({ activity_symptoms: ["Dizziness"] }), [
    { id: "dizziness", label: "Dizziness during activity", severity: "high" },
  ]);
});

test("cardiac_eval_12mo=false ⇒ medium; true/absent ⇒ none", () => {
  assert.equal(computeRedFlags({ cardiac_eval_12mo: false }).length, 1);
  assert.equal(computeRedFlags({ cardiac_eval_12mo: true }).length, 0);
  assert.equal(computeRedFlags({}).length, 0);
});

test("fall_risk needs joint_pain=true AND falls/balance mention (case-insensitive)", () => {
  assert.equal(
    computeRedFlags({ joint_pain: true, limiting_factors: "Fear of FALLS on stairs" }).some(
      (f) => f.id === "fall_risk",
    ),
    true,
  );
  assert.equal(
    computeRedFlags({ joint_pain: true, limiting_factors: "poor Balance" }).some(
      (f) => f.id === "fall_risk",
    ),
    true,
  );
  // joint_pain false ⇒ no fall_risk even if limiting mentions balance
  assert.equal(
    computeRedFlags({ joint_pain: false, limiting_factors: "balance issues" }).some(
      (f) => f.id === "fall_risk",
    ),
    false,
  );
  // joint_pain true but no falls/balance mention ⇒ no fall_risk
  assert.equal(
    computeRedFlags({ joint_pain: true, limiting_factors: "just knee pain" }).some(
      (f) => f.id === "fall_risk",
    ),
    false,
  );
});

test("breathing_stamina: 'no'/'none' (any case, trimmed) ⇒ none; otherwise ⇒ medium", () => {
  assert.equal(computeRedFlags({ breathing_stamina: "None" }).length, 0);
  assert.equal(computeRedFlags({ breathing_stamina: "  NO " }).length, 0);
  assert.equal(computeRedFlags({ breathing_stamina: "" }).length, 0);
  assert.deepEqual(computeRedFlags({ breathing_stamina: "Mild wheeze" }), [
    { id: "breathing_stamina", label: "Reported breathing/stamina issues", severity: "medium" },
  ]);
});

test("string-serialized booleans behave like real booleans (JSON ->> parity)", () => {
  assert.equal(computeRedFlags({ cardiac_eval_12mo: "false" }).length, 1);
  assert.equal(
    computeRedFlags({ joint_pain: "true", limiting_factors: "balance" }).some(
      (f) => f.id === "fall_risk",
    ),
    true,
  );
});

test("parseRedFlags narrows Json and drops malformed entries", () => {
  assert.deepEqual(parseRedFlags(seedExpected), seedExpected);
  assert.deepEqual(parseRedFlags(null), []);
  assert.deepEqual(parseRedFlags("nope"), []);
  assert.deepEqual(
    parseRedFlags([
      { id: "ok", label: "Fine", severity: "high" },
      { id: "bad", label: "No severity" },
      { severity: "medium" },
      42,
    ]),
    [{ id: "ok", label: "Fine", severity: "high" }],
  );
});
