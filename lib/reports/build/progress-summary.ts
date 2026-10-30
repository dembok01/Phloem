// W1.6 — the `progress_summary` report: a timeline-based document that doubles as
// the family's monthly summary.
//
// Composed in TypeScript rather than SQL for two reasons. It stitches four
// different sources into one narrative, which SQL makes unreadable; and the
// improve/decline wording comes from lib/measures.ts — the SAME module the live
// Trends tab uses — so a PDF printed today can never disagree with the screen
// about which way a number moved.
//
// Audience: the family first (it is created with share_with_caregiver = true), the
// care team second. That decides what goes in: only `family_safe` measures, never a
// psych measure, never a contact identifier. The care team's full-fidelity view is
// the live Trends tab, not this document.
//
// No `server-only` guard, matching the other §8 builders: this module holds no
// credentials (the caller supplies the client) and dev scripts import it directly.
// lib/reports/progress.ts, which orchestrates with the admin client, carries it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { groupSeries, summarise, formatValue, type MeasurePoint } from "@/lib/measures";
import { humanize } from "@/lib/reports/build/helpers";
import { inPeriod, periodLabel, type Period } from "@/lib/progress-period";
import type {
  MeasureTrendEntry,
  ReportContent,
  ReportSection,
  TimelineEntry,
} from "@/lib/reports/types";

type Admin = SupabaseClient<Database>;

export type ProgressSummaryInput = {
  memberId: string;
  /** null builds an all-time summary (used before the first cycle closes) */
  cycleId: string | null;
  /** 0061: the admin's report for a chosen period, on request from the family.
   *  What happened is narrowed to the period; the numbers run up to its end. */
  period?: Period;
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
function d(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso);
  return Number.isNaN(t.getTime()) ? "—" : dateFmt.format(t);
}

/**
 * Compose the report content. Reads with a SERVICE-ROLE client (RLS bypassed), so
 * every narrowing decision is explicit and visible in this file — the safest shape
 * for a document that will be shown to a family.
 */
export async function buildProgressSummary(
  admin: Admin,
  { memberId, cycleId, period }: ProgressSummaryInput,
): Promise<ReportContent> {
  const [
    { data: member },
    { data: cycle },
    { data: cycles },
    { data: consults },
    { data: reports },
    { data: allCases },
    { data: catalog },
    { data: responses },
  ] = await Promise.all([
    admin.from("members").select("id, full_name, status").eq("id", memberId).maybeSingle(),
    cycleId
      ? admin.from("cycles").select("id, number, start_date, end_date, status").eq("id", cycleId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("cycles")
      .select("id, number, start_date, end_date, status, packages!inner(member_id)")
      .eq("packages.member_id", memberId),
    admin
      .from("consultations")
      .select("type, cycle_id, scheduled_at, completed_at, meeting_status")
      .eq("member_id", memberId),
    admin.from("reports").select("id, type, created_at, cycle_id").eq("member_id", memberId),
    admin
      .from("member_cases")
      .select("id, title, status, severity, opened_at, resolved_at")
      .eq("member_id", memberId),
    admin
      .from("measure_catalog")
      .select("measure_key, label, unit, domain, higher_is_better, family_safe, sort")
      .eq("family_safe", true)
      .order("domain")
      .order("sort"),
    admin
      .from("form_responses")
      .select("answers, submitted_at, cycle_id, form_templates!inner(key), cycles(number)")
      .eq("member_id", memberId)
      .not("submitted_at", "is", null),
  ]);

  const name = member?.full_name ?? "Member";
  const cycleNo = cycle?.number ?? null;
  const sections: ReportSection[] = [];
  const span = period ? periodLabel(period) : null;
  const periodEnd = period ? Date.parse(`${period.to}T23:59:59.999+05:30`) : Infinity;
  const cases = period ? casesAsOf(allCases ?? [], period) : allCases;

  // ---- measures (family-safe only) -------------------------------------------
  const { data: sources } = await admin
    .from("measure_sources")
    .select("measure_key, template_key, field_id, parse");

  const safeKeys = new Set((catalog ?? []).map((c) => c.measure_key));
  const points: MeasurePoint[] = [];
  for (const r of responses ?? []) {
    const tpl = r.form_templates as { key: string } | { key: string }[] | null;
    const key = Array.isArray(tpl) ? tpl[0]?.key : tpl?.key;
    if (!key) continue;
    const cyc = r.cycles as { number: number } | { number: number }[] | null;
    const cycNumber = Array.isArray(cyc) ? cyc[0]?.number : cyc?.number;
    const answers = (r.answers ?? {}) as Record<string, unknown>;

    for (const s of sources ?? []) {
      if (s.template_key !== key || !safeKeys.has(s.measure_key)) continue;
      const value = readMeasure(answers, s.field_id, s.parse);
      if (value === null) continue;
      const meta = (catalog ?? []).find((c) => c.measure_key === s.measure_key);
      if (!meta) continue;
      const at = preferConsultDate(answers, r.submitted_at);
      if (Date.parse(at) > periodEnd) continue;
      points.push({
        measure_key: s.measure_key,
        label: meta.label,
        unit: meta.unit,
        domain: meta.domain,
        higher_is_better: meta.higher_is_better,
        at,
        cycle_number: cycNumber ?? null,
        value,
        source: key,
      });
    }
  }

  const series = groupSeries(points);
  const stats = summarise(series);

  // ---- 1. plain-language lead ------------------------------------------------
  sections.push({
    heading: "In plain words",
    kind: "plain_language",
    data: plainLanguage({
      name,
      scope: span ? `the period ${span}` : cycleNo ? `cycle ${cycleNo}` : null,
      stats,
      series,
      cases: cases ?? [],
    }),
  });

  // ---- 2. timeline ----------------------------------------------------------
  const entries = timelineEntries({
    consults: consults ?? [],
    reports: (reports ?? []).filter((r) => r.type !== "wellbeing"),
    cycles: (cycles ?? []) as { number: number; start_date: string; end_date: string; status: string }[],
    cases: cases ?? [],
    from: period?.from ?? cycle?.start_date ?? null,
    to: period?.to ?? cycle?.end_date ?? null,
  });
  sections.push({
    heading: period ? "What happened in this period" : cycleNo ? `What happened in cycle ${cycleNo}` : "The journey so far",
    kind: "timeline",
    data: { entries },
  });

  // ---- 3. measures ----------------------------------------------------------
  if (series.length > 0) {
    const measures: MeasureTrendEntry[] = series.map((s) => ({
      key: s.key,
      label: s.label,
      unit: s.unit,
      higher_is_better: s.higher_is_better,
      points: s.points.map((p) => ({ at: p.at, value: p.value, cycle: p.cycle_number })),
    }));
    sections.push({
      heading: "How the numbers are moving",
      kind: "measure_trend",
      data: {
        measures,
        note:
          `Each figure is the most recent reading${period ? ` up to ${periodLabel({ from: period.to, to: period.to })}` : ""}, compared with the very first one taken. ` +
          "Some numbers, like weight, are shown without a verdict — whether a change is good " +
          "depends on the plan, and that is the doctor's call.",
      },
    });
  }

  // ---- 4. comparison with the previous cycle --------------------------------
  const comparison = cycleComparison(
    series,
    period ? `By ${periodLabel({ from: period.to, to: period.to })}` : cycleNo ? `Now (cycle ${cycleNo})` : "Now",
  );
  if (comparison && period) comparison.heading = "Where things stood against the start";
  if (comparison) sections.push(comparison);

  // ---- 5. cases ------------------------------------------------------------
  const open = (cases ?? []).filter((c) => c.status !== "resolved");
  const resolved = (cases ?? []).filter((c) => c.status === "resolved");
  if (open.length > 0 || resolved.length > 0) {
    sections.push({
      heading: "Health matters being tracked",
      kind: "table",
      data: {
        columns: ["Matter", "Status", "Since"],
        rows: [
          ...open.map((c) => [c.title, humanize(c.status), d(c.opened_at)]),
          ...resolved.map((c) => [c.title, "Resolved", d(c.resolved_at)]),
        ],
      },
    });
  }

  // ---- 6. care received this cycle -----------------------------------------
  const inCycle = (consults ?? []).filter((c) => {
    if (period) {
      const when = c.completed_at ?? c.scheduled_at;
      return !!when && inPeriod(when, period);
    }
    return !cycleId || c.cycle_id === cycleId;
  });
  const held = inCycle.filter((c) => c.meeting_status === "done");
  sections.push({
    heading: "Care received",
    kind: "kv",
    data: {
      "Consultations held": `${held.length} of ${inCycle.length || held.length}`,
      "Specialists involved": held.length
        ? [...new Set(held.map((c) => humanize(c.type)))].sort().join(", ")
        : "—",
      ...(span ? { Period: span } : {}),
      ...(cycle
        ? { "Cycle dates": `${d(cycle.start_date)} – ${d(cycle.end_date)}` }
        : {}),
    },
  });

  return {
    title: span
      ? `Progress Report — ${name} · ${span}`
      : cycleNo
        ? `Progress Summary — ${name} · Cycle ${cycleNo}`
        : `Progress Summary — ${name}`,
    generated_at: new Date().toISOString(),
    cycle: cycleNo,
    sections,
    ...(period ? { period: { from: period.from, to: period.to } } : {}),
  };
}

/** The health matters that were open at some point in the period, each as it stood
 *  on the period's last day — a matter resolved after it is still being tracked. */
function casesAsOf<C extends { status: string; opened_at: string; resolved_at: string | null }>(
  cases: C[],
  period: Period,
): C[] {
  const start = Date.parse(`${period.from}T00:00:00+05:30`);
  const end = Date.parse(`${period.to}T23:59:59.999+05:30`);
  return cases
    .filter((c) => Date.parse(c.opened_at) <= end && (!c.resolved_at || Date.parse(c.resolved_at) >= start))
    .map((c) => {
      const resolvedByEnd = !!c.resolved_at && Date.parse(c.resolved_at) <= end;
      return {
        ...c,
        status: resolvedByEnd ? "resolved" : c.status === "resolved" ? "open" : c.status,
        resolved_at: resolvedByEnd ? c.resolved_at : null,
      };
    });
}

// ---------------------------------------------------------------------------

/** Mirrors _measure_value() in migration 0022 — a value that is not a clean number
 *  is not a data point. Kept in step with the SQL deliberately: the RPC serves live
 *  surfaces, this serves the document, and both must read a "128/82" the same way. */
function readMeasure(answers: Record<string, unknown>, field: string, parse: string): number | null {
  const raw = answers[field];
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (parse === "bp_sys") text = (text.split("/")[0] ?? "").trim();
  if (parse === "bp_dia") text = (text.split("/")[1] ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function preferConsultDate(answers: Record<string, unknown>, submittedAt: string | null): string {
  const date = answers["date"];
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00+05:30`;
  return submittedAt ?? new Date().toISOString();
}

function timelineEntries(args: {
  consults: { type: string; cycle_id: string | null; scheduled_at: string | null; completed_at: string | null; meeting_status: string }[];
  reports: { id: string; type: string; created_at: string; cycle_id: string | null }[];
  cycles: { number: number; start_date: string; end_date: string; status: string }[];
  cases: { title: string; status: string; opened_at: string; resolved_at: string | null }[];
  from: string | null;
  to: string | null;
}): TimelineEntry[] {
  const out: TimelineEntry[] = [];

  for (const c of args.consults) {
    const when = c.completed_at ?? c.scheduled_at;
    if (!when) continue;
    // §3: the wellbeing check-in is acknowledged, never described.
    const title =
      c.type === "psychologist"
        ? "Wellbeing check-in completed"
        : `${humanize(c.type)} consultation ${c.meeting_status === "done" ? "held" : c.meeting_status === "cancelled" ? "cancelled" : "scheduled"}`;
    out.push({ at: when, kind: "consult", title, detail: c.cycle_id ? "Monthly round" : "First round" });
  }

  for (const r of args.reports) {
    out.push({ at: r.created_at, kind: "report", title: `${humanize(r.type)} written` });
  }

  for (const cy of args.cycles) {
    out.push({
      at: `${cy.start_date}T00:00:00+05:30`,
      kind: "cycle",
      title: `Cycle ${cy.number} began`,
      detail: `${d(cy.start_date)} – ${d(cy.end_date)}`,
    });
    if (cy.status === "closed") {
      out.push({ at: `${cy.end_date}T23:59:00+05:30`, kind: "cycle", title: `Cycle ${cy.number} completed` });
    }
  }

  for (const c of args.cases) {
    out.push({ at: c.opened_at, kind: "case", title: `Started tracking: ${c.title}` });
    if (c.resolved_at) out.push({ at: c.resolved_at, kind: "case", title: `Resolved: ${c.title}` });
  }

  const from = args.from ? new Date(`${args.from}T00:00:00+05:30`).getTime() : null;
  const to = args.to ? new Date(`${args.to}T23:59:59+05:30`).getTime() : null;
  return out
    .filter((e) => {
      if (from === null || to === null) return true;
      const t = new Date(e.at).getTime();
      return Number.isNaN(t) || (t >= from && t <= to);
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

function cycleComparison(
  series: ReturnType<typeof groupSeries>,
  rightLabel: string,
): ReportSection | null {
  const movable = series.filter((s) => s.points.length > 1);
  if (movable.length === 0) return null;
  return {
    heading: "This month against the start",
    kind: "comparison",
    data: {
      left_label: "At the start",
      right_label: rightLabel,
      rows: movable.map((s) => ({
        label: s.label,
        left: formatValue(s.baseline, s.unit),
        right: formatValue(s.latest, s.unit),
      })),
    },
  };
}

/** The lead paragraph. Written to be read by an adult child on a phone, and to be
 *  honest when there is nothing to report — a cheerful summary of no data is worse
 *  than saying so. */
function plainLanguage(args: {
  name: string;
  /** "cycle 2", "the period 1 Sept 2026 – 30 Sept 2026"; null = the programme so far */
  scope: string | null;
  stats: { tracked: number; improved: number; declined: number };
  series: ReturnType<typeof groupSeries>;
  cases: { title: string; status: string }[];
}): string {
  const first = args.name.split(" ")[0] || args.name;
  const { improved, declined, tracked } = args.stats;
  const parts: string[] = [];

  if (tracked === 0) {
    parts.push(
      `This is ${first}'s summary${args.scope ? ` for ${args.scope}` : ""}. ` +
        `No measurements have been recorded yet, so there is nothing to compare — the care team ` +
        `takes the first readings during the initial consultations.`,
    );
    return parts.join(" ");
  }

  parts.push(
    `Over ${args.scope ?? "the programme so far"}, the care team tracked ` +
      `${tracked} measure${tracked === 1 ? "" : "s"} for ${first}.`,
  );

  const up = args.series.filter((s) => s.direction === "improved").map((s) => s.label.toLowerCase());
  const down = args.series.filter((s) => s.direction === "declined").map((s) => s.label.toLowerCase());

  if (improved > 0) parts.push(`${sentenceList(up)} ${up.length === 1 ? "has" : "have"} improved since the start.`);
  if (declined > 0) {
    parts.push(
      `${sentenceList(down)} ${down.length === 1 ? "has" : "have"} moved the wrong way — the care team ` +
        `is aware and will address ${down.length === 1 ? "it" : "them"} at the next consultation.`,
    );
  }
  if (improved === 0 && declined === 0) {
    parts.push(`The numbers are holding steady, which at this stage is a good sign.`);
  }

  const open = args.cases.filter((c) => c.status !== "resolved");
  if (open.length > 0) {
    parts.push(
      `${open.length} health matter${open.length === 1 ? "" : "s"} ` +
        `(${open.map((c) => c.title).join(", ")}) ${open.length === 1 ? "is" : "are"} being tracked.`,
    );
  }

  parts.push(`Everything below is the detail behind that summary.`);
  return parts.join(" ");
}

function sentenceList(items: string[]): string {
  const unique = [...new Set(items)];
  if (unique.length === 0) return "";
  if (unique.length === 1) return capitalise(unique[0]);
  if (unique.length === 2) return `${capitalise(unique[0])} and ${unique[1]}`;
  return `${capitalise(unique[0])}, ${unique.slice(1, -1).join(", ")} and ${unique[unique.length - 1]}`;
}
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
