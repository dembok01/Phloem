import test from "node:test";
import assert from "node:assert/strict";
import { logEvent, logError } from "./observe";

test("logEvent returns a structured record (evt/level/at + fields)", () => {
  const r = logEvent("cron.daily", { cycles_rolled: 3 });
  assert.equal(r.evt, "cron.daily");
  assert.equal(r.level, "info");
  assert.equal(r.cycles_rolled, 3);
  assert.equal(typeof r.at, "string");
});

test("logError captures an Error's message at error level", () => {
  const r = logError("cron.daily.rpc_failed", new Error("boom"), { simulated: null });
  assert.equal(r.evt, "cron.daily.rpc_failed");
  assert.equal(r.level, "error");
  assert.equal(r.error, "boom");
  assert.equal(r.simulated, null);
});

test("logError stringifies non-Error throwables", () => {
  assert.equal(logError("x", "just a string").error, "just a string");
});
