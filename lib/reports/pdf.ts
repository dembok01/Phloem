// Server-only: HTML → PDF via a headless Chromium (§2). Serverless/prod uses
// @sparticuz/chromium; local dev uses an installed Chrome/Chromium (system Chrome
// or PUPPETEER_EXECUTABLE_PATH) — avoids bundling a browser download.
import "server-only";
import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";

const LOCAL_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter((p): p is string => !!p);

function isServerless(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL ||
    process.env.CHROMIUM_SERVERLESS === "1"
  );
}

async function launch(): Promise<Browser> {
  if (isServerless()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const executablePath = LOCAL_CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    throw new Error("no_local_chrome: set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium binary");
  }
  return puppeteer.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#9ca3af;padding:0 14mm;text-align:right;">' +
        'Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
