// Shared, presentational report renderer (§8). Server-renderable (no "use client")
// so it works both inside the RSC web view and via renderToStaticMarkup for the
// PDF. Styling comes from REPORT_CSS (semantic class names), not Tailwind, so the
// output is identical in both contexts.
import { formatDateTime } from "@/lib/reports/format";
import type { ReportContent, ReportSection } from "@/lib/reports/types";

export function ReportView({ content }: { content: ReportContent }) {
  return (
    <article className="report-doc">
      <h1 className="report-title">{content.title}</h1>
      <p className="report-meta">
        Generated {formatDateTime(content.generated_at)}
        {content.cycle != null ? ` · Cycle ${content.cycle}` : ""}
      </p>
      {content.sections.map((section, i) => (
        <section key={i} className="report-section">
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
              <dd>{String(v)}</dd>
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
                  <td key={ci}>{String(cell)}</td>
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
