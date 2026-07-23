"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; exact?: boolean };

/** Horizontal section sub-nav with active-link highlighting (§10 shells).
 * `exact` items (typically the index tab) match only their own path, not children.
 * Pill-style active state; scrolls horizontally on small screens instead of wrapping. */
export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Section"
    >
      <div className="flex w-max gap-1 rounded-full border bg-card p-1 shadow-card">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + "?") ||
            (!item.exact && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
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
