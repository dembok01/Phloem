import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/** Consistent page header: optional breadcrumbs, display-face title, one-line
 * description, and an actions slot pinned to the right (C1).
 *
 * V1/M9 — the title now uses the documented display scale. It was capped at
 * `text-3xl` (30px) while DESIGN-SYSTEM.md specifies steps up to 44, which is a
 * large part of why no screen had a focal point: the biggest thing on the page was
 * barely larger than the body text. `eyebrow` and `stats` are additive slots for
 * the hero treatment (M3); every existing call site renders as before, only
 * bigger. */
export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  eyebrow,
  stats,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  /** small mono label above the title — names the surface */
  eyebrow?: React.ReactNode;
  /** a strip of at-a-glance figures under the description */
  stats?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 space-y-1">
        {crumbs && crumbs.length > 0 ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
                  {c.href ? (
                    <Link href={c.href} className="rounded-sm hover:text-foreground hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-foreground">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[17px] text-muted-foreground">{description}</p>
        ) : null}
        {stats ? <div className="pt-2">{stats}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
