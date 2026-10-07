import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// V1/M1 — the inset list. The keystone of the elevation plan.
//
// Before this, every queue in the product was N separate bordered white cards:
// seven identical objects with identical weight, and no way for the eye to find
// anything. This renders one recessed panel with hairline dividers instead, which
// kills the wall of sameness, raises density ~40% (78px rows → 56px), and lets a
// severity rail run down the edge of a row where a whole extra card used to be.
//
// It also fixes the inverted hierarchy (M2): a queue repeats its VERB and varies
// its NAME, so the name is the dominant token and the verb becomes a small mono
// eyebrow above it. You scan names, not seven copies of "Schedule the…".
//
// One component, because these rules should never drift between surfaces.

const RAIL: Record<string, string> = {
  danger: "before:bg-danger",
  warning: "before:bg-warning",
  info: "before:bg-info",
  success: "before:bg-success",
  none: "",
};

export type ListTone = keyof typeof RAIL;

/** Recessed container. Put it inside a Card (or use it bare on the canvas). */
export function List({
  children,
  className,
  stagger = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** entrance for the rows; off for lists that re-render often */
  stagger?: boolean;
}) {
  return (
    <ul
      className={cn(
        "divide-y divide-border/70 overflow-hidden rounded-xl bg-muted/35 ring-1 ring-foreground/[0.04]",
        stagger && "stagger-in",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/**
 * One row. `title` is the dominant token; `eyebrow` is the small mono label above
 * it; `meta` sits right-aligned in the data face so digits line up between rows.
 *
 * `action` stays visible. An earlier pass hid it until hover, which made the
 * queue's primary control undiscoverable — the "seven shouting buttons" defect
 * (D3) is solved by the recessed ground and the hierarchy, not by hiding the
 * thing the row exists to do.
 *
 * A row with `href` always shows its chevron, and the chevron nudges on hover:
 * that is the signal that the row opens. With `href` AND `action` the row still
 * opens — the title is the real link, stretched over the row, and the action
 * sits above it — so a row never has to choose between "opens" and "does".
 * (A button inside an <a> is invalid HTML, which is why this is not one Link.)
 */
export function ListRow({
  href,
  leading,
  eyebrow,
  title,
  detail,
  meta,
  action,
  tone = "none",
  chips,
  className,
}: {
  href?: string;
  leading?: React.ReactNode;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  tone?: ListTone;
  chips?: React.ReactNode;
  className?: string;
}) {
  const stretched = Boolean(href && action);

  const titleNode = stretched ? (
    <Link
      href={href!}
      // The ::after covers the whole row, so a click anywhere opens it; the
      // focus ring is drawn on that cover, not around the words.
      className="block truncate font-medium text-foreground no-underline outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
    >
      {title}
    </Link>
  ) : (
    <span className="block truncate font-medium text-foreground">{title}</span>
  );

  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}

      <span className="min-w-0 flex-1">
        {eyebrow ? <span className="eyebrow block text-[10.5px] leading-tight">{eyebrow}</span> : null}
        {titleNode}
        {detail ? (
          <span className="block truncate text-sm text-muted-foreground">{detail}</span>
        ) : null}
        {chips ? <span className="mt-1.5 block">{chips}</span> : null}
      </span>

      {meta ? (
        <span className="hidden shrink-0 font-data text-xs tabular-nums text-muted-foreground sm:block">
          {meta}
        </span>
      ) : null}

      {action ? <span className="relative z-10 shrink-0">{action}</span> : null}

      {href ? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-(--motion-press) ease-out group-hover/row:translate-x-0.5 group-hover/row:text-foreground"
          aria-hidden
        />
      ) : null}
    </>
  );

  const shell = cn(
    "group/row relative flex items-center gap-3 px-4 py-3 min-h-14",
    // The rail replaces what used to be a whole extra bordered card.
    tone !== "none" &&
      "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
    RAIL[tone],
    // `.pressable` owns the transition shorthand, so the stretched row (which
    // does not scale — its button presses on its own) declares its own.
    href && !stretched && "pressable hover:bg-card focus-visible:bg-card",
    stretched &&
      "transition-colors duration-(--motion-press) hover:bg-card has-[a:focus-visible]:bg-card",
    className,
  );

  return (
    <li className="bg-transparent">
      {href && !stretched ? (
        <Link href={href} className={cn(shell, "no-underline")}>
          {body}
        </Link>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
  );
}

/**
 * Section label above a list: eyebrow + count + a rule that runs to the edge.
 * `tone` tints the whole section rather than every card inside it (M4).
 */
export function ListSection({
  label,
  count,
  icon,
  tone = "none",
  children,
  className,
}: {
  label: React.ReactNode;
  count?: number;
  icon?: React.ReactNode;
  tone?: ListTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <h2 className="eyebrow flex items-center gap-2">
        {icon}
        {label}
        {count != null ? (
          <span
            className={cn(
              "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-px font-data text-[11px] tabular-nums",
              tone === "danger" && "bg-danger-tint text-danger",
              tone === "warning" && "bg-warning-tint text-warning",
              (tone === "none" || tone === "info" || tone === "success") &&
                "bg-secondary text-secondary-foreground",
            )}
          >
            {count}
          </span>
        ) : null}
        <span className="ml-1 h-px flex-1 bg-border" aria-hidden />
      </h2>
      {children}
    </section>
  );
}
