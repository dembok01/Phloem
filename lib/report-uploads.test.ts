import test from "node:test";
import assert from "node:assert/strict";
import { reviewTargets, slotTargets, type SlotConsult } from "./report-uploads";

const consult = (over: Partial<SlotConsult>): SlotConsult => ({
  id: "x",
  type: "nutritionist",
  cycle_id: null,
  meeting_status: "done",
  report_status: "pending",
  report_closed_reason: null,
  report_uploaded_by: null,
  report_uploaded_at: null,
  completed_at: null,
  ...over,
});

test("slots: only reports a file can stand in for", () => {
  const cycles = new Map([["c2", 2]]);
  const ids = slotTargets(
    [
      consult({ id: "nutri-plan" }),
      consult({ id: "doctor", type: "doctor" }),
      consult({ id: "not-held", meeting_status: "scheduled" }),
      consult({ id: "diet-review-slot", cycle_id: "c2" }), // goes through diet reviews
      consult({ id: "filed", type: "trainer", report_status: "submitted" }), // filed by form
      consult({ id: "not-needed", type: "trainer", report_status: "closed", report_closed_reason: "not_needed" }),
      consult({ id: "outside", type: "trainer", report_status: "closed", report_closed_reason: "received_outside" }),
      consult({ id: "uploaded", type: "psychologist", report_status: "submitted", report_uploaded_by: "u" }),
      consult({ id: "trainer-review", type: "trainer", cycle_id: "c2" }),
    ],
    cycles,
  ).map((t) => `${t.id}${t.replaces ? " (replaces)" : ""}`);
  assert.deepEqual(ids, ["nutri-plan", "outside", "uploaded (replaces)", "trainer-review"]);
});

test("slots: a nutritionist is offered only their own reports", () => {
  const ids = slotTargets(
    [consult({ id: "n" }), consult({ id: "t", type: "trainer" })],
    new Map(),
    ["nutritionist"],
  ).map((t) => t.id);
  assert.deepEqual(ids, ["n"]);
});

test("reviews: begun cycles, newest first, dates bounded by the cycle and today", () => {
  const targets = reviewTargets(
    [
      { id: "c1", number: 1, start_date: "2026-09-01", end_date: "2026-09-30", status: "closed" },
      { id: "c2", number: 2, start_date: "2026-10-01", end_date: "2026-10-30", status: "active" },
      { id: "c3", number: 3, start_date: "2026-10-31", end_date: "2026-11-29", status: "upcoming" },
    ],
    new Map([["c2", 1]]),
    "2026-10-11",
  );
  assert.deepEqual(
    targets.map((t) => [t.id, t.start, t.end]),
    [
      ["c2", "2026-09-24", "2026-10-11"],
      ["c1", "2026-08-25", "2026-10-07"],
    ],
  );
  assert.match(targets[0].detail, /1 review so far/);
});
