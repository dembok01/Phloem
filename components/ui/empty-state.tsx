import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Designed empty state (C1): says what this space will hold and invites the
 * next action — never a bare "Empty". */
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
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-card/50 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-1 inline-flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
