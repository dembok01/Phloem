import test from "node:test";
import assert from "node:assert/strict";
import { actionOk, actionFail, actionFromError, type ActionResult } from "./action-result";

test("actionOk carries typed data and the ok discriminant", () => {
  const r: ActionResult<{ reportId: string }> = actionOk({ reportId: "r1" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.reportId, "r1");
});

test("actionFail carries copy + null code by default", () => {
  const r = actionFail("nope");
  assert.deepEqual(r, { ok: false, error: "nope", code: null });
});

test("actionFromError maps a known code to registry copy + typed code", () => {
  const r = actionFromError({ message: "P0001: not_paused" }, "fallback");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "not_paused");
    assert.equal(r.error, "The program isn't paused.");
  }
});

test("actionFromError falls back + null code for unknown messages, overrides win", () => {
  assert.equal(actionFromError({ message: "boom" }, "fallback").error, "fallback");
  const r = actionFromError({ message: "not_allowed" }, "fallback", { not_allowed: "custom" });
  if (!r.ok) {
    assert.equal(r.error, "custom");
    assert.equal(r.code, "not_allowed");
  }
});
