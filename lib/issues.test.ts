import test from "node:test";
import assert from "node:assert/strict";
import { computeIssues, worstSeverity, type IssueInput } from "./issues";

const NONE: IssueInput = {
  flags: [],
  clearance: "cleared",
  adverseEvent: false,
  reportOverdueHours: null,
  decliningMeasures: [],
  engagement: "engaged",
  daysUntilProgrammeEnds: null,
  unreadMessages: 0,
};

test("a member with nothing wrong raises nothing", () => {
  assert.deepEqual(computeIssues(NONE), []);
});

test("a high red flag with no clearance decision is the top issue", () => {
  const issues = computeIssues({
    ...NONE,
    flags: [{ severity: "high", label: "Chest pain during activity" }],
    clearance: null,
  });
  assert.equal(issues[0].kind, "clearance");
  assert.equal(issues[0].severity, "danger");
});

test("a red flag that HAS a clearance decision is not an outstanding issue", () => {
  const issues = computeIssues({
    ...NONE,
    flags: [{ severity: "high", label: "Chest pain during activity" }],
    clearance: "cleared_with_restrictions",
  });
  assert.equal(
    issues.find((i) => i.kind === "clearance"),
    undefined,
    "the doctor already decided — it stops being a thing to chase",
  );
});

test("an adverse event is danger regardless of anything else", () => {
  const issues = computeIssues({ ...NONE, adverseEvent: true });
  assert.equal(issues[0].kind, "adverse_event");
  assert.equal(issues[0].severity, "danger");
});

test("a report pending past 72h is a warning; under 72h is not raised", () => {
  assert.equal(computeIssues({ ...NONE, reportOverdueHours: 80 })[0]?.kind, "report_overdue");
  assert.deepEqual(computeIssues({ ...NONE, reportOverdueHours: 40 }), []);
});

test("declining measures are named, not just counted", () => {
  const issues = computeIssues({
    ...NONE,
    decliningMeasures: ["Timed up-and-go", "Balance hold"],
  });
  const decline = issues.find((i) => i.kind === "measure_decline")!;
  assert.match(decline.detail!, /Timed up-and-go/);
  assert.match(decline.detail!, /Balance hold/);
});

test("engagement: at_risk is a warning, quiet is not the doctor's problem", () => {
  assert.equal(computeIssues({ ...NONE, engagement: "at_risk" })[0]?.kind, "family_at_risk");
  assert.deepEqual(
    computeIssues({ ...NONE, engagement: "quiet" }),
    [],
    "a quiet family is the coordinator's call to make, not a clinical issue",
  );
});

test("a programme ending inside a fortnight is info, not alarm", () => {
  const issues = computeIssues({ ...NONE, daysUntilProgrammeEnds: 9 });
  assert.equal(issues[0].kind, "programme_ending");
  assert.equal(issues[0].severity, "info");
  assert.deepEqual(computeIssues({ ...NONE, daysUntilProgrammeEnds: 40 }), []);
});

test("an ended programme does not report as 'ending in -3 days'", () => {
  assert.deepEqual(computeIssues({ ...NONE, daysUntilProgrammeEnds: -3 }), []);
});

test("unread messages are info and pluralise correctly", () => {
  assert.match(computeIssues({ ...NONE, unreadMessages: 1 })[0].label, /1 unread message$/);
  assert.match(computeIssues({ ...NONE, unreadMessages: 4 })[0].label, /4 unread messages$/);
});

test("issues sort danger → warning → info, so the strip reads by urgency", () => {
  const issues = computeIssues({
    ...NONE,
    unreadMessages: 2,
    daysUntilProgrammeEnds: 5,
    reportOverdueHours: 100,
    adverseEvent: true,
    engagement: "at_risk",
  });
  const severities = issues.map((i) => i.severity);
  assert.deepEqual(severities, [...severities].sort(bySeverity), "already ordered by urgency");
  assert.equal(issues[0].severity, "danger");
  assert.equal(issues[issues.length - 1].severity, "info");
});

test("worstSeverity reports the highest present, or null for a clean member", () => {
  assert.equal(worstSeverity(computeIssues(NONE)), null);
  assert.equal(worstSeverity(computeIssues({ ...NONE, unreadMessages: 1 })), "info");
  assert.equal(
    worstSeverity(computeIssues({ ...NONE, unreadMessages: 1, adverseEvent: true })),
    "danger",
  );
});

const ORDER = { danger: 0, warning: 1, info: 2 } as const;
function bySeverity(a: "danger" | "warning" | "info", b: "danger" | "warning" | "info"): number {
  return ORDER[a] - ORDER[b];
}
