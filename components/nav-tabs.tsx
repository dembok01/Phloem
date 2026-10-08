"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { TAB_FACE, TAB_TRACK, tabClass } from "@/components/tab-styles";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; exact?: boolean };

type Pill = { x: number; y: number; w: number; h: number };

/** Horizontal section sub-nav with active-link highlighting (§10 shells).
 * `exact` items (typically the index tab) match only their own path, not children.
 * Segmented-control look; scrolls horizontally on small screens instead of wrapping. */
export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const activeRef = React.useRef<HTMLAnchorElement>(null);
  // The raised face is ONE pill that glides to the new tab (it lives in the
  // layout, so it survives the navigation), and a tab change reads as movement
  // along the rail rather than a jump. Until it has measured — first paint,
  // before hydration — the active tab paints its own face, so nothing is ever
  // unmarked. The first placement is instant; only later moves glide.
  const [pill, setPill] = React.useState<Pill | null>(null);
  const [glide, setGlide] = React.useState(false);

  React.useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const el = activeRef.current;
      setPill(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    measure();
    // A tab's spinner or a late web font changes widths under the pill.
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    const raf = requestAnimationFrame(() => setGlide(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  // On a phone the rail scrolls sideways; land with the current tab in view.
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav
      className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Section"
    >
      <div ref={trackRef} className={cn("relative flex w-max gap-1 rounded-full", TAB_TRACK)}>
        {pill ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 left-0 rounded-full",
              TAB_FACE,
              glide && "transition-[translate,width] duration-(--motion-pop) ease-in-out",
            )}
            style={{ width: pill.w, height: pill.h, translate: `${pill.x}px ${pill.y}px` }}
          />
        ) : null}
        {items.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + "?") ||
            (!item.exact && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              ref={active ? activeRef : undefined}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={tabClass(active, undefined, { face: !pill })}
            >
              <TabLabel label={item.label} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Renders the tab label with a spinner while its own navigation is in flight
 * (useLinkStatus is scoped to the nearest parent Link). */
function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
    </span>
  );
}
