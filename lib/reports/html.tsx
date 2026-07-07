// Server-only: assemble the full HTML document for the PDF from the SAME
// ReportView component used by the web view (§8). Inlines REPORT_CSS + PDF_CSS
// and the PHLOEM logo as a data URI so puppeteer never needs a network fetch.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ReportView } from "@/components/reports/ReportView";
import { PDF_CSS, REPORT_CSS } from "./styles";
import type { ReportContent } from "./types";

let logoCache: string | null = null;

async function logoDataUri(): Promise<string> {
  if (logoCache !== null) return logoCache;
  try {
    const file = await readFile(path.join(process.cwd(), "public", "phloem-logo.png"));
    logoCache = `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    logoCache = "";
  }
  return logoCache;
}

export async function reportHtml(content: ReportContent): Promise<string> {
  // Dynamic import: a static `import ... from "react-dom/server"` is rejected by
  // the App Router bundler. Importing it lazily inside this server-only helper
  // keeps the SAME <ReportView> for web + PDF (§8) without tripping that rule.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(<ReportView content={content} />);
  const logo = await logoDataUri();
  const brand = logo
    ? `<img src="${logo}" alt="PHLOEM" />`
    : `<strong style="font-size:20px;color:#0f766e;">PHLOEM</strong>`;
  const header = `<div class="pdf-header">${brand}<span class="pdf-brand">Chronic-Care Program</span></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><style>${REPORT_CSS}${PDF_CSS}</style></head><body>${header}${body}</body></html>`;
}
