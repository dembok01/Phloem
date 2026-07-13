/** Quick single-page screenshot helper: npx tsx scripts/shot-one.ts <url-path> <outfile> [email] [width] */
import puppeteer from "puppeteer-core";
import { config as dotenv } from "dotenv";
import path from "node:path";
dotenv({ path: path.resolve(process.cwd(), ".env.local") });
const [, , urlPath = "/login", out = "shot.png", email = "", width = "1440"] = process.argv;
async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true, timeout: 120000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: Number(width), height: 900 });
  if (email) {
    const pw = email === (process.env.SEED_ADMIN_EMAIL ?? "") ? process.env.SEED_ADMIN_PASSWORD! : "test12345!";
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2", timeout: 60000 });
    await page.type("#email", email); await page.type("#password", pw);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), page.click('button[type="submit"]')]);
  }
  await page.goto(`http://localhost:3000${urlPath}`, { waitUntil: "networkidle2", timeout: 60000 });
  try { await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 }); } catch {}
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: out as `${string}.png`, fullPage: true });
  await browser.close();
  console.log("saved", out);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
