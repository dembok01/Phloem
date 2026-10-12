import test from "node:test";
import assert from "node:assert/strict";
import { activeProgress } from "./pipeline-progress";

const cycles = [
  { number: 1, start_date: "2026-09-01", end_date: "2026-09-30", status: "closed" },
  { number: 2, start_date: "2026-10-01", end_date: "2026-10-30", status: "active" },
  { number: 3, start_date: "2026-10-31", end_date: "2026-11-29", status: "upcoming" },
];

test("an active member: cycle, day within it, and the days left", () => {
  assert.deepEqual(activeProgress({ status: "active", end_date: "2026-11-29" }, cycles, "2026-10-14"), {
    cycle: 2,
    cycles: 3,
    day: 14,
    days: 30,
    ends: "29 Nov",
    daysLeft: 46,
    paused: false,
  });
});

test("the day stays inside the cycle, and no active cycle means nothing to show", () => {
  assert.equal(activeProgress({ status: "active", end_date: null }, cycles, "2026-11-05")?.day, 30);
  assert.equal(activeProgress({ status: "active", end_date: null }, cycles, "2026-09-20")?.day, 1);
  assert.equal(activeProgress({ status: "paused", end_date: null }, cycles.slice(0, 1), "2026-10-14"), null);
});
