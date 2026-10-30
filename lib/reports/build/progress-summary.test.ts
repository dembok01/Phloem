import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildProgressSummary } from "./progress-summary";
import type { ReportSection } from "@/lib/reports/types";

// A stand-in for the service-role client: every query on a table answers with that
// table's rows. The fixture holds one member, so the builder's member filters have
// nothing to exclude — what's under test is the period narrowing in the builder.
function fakeDb(rows: Record<string, unknown[]>): SupabaseClient<Database> {
  const query = (table: string) => {
    const data = rows[table] ?? [];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "order", "in", "is"]) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error: null });
    chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(ok, bad);
    return chain;
  };
  return { from: query } as unknown as SupabaseClient<Database>;
}

const db = fakeDb({
  members: [{ id: "m", full_name: "Meera Nair", status: "active" }],
  cycles: [
    { id: "c1", number: 1, start_date: "2026-08-03", end_date: "2026-09-01", status: "closed" },
    { id: "c2", number: 2, start_date: "2026-09-02", end_date: "2026-10-01", status: "closed" },
  ],
  consultations: [
    { type: "doctor", cycle_id: null, scheduled_at: null, completed_at: "2026-08-05T10:00:00+05:30", meeting_status: "done" },
    { type: "doctor", cycle_id: "c2", scheduled_at: null, completed_at: "2026-09-05T10:00:00+05:30", meeting_status: "done" },
    { type: "psychologist", cycle_id: "c2", scheduled_at: null, completed_at: "2026-09-10T10:00:00+05:30", meeting_status: "done" },
    { type: "trainer", cycle_id: "c2", scheduled_at: "2026-10-05T10:00:00+05:30", completed_at: null, meeting_status: "scheduled" },
  ],
  reports: [
    { id: "r1", type: "nutrition_plan", created_at: "2026-08-07T10:00:00+05:30", cycle_id: null },
    { id: "r2", type: "doctor_review", created_at: "2026-09-06T10:00:00+05:30", cycle_id: "c2" },
    { id: "r3", type: "wellbeing", created_at: "2026-09-11T10:00:00+05:30", cycle_id: "c2" },
  ],
  member_cases: [
    { id: "k1", title: "Knee pain", status: "resolved", severity: "low", opened_at: "2026-08-10T10:00:00+05:30", resolved_at: "2026-09-20T10:00:00+05:30" },
    { id: "k2", title: "Low sugar", status: "open", severity: "low", opened_at: "2026-10-10T10:00:00+05:30", resolved_at: null },
  ],
  measure_catalog: [
    { measure_key: "weight", label: "Weight", unit: "kg", domain: "body", higher_is_better: null, family_safe: true, sort: 1 },
  ],
  measure_sources: [
    { measure_key: "weight", template_key: "doctor_initial", field_id: "weight", parse: "number" },
    { measure_key: "weight", template_key: "doctor_review", field_id: "weight", parse: "number" },
  ],
  form_responses: [
    { answers: { weight: "70", date: "2026-08-05" }, submitted_at: "2026-08-05T11:00:00+05:30", cycle_id: null, form_templates: { key: "doctor_initial" }, cycles: null },
    { answers: { weight: "68", date: "2026-09-05" }, submitted_at: "2026-09-05T11:00:00+05:30", cycle_id: "c2", form_templates: { key: "doctor_review" }, cycles: { number: 2 } },
    { answers: { weight: "66", date: "2026-10-05" }, submitted_at: "2026-10-05T11:00:00+05:30", cycle_id: null, form_templates: { key: "doctor_review" }, cycles: { number: 3 } },
  ],
});

const section = <K extends ReportSection["kind"]>(s: ReportSection[], kind: K) =>
  s.find((x) => x.kind === kind) as Extract<ReportSection, { kind: K }> | undefined;

const september = { from: "2026-09-01", to: "2026-09-30" };

test("a period report is titled with its dates and records them", async () => {
  const r = await buildProgressSummary(db, { memberId: "m", cycleId: null, period: september });
  assert.equal(r.title, "Progress Report — Meera Nair · 1 Sept 2026 – 30 Sept 2026");
  assert.deepEqual(r.period, september);
  assert.equal(r.cycle, null);
});

test("the timeline holds only what happened in the period", async () => {
  const r = await buildProgressSummary(db, { memberId: "m", cycleId: null, period: september });
  const titles = section(r.sections, "timeline")!.data.entries.map((e) => e.title);
  assert.deepEqual(new Set(titles), new Set([
    "Cycle 1 completed",
    "Cycle 2 began",
    "Doctor consultation held",
    "Doctor review written",
    "Wellbeing check-in completed",
    "Resolved: Knee pain",
  ]));
});

test("care received counts the period's consultations", async () => {
  const r = await buildProgressSummary(db, { memberId: "m", cycleId: null, period: september });
  const kv = section(r.sections, "kv")!.data;
  assert.equal(kv["Consultations held"], "2 of 2");
  assert.equal(kv["Period"], "1 Sept 2026 – 30 Sept 2026");
});

test("the numbers stop at the period's end, against the very first reading", async () => {
  const r = await buildProgressSummary(db, { memberId: "m", cycleId: null, period: september });
  const weight = section(r.sections, "measure_trend")!.data.measures[0];
  assert.deepEqual(weight.points.map((p) => p.value), [70, 68]);
  const cmp = section(r.sections, "comparison")!.data;
  assert.equal(cmp.right_label, "By 30 Sept 2026");
  assert.match(String(cmp.rows[0].left), /70/);
  assert.match(String(cmp.rows[0].right), /68/);
});

test("health matters show how they stood at the period's end", async () => {
  const r = await buildProgressSummary(db, { memberId: "m", cycleId: null, period: september });
  const table = section(r.sections, "table")!.data;
  assert.deepEqual(table.rows.map((row) => [row[0], row[1]]), [["Knee pain", "Resolved"]]);

  // In August the knee was still being tracked: it was resolved only on 20 Sept.
  const aug = await buildProgressSummary(db, { memberId: "m", cycleId: null, period: { from: "2026-08-01", to: "2026-08-31" } });
  const augRows = section(aug.sections, "table")!.data.rows;
  assert.deepEqual(augRows.map((row) => row[0]), ["Knee pain"]);
  assert.notEqual(augRows[0][1], "Resolved");
});

test("the wellbeing report is never described", async () => {
  const r = await buildProgressSummary(db, { memberId: "m", cycleId: null, period: september });
  const titles = section(r.sections, "timeline")!.data.entries.map((e) => e.title).join(" | ");
  assert.doesNotMatch(titles, /Wellbeing written/i);
});

test("the monthly summary for a cycle is unchanged", async () => {
  const r = await buildProgressSummary(db, { memberId: "m", cycleId: "c1" });
  assert.equal(r.title, "Progress Summary — Meera Nair · Cycle 1");
  assert.equal(r.period, undefined);
});
