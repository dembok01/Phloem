import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBER_DEMOGRAPHICS,
  MEMBER_CONTACTS,
  OWN_PROFILE,
  ADMIN_PROFILE,
  AMEND_REFUSED_KEYS,
  buildPatch,
  canEdit,
  type FieldGroup,
} from "./member-fields";

// Every migration, in order: a function restated later (0057 let the coordinator
// edit) replaces the earlier whitelist, so the LAST match for a marker is the live one.
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const SQL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

/** Pull `v_allowed := array['a','b']` that follows a `-- manifest:<marker>` line. */
function sqlWhitelist(marker: string): string[] {
  const re = new RegExp(
    `-- manifest:${marker}\\b[\\s\\S]*?v_allowed := array\\[([^\\]]*)\\]`,
    "g",
  );
  const m = [...SQL.matchAll(re)].at(-1);
  assert.ok(m, `no whitelist found in the migrations for marker ${marker}`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
}

function manifestKeys(group: FieldGroup, role: Parameters<typeof canEdit>[1]): string[] {
  return group.fields.filter((f) => canEdit(f, role)).map((f) => f.key).sort();
}

test("the manifest matches the SQL whitelist for every group", () => {
  assert.deepEqual(manifestKeys(MEMBER_DEMOGRAPHICS, "admin"), sqlWhitelist("member:admin"));
  assert.deepEqual(manifestKeys(MEMBER_DEMOGRAPHICS, "caregiver"), sqlWhitelist("member:caregiver"));
  assert.deepEqual(manifestKeys(MEMBER_CONTACTS, "admin"), sqlWhitelist("contacts:admin"));
  assert.deepEqual(manifestKeys(MEMBER_CONTACTS, "caregiver"), sqlWhitelist("contacts:caregiver"));
  assert.deepEqual(manifestKeys(MEMBER_DEMOGRAPHICS, "coordinator"), sqlWhitelist("member:coordinator"));
  assert.deepEqual(manifestKeys(MEMBER_CONTACTS, "coordinator"), sqlWhitelist("contacts:coordinator"));
  assert.deepEqual(manifestKeys(OWN_PROFILE, "caregiver"), sqlWhitelist("profile:self"));
  assert.deepEqual(manifestKeys(ADMIN_PROFILE, "admin"), sqlWhitelist("profile:admin"));
});

test("a clinician may edit nothing on a member", () => {
  assert.deepEqual(manifestKeys(MEMBER_DEMOGRAPHICS, "doctor"), []);
  assert.deepEqual(manifestKeys(MEMBER_CONTACTS, "nutritionist"), []);
});

test("buildPatch keeps only fields that changed AND the role may edit", () => {
  const current = { language: "Malayalam", city: "Kochi", full_name: "Meera Nair" };
  const next = { language: "Tamil", city: "Kochi", full_name: "Meera R Nair" };
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "caregiver", next, current), {
    language: "Tamil",
  });
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "admin", next, current), {
    language: "Tamil",
    full_name: "Meera R Nair",
  });
});

test("buildPatch trims, treats blank as a cleared value, and ignores unknown keys", () => {
  const current = { city: "Kochi", occupation: "Teacher" };
  const next = { city: "  Kochi  ", occupation: "", nonsense: "x" };
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "admin", next, current), {
    occupation: "",
  });
});

test("buildPatch never clears a field the form did not send", () => {
  const current = { city: "Kochi", occupation: "Teacher" };
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "admin", { city: "Pune" }, current), { city: "Pune" });
});

test("buildPatch returns an empty object when nothing moved", () => {
  const current = { city: "Kochi" };
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "admin", { city: "Kochi" }, current), {});
});

test("the amendment form hides exactly the keys amend_onboarding refuses", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "0040_amend_onboarding_consent_guard.sql"),
    "utf8",
  );
  const block = sql.match(/if v_key = any\(array\[([\s\S]*?)\]\)/);
  assert.ok(block, "no refused-key array found in 0040");
  const refused = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...AMEND_REFUSED_KEYS].sort(), refused);
});
