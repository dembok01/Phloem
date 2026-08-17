import { AlertTriangle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Designed failure state (DESIGN-SYSTEM §5: errors say what happened and how to
 * fix it). Sibling of `EmptyState` and deliberately the same shape, with two
 * differences: a solid border and card ground rather than the dashed "nothing
 * here yet" treatment, and a tinted mark so a failure never reads as an
 * invitation.
 *
 * It never renders a stack trace, a Postgres message or an RLS policy name —
 * only the caller's plain-language copy plus Next's opaque `digest`, which is a
 * hash a family can safely quote to their coordinator.
 */
export function ErrorState({
  icon: Icon = AlertTriangle,
  tone = "danger",
  title,
  description,
  digest,
  action,
  className,
}: {
  icon?: LucideIcon;
  /** `danger` for something that broke; `info` for something simply not found. */
  tone?: "danger" | "info";
  title: string;
  description?: string;
  /** Next.js error digest — an opaque hash, safe to show. */
  digest?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border bg-card px-6 py-10 text-center shadow-card",
        className,
      )}
    >
      <span
        className={cn(
          "mb-1 inline-flex size-11 items-center justify-center rounded-full",
          tone === "danger" ? "bg-danger-tint text-danger" : "bg-info-tint text-info",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-display text-lg font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
      {digest ? (
        <p className="mt-2 font-data text-xs text-muted-foreground">Reference {digest}</p>
      ) : null}
    </div>
  );
}
