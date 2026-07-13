/**
 * Design-audit screenshot runner. Walks every role with the seeded accounts and
 * screenshots every screen at desktop (1440×900) and mobile (390×844) widths.
 *
 *   npx tsx scripts/design-audit.ts design-audit/before [--flow]
 *
 * --flow additionally drives the one-time interactive flows (invite accept →
 * video gate → onboarding wizard first steps). Run it once for the "before"
 * pass; afterwards the invite is burned and the flow shots are skipped.
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { config as dotenv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv({ path: path.resolve(process.cwd(), ".env.local") });

const BASE = "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.argv[2] ?? "design-audit/before";
const RUN_FLOW = process.argv.includes("--flow");
const PASSWORD = "test12345!";

const MEERA = "11111111-1111-4111-8111-111111111111";
const RAJAN = "22222222-2222-4222-8222-222222222222";
const GOPALAN = "f28b3de7-c4be-4ef1-970f-7a2dc38b41ee";
const INVITE_TOKEN = "09edd1d1-31dd-4b06-bd06-52d53d0d569e";
const REPORT_DOCTOR = "8afea987-7368-4d63-a60e-61ed7d0532d9";
const REPORT_NUTRITION = "dcbba5c4-374b-4cf9-8b55-6face45fc0ff";
const REPORT_WELLBEING = "aaf33d6e-1971-4d0c-b76b-a7a9fbe5a9cd";
const REPORT_SUMMARY = "55555555-5555-4555-8555-555555555555";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type Shot = { slug: string; url: string };
type Session = { name: string; email: string | null; shots: Shot[] };

const SESSIONS: Session[] = [
  {
    name: "public",
    email: null,
    shots: [
      { slug: "login", url: "/login" },
      ...(RUN_FLOW ? [{ slug: "invite-accept", url: `/invite/${INVITE_TOKEN}` }] : []),
    ],
  },
  {
    name: "admin",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@phloem.local",
    shots: [
      { slug: "overview", url: "/admin" },
      { slug: "members", url: "/admin/members" },
      { slug: "member-new", url: "/admin/members/new" },
      { slug: "member-active", url: `/admin/members/${MEERA}` },
      { slug: "member-invited", url: `/admin/members/${GOPALAN}` },
      { slug: "care-team", url: "/admin/care-team" },
      { slug: "invites", url: "/admin/invites" },
      { slug: "audit", url: "/admin/audit" },
      { slug: "notifications", url: "/notifications" },
      { slug: "report-doctor", url: `/reports/${REPORT_DOCTOR}` },
      { slug: "report-wellbeing", url: `/reports/${REPORT_WELLBEING}` },
    ],
  },
  {
    name: "coordinator",
    email: "coordinator@phloem.local",
    shots: [
      { slug: "today", url: "/coordinator" },
      { slug: "pipeline", url: "/coordinator/pipeline" },
      { slug: "member-active", url: `/coordinator/members/${MEERA}` },
      { slug: "member-to-assign", url: `/coordinator/members/${RAJAN}` },
      { slug: "notifications", url: "/notifications" },
    ],
  },
  {
    name: "doctor",
    email: "doctor@phloem.local",
    shots: [
      { slug: "clients", url: "/clinician/clients" },
      { slug: "client-overview", url: `/clinician/clients/${MEERA}?tab=overview` },
      { slug: "client-onboarding", url: `/clinician/clients/${MEERA}?tab=onboarding` },
      { slug: "client-form", url: `/clinician/clients/${MEERA}?tab=form` },
      { slug: "client-reports", url: `/clinician/clients/${MEERA}?tab=reports` },
    ],
  },
  {
    name: "nutritionist",
    email: "nutritionist@phloem.local",
    shots: [
      { slug: "clients", url: "/clinician/clients" },
      { slug: "client-overview", url: `/clinician/clients/${MEERA}?tab=overview` },
      { slug: "client-onboarding-diet", url: `/clinician/clients/${MEERA}?tab=onboarding` },
      { slug: "client-directives", url: `/clinician/clients/${MEERA}?tab=directives` },
      { slug: "client-form", url: `/clinician/clients/${MEERA}?tab=form` },
      { slug: "client-feedback", url: `/clinician/clients/${MEERA}?tab=feedback` },
    ],
  },
  {
    name: "trainer",
    email: "trainer@phloem.local",
    shots: [
      { slug: "clients", url: "/clinician/clients" },
      { slug: "client-clearance", url: `/clinician/clients/${MEERA}?tab=clearance` },
      { slug: "client-form", url: `/clinician/clients/${MEERA}?tab=form` },
    ],
  },
  {
    name: "psychologist",
    email: "psychologist@phloem.local",
    shots: [
      { slug: "clients", url: "/clinician/clients" },
      { slug: "client-context", url: `/clinician/clients/${MEERA}?tab=context` },
      { slug: "client-form", url: `/clinician/clients/${MEERA}?tab=form` },
      { slug: "client-reports", url: `/clinician/clients/${MEERA}?tab=reports` },
    ],
  },
  {
    name: "caregiver",
    email: "caregiver@phloem.local",
    shots: [
      { slug: "home", url: "/portal" },
      { slug: "plans", url: `/portal/members/${MEERA}/plans` },
      { slug: "reports", url: `/portal/members/${MEERA}/reports` },
      { slug: "schedule", url: `/portal/members/${MEERA}/schedule` },
      { slug: "notifications", url: "/notifications" },
      { slug: "report-nutrition", url: `/reports/${REPORT_NUTRITION}` },
      { slug: "report-summary", url: `/reports/${REPORT_SUMMARY}` },
    ],
  },
  {
    name: "elderly",
    email: "elder@phloem.local",
    shots: [
      { slug: "home", url: "/portal" },
      { slug: "plans", url: `/portal/members/${MEERA}/plans` },
      { slug: "schedule", url: `/portal/members/${MEERA}/schedule` },
    ],
  },
];

async function settle(page: Page) {
  try {
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 });
  } catch {
    /* keep going — screenshot whatever is there */
  }
  await new Promise((r) => setTimeout(r, 250));
}

async function shoot(page: Page, slug: string) {
  await page.setViewport(DESKTOP);
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${slug}.png`) as `${string}.png`, fullPage: true });
  await page.setViewport(MOBILE);
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: path.join(OUT, `${slug}--mobile.png`) as `${string}.png`, fullPage: true });
  await page.setViewport(DESKTOP);
  console.log(`  ✓ ${slug}`);
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", email);
  await page.type("#password", email === (process.env.SEED_ADMIN_EMAIL ?? "") ? process.env.SEED_ADMIN_PASSWORD! : PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function inviteFlow(browser: Browser) {
  console.log("session: invite flow (gopalan caregiver)");
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(DESKTOP);
  try {
    await page.goto(`${BASE}/invite/${INVITE_TOKEN}`, { waitUntil: "networkidle2" });
    const usable = await page.$("#full_name");
    if (!usable) {
      console.log("  invite already used — skipping flow");
      return;
    }
    await page.type("#full_name", "Suresh Gopalan");
    await page.type("#password", PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    await shoot(page, "flow-01-after-accept");

    // Portal home → start onboarding (video gate first)
    await page.goto(`${BASE}/portal`, { waitUntil: "networkidle2" });
    await shoot(page, "flow-02-portal-pre-onboarding");
    await page.goto(`${BASE}/portal/onboarding/${GOPALAN}`, { waitUntil: "networkidle2" });
    await shoot(page, "flow-03-video-gate");

    // Mark video watched if the gate is present
    const watched = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.find((b) => /watched/i.test(b.textContent ?? "")) ?? null;
    });
    const el = watched.asElement();
    if (el) {
      await (el as unknown as { click(): Promise<void> }).click();
      await settle(page);
      await shoot(page, "flow-04-wizard-step1");
      // Fill the first text/number inputs, advance one step to trigger autosave
      await page.evaluate(() => {
        const set = (sel: string, val: string) => {
          const i = document.querySelector<HTMLInputElement>(sel);
          if (!i) return;
          const proto = Object.getPrototypeOf(i);
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          desc?.set?.call(i, val);
          i.dispatchEvent(new Event("input", { bubbles: true }));
        };
        set('input[type="text"]', "K. V. Gopalan");
        set('input[type="number"]', "76");
      });
      await new Promise((r) => setTimeout(r, 1600)); // let the debounced autosave fire
      await shoot(page, "flow-05-wizard-filled-saved");
      const next = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        return btns.find((b) => /^next$/i.test((b.textContent ?? "").trim())) ?? null;
      });
      const nextEl = next.asElement();
      if (nextEl) {
        await (nextEl as unknown as { click(): Promise<void> }).click();
        await settle(page);
        await shoot(page, "flow-06-wizard-step2");
      }
    }
  } catch (e) {
    console.log(`  flow error (continuing): ${(e as Error).message}`);
  } finally {
    await ctx.close();
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    timeout: 120000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  for (const session of SESSIONS) {
    console.log(`session: ${session.name}`);
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(DESKTOP);
    try {
      if (session.email) await login(page, session.email);
      for (const s of session.shots) {
        try {
          await page.goto(`${BASE}${s.url}`, { waitUntil: "networkidle2", timeout: 20000 });
          await shoot(page, `${session.name}--${s.slug}`);
        } catch (e) {
          console.log(`  ✗ ${s.slug}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      console.log(`  session failed: ${(e as Error).message}`);
    } finally {
      await ctx.close();
    }
  }

  if (RUN_FLOW) await inviteFlow(browser);
  await browser.close();
  console.log(`done → ${OUT}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
