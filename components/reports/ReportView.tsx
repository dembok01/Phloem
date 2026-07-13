// Shared, presentational report renderer (§8). Server-renderable (no "use client")
// so it works both inside the RSC web view and via renderToStaticMarkup for the
// PDF. Styling comes from REPORT_CSS (semantic class names), not Tailwind, so the
// output is identical in both contexts.
//
// C5: the first section (the professional's assessment, §8 invariant) renders as
// the document lead; bare ISO dates in values render human-readable per §11.
import { formatDateTime } from "@/lib/reports/format";
import type { ReportContent, ReportSection } from "@/lib/reports/types";

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

    default:
      return null;
  }
}
