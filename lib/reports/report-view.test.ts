// W1.7 — the guard on the three new report section kinds.
//
// These sections carry clinical judgement into a document that gets printed and
// handed to a family, and the SAME components render the web view and the PDF. So
// the test renders them exactly the way lib/reports/html.tsx does — through
// renderToStaticMarkup with REPORT_CSS inlined — and asserts on the markup that
// reaches puppeteer.
//
// createElement rather than JSX: tsconfig sets `jsx: preserve` for Next, so a .tsx
// file cannot run under `tsx --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/reports/ReportView";
import { PDF_CSS, REPORT_CSS } from "@/lib/reports/styles";
import type { ReportContent } from "@/lib/reports/types";

function render(content: ReportContent): string {
  const body = renderToStaticMarkup(createElement(ReportView, { content }));
  return `<style>${REPORT_CSS}${PDF_CSS}</style>${body}`;
}

/** The markup alone. Assertions about what a report DOESN'T contain must look here:
 *  REPORT_CSS carries every class name, so searching the full document would always
 *  find `.report-measure` even in a report that renders no measures. */
function renderBody(content: ReportContent): string {
  return renderToStaticMarkup(createElement(ReportView, { content }));
}

const CONTENT: ReportContent = {
  title: "Progress Summary — Render Check · Cycle 2",
  generated_at: "2026-08-18T06:30:00Z",
  cycle: 2,
  sections: [
    {
      heading: "In plain words",
      kind: "plain_language",
      data: "Sit-to-stand has improved. Timed up-and-go has moved the wrong way.",
    },
    {
      heading: "What happened in cycle 2",
      kind: "timeline",
      data: {
        entries: [
          { at: "2026-08-10T09:00:00+05:30", kind: "consult", title: "Doctor consultation held", detail: "Monthly round" },
          { at: "2026-08-10T10:00:00+05:30", kind: "report", title: "Doctor review written" },
          { at: "2026-07-12T00:00:00+05:30", kind: "cycle", title: "Cycle 2 began" },
          { at: "2026-07-05T00:00:00+05:30", kind: "case", title: "Started tracking: Knee osteoarthritis" },
        ],
      },
    },
    {
      heading: "How the numbers are moving",
      kind: "measure_trend",
      data: {
        measures: [
          {
            key: "sit_to_stand",
            label: "30-second sit-to-stand",
            unit: "reps",
            higher_is_better: true,
            points: [
              { at: "2026-05-02T00:00:00Z", value: 8 },
              { at: "2026-06-02T00:00:00Z", value: 10 },
              { at: "2026-07-02T00:00:00Z", value: 13 },
            ],
          },
          {
            key: "tug_seconds",
            label: "Timed up-and-go",
            unit: "s",
            higher_is_better: false,
            points: [
              { at: "2026-05-02T00:00:00Z", value: 14 },
              { at: "2026-07-02T00:00:00Z", value: 17 },
            ],
          },
          {
            key: "weight_kg",
            label: "Weight",
            unit: "kg",
            higher_is_better: null,
            points: [
              { at: "2026-05-02T00:00:00Z", value: 70 },
              { at: "2026-07-02T00:00:00Z", value: 74 },
            ],
          },
          {
            key: "balance_seconds",
            label: "Balance hold",
            unit: "s",
            higher_is_better: true,
            points: [{ at: "2026-05-02T00:00:00Z", value: 12 }],
          },
        ],
      },
    },
    {
      heading: "This month against the start",
      kind: "comparison",
      data: {
        left_label: "At the start",
        right_label: "Now (cycle 2)",
        rows: [
          { label: "Sit-to-stand", left: "8 reps", right: "13 reps" },
          { label: "Missing value", left: null, right: "" },
        ],
      },
    },
  ],
};

test("every measure renders, and only multi-reading ones get a mark", () => {
  const html = render(CONTENT);
  assert.equal((html.match(/class="report-measure"/g) ?? []).length, 4);
  // 3 of the 4 have more than one reading; a single reading has no line to draw.
  assert.equal((html.match(/<polyline/g) ?? []).length, 3);
  assert.match(html, /Baseline recorded/);
});

test("direction wording is per-measure, so a RISING timed up-and-go reads as worse", () => {
  const html = render(CONTENT);
  assert.match(html, /improving/, "sit-to-stand rose and higher is better");
  assert.match(html, /needs attention/, "timed up-and-go rose and lower is better");
});

test("a neutral measure is reported but never judged", () => {
  const html = render(CONTENT);
  assert.match(html, /74 kg/, "the weight reading is shown");
  assert.doesNotMatch(
    html,
    /74 kg[\s\S]{0,160}(improving|needs attention)/,
    "whether weight gain is good is the doctor's call, not the chart's",
  );
});

test("the numbers are also available as text, so identity is never colour-alone", () => {
  const html = render(CONTENT);
  assert.match(html, /report-measures-table/);
  // baseline and latest for sit-to-stand appear in the table
  assert.match(html, /<td>8 reps<\/td>/);
  assert.match(html, /<td>13 reps<\/td>/);
});

test("timeline groups by month, newest month first", () => {
  const html = render(CONTENT);
  assert.match(html, /August 2026/);
  assert.match(html, /July 2026/);
  assert.ok(
    html.indexOf("August 2026") < html.indexOf("July 2026"),
    "the most recent month leads",
  );
});

test("comparison renders both columns and dashes empty cells", () => {
  const html = render(CONTENT);
  assert.match(html, /At the start/);
  assert.match(html, /Now \(cycle 2\)/);
  assert.match(html, /<td>—<\/td>/, "null and empty values render as an em dash, not blank");
});

test("no CSS variable reaches the PDF without a fallback", () => {
  // The PDF document has no :root tokens, so a bare var() resolves to nothing.
  // var(--x, fallback) is the house pattern and is fine.
  const html = render(CONTENT);
  assert.doesNotMatch(html, /var\(--[a-zA-Z0-9-]+\)/);
});

test("existing section kinds are untouched by the additions", () => {
  const html = renderBody({
    title: "Doctor Review",
    generated_at: "2026-08-18T06:30:00Z",
    cycle: 1,
    sections: [
      { heading: "Assessment", kind: "text", data: "Stable." },
      { heading: "Vitals", kind: "kv", data: { "Blood pressure": "128/82" } },
      { heading: "Meds", kind: "table", data: { columns: ["Drug"], rows: [["Metformin"]] } },
      { heading: "Goals", kind: "list", data: ["Walk daily"] },
      { heading: "Flag", kind: "callout", data: { tone: "warning", text: "Review needed." } },
    ],
  });
  assert.match(html, /report-section--lead/, "the assessment still leads the document");
  assert.match(html, /128\/82/);
  assert.match(html, /Metformin/);
  assert.match(html, /report-callout--warning/);
  assert.doesNotMatch(html, /report-measure|report-timeline/, "no new chrome leaks in");
});
