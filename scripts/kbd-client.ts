/**
 * Portal Elevation phase-5 keyboard/interaction verification for the CLIENT
 * surfaces — the counterpart to kbd-test.ts, which covers coordinator and
 * clinician. Prints machine-checkable assertions.
 *
 *   npx tsx scripts/kbd-client.ts        (needs `npm run dev` on :3000)
 *
 * Three things are asserted per the elevation acceptance gate:
 *   1. focus stays visible on every client route (the 2px Phloem ring),
 *   2. the portal home's staggered tiles never block interaction — a group
 *      entrance that swallows a tap is worse than no animation at all,
 *   3. the new error/not-found boundaries actually render their designed copy
 *      rather than a framework default.
 */
import puppeteer, { type Page } from "puppeteer-core";
import { config as dotenv } from "dotenv";
import path from "node:path";
dotenv({ path: path.resolve(process.cwd(), ".env.local") });

const BASE = "http://localhost:3000";
const NAV = 240000; // cold turbopack compiles are slow on this machine
const MEERA = "11111111-1111-4111-8111-111111111111";

let failures = 0;
function assert(name: string, ok: boolean, detail: unknown = "") {
  if (!ok) failures++;
  console.log(`ASSERT ${name}: ${ok ? "PASS" : "FAIL"}`, detail === "" ? "" : JSON.stringify(detail));
}

async function login(p: Page, email: string) {
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: NAV });
  await p.type("#email", email);
  await p.type("#password", "test12345!");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle2", timeout: NAV }),
    p.click('button[type="submit"]'),
  ]);
  // Without this every later assertion silently probes the sign-in page instead
  // of the route it names — some of which then "PASS" on the sign-in form's own
  // inputs. A false PASS is worse than a FAIL.
  if (new URL(p.url()).pathname.startsWith("/login")) {
    throw new Error(
      `sign-in failed for ${email} — still on /login. Seeded client fixtures are ` +
        `opt-in since e82c783; this suite needs a caregiver account that exists.`,
    );
  }
}

/** Tab `n` times and report whether the focused element shows a real ring. */
async function focusRing(p: Page, n = 4) {
  for (let i = 0; i < n; i++) await p.keyboard.press("Tab");
  return (await p.evaluate(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const visible =
      (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none';
    return { tag: el.tagName, visible, outline: cs.outlineWidth + ' ' + cs.outlineStyle };
  })()`)) as { tag: string; visible: boolean; outline: string } | null;
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

  // --- Public doors ---
  for (const [slug, url] of [
    ["login", "/login"],
    ["invite-expired", "/invite/6bdcc722-0517-4e93-8b1c-f8a5acb8bd62"],
  ] as const) {
    await p.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: NAV });
    // One Tab: these pages have few focusables, and tabbing past the last one
    // hands focus to browser chrome and reports a false FAIL.
    const f = await focusRing(p, 1);
    assert(`focus-visible/${slug}`, f?.visible === true, f);
  }

  await login(p, "caregiver@phloem.local");

  // --- Focus visibility across every client route ---
  const ROUTES: [string, string][] = [
    ["portal-home", "/portal"],
    ["plans", `/portal/members/${MEERA}/plans`],
    ["reports", `/portal/members/${MEERA}/reports`],
    ["schedule", `/portal/members/${MEERA}/schedule`],
    ["documents", `/portal/members/${MEERA}/documents`],
    ["notifications", "/notifications"],
  ];
  for (const [slug, url] of ROUTES) {
    await p.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: NAV });
    const f = await focusRing(p, 4);
    assert(`focus-visible/${slug}`, f?.visible === true, f);
  }

  // --- The stagger must never swallow a tap ---
  // Reload and hit-test a staggered tile immediately, i.e. while it is still
  // animating in. elementFromPoint must resolve to the link, and the link must
  // not be pointer-events:none or offset from where it appears.
  await p.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: NAV });
  const hit = (await p.evaluate(`(() => {
    const tile = document.querySelector('.stagger-in > a:last-child');
    if (!tile) return { found: false };
    const r = tile.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      found: true,
      hittable: !!at && (at === tile || tile.contains(at)),
      pointerEvents: getComputedStyle(tile).pointerEvents,
      animation: getComputedStyle(tile).animationName,
    };
  })()`)) as { found: boolean; hittable?: boolean; pointerEvents?: string; animation?: string };
  assert("stagger-does-not-block-interaction", hit.found === true && hit.hittable === true, hit);

  // --- Designed boundaries, not framework defaults ---
  await p.goto(`${BASE}/portal/no-such-page`, { waitUntil: "networkidle2", timeout: NAV });
  const nf = await p.evaluate(`document.body.innerText`);
  assert(
    "portal-not-found-renders-designed-copy",
    /couldn.t find that page/i.test(String(nf)) && /portal home/i.test(String(nf)),
    String(nf).slice(0, 90),
  );

  await b.close();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
