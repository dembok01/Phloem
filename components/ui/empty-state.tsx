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
        "relative isolate flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-input bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      {/* Signature watermark — the same concentric rings that encode a member's
          cycles, here at 6% as ground texture. */}
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className="pointer-events-none absolute -right-6 -bottom-8 -z-10 size-44 text-primary opacity-[0.06]"
      >
        <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="60" cy="60" r="22" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="60" cy="60" r="8" fill="none" stroke="currentColor" strokeWidth="6" />
      </svg>

      {Icon ? (
        <span className="mb-1 inline-flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
