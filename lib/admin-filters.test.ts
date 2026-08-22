import test from "node:test";
import assert from "node:assert/strict";
import { compareValues, matchesQuery, normalize, relativeDayLabel, sortRows } from "./admin-filters";

test("normalize strips case and accents", () => {
  assert.equal(normalize("  Menón  "), "menon");
  assert.equal(normalize("Dr. Arjun NAIR"), "dr. arjun nair");
});

test("accented and unaccented spellings find each other", () => {
  assert.equal(matchesQuery(["Lakshmi Menón"], "menon"), true);
  assert.equal(matchesQuery(["Lakshmi Menon"], "menón"), true);
});

test("every token must match, but they may land in different fields", () => {
  const row = ["Arjun Nair", "arjun@phloem.local", "doctor"];
  assert.equal(matchesQuery(row, "arjun doctor"), true);
  assert.equal(matchesQuery(row, "arjun trainer"), false);
  assert.equal(matchesQuery(row, "nair phloem"), true);
});

test("an empty or whitespace query matches everything", () => {
  assert.equal(matchesQuery(["anything"], ""), true);
  assert.equal(matchesQuery(["anything"], "   "), true);
  assert.equal(matchesQuery([null, undefined], ""), true);
});

test("null fields never throw and never match", () => {
  assert.equal(matchesQuery([null, undefined, "Kochi"], "kochi"), true);
  assert.equal(matchesQuery([null, undefined], "kochi"), false);
});

test("missing values sort last in BOTH directions", () => {
  // A member with no city is not "before Kochi" — they are absent. Flipping the
  // arrow must not march every blank row to the top.
  const rows = [{ city: "Kochi" }, { city: null }, { city: "Aluva" }];
  assert.deepEqual(
    sortRows(rows, (r) => r.city, "asc").map((r) => r.city),
    ["Aluva", "Kochi", null],
  );
  assert.deepEqual(
    sortRows(rows, (r) => r.city, "desc").map((r) => r.city),
    ["Kochi", "Aluva", null],
  );
});

test("numbers compare numerically, not lexically", () => {
  const rows = [{ age: 9 }, { age: 72 }, { age: 10 }];
  assert.deepEqual(
    sortRows(rows, (r) => r.age, "asc").map((r) => r.age),
    [9, 10, 72],
  );
  assert.equal(compareValues(9, 72, "asc") < 0, true);
});

test("sort is stable and does not mutate its input", () => {
  const rows = [
    { name: "b", i: 1 },
    { name: "a", i: 2 },
    { name: "a", i: 3 },
  ];
  const copy = [...rows];
  const out = sortRows(rows, (r) => r.name, "asc");
  assert.deepEqual(out.map((r) => r.i), [2, 3, 1]);
  assert.deepEqual(rows, copy);
});

test("relativeDayLabel reads as a distance, on IST calendar days", () => {
  const now = Date.parse("2026-08-21T04:00:00Z"); // 09:30 IST
  // 23:00 IST the same evening is still "today", not "in 0 days".
  assert.equal(relativeDayLabel("2026-08-21T17:30:00Z", now), "today");
  assert.equal(relativeDayLabel("2026-08-22T06:00:00Z", now), "tomorrow");
  assert.equal(relativeDayLabel("2026-08-24T06:00:00Z", now), "in 3 days");
  assert.equal(relativeDayLabel("2026-08-20T06:00:00Z", now), "expired yesterday");
  assert.equal(relativeDayLabel("2026-08-18T06:00:00Z", now), "expired 3 days ago");
});

test("an unparseable date degrades to an em-dash rather than NaN", () => {
  assert.equal(relativeDayLabel("not-a-date"), "—");
});
