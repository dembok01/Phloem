import test from "node:test";
import assert from "node:assert/strict";
import { LENS_ROLES, parseLens, serializeLens, viewRoleFor } from "./lens-core";
import { allowedPrefixes, roleHome } from "./permissions";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

test("round-trips both lens shapes", () => {
  assert.equal(serializeLens({ role: "doctor", userId: null }), "doctor");
  assert.equal(serializeLens({ role: "trainer", userId: UUID }), `trainer:${UUID}`);
  assert.deepEqual(parseLens("doctor"), { role: "doctor", userId: null });
  assert.deepEqual(parseLens(`trainer:${UUID}`), { role: "trainer", userId: UUID });
});

test("rejects roles the picker never offers", () => {
  // Psychologist is out of scope by design; admin/coordinator/caregiver are not
  // clinical shells at all. A hand-edited cookie must not conjure any of them.
  for (const role of ["psychologist", "admin", "coordinator", "caregiver", "member", ""]) {
    assert.equal(parseLens(role), null, `${role} must not parse`);
  }
});

test("rejects a malformed or over-long userId", () => {
  assert.equal(parseLens("doctor:"), null);
  assert.equal(parseLens("doctor:not-a-uuid"), null);
  assert.equal(parseLens("doctor:' or 1=1--"), null);
  assert.equal(parseLens(`doctor:${UUID}:extra`), null);
  assert.equal(parseLens(undefined), null);
});

test("viewRoleFor only bends for an admin", () => {
  const lens = { role: "doctor" as const, userId: null };
  assert.equal(viewRoleFor("admin", lens), "doctor");
  assert.equal(viewRoleFor("admin", null), "admin");
  // A non-admin carrying a lens cookie is still exactly themselves. getLens()
  // already returns null for them; this is the second lock on the same door.
  assert.equal(viewRoleFor("nutritionist", lens), "nutritionist");
  assert.equal(viewRoleFor("caregiver", lens), "caregiver");
  assert.equal(viewRoleFor("coordinator", lens), "coordinator");
});

test("admin is the only role with more than one shell, and never gets /portal", () => {
  assert.deepEqual(allowedPrefixes("admin"), ["/admin", "/coordinator", "/clinician"]);
  assert.equal(allowedPrefixes("admin").includes("/portal"), false);
  for (const role of ["coordinator", "doctor", "nutritionist", "trainer", "psychologist", "caregiver", "member"] as const) {
    assert.equal(allowedPrefixes(role).length, 1, `${role} must keep exactly one shell`);
  }
});

test("every role still lands inside a shell it is allowed to browse", () => {
  for (const role of ["admin", "coordinator", "doctor", "nutritionist", "trainer", "psychologist", "caregiver", "member"] as const) {
    const home = roleHome(role);
    assert.ok(
      allowedPrefixes(role).some((p) => home.startsWith(p)),
      `${role} lands on ${home}, which allowedPrefixes would redirect away from`,
    );
  }
});

test("every lens role is a real clinical shell", () => {
  for (const role of LENS_ROLES) {
    assert.deepEqual(allowedPrefixes(role), ["/clinician"]);
  }
});
