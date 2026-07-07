// One source of truth for report styling, shared by the web view (injected via a
// <style> tag) and the PDF HTML (inlined). Semantic class names (report-*) so the
// SAME ReportView component renders identically in both — no Tailwind dependency
// inside the puppeteer document. Base font ≥16px per §11.

export const REPORT_CSS = `
.report-doc { color:#111827; font-size:16px; line-height:1.55;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.report-doc .report-title { font-size:24px; font-weight:700; margin:0 0 4px; color:#0f172a; }
.report-doc .report-meta { font-size:13px; color:#6b7280; margin:0 0 20px; }
.report-doc .report-section { margin:0 0 22px; break-inside:avoid; }
.report-doc .report-section > h2 { font-size:16px; font-weight:700; color:#0f766e;
  text-transform:uppercase; letter-spacing:.04em; margin:0 0 10px; padding-bottom:6px;
  border-bottom:1px solid #e5e7eb; }
.report-doc dl.report-kv { display:grid; grid-template-columns:minmax(180px,34%) 1fr;
  gap:6px 16px; margin:0; }
.report-doc dl.report-kv dt { font-weight:600; color:#374151; }
.report-doc dl.report-kv dd { margin:0; color:#111827; white-space:pre-wrap; }
.report-doc table.report-table { width:100%; border-collapse:collapse; font-size:15px; }
.report-doc table.report-table th { text-align:left; background:#f3f4f6; color:#374151;
  font-weight:600; padding:8px 10px; border:1px solid #e5e7eb; }
.report-doc table.report-table td { padding:8px 10px; border:1px solid #e5e7eb; vertical-align:top; }
.report-doc ul.report-list { margin:0; padding-left:20px; }
.report-doc ul.report-list li { margin:2px 0; }
.report-doc .report-text { margin:0; white-space:pre-wrap; }
.report-doc .report-callout { border-radius:10px; padding:14px 16px; border:1px solid; }
.report-doc .report-callout .report-callout-lead { font-weight:600; margin:0 0 8px; }
.report-doc .report-callout ul { margin:0; padding-left:20px; }
.report-doc .report-callout--warning { background:#fffbeb; border-color:#fcd34d; color:#92400e; }
.report-doc .report-callout--danger  { background:#fef2f2; border-color:#fca5a5; color:#991b1b; }
.report-doc .report-callout--info    { background:#eff6ff; border-color:#bfdbfe; color:#1e40af; }
`;

// PDF-only chrome: the branded header band + page setup. Combined with REPORT_CSS.
export const PDF_CSS = `
@page { size:A4; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; }
.pdf-header { display:flex; align-items:center; gap:12px; padding-bottom:12px;
  margin-bottom:18px; border-bottom:2px solid #0f766e; }
.pdf-header img { height:34px; width:auto; }
.pdf-header .pdf-brand { font-size:13px; color:#6b7280; margin-left:auto; }
`;
