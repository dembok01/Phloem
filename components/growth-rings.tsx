"use client";

// The PHLOEM signature mark (DESIGN-SYSTEM §4): one concentric ring per 30-day
// cycle, like a tree recording seasons. Closed cycles are solid rings; the
// active cycle is an arc swept to today's day-count; upcoming cycles are faint;
// a paused program renders the arc in Honey. The arc draws in once on first
// paint — global reduced-motion/elderly CSS collapses that to an instant render.
import * as React from "react";
import { cn } from "@/lib/utils";

export type RingCycle = { number: number; status: string };

export function GrowthRings({
  cycles,
  dayOfActive,
  daysInCycle = 30,
  paused = false,
  size = 96,
  className,
  title,
}: {
  cycles: RingCycle[];
  /** 1-based day within the active cycle; clamped to [0, daysInCycle]. */
  dayOfActive?: number | null;
  daysInCycle?: number;
  paused?: boolean;
  size?: number;
  className?: string;
  /** Accessible description; defaults to a cycle/day summary. */
  title?: string;
}) {
  const [drawn, setDrawn] = React.useState(false);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const n = Math.max(cycles.length, 1);
  const stroke = Math.max(2.5, Math.min(6, size / (n * 4.5)));
  const gap = stroke * 0.9;
  const outerR = size / 2 - stroke;
  const c = size / 2;

  const active = cycles.find((cy) => cy.status === "active");
  const fraction = active
    ? Math.min(Math.max((dayOfActive ?? 0) / daysInCycle, 0.04), 1)
    : 0;

  const label =
    title ??
    (active
      ? `Cycle ${active.number} of ${n}, day ${Math.max(dayOfActive ?? 1, 1)} of ${daysInCycle}${paused ? ", paused" : ""}`
      : `${cycles.filter((cy) => cy.status === "closed").length} of ${n} cycles complete`);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
    >
      <title>{label}</title>
      {cycles.map((cy, i) => {
        // Innermost ring = cycle 1; rings grow outward like a trunk.
        const r = outerR - (n - 1 - i) * (stroke + gap);
        if (r <= 0) return null;
        const circumference = 2 * Math.PI * r;

        if (cy.status === "closed") {
          return (
            <circle
              key={cy.number}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={stroke}
              opacity={0.85}
            />
          );
        }
        if (cy.status === "active") {
          return (
            <g key={cy.number}>
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke="var(--border)"
                strokeWidth={stroke}
              />
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={paused ? "var(--warning)" : "var(--primary)"}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={drawn ? circumference * (1 - fraction) : circumference}
                transform={`rotate(-90 ${c} ${c})`}
                style={{ transition: "stroke-dashoffset 600ms ease-out" }}
              />
            </g>
          );
        }
        return (
          <circle
            key={cy.number}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}
