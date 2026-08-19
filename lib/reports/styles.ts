// One source of truth for report styling, shared by the web view (injected via a
// <style> tag) and the PDF HTML (inlined). Semantic class names (report-*) so the
// SAME ReportView component renders identically in both — no Tailwind dependency
// inside the puppeteer document. Base font ≥16px per §11.
//
// C5: medical-document hierarchy. The FIRST section of every report is the
// professional's own assessment (§8 invariant) — it renders as the document's
// lead voice (larger, Phloem rule, no boxed chrome). Everything after it is
// structured reference material. Colors are the DESIGN-SYSTEM.md palette as
// literals (the PDF renders outside the app's CSS variables); the font stack
// resolves to the brand faces on the web and degrades to system faces in PDF.

export const REPORT_CSS = `
.report-doc { color:#1F2A24; font-size:16px; line-height:1.55;
  font-family: var(--font-brand-body, "Atkinson Hyperlegible"), "Atkinson Hyperlegible",
    system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.report-doc .report-eyebrow { font-family: var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace;
  font-size:11px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:#5A6B60; margin:0 0 6px; }
.report-doc .report-title { font-family: var(--font-brand-display, "Bricolage Grotesque"), "Bricolage Grotesque",
    system-ui, sans-serif;
  font-size:27px; font-weight:650; letter-spacing:-0.01em; line-height:1.15; margin:0 0 6px; color:#1F2A24; }
.report-doc .report-meta { font-family: var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace;
  font-size:12px; color:#5A6B60; margin:0 0 26px; padding-bottom:14px; border-bottom:1px solid #DCE5DD; }

/* Cover block (V4). The document names itself before it starts talking. */
.report-doc .report-cover { margin:0 0 30px; padding:0 0 16px; border-bottom:2px solid #1E6B4E; }
.report-doc .report-cover .report-title { margin-bottom:14px; }
.report-doc dl.report-covermeta { display:flex; flex-wrap:wrap; gap:22px 34px; margin:0; }
.report-doc dl.report-covermeta > div { display:flex; flex-direction:column; gap:2px; }
.report-doc dl.report-covermeta dt { font-family:var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace;
  font-size:9.5px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:#5A6B60; }
.report-doc dl.report-covermeta dd { margin:0; font-family:var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace;
  font-size:12.5px; color:#1F2A24; font-variant-numeric:tabular-nums; }
.report-doc .report-section { margin:0 0 24px; break-inside:avoid; }
.report-doc .report-section > h2 { font-family: var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace;
  font-size:12px; font-weight:600; color:#5A6B60;
  text-transform:uppercase; letter-spacing:.09em; margin:0 0 10px; padding-bottom:6px;
  border-bottom:1px solid #DCE5DD; }

/* The lead section — the professional's assessment speaks first and largest. */
.report-doc .report-section--lead { margin:0 0 30px; padding:2px 0 2px 18px; border-left:3px solid #1E6B4E; }
.report-doc .report-section--lead > h2 { font-family: var(--font-brand-display, "Bricolage Grotesque"),
    "Bricolage Grotesque", system-ui, sans-serif;
  font-size:17px; font-weight:600; color:#1F2A24; text-transform:none; letter-spacing:0;
  border-bottom:0; padding-bottom:0; margin:0 0 8px; }
.report-doc .report-section--lead .report-text { font-size:17.5px; line-height:1.6; color:#1F2A24; }

.report-doc dl.report-kv { display:grid; grid-template-columns:minmax(180px,34%) 1fr;
  gap:7px 16px; margin:0; }
.report-doc dl.report-kv dt { font-weight:600; color:#5A6B60; }
.report-doc dl.report-kv dd { margin:0; color:#1F2A24; white-space:pre-wrap; }
.report-doc table.report-table { width:100%; border-collapse:collapse; font-size:15px; }
.report-doc table.report-table th { text-align:left; background:#F5F8F5; color:#5A6B60;
  font-family: var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace; font-size:12.5px;
  font-weight:500; letter-spacing:.02em;
  padding:8px 10px; border:1px solid #DCE5DD; }
.report-doc table.report-table td { padding:8px 10px; border:1px solid #DCE5DD; vertical-align:top; }
.report-doc ul.report-list { margin:0; padding-left:20px; }
.report-doc ul.report-list li { margin:3px 0; }
.report-doc .report-text { margin:0; white-space:pre-wrap; }

/* Callouts — first-class clinical components (red flags, adverse events,
   restrictions): a firm left bar, a bold lead, quiet tinted ground. */
.report-doc .report-callout { border-radius:10px; padding:14px 16px 14px 14px; border:1px solid; border-left-width:4px; }
.report-doc .report-callout .report-callout-lead { font-weight:700; margin:0 0 8px; }
.report-doc .report-callout ul { margin:0; padding-left:20px; }
.report-doc .report-callout li { margin:3px 0; }
.report-doc .report-callout--warning { background:#FBF3E4; border-color:#D9B36A; border-left-color:#8A5A0B; color:#5C3D08; }
.report-doc .report-callout--danger  { background:#F9ECE8; border-color:#DFA08F; border-left-color:#A63A24; color:#7C2B1B; }
.report-doc .report-callout--info    { background:#E9F1FA; border-color:#A8C4E4; border-left-color:#2F6DB5; color:#24527E; }
.report-doc .report-plain { border-radius:10px; padding:14px 16px; background:#EAF3EC; border:1px solid #BFD8C6; border-left:4px solid #3E7C57; color:#22402F; }
.report-doc .report-muted { color:#5A6B60; }

/* measure_trend (W1.7) — small multiples: label + value, a mark, a worded delta.
   Rows avoid page breaks so a measure never splits across a PDF page. */
.report-doc ul.report-measures { list-style:none; margin:0 0 14px; padding:0;
  display:grid; grid-template-columns:1fr 1fr; gap:10px 16px; }
.report-doc .report-measure { break-inside:avoid; page-break-inside:avoid;
  border:1px solid #DCE5DD; border-radius:10px; padding:10px 12px; background:#FCFDFC; }
.report-doc .report-measure-head { display:flex; align-items:baseline; gap:8px; }
.report-doc .report-measure-label { font-size:12px; font-weight:600; color:#5A6B60;
  letter-spacing:.02em; }
.report-doc .report-measure-value { margin-left:auto; font-family:var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace;
  font-size:16px; font-weight:600; color:#1F2A24; font-variant-numeric:tabular-nums; }
.report-doc .report-measure-plot { margin:6px 0 4px; min-height:26px; }
.report-doc .report-measure-single { font-size:11px; color:#5A6B60; }
.report-doc .report-measure-delta { font-size:11.5px; font-weight:600; }
.report-doc table.report-measures-table { font-size:12px; }

/* timeline (W1.5/W1.6) */
.report-doc .report-timeline-group { margin:0 0 14px; break-inside:avoid; page-break-inside:avoid; }
.report-doc .report-timeline-month { font-family:var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace; font-size:11px;
  font-weight:500; letter-spacing:.08em; text-transform:uppercase; color:#5A6B60;
  margin:0 0 6px; padding-bottom:4px; border-bottom:1px solid #DCE5DD; }
.report-doc ol.report-timeline-list { list-style:none; margin:0; padding:0; }
.report-doc .report-timeline-item { display:flex; gap:10px; padding:5px 0;
  break-inside:avoid; page-break-inside:avoid; }
.report-doc .report-timeline-kind { flex:0 0 84px; font-family:var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace;
  font-size:10px; font-weight:500; letter-spacing:.06em; text-transform:uppercase;
  color:#5A6B60; padding-top:2px; }
.report-doc .report-timeline-body { display:block; }
.report-doc .report-timeline-title { display:inline; font-size:14px; color:#1F2A24; }
.report-doc .report-timeline-date { font-family:var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace; font-size:11px;
  color:#5A6B60; margin-left:8px; }
.report-doc .report-timeline-detail { display:block; font-size:12px; color:#5A6B60; margin-top:1px; }

/* comparison (W1.7) */
.report-doc .report-compare-label { text-align:left; font-weight:600; color:#5A6B60;
  background:#F5F8F5; }
`;

// PDF-only chrome: the branded header band + page setup. Combined with REPORT_CSS.
export const PDF_CSS = `
/* A clinical document that gets printed and filed needs to survive being
   separated from its first page. */
@page {
  size:A4;
  margin:16mm 14mm 18mm;
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-family: ui-monospace, monospace;
    font-size: 9pt;
    color: #5A6B60;
  }
}
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; }
.pdf-header { display:flex; align-items:center; gap:12px; padding-bottom:12px;
  margin-bottom:18px; border-bottom:2px solid #1E6B4E; }
.pdf-header img { height:34px; width:auto; }
.pdf-header .pdf-brand { font-family:var(--font-brand-data, "IBM Plex Mono"), ui-monospace, monospace; font-size:11px; letter-spacing:.08em;
  text-transform:uppercase; color:#5A6B60; margin-left:auto; }
`;
