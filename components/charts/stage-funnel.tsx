import Link from "next/link";
import { cn } from "@/lib/utils";

// Where every member sits in the lifecycle, as one bar. Pure CSS — a stacked
// proportional bar is flex with widths; recharts would add a client bundle to
// draw seven rectangles.
// Segments are links, so the chart is also the filter: the number you are
// looking at is the way to the list behind it.
export type Stage = { key: string; label: string; count: number; href: string };

// Sequential ramp: one hue, light -> dark along the journey. Stage order carries
// meaning here (it is a progression, not an identity), so this is deliberately
// NOT the categorical palette.
const RAMP = [
  "color-mix(in oklch, var(--primary) 18%, var(--card))",
  "color-mix(in oklch, var(--primary) 30%, var(--card))",
  "color-mix(in oklch, var(--primary) 42%, var(--card))",
  "color-mix(in oklch, var(--primary) 55%, var(--card))",
  "color-mix(in oklch, var(--primary) 68%, var(--card))",
  "color-mix(in oklch, var(--primary) 82%, var(--card))",
  "var(--primary)",
];

export function StageFunnel({ stages, className }: { stages: Stage[]; className?: string }) {
  const total = stages.reduce((n, s) => n + s.count, 0);
  if (total === 0) {
    return (
      <p className={cn("text-muted-foreground", className)}>
        No members yet — stages fill in as people are invited and onboarded.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-9 w-full gap-0.5 overflow-hidden rounded-lg" role="list">
        {stages.map((s, i) =>
          s.count === 0 ? null : (
            <Link
              key={s.key}
              href={s.href}
              role="listitem"
              title={`${s.label}: ${s.count}`}
              style={{
                width: `${(s.count / total) * 100}%`,
                background: RAMP[Math.min(i, RAMP.length - 1)],
              }}
              className="pressable group relative grid place-items-center first:rounded-l-lg last:rounded-r-lg hover:brightness-95"
            >
              <span className="font-data text-xs font-medium text-foreground/80 tabular-nums">
                {s.count}
              </span>
            </Link>
          ),
        )}
      </div>
      {/* Identity is never colour-alone: every stage is named in the legend. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {stages.map((s, i) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px] ring-1 ring-foreground/10"
              style={{ background: RAMP[Math.min(i, RAMP.length - 1)] }}
            />
            {s.label}
            <span className="font-data tabular-nums text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
