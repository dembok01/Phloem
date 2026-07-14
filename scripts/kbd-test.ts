/** Phase D keyboard-only verification: focus visibility + ⌘K palette (coordinator)
 * and Tab-into-form-rail (clinician). Prints machine-checkable assertions. */
import puppeteer, { type Page } from "puppeteer-core";
import { config as dotenv } from "dotenv";
import path from "node:path";
dotenv({ path: path.resolve(process.cwd(), ".env.local") });

const OUT = "/tmp";

const NAV = 240000; // cold turbopack compiles are slow on this machine

async function login(p: Page, email: string) {
  await p.goto("http://localhost:3000/login", { waitUntil: "networkidle2", timeout: NAV });
  await p.type("#email", email);
  await p.type("#password", "test12345!");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle2", timeout: NAV }),
    p.click('button[type="submit"]'),
  ]);
}

async function main() {
  const b = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    timeout: 120000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });

  // --- Coordinator: focus visibility ---
  await login(p, "coordinator@phloem.local");
  await p.goto("http://localhost:3000/coordinator/pipeline", { waitUntil: "networkidle2", timeout: 240000 });
  for (let i = 0; i < 5; i++) await p.keyboard.press("Tab");
  const focus = (await p.evaluate(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none';
    return { tag: el.tagName, visibleFocusRing: visible, outline: cs.outlineWidth + ' ' + cs.outlineStyle };
  })()`)) as { tag: string; visibleFocusRing: boolean; outline: string } | null;
  console.log("ASSERT focus-visible-on-tab:", focus?.visibleFocusRing === true ? "PASS" : "FAIL", JSON.stringify(focus));
  await p.screenshot({ path: `${OUT}/kbd-focus.png` });

  // --- Coordinator: ⌘K palette open → type → arrow → enter navigates ---
  await p.keyboard.down("Meta");
  await p.keyboard.press("k");
  await p.keyboard.up("Meta");
  await new Promise((r) => setTimeout(r, 700));
  const open = (await p.evaluate(`!!document.querySelector('[aria-label="Command palette"]')`)) as boolean;
  console.log("ASSERT cmdk-opens:", open ? "PASS" : "FAIL");
  await p.keyboard.type("meera");
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: `${OUT}/kbd-palette.png` });
  const before = p.url();
  await p.keyboard.press("Enter");
  try {
    await p.waitForNavigation({ waitUntil: "networkidle2", timeout: 240000 });
  } catch {}
  const navigated = p.url() !== before && /\/coordinator\/members\//.test(p.url());
  console.log("ASSERT cmdk-enter-navigates:", navigated ? "PASS" : "FAIL", p.url());

  // --- Clinician: Tab reaches the form section rail (fresh context: the
  // coordinator session above would redirect /login away from an auth'd user). ---
  const ctx = await b.createBrowserContext();
  const cp = await ctx.newPage();
  await cp.setViewport({ width: 1440, height: 900 });
  await login(cp, "doctor@phloem.local");
  await cp.goto("http://localhost:3000/clinician/clients/22222222-2222-4222-8222-222222222222?tab=form", {
    waitUntil: "networkidle2",
    timeout: 240000,
  });
  let reachedRail = false;
  for (let i = 0; i < 15; i++) {
    await cp.keyboard.press("Tab");
    const href = (await cp.evaluate(`(document.activeElement && document.activeElement.getAttribute('href')) || ''`)) as string;
    if (href.startsWith("#sec-")) {
      reachedRail = true;
      break;
    }
  }
  console.log("ASSERT clinician-form-rail-focusable:", reachedRail ? "PASS" : "FAIL");

  await b.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
