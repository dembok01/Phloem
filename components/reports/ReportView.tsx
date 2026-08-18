// Shared, presentational report renderer (§8). Server-renderable (no "use client")
// so it works both inside the RSC web view and via renderToStaticMarkup for the
// PDF. Styling comes from REPORT_CSS (semantic class names), not Tailwind, so the
// output is identical in both contexts.
//
// C5: the first section (the professional's assessment, §8 invariant) renders as
// the document lead; bare ISO dates in values render human-readable per §11.
import { Sparkline } from "@/components/charts/sparkline";
import { formatDateTime } from "@/lib/reports/format";
import { formatValue, groupSeries, type MeasurePoint } from "@/lib/measures";
import type {
  ComparisonData,
  MeasureTrendData,
  ReportContent,
  ReportSection,
  TimelineData,
} from "@/lib/reports/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** "2026-07-12" → "Sat, 12 Jul 2026"; anything else unchanged (§11 dates). */
function display(v: unknown): string {
  const s = String(v);
  if (ISO_DATE.test(s)) {
    const d = new Date(`${s}T00:00:00+05:30`);
    if (!Number.isNaN(d.getTime())) return dateFmt.format(d);
  }
  return s;
}

export function ReportView({ content }: { content: ReportContent }) {
  return (
    <article className="report-doc">
      <p className="report-eyebrow">PHLOEM · Clinical report</p>
      <h1 className="report-title">{content.title}</h1>
      <p className="report-meta">
        Generated {formatDateTime(content.generated_at)}
        {content.cycle != null ? ` · Cycle ${content.cycle}` : ""}
      </p>
      {content.sections.map((section, i) => (
        <section key={i} className={i === 0 ? "report-section report-section--lead" : "report-section"}>
          <h2>{section.heading}</h2>
          <SectionBody section={section} />
        </section>
      ))}
    </article>
  );
}

function SectionBody({ section }: { section: ReportSection }) {
  switch (section.kind) {
    case "text":
      return <p className="report-text">{section.data}</p>;

    case "kv":
      return (
        <dl className="report-kv">
          {Object.entries(section.data).map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{display(v)}</dd>
            </div>
          ))}
        </dl>
      );

    case "table":
      return (
        <table className="report-table">
          <thead>
            <tr>
              {section.data.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.data.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{display(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "list":
      return (
        <ul className="report-list">
          {section.data.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );

    case "callout": {
      const tone = section.data.tone ?? "info";
      return (
        <div className={`report-callout report-callout--${tone}`}>
          {section.data.lead ? <p className="report-callout-lead">{section.data.lead}</p> : null}
          {section.data.text ? <p className="report-text">{section.data.text}</p> : null}
          {section.data.items && section.data.items.length > 0 ? (
            <ul>
              {section.data.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }

    case "plain_language":
      return (
        <div className="report-plain">
          <p className="report-text">{section.data}</p>
        </div>
      );

    case "measure_trend":
      return <MeasureTrendBody data={section.data} />;

    case "timeline":
      return <TimelineBody data={section.data} />;

    case "comparison":
      return <ComparisonBody data={section.data} />;

    default:
      return null;
  }
}

// Status ink for the report surface. Literal hex, not tokens: REPORT_CSS is
// inlined static CSS for the PDF, where CSS variables do not resolve.
const INK = {
  improved: "#1E6B4E", // Phloem
  declined: "#8A5A0B", // Honey — "needs attention", never Clay (that is adverse-event red)
  neutral: "#5A6B60", // Moss
} as const;

/** Small multiples, one row per measure: current value, sparkline, and a
 *  direction-aware delta. Never colour alone — every status carries an arrow
 *  glyph and words ("improving" / "needs attention"). */
function MeasureTrendBody({ data }: { data: MeasureTrendData }) {
  const series = groupSeries(
    data.measures.flatMap((m) =>
      m.points.map(
        (p): MeasurePoint => ({
          measure_key: m.key,
          label: m.label,
          unit: m.unit,
          domain: "clinical",
          higher_is_better: m.higher_is_better,
          at: p.at,
          cycle_number: p.cycle ?? null,
          value: p.value,
          source: "report",
        }),
      ),
    ),
  );
  // Keep the author's ordering rather than the grouping's.
  const order = new Map(data.measures.map((m, i) => [m.key, i]));
  series.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));

  if (series.length === 0) {
    return <p className="report-text report-muted">No measurements recorded yet.</p>;
  }

  return (
    <>
      <ul className="report-measures">
        {series.map((s) => {
          const tone =
            s.direction === "improved" ? "improved" : s.direction === "declined" ? "declined" : "neutral";
          const glyph = s.direction === "improved" ? "▲" : s.direction === "declined" ? "▼" : "→";
          const delta = s.deltaFromBaseline;
          return (
            <li key={s.key} className="report-measure">
              <div className="report-measure-head">
                <span className="report-measure-label">{s.label}</span>
                <span className="report-measure-value">{formatValue(s.latest, s.unit)}</span>
              </div>
              <div className="report-measure-plot">
                {s.points.length > 1 ? (
                  <Sparkline
                    values={s.points.map((p) => p.value)}
                    width={104}
                    height={26}
                    domain="data"
                    stroke={INK[tone]}
                    ringColor="#FFFFFF"
                    label={`${s.label}: ${s.points.map((p) => p.value).join(", ")}`}
                  />
                ) : (
                  <span className="report-measure-single">Baseline recorded</span>
                )}
              </div>
              <div className="report-measure-delta" style={{ color: INK[tone] }}>
                {delta === null ? (
                  <span className="report-muted">First reading — no change to show yet</span>
                ) : (
                  <>
                    <span aria-hidden>{glyph}</span>{" "}
                    {delta === 0
                      ? "No change since intake"
                      : `${formatValue(Math.abs(delta), s.unit)} ${delta > 0 ? "higher" : "lower"} than intake`}
                    {s.direction === "improved" ? " — improving" : null}
                    {s.direction === "declined" ? " — needs attention" : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {/* Identity is never colour-alone, and the numbers are always available as
          text — this table is the accessible view of the marks above. */}
      <table className="report-table report-measures-table">
        <thead>
          <tr>
            <th>Measure</th>
            <th>At intake</th>
            <th>Latest</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>{formatValue(s.baseline, s.unit)}</td>
              <td>{formatValue(s.latest, s.unit)}</td>
              <td>
                {s.deltaFromBaseline === null
                  ? "—"
                  : `${s.deltaFromBaseline > 0 ? "+" : ""}${s.deltaFromBaseline}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.note ? <p className="report-text report-muted">{data.note}</p> : null}
    </>
  );
}

const TIMELINE_LABEL: Record<string, string> = {
  consult: "Consultation",
  report: "Report",
  cycle: "Programme",
  case: "Case",
  flag: "Flag",
  activity: "Activity",
};

/** Dated entries, newest first, grouped by month so a long journey stays readable
 *  on paper. The dot is a shape+letter pair, not a colour cue. */
function TimelineBody({ data }: { data: TimelineData }) {
  const entries = [...data.entries].sort((a, b) => (a.at < b.at ? 1 : -1));
  if (entries.length === 0) {
    return <p className="report-text report-muted">Nothing recorded in this period.</p>;
  }

  const groups: { month: string; items: typeof entries }[] = [];
  for (const e of entries) {
    const month = monthLabel(e.at);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(e);
    else groups.push({ month, items: [e] });
  }

  return (
    <div className="report-timeline">
      {groups.map((g) => (
        <div key={g.month} className="report-timeline-group">
          <p className="report-timeline-month">{g.month}</p>
          <ol className="report-timeline-list">
            {g.items.map((e, i) => (
              <li key={i} className="report-timeline-item">
                <span className="report-timeline-kind">{TIMELINE_LABEL[e.kind] ?? e.kind}</span>
                <span className="report-timeline-body">
                  <span className="report-timeline-title">{e.title}</span>
                  <span className="report-timeline-date">{dayLabel(e.at)}</span>
                  {e.detail ? <span className="report-timeline-detail">{e.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function ComparisonBody({ data }: { data: ComparisonData }) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th />
          <th>{data.left_label}</th>
          <th>{data.right_label}</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r, i) => (
          <tr key={i}>
            <th scope="row" className="report-compare-label">
              {r.label}
            </th>
            <td>{r.left === null || r.left === "" ? "—" : display(r.left)}</td>
            <td>{r.right === null || r.right === "" ? "—" : display(r.right)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const monthFmt = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : monthFmt.format(d);
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dayFmt.format(d);
}
