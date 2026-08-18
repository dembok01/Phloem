import test from "node:test";
import assert from "node:assert/strict";
import { groupSeries, summarise, formatValue, type MeasurePoint } from "./measures";

function pt(over: Partial<MeasurePoint> & { measure_key: string; value: number; at: string }): MeasurePoint {
  return {
    label: over.measure_key,
    unit: null,
    domain: "training",
    higher_is_better: null,
    cycle_number: null,
    source: "trainer_review",
    ...over,
  };
}

test("groupSeries orders points oldest-first and keeps one entry per measure", () => {
  const series = groupSeries([
    pt({ measure_key: "sit_to_stand", value: 11, at: "2026-08-01T00:00:00Z" }),
    pt({ measure_key: "sit_to_stand", value: 8, at: "2026-06-01T00:00:00Z" }),
    pt({ measure_key: "tug_seconds", value: 14, at: "2026-06-01T00:00:00Z" }),
  ]);
  assert.equal(series.length, 2);
  const sts = series.find((s) => s.key === "sit_to_stand")!;
  assert.deepEqual(sts.points.map((p) => p.value), [8, 11]);
  assert.equal(sts.baseline, 8);
  assert.equal(sts.latest, 11);
});

test("higher_is_better: a rise is an improvement", () => {
  const [s] = groupSeries([
    pt({ measure_key: "sit_to_stand", value: 8, at: "2026-06-01T00:00:00Z", higher_is_better: true }),
    pt({ measure_key: "sit_to_stand", value: 11, at: "2026-08-01T00:00:00Z", higher_is_better: true }),
  ]);
  assert.equal(s.deltaFromBaseline, 3);
  assert.equal(s.direction, "improved");
});

test("lower_is_better: a FALL is the improvement (timed up-and-go)", () => {
  const [s] = groupSeries([
    pt({ measure_key: "tug_seconds", value: 14, at: "2026-06-01T00:00:00Z", higher_is_better: false }),
    pt({ measure_key: "tug_seconds", value: 11, at: "2026-08-01T00:00:00Z", higher_is_better: false }),
  ]);
  assert.equal(s.deltaFromBaseline, -3);
  assert.equal(s.direction, "improved", "3 seconds faster on the TUG is better, not worse");
});

test("lower_is_better: a rise is a decline", () => {
  const [s] = groupSeries([
    pt({ measure_key: "tug_seconds", value: 11, at: "2026-06-01T00:00:00Z", higher_is_better: false }),
    pt({ measure_key: "tug_seconds", value: 15, at: "2026-08-01T00:00:00Z", higher_is_better: false }),
  ]);
  assert.equal(s.direction, "declined");
});

test("neutral measures (weight) never claim a direction", () => {
  const [s] = groupSeries([
    pt({ measure_key: "weight_kg", value: 70, at: "2026-06-01T00:00:00Z", higher_is_better: null }),
    pt({ measure_key: "weight_kg", value: 74, at: "2026-08-01T00:00:00Z", higher_is_better: null }),
  ]);
  assert.equal(s.deltaFromBaseline, 4);
  assert.equal(s.direction, "neutral", "a doctor decides whether weight gain is good; the chart must not");
});

test("an unchanged value is unchanged, not an improvement", () => {
  const [s] = groupSeries([
    pt({ measure_key: "sit_to_stand", value: 9, at: "2026-06-01T00:00:00Z", higher_is_better: true }),
    pt({ measure_key: "sit_to_stand", value: 9, at: "2026-08-01T00:00:00Z", higher_is_better: true }),
  ]);
  assert.equal(s.direction, "unchanged");
});

test("a single reading has no delta and no direction", () => {
  const [s] = groupSeries([
    pt({ measure_key: "sit_to_stand", value: 9, at: "2026-06-01T00:00:00Z", higher_is_better: true }),
  ]);
  assert.equal(s.deltaFromBaseline, null);
  assert.equal(s.deltaFromPrevious, null);
  assert.equal(s.direction, "baseline");
});

test("deltaFromPrevious compares the last two readings, not the first and last", () => {
  const [s] = groupSeries([
    pt({ measure_key: "sit_to_stand", value: 8, at: "2026-06-01T00:00:00Z", higher_is_better: true }),
    pt({ measure_key: "sit_to_stand", value: 14, at: "2026-07-01T00:00:00Z", higher_is_better: true }),
    pt({ measure_key: "sit_to_stand", value: 12, at: "2026-08-01T00:00:00Z", higher_is_better: true }),
  ]);
  assert.equal(s.deltaFromBaseline, 4);
  assert.equal(s.deltaFromPrevious, -2);
  assert.equal(s.direction, "improved", "direction reads against baseline — still up 4 since intake");
  assert.equal(s.recentDirection, "declined", "…but down 2 this month, which the doctor must see");
});

test("summarise counts only measures that actually moved", () => {
  const s = summarise(
    groupSeries([
      pt({ measure_key: "sit_to_stand", value: 8, at: "2026-06-01T00:00:00Z", higher_is_better: true }),
      pt({ measure_key: "sit_to_stand", value: 11, at: "2026-08-01T00:00:00Z", higher_is_better: true }),
      pt({ measure_key: "tug_seconds", value: 11, at: "2026-06-01T00:00:00Z", higher_is_better: false }),
      pt({ measure_key: "tug_seconds", value: 15, at: "2026-08-01T00:00:00Z", higher_is_better: false }),
      pt({ measure_key: "weight_kg", value: 70, at: "2026-06-01T00:00:00Z", higher_is_better: null }),
      pt({ measure_key: "weight_kg", value: 74, at: "2026-08-01T00:00:00Z", higher_is_better: null }),
    ]),
  );
  assert.equal(s.improved, 1);
  assert.equal(s.declined, 1);
  assert.equal(s.tracked, 3);
});

test("formatValue keeps integers clean and rounds long decimals", () => {
  assert.equal(formatValue(11, "reps"), "11 reps");
  assert.equal(formatValue(11.5, "s"), "11.5 s");
  assert.equal(formatValue(11.25789, null), "11.3");
  assert.equal(formatValue(4, "/5"), "4/5", "a rating reads 4/5, never '4 /5'");
});
