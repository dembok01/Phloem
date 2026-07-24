import test from "node:test";
import assert from "node:assert/strict";
import { CLEARED, resolveClearance } from "./clearance";

// Rows are newest-first, matching `order by created_at desc`.
test("empty clearance on the newest review does not revoke the prior clearance (H-1)", () => {
  const rows = [
    { content: { clearance: "" } }, // unchanged doctor_review (pre-0015 builder output)
    { content: { clearance: "cleared" } }, // initial report
  ];
  assert.equal(resolveClearance(rows), "cleared");
});

test("a missing clearance key is skipped, like the SQL coalesce filter", () => {
  const rows = [{ content: {} }, { content: { clearance: "cleared_with_restrictions" } }];
  assert.equal(resolveClearance(rows), "cleared_with_restrictions");
});

test("newest non-empty clearance wins", () => {
  const rows = [
    { content: { clearance: "on_hold" } },
    { content: { clearance: "cleared" } },
  ];
  assert.equal(resolveClearance(rows), "on_hold");
  assert.equal(CLEARED.has("on_hold"), false);
});

test("no doctor reports → null (gate stays locked)", () => {
  assert.equal(resolveClearance([]), null);
});

test("non-object content is tolerated", () => {
  assert.equal(resolveClearance([{ content: null }, { content: "x" }]), null);
});
