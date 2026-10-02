import test from "node:test";
import assert from "node:assert/strict";
import { foodFrequencyKv } from "./onboarding-summary";

test("food frequency is one row, each food beside its answer, in the form's order", () => {
  // Keys arrive in jsonb order (by length), not the order the family saw them.
  const kv = foodFrequencyKv({
    Dairy: "Daily",
    Fruits: "Few times a week",
    Sweets: "Few times a week",
    Protein: "Rarely",
    Vegetables: "",
  });
  assert.deepEqual(Object.keys(kv), ["How often they eat"]);
  assert.equal(
    kv["How often they eat"],
    "Fruits — Few times a week\nDairy — Daily\nProtein — Rarely\nSweets — Few times a week",
    "unanswered foods are left out; the rest follow the form",
  );
});

test("no grid answer reads as a dash, not a missing row", () => {
  assert.deepEqual(foodFrequencyKv({}), { "How often they eat": "—" });
  assert.deepEqual(foodFrequencyKv(undefined), {});
});
