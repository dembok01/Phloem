import test from "node:test";
import assert from "node:assert/strict";
import { deleteMember } from "./member-deletion";

const MEMBER = "68d67032-29f1-4330-9dd1-88ddab5a2770";

function validDeletionForm(): FormData {
  const formData = new FormData();
  formData.set("member_id", MEMBER);
  formData.set("confirm_name", "Haseena Haja");
  return formData;
}

const snapshot = {
  full_name: "Haseena Haja",
  status: "invited",
  deleted: { assignments: 3, consultations: 3, packages: 1, member_contacts: 1 },
};

test("a confirmed deletion reports what the cascade destroyed", async () => {
  const result = await deleteMember(validDeletionForm(), async (args) => {
    assert.deepEqual(args, { p_member: MEMBER, p_confirm_name: "Haseena Haja" });
    return { data: snapshot, error: null };
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      memberName: "Haseena Haja",
      status: "invited",
      deleted: [
        { table: "assignments", count: 3 },
        { table: "consultations", count: 3 },
        { table: "member_contacts", count: 1 },
        { table: "packages", count: 1 },
      ],
    },
  });
});

test("rows the cascade did not touch are left out of the summary", async () => {
  const result = await deleteMember(validDeletionForm(), async () => ({
    data: { full_name: "Haseena Haja", status: "invited", deleted: { reports: 0, packages: 1 } },
    error: null,
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.data.deleted, [{ table: "packages", count: 1 }]);
});

test("a malformed member id never reaches the database", async () => {
  const formData = validDeletionForm();
  formData.set("member_id", "not-a-uuid");
  let rpcCalls = 0;

  const result = await deleteMember(formData, async () => {
    rpcCalls += 1;
    return { data: snapshot, error: null };
  });

  assert.deepEqual(result, {
    ok: false,
    error: "Invalid request.",
    code: null,
  });
  assert.equal(rpcCalls, 0);
});

test("an empty confirmation never reaches the database", async () => {
  const formData = validDeletionForm();
  formData.set("confirm_name", "   ");
  let rpcCalls = 0;

  const result = await deleteMember(formData, async () => {
    rpcCalls += 1;
    return { data: snapshot, error: null };
  });

  assert.equal(result.ok, false);
  assert.equal(rpcCalls, 0);
});

test("a mistyped name comes back as its own code, not a generic failure", async () => {
  const result = await deleteMember(validDeletionForm(), async () => ({
    data: null,
    error: { message: 'P0001: name_mismatch' },
  }));

  assert.deepEqual(result, {
    ok: false,
    error:
      "The name you typed doesn't match this member. Deletion is cancelled — check you are on the right profile.",
    code: "name_mismatch",
  });
});

test("a non-admin caller is refused with the registry's permission copy", async () => {
  const result = await deleteMember(validDeletionForm(), async () => ({
    data: null,
    error: { message: "not_allowed" },
  }));

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "not_allowed");
});

test("a successful delete that returns no snapshot is still a success", async () => {
  const result = await deleteMember(validDeletionForm(), async () => ({
    data: null,
    error: null,
  }));

  assert.deepEqual(result, {
    ok: true,
    data: { memberName: "Haseena Haja", status: null, deleted: [] },
  });
});
