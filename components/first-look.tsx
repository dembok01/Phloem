"use client";

// Client half of the first-look tier — see lib/first-look.ts for the rule.
//
// `html[data-look]` has three states:
//   "first" — this route has not been seen this session: the CSS choreography in
//             globals.css (.fl-rise, .fl-stagger, .fl-draw, .fl-reveal-x …) plays.
//   "again" — seen before: content arrives with a 180ms settle, nothing more.
//   "done"  — the first look has finished; set a few seconds later so a refresh
//             of the same page (a server action, router.refresh) never replays it.
//
// Every caller funnels through `decide(pathname)`, which is idempotent per
// pathname. That matters because React runs layout effects child-first: a
// <CountUp> deep in a page asks before the <PageEnter> that wraps it does, and
// both must get the same answer.
import * as React from "react";
import { usePathname } from "next/navigation";
import { lookKey, type Look } from "@/lib/first-look";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    __phloemLook?: { key: string; look: Look } | null;
  }
}

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Long enough for the slowest choreography (the 700ms ring + delays) to finish. */
const SETTLE_MS = 4000;

let current: { path: string; look: Look } | null = null;
/** The pathname whose look the boot script decided (a hard load), until we leave it. */
let bootPath: string | null = null;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * True while we are still on the page a hard load painted. Its first frame was
 * decided and animated by CSS before React existed, so JS must not animate it
 * again. Keyed to the route, not a page-wide flag: a hard load of /login followed
 * by sign-in lands on /admin by client navigation, and /admin must still get its
 * own arrival.
 */
function isBoot(pathname: string): boolean {
  if (bootPath === pathname) return true;
  const boot = window.__phloemLook;
  return Boolean(boot && boot.key === lookKey(pathname));
}

function decide(pathname: string): Look {
  if (current && current.path === pathname) return current.look;
  const root = document.documentElement;
  const key = lookKey(pathname);
  let look: Look;
  const boot = window.__phloemLook;
  if (boot && boot.key === key) {
    // The boot script already decided this page before first paint.
    look = boot.look;
    bootPath = pathname;
  } else {
    let seen = true;
    try {
      seen = window.sessionStorage.getItem(key) !== null;
      if (!seen) window.sessionStorage.setItem(key, "1");
    } catch {
      seen = true; // no storage → treat as seen → no animation
    }
    look = seen ? "again" : "first";
    bootPath = null;
    // A stale boot marker (left by a hard-loaded sign-in page) would make the CSS
    // page fade run on top of the JS one below.
    root.removeAttribute("data-boot");
    root.setAttribute("data-look", look);
  }
  window.__phloemLook = null;
  clearTimeout(settleTimer);
  if (look === "first") {
    settleTimer = setTimeout(() => {
      if (current?.path === pathname) {
        root.setAttribute("data-look", "done");
        current = { path: pathname, look: "again" };
      }
    }, SETTLE_MS);
  }
  current = { path: pathname, look };
  return look;
}

/** Reduced motion or elderly mode: JS-driven motion must opt out by hand, because
 * the global CSS guards cannot reach WAAPI or rAF (see use-calm-motion.ts). */
function calm(): boolean {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("elderly")
  );
}

/**
 * Wraps the content of a page (below the shell and the tab rail, which must stay
 * put) and gives each navigation its arrival:
 *   · hard load — CSS already handled it before paint; nothing to do here.
 *   · first look — a 300ms fade of the whole page under the .fl-* choreography.
 *   · again — the content settles: 180ms fade with a 4px rise.
 *
 * `except` lets the app-wide instance stand aside for sections that mount their
 * own PageEnter under their tab rail, so a page is never wrapped twice.
 */
export function PageEnter({
  children,
  className,
  except,
}: {
  children: React.ReactNode;
  className?: string;
  except?: string[];
}) {
  const pathname = usePathname();
  const ref = React.useRef<HTMLDivElement>(null);
  const inert = except?.some((p) => pathname === p || pathname.startsWith(p + "/")) ?? false;

  React.useLayoutEffect(() => {
    const boot = isBoot(pathname);
    const look = decide(pathname);
    if (boot) {
      // Leave the CSS page fade time to finish before dropping the marker.
      const id = setTimeout(() => document.documentElement.removeAttribute("data-boot"), 600);
      return () => clearTimeout(id);
    }
    const el = ref.current;
    if (inert || !el || calm()) return;
    el.animate(
      look === "first"
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(4px)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: look === "first" ? 300 : 180, easing: EASE_OUT },
    );
  }, [pathname, inert]);

  if (inert) return <>{children}</>;
  return (
    <div ref={ref} className={cn("page-root", className)}>
      {children}
    </div>
  );
}

const fmt = new Intl.NumberFormat("en-IN");

/**
 * An OPERATIONAL count that rises from zero on a page's first look — members in
 * care, consultations this week, actions left today.
 *
 * NEVER use this for a clinical value (blood pressure, weight, WHO-5, adherence):
 * a number in motion can be misread, and a clinician must never see a wrong
 * reading even for 600ms. Those render as plain text, always.
 *
 * The final value is server-rendered, so with no JS — or on a hard load, where the
 * number is already on screen before hydration — it simply shows. The count runs
 * only on client navigations, where the layout effect sets "0" before the first
 * paint, so the final figure never flashes first.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const pathname = usePathname();
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || isBoot(pathname)) return;
    if (decide(pathname) !== "first" || calm()) return;
    let raf = 0;
    const start = performance.now();
    const duration = 600;
    el.textContent = "0";
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4); // ease-out quart
      el.textContent = fmt.format(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = fmt.format(value);
    };
    // Mount only: a later change of `value` (a refresh) just shows the new figure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {fmt.format(value)}
    </span>
  );
}
