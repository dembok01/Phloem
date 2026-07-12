import { cn } from "@/lib/utils";
import { formatDateIST } from "@/lib/datetime";

export type ProgressCycle = { number: number; start_date: string; end_date: string; status: string };

// §10 package progress bar — one segment per cycle (closed = filled, active =
// current with a "Day X of 30", upcoming = empty), plus a paused badge.
export function ProgressBar({
  cycles,
  paused,
}: {
  cycles: ProgressCycle[];
  paused: boolean;
}) {
  if (cycles.length === 0) return null;
  const active = cycles.find((c) => c.status === "active");
  const dayOfCycle = active ? istDaysBetween(active.start_date) + 1 : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-medium">Program progress</p>
        {paused ? (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-300">
            Paused
          </span>
        ) : active ? (
          <span className="text-sm text-muted-foreground">
            Cycle {active.number} · Day {Math.min(Math.max(dayOfCycle ?? 1, 1), 30)} of 30
          </span>
        ) : null}
      </div>
      <div className="flex gap-1.5" role="list" aria-label="Cycles">
        {cycles.map((c) => (
          <div
            key={c.number}
            role="listitem"
            title={`Cycle ${c.number}: ${formatDateIST(c.start_date)} – ${formatDateIST(c.end_date)} (${c.status})`}
            className={cn(
              "h-3 flex-1 rounded-full",
              c.status === "closed"
                ? "bg-primary"
                : c.status === "active"
                  ? "bg-primary/60"
                  : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatDateIST(cycles[0].start_date)}</span>
        <span>{formatDateIST(cycles[cycles.length - 1].end_date)}</span>
      </div>
    </div>
  );
}

// Whole days between an IST calendar date and today (IST), non-negative.
function istDaysBetween(startIso: string): number {
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  const today = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const start = new Date(startIso + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((today - start) / 86400_000));
}
