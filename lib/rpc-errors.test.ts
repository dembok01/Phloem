import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RPC_ERROR_CODES, rpcErrorCode, rpcErrorMessage } from "./rpc-errors";

test("every raise exception code in the migrations is registered", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const codes = new Set<string>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/raise exception '([a-z_]+)[':]/g)) codes.add(m[1]);
  }
  const registered = new Set<string>(RPC_ERROR_CODES);
  const missing = [...codes].filter((c) => !registered.has(c));
  assert.deepEqual(missing, [], `codes raised in migrations but not registered: ${missing}`);
});

test("parses a code out of a real PostgREST-style message", () => {
  assert.equal(
    rpcErrorCode({ message: "awaiting_doctor_clearance" }),
    "awaiting_doctor_clearance"
  );
  assert.equal(rpcErrorCode({ message: "P0001: not_allowed" }), "not_allowed");
  assert.equal(rpcErrorCode({ message: "network timeout" }), null);
  assert.equal(rpcErrorCode(null), null);
});

test("overrides win, fallback covers unknowns", () => {
  assert.equal(
    rpcErrorMessage({ message: "not_allowed" }, "fallback", { not_allowed: "custom" }),
    "custom"
  );
  assert.equal(rpcErrorMessage({ message: "???" }, "fallback"), "fallback");
});
