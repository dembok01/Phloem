import test from "node:test";
import assert from "node:assert/strict";
import { buildMemberContext, assertPhiFree, PHI_STRIP_KEYS } from "./context";

const member = { full_name: "Meera", age: 72, gender: "female", city: "Kochi", language: "Malayalam" };

test("buildMemberContext strips every §4 contact identifier from onboarding", () => {
  const ctx = buildMemberContext({
    member,
    onboarding: {
      diet_pref: "vegetarian",
      contact_number: "+919900000000",
      pin_code: "682001",
      emergency_contact_name: "Anita",
      emergency_contact_phone: "+918800000000",
      email: "x@y.z",
    },
    reports: [],
  });
  const blob = JSON.stringify(ctx);
  for (const k of PHI_STRIP_KEYS) assert.ok(!blob.includes(`"${k}"`), `${k} must be stripped`);
  assert.equal((ctx.onboarding as Record<string, unknown>).diet_pref, "vegetarian");
});

test("stripping is recursive across nested objects", () => {
  const ctx = buildMemberContext({
    member,
    onboarding: { section: { phone: "x", activity_level: "low" } },
    reports: [],
  });
  assert.ok(!JSON.stringify(ctx).includes('"phone"'));
  assert.equal((ctx.onboarding as { section: Record<string, unknown> }).section.activity_level, "low");
});

test("assertPhiFree throws when a contact key survives", () => {
  assert.throws(() => assertPhiFree({ member, onboarding: { email: "a@b.c" }, reports: [] }), /PHI keys/);
});

test("non-object onboarding becomes null (never leaks)", () => {
  const ctx = buildMemberContext({ member, onboarding: "unexpected", reports: [] });
  assert.equal(ctx.onboarding, null);
});
