// §8 report content model. `reports.content` is uniform across every report type;
// shared components (components/reports/ReportView) render it for both the web
// view and the PDF. Kinds: text | kv | table | list | callout | plain_language.
// `plain_language` is an additive, family-facing summary block (Tier-3 T3.3 AI
// summaries). Additive-only: existing report types never emit it and render
// byte-identical.

export type KvData = Record<string, string | number>;
export type TableData = { columns: string[]; rows: (string | number)[][] };
export type CalloutTone = "info" | "warning" | "danger";
export type CalloutData = {
  tone?: CalloutTone;
  lead?: string;
  items?: string[];
  text?: string;
};

/** W1.7 — a longitudinal measure, stored as raw readings. The improve/decline
 *  judgement is NOT baked in: the renderer derives it through lib/measures.ts so
 *  the wording lives in exactly one place (and a stored report can never disagree
 *  with the live Trends tab about which way a number moved). */
export type MeasureTrendPoint = { at: string; value: number; cycle?: number | null };
export type MeasureTrendEntry = {
  key: string;
  label: string;
  unit: string | null;
  higher_is_better: boolean | null;
  points: MeasureTrendPoint[];
};
export type MeasureTrendData = { measures: MeasureTrendEntry[]; note?: string };

/** W1.5/W1.6 — dated entries for a timeline-shaped section. */
export type TimelineEntryKind = "consult" | "report" | "cycle" | "case" | "flag" | "activity";
export type TimelineEntry = {
  at: string;
  kind: TimelineEntryKind;
  title: string;
  detail?: string;
};
export type TimelineData = { entries: TimelineEntry[] };

/** Two-column this-vs-previous comparison. */
export type ComparisonData = {
  left_label: string;
  right_label: string;
  rows: { label: string; left: string | number | null; right: string | number | null }[];
};

export type ReportSection =
  | { heading: string; kind: "text"; data: string }
  | { heading: string; kind: "kv"; data: KvData }
  | { heading: string; kind: "table"; data: TableData }
  | { heading: string; kind: "list"; data: string[] }
  | { heading: string; kind: "callout"; data: CalloutData }
  | { heading: string; kind: "plain_language"; data: string }
  | { heading: string; kind: "measure_trend"; data: MeasureTrendData }
  | { heading: string; kind: "timeline"; data: TimelineData }
  | { heading: string; kind: "comparison"; data: ComparisonData };

export type ReportContent = {
  title: string;
  generated_at: string;
  cycle: number | null;
  sections: ReportSection[];
};

/** Narrow untyped `reports.content` (Json) into a renderable ReportContent. */
export function parseReportContent(value: unknown): ReportContent {
  const v = (value ?? {}) as Partial<ReportContent>;
  return {
    title: typeof v.title === "string" ? v.title : "Report",
    generated_at: typeof v.generated_at === "string" ? v.generated_at : new Date().toISOString(),
    cycle: typeof v.cycle === "number" ? v.cycle : null,
    sections: Array.isArray(v.sections) ? (v.sections as ReportSection[]) : [],
  };
}
