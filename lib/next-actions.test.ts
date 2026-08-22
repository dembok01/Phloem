import test from "node:test";
import assert from "node:assert/strict";
import { nextActions, type NextActionsInput } from "./next-actions";

// 2026-08-22, 09:30 IST
const NOW = Date.parse("2026-08-22T04:00:00Z");
const ist = (day: string, hhmm = "10:00") => `${day}T${hhmm}:00+05:30`;

function input(over: Partial<NextActionsInput> = {}): NextActionsInput {
  return { members: [], consultations: [], renewals: [], suspended: [], now: NOW, ...over };
}

const member = (id: string, status: string, full_name = "Meera Nair") =>
  ({ id, full_name, status }) as NextActionsInput["members"][number];

const consult = (over: Partial<NextActionsInput["consultations"][number]> = {}) =>
  ({
    id: "c1",
    member_id: "m1",
    type: "doctor",
    meeting_status: "to_schedule",
    report_status: "pending",
    scheduled_at: null,
    completed_at: null,
    cycle_id: null,
    cycleNumber: null,
    ...over,
  }) as NextActionsInput["consultations"][number];

test("member status drives the coordinator's three lifecycle actions", () => {
  const out = nextActions(
    input({
      members: [
        member("m1", "onboarded", "Meera"),
        member("m2", "ready_to_start", "Rajan"),
        member("m3", "renewal_due", "Asha"),
      ],
    }),
  );
  assert.deepEqual(
    out.map((a) => a.kind),
    ["assign", "start", "renewal"],
  );
  assert.equal(out.every((a) => a.owner === "coordinator"), true);
  assert.equal(out[0].subject, "Meera");
});

test("a status with nothing to do produces no action", () => {
  const out = nextActions(input({ members: [member("m1", "onboarding")] }));
  assert.deepEqual(out, []);
});

test("initial consultations read as consultations", () => {
  const out = nextActions(
    input({ members: [member("m1", "assigned")], consultations: [consult()] }),
  );
  assert.equal(out[0].verb, "Schedule the doctor consultation");
});

test("cycle consultations read as that cycle's review — the gap this fixes", () => {
  // Before the engine, the queue filtered to `cycle_id is null`, so once a
  // programme started its monthly reviews produced no task at all.
  const out = nextActions(
    input({
      members: [member("m1", "active")],
      consultations: [consult({ cycle_id: "cy2", cycleNumber: 2, type: "nutritionist" })],
    }),
  );
  assert.equal(out[0].verb, "Schedule the month-2 nutritionist review");
});

test("a scheduled meeting buckets by when it is", () => {
  const base = { members: [member("m1", "active")] };
  const today = nextActions(
    input({ ...base, consultations: [consult({ meeting_status: "scheduled", scheduled_at: ist("2026-08-22", "15:00") })] }),
  );
  assert.equal(today[0].kind, "meet");
  assert.equal(today[0].bucket, "today");
  // The row must still carry WHEN — a coordinator needs the time, not just the
  // fact that something is today.
  assert.equal(today[0].at, ist("2026-08-22", "15:00"));

  const later = nextActions(
    input({ ...base, consultations: [consult({ meeting_status: "scheduled", scheduled_at: ist("2026-08-25") })] }),
  );
  assert.equal(later[0].bucket, "week");

  const past = nextActions(
    input({ ...base, consultations: [consult({ meeting_status: "scheduled", scheduled_at: ist("2026-08-20") })] }),
  );
  assert.equal(past[0].kind, "markdone");
  assert.equal(past[0].bucket, "overdue");
});

test("a done meeting with no report becomes a chase", () => {
  const out = nextActions(
    input({
      members: [member("m1", "active")],
      consultations: [
        consult({ meeting_status: "done", report_status: "pending", completed_at: ist("2026-08-21") }),
      ],
    }),
  );
  assert.equal(out[0].kind, "report");
  assert.equal(out[0].owner, "coordinator");
});

test("a done meeting WITH its report is finished, and says nothing", () => {
  const out = nextActions(
    input({
      members: [member("m1", "active")],
      consultations: [consult({ meeting_status: "done", report_status: "submitted" })],
    }),
  );
  assert.deepEqual(out, []);
});

test("admin gets the renewal only once the family has accepted", () => {
  const accepted = nextActions(
    input({
      members: [member("m1", "renewal_due", "Meera")],
      renewals: [{ member_id: "m1", status: "accepted", decided_at: ist("2026-08-12") }],
    }),
  );
  const adminRows = accepted.filter((a) => a.owner === "admin");
  assert.equal(adminRows.length, 1);
  assert.equal(adminRows[0].kind, "renewal_complete");

  const pending = nextActions(
    input({
      members: [member("m1", "renewal_due")],
      renewals: [{ member_id: "m1", status: "proposed", decided_at: null }],
    }),
  );
  assert.equal(pending.filter((a) => a.owner === "admin").length, 0);
});

test("a suspended clinician is only an admin problem while members are stranded", () => {
  const stranded = nextActions(
    input({ suspended: [{ id: "u1", full_name: "Dr. Arjun Nair", role: "doctor", activeMembers: 3 }] }),
  );
  assert.equal(stranded[0].kind, "clinician_suspended");
  assert.match(stranded[0].why, /3/);

  const harmless = nextActions(
    input({ suspended: [{ id: "u1", full_name: "Dr. Arjun Nair", role: "doctor", activeMembers: 0 }] }),
  );
  assert.deepEqual(harmless, []);
});

test("a deactivated member is an admin decision, not urgent", () => {
  const out = nextActions(input({ members: [member("m1", "inactive", "Rajan")] }));
  assert.equal(out[0].kind, "member_inactive");
  assert.equal(out[0].owner, "admin");
  assert.equal(out[0].bucket, "week");
});

test("coordinator work that has rotted escalates to admin WITHOUT leaving the coordinator", () => {
  // 9 days past the scheduled time: still the coordinator's row, plus an admin
  // escalation. Escalating must not silently move the work off their desk.
  const out = nextActions(
    input({
      members: [member("m1", "active", "Meera")],
      consultations: [consult({ meeting_status: "scheduled", scheduled_at: ist("2026-08-13") })],
    }),
  );
  assert.equal(out.filter((a) => a.owner === "coordinator" && a.kind === "markdone").length, 1);
  const stalled = out.filter((a) => a.kind === "stalled");
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].owner, "admin");
  assert.match(stalled[0].why, /9 days/);
});

test("work only two days late does not escalate", () => {
  const out = nextActions(
    input({
      members: [member("m1", "active")],
      consultations: [consult({ meeting_status: "scheduled", scheduled_at: ist("2026-08-20") })],
    }),
  );
  assert.equal(out.filter((a) => a.kind === "stalled").length, 0);
});

test("EVERY action carries a why — the tooltips are generated from these", () => {
  const out = nextActions(
    input({
      members: [
        member("m1", "onboarded"),
        member("m2", "ready_to_start"),
        member("m3", "renewal_due"),
        member("m4", "inactive"),
      ],
      consultations: [
        consult({ member_id: "m1" }),
        consult({ id: "c2", member_id: "m1", meeting_status: "done", report_status: "pending" }),
      ],
      renewals: [{ member_id: "m3", status: "accepted", decided_at: ist("2026-08-12") }],
      suspended: [{ id: "u1", full_name: "Dr. X", role: "doctor", activeMembers: 1 }],
    }),
  );
  assert.ok(out.length >= 7);
  for (const a of out) {
    assert.ok(a.why.trim().length > 0, `${a.kind} has no why`);
    assert.ok(a.verb.trim().length > 0, `${a.kind} has no verb`);
    assert.ok(a.href.startsWith("/"), `${a.kind} has no href`);
  }
});

test("overdue sorts before today, today before week", () => {
  const out = nextActions(
    input({
      members: [member("m1", "onboarded")],
      consultations: [
        consult({ id: "c1", meeting_status: "scheduled", scheduled_at: ist("2026-08-25") }),
        consult({ id: "c2", meeting_status: "scheduled", scheduled_at: ist("2026-08-20") }),
      ],
    }),
  );
  const buckets = out.filter((a) => a.owner === "coordinator").map((a) => a.bucket);
  assert.deepEqual(buckets, ["overdue", "today", "week"]);
});
