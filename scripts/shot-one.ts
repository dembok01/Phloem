/** Quick single-page screenshot helper: npx tsx scripts/shot-one.ts <url-path> <outfile> [email] [width]
 *
 * Login waits for the URL to LEAVE /login rather than racing a waitForNavigation
 * against the submit: the login form posts a server action, which does not always
 * surface as a classic navigation, and the old race silently produced screenshots
 * of the login page instead of the requested route.
 */
import puppeteer from "puppeteer-core";
import { config as dotenv } from "dotenv";
import path from "node:path";
dotenv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
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
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2", timeout: 90000 });
    await page.type("#email", email);
    await page.type("#password", pw);
    await page.click('button[type="submit"]');
    await page
      .waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 90000 })
      .catch(() => {
        throw new Error(`login failed for ${email} — still on /login (check credentials or network)`);
      });
  }
  await page.goto(`http://localhost:3000${urlPath}`, { waitUntil: "networkidle2", timeout: 90000 });
  try { await page.waitForNetworkIdle({ idleTime: 400, timeout: 10000 }); } catch {}
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: out as `${string}.png`, fullPage: true });
  await browser.close();
  console.log("saved", out);
}
main().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });
