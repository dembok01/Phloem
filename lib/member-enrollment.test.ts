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

test("a new caregiver returns the exact generated invite for manual sharing", async () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://dashboard.example.com/";

  try {
    const result = await enrollMember(validEnrollmentForm(), async () => ({
      data: {
        mode: "invited",
        member_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        token: "11111111-2222-3333-4444-555555555555",
      },
      error: null,
    }));

    assert.deepEqual(result, {
      ok: true,
      data: {
        outcome: "invited",
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

test("an existing caregiver account is reported for confirmation, not linked outright", async () => {
  const form = validEnrollmentForm();
  form.set("city", "Kochi");

  const result = await enrollMember(form, async () => ({
    data: {
      mode: "confirm_link",
      caregiver_name: "Alex Kumar",
      caregiver_email: "alex@example.com",
      existing_members: ["Joseph Thomas"],
    },
    error: null,
  }));

  assert.equal(result.ok, true);
  assert.equal(result.data.outcome, "confirm_link");
  assert.equal(result.data.caregiverName, "Alex Kumar");
  assert.deepEqual(
    result.data.outcome === "confirm_link" ? result.data.existingMembers : null,
    ["Joseph Thomas"],
  );
  // Everything typed comes back, so answering the question costs no retyping.
  assert.deepEqual(result.data.outcome === "confirm_link" ? result.data.fields : null, {
    full_name: "Mary Thomas",
    age: "68",
    caregiver_email: "alex@example.com",
    duration_months: "3",
    city: "Kochi",
  });
});

test("a confirmed link reports the account it joined and offers no invite", async () => {
  const form = validEnrollmentForm();
  form.set("link_existing", "true");

  const args: Record<string, unknown>[] = [];
  const result = await enrollMember(form, async (a) => {
    args.push(a as unknown as Record<string, unknown>);
    return {
      data: {
        mode: "linked",
        member_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        caregiver_id: "ffffffff-1111-2222-3333-444444444444",
        caregiver_name: "Alex Kumar",
      },
      error: null,
    };
  });

  assert.equal(args[0]!.p_link_existing, true);
  assert.deepEqual(result, {
    ok: true,
    data: {
      outcome: "linked",
      memberName: "Mary Thomas",
      caregiverEmail: "alex@example.com",
      caregiverName: "Alex Kumar",
    },
  });
});

test('link_existing="false" does not arm the link', async () => {
  // Boolean("false") is true, so a coerced flag would link on the one input
  // that exists to say "do not link".
  const form = validEnrollmentForm();
  form.set("link_existing", "false");

  const args: Record<string, unknown>[] = [];
  await enrollMember(form, async (a) => {
    args.push(a as unknown as Record<string, unknown>);
    return { data: { mode: "invited", member_id: "m", token: "t" }, error: null };
  });

  assert.equal(args[0]!.p_link_existing, false);
});

test("invalid enrollment data is rejected before member creation", async () => {
  const formData = validEnrollmentForm();
  formData.set("caregiver_email", "not-an-email");
  let rpcCalls = 0;

  const result = await enrollMember(formData, async () => {
    rpcCalls += 1;
    return { data: { mode: "invited", member_id: "m", token: "t" }, error: null };
  });

  assert.deepEqual(result, {
    ok: false,
    error: "Please check the required fields (name, age, and caregiver email).",
    code: null,
  });
  assert.equal(rpcCalls, 0);
});

test("an unreadable RPC payload never reports a copyable invite", async () => {
  const result = await enrollMember(validEnrollmentForm(), async () => ({
    data: null,
    error: null,
  }));

  assert.deepEqual(result, {
    ok: false,
    error:
      "The member may have been enrolled, but the result could not be read. Check Members before retrying.",
    code: null,
  });
});
