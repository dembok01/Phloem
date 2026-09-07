import test from "node:test";
import assert from "node:assert/strict";
import { enrollMember } from "./member-enrollment";

function validEnrollmentForm(): FormData {
  const formData = new FormData();
  formData.set("full_name", "Mary Thomas");
  formData.set("age", "68");
  formData.set("caregiver_email", "alex@example.com");
  formData.set("duration_months", "3");
  return formData;
}

test("successful enrollment returns the exact generated invite for manual sharing", async () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://dashboard.example.com/";

  try {
    const result = await enrollMember(validEnrollmentForm(), async () => ({
      data: "11111111-2222-3333-4444-555555555555",
      error: null,
    }));

    assert.deepEqual(result, {
      ok: true,
      data: {
        memberName: "Mary Thomas",
        caregiverEmail: "alex@example.com",
        inviteUrl:
          "https://dashboard.example.com/invite/11111111-2222-3333-4444-555555555555",
      },
    });
  } finally {
    if (previousBaseUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousBaseUrl;
  }
});

test("invalid enrollment data is rejected before member creation", async () => {
  const formData = validEnrollmentForm();
  formData.set("caregiver_email", "not-an-email");
  let rpcCalls = 0;

  const result = await enrollMember(formData, async () => {
    rpcCalls += 1;
    return { data: "unused-token", error: null };
  });

  assert.deepEqual(result, {
    ok: false,
    error: "Please check the required fields (name, age, and caregiver email).",
    code: null,
  });
  assert.equal(rpcCalls, 0);
});

test("a missing RPC token never reports a copyable invite", async () => {
  const result = await enrollMember(validEnrollmentForm(), async () => ({
    data: null,
    error: null,
  }));

  assert.deepEqual(result, {
    ok: false,
    error: "The member was enrolled, but an invite link was not returned. Check Invites before retrying.",
    code: null,
  });
});
