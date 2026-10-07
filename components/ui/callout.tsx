import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A notice in the flow of a page. The rule it enforces: a callout that leads
// somewhere SHOWS a button, and one that only informs looks like a note, never
// like something to press. Before this, the doctor's "form is due — open it"
// card and the read-only "their form is due" card were the same honey tile, so
// the one that leads nowhere looked exactly like the one that does.

const TONE = {
  warning: { card: "border-warning/45 bg-warning-tint hover:border-warning", icon: "text-warning" },
  info: { card: "border-info/40 bg-info-tint hover:border-info", icon: "text-info" },
  danger: { card: "border-danger/45 bg-danger-tint hover:border-danger", icon: "text-danger" },
} as const;

export function Callout({
  tone = "warning",
  icon: Icon,
  action,
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  icon?: LucideIcon;
  /** Where it leads. Omit for a notice that only informs. */
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  if (!action) {
    // Informational: flat, muted, no edge — it reads as a note, not a control.
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
      >
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  const t = TONE[tone];
  // The whole card is the link (a generous target); the button inside is its
  // visible promise. A <span>, because a button inside an <a> is invalid.
  return (
    <Link
      href={action.href}
      className={cn(
        "group/callout flex items-center gap-3 rounded-xl border p-4 font-medium no-underline transition-colors duration-(--motion-press)",
        t.card,
        className,
      )}
    >
      {Icon ? <Icon className={cn("size-5 shrink-0", t.icon)} aria-hidden /> : null}
      <div className="min-w-0 flex-1 text-foreground">{children}</div>
      <span
        className={cn(
          buttonVariants({ size: "sm" }),
          "pointer-events-none shrink-0 group-hover/callout:bg-primary-hover",
        )}
      >
        {action.label}
        <ArrowRight
          className="transition-[translate] duration-(--motion-press) ease-out group-hover/callout:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}
