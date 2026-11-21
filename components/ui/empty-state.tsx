import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Designed empty state (C1): says what this space will hold and invites the
 * next action — never a bare "Empty".
 *
 * V1/M8 — an empty panel used to be one grey sentence in a dashed box, which read
 * as a hole in the page rather than a designed state. It now carries the growth
 * ring as a faint watermark, so even a screen with no data still looks like this
 * product. The mark is decorative and `aria-hidden`; the words carry the meaning.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-border/80 bg-linear-to-br from-card via-card to-secondary/35 px-6 py-12 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]",
        className,
      )}
    >
      {/* Signature watermark — the same concentric rings that encode a member's
          cycles, here at 6% as ground texture. */}
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className="pointer-events-none absolute -right-8 -bottom-10 -z-10 size-52 text-primary opacity-[0.05]"
      >
        <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="60" cy="60" r="22" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="60" cy="60" r="8" fill="none" stroke="currentColor" strokeWidth="6" />
      </svg>

      {Icon ? (
        <span className="mb-2 inline-flex size-14 items-center justify-center rounded-2xl border border-primary/10 bg-secondary/80 text-secondary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
          <Icon className="size-6" strokeWidth={1.6} aria-hidden />
        </span>
      ) : null}
      <p className="max-w-md font-display text-xl font-semibold tracking-tight text-balance text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
