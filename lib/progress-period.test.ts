import test from "node:test";
import assert from "node:assert/strict";
import { checkPeriod, inPeriod, periodLabel, presetPeriods, todayIST } from "./progress-period";

const cycles = [
  { number: 1, start_date: "2026-08-03", end_date: "2026-09-01" },
  { number: 2, start_date: "2026-09-02", end_date: "2026-10-01" },
  { number: 3, start_date: "2026-10-02", end_date: "2026-10-31" },
  { number: 4, start_date: "2026-11-01", end_date: "2026-11-30" },
];

test("the presets are everything so far, then each cycle that has begun", () => {
  const p = presetPeriods({ enrolledOn: "2026-07-20", cycles, today: "2026-10-30" });
  assert.deepEqual(
    p.map((x) => [x.key, x.label, x.from, x.to]),
    [
      ["all", "Everything so far", "2026-07-20", "2026-10-30"],
      ["cycle-1", "Cycle 1", "2026-08-03", "2026-09-01"],
      ["cycle-2", "Cycle 2", "2026-09-02", "2026-10-01"],
      // the running cycle stops at today; cycle 4 hasn't begun
      ["cycle-3", "Cycle 3", "2026-10-02", "2026-10-30"],
    ],
  );
  assert.equal(p[0].detail, "20 Jul 2026 – 30 Oct 2026");
});

test("a member with no programme yet still gets everything so far", () => {
  const p = presetPeriods({ enrolledOn: "2026-10-28", cycles: [], today: "2026-10-30" });
  assert.deepEqual(p.map((x) => x.key), ["all"]);
});

test("a period runs forward and ends by today", () => {
  assert.equal(checkPeriod({ from: "2026-09-01", to: "2026-09-30" }, "2026-10-30"), null);
  assert.equal(checkPeriod({ from: "2026-10-30", to: "2026-10-30" }, "2026-10-30"), null);
  assert.match(checkPeriod({ from: "2026-10-01", to: "2026-09-01" }, "2026-10-30") ?? "", /start/i);
  assert.match(checkPeriod({ from: "2026-10-01", to: "2026-11-02" }, "2026-10-30") ?? "", /today/i);
  assert.match(checkPeriod({ from: "", to: "2026-10-01" }, "2026-10-30") ?? "", /dates/i);
  assert.match(checkPeriod({ from: "2026-02-30", to: "2026-03-01" }, "2026-10-30") ?? "", /dates/i);
});

test("a period covers whole IST days at both ends", () => {
  const sep = { from: "2026-09-01", to: "2026-09-30" };
  assert.equal(inPeriod("2026-09-01T00:10:00+05:30", sep), true);
  assert.equal(inPeriod("2026-09-30T23:50:00+05:30", sep), true);
  // 31 Aug 23:00 UTC is already 1 Sep in India
  assert.equal(inPeriod("2026-08-31T23:00:00Z", sep), true);
  assert.equal(inPeriod("2026-08-31T23:50:00+05:30", sep), false);
  assert.equal(inPeriod("2026-10-01T00:00:00+05:30", sep), false);
  assert.equal(inPeriod("not a date", sep), false);
});

test("a period reads as dates, one date when it is a single day", () => {
  assert.equal(periodLabel({ from: "2026-09-01", to: "2026-09-30" }), "1 Sept 2026 – 30 Sept 2026");
  assert.equal(periodLabel({ from: "2026-10-30", to: "2026-10-30" }), "30 Oct 2026");
});

test("today is the date in India", () => {
  // 20:00 UTC on 29 Oct is 01:30 on 30 Oct in India
  assert.equal(todayIST(Date.parse("2026-10-29T20:00:00Z")), "2026-10-30");
});
