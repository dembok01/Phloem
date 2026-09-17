import test from "node:test";
import assert from "node:assert/strict";
import { buildClinicalReport } from "./clinical";

const input = (answers: Record<string, unknown>) => ({ memberName: "Test", answers, cycle: null });
const headings = (c: { sections: { heading: string }[] }) => c.sections.map((s) => s.heading);

test("doctor_review carries the vitals the v2 form collects", () => {
  const c = buildClinicalReport("doctor_review", input({ review_summary: "ok", bp: "128/82" }));
  const vitals = c.sections.find((s) => s.heading === "Vitals This Month");
  assert.equal((vitals?.data as Record<string, string>)["Blood pressure"], "128/82");
});

test("doctor_review shows the new clearance only when it was updated", () => {
  const unchanged = buildClinicalReport("doctor_review", input({ review_summary: "ok", clearance_change: "unchanged" }));
  assert.ok(!headings(unchanged).includes("Exercise Clearance"));
  assert.equal(unchanged.clearance, undefined);

  const updated = buildClinicalReport(
    "doctor_review",
    input({ review_summary: "ok", clearance_change: "updated", clearance: "on_hold" }),
  );
  assert.ok(headings(updated).includes("Exercise Clearance"));
  assert.equal(updated.clearance, "on_hold");
  assert.equal(headings(updated)[0], "Doctor's Review"); // §8: assessment leads
});
