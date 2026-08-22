"use client";

// The PHLOEM signature mark (DESIGN-SYSTEM §4): one concentric ring per 30-day
// cycle, like a tree recording seasons. Closed cycles are solid rings; the
// active cycle is an arc swept to today's day-count; upcoming cycles are faint;
// a paused program renders the arc in Honey. The arc draws in once on first
// paint — global reduced-motion/elderly CSS collapses that to an instant render.
import * as React from "react";
import { cn } from "@/lib/utils";

export type RingCycle = { number: number; status: string };

/** Shared across signature usages, so the arc draws once per session app-wide. */
const SIGNATURE_SEEN_KEY = "phloem:rings:drawn";

export function GrowthRings({
  cycles,
  dayOfActive,
  daysInCycle = 30,
  paused = false,
  ending = false,
  size = 96,
  className,
  title,
  once = false,
}: {
  cycles: RingCycle[];
  /** 1-based day within the active cycle; clamped to [0, daysInCycle]. */
  dayOfActive?: number | null;
  daysInCycle?: number;
  paused?: boolean;
  /** W4 — the package ends within a fortnight. The signature mark carries the
   *  message (the live arc turns Honey) rather than the screen growing a new
   *  badge: the ring already encodes where the programme is, so "nearly over"
   *  belongs in the same mark. Pause wins if both are true — a paused programme
   *  is not ending on schedule. */
  ending?: boolean;
  size?: number;
  className?: string;
  /** Accessible description; defaults to a cycle/day summary. */
  title?: string;
  /**
   * Signature usages (the portal hero) pass `once`: the arc is a moment the first
   * time it is seen and latency on the fortieth, so after one draw per browser
   * session it renders its final state instantly. Progress usages
   * (`OnboardingProgress`) must leave this off — they animate on every value
   * change, which is the whole point of the mark there.
   */
  once?: boolean;
}) {
  const [drawn, setDrawn] = React.useState(false);
  // Whether the transition is attached at all. Kept separate from `drawn` so a
  // `once` ring that has already been seen can snap to its final offset with no
  // transition to animate.
  const [animated, setAnimated] = React.useState(false);

  React.useEffect(() => {
    if (once) {
      let seen = false;
      // sessionStorage throws in some privacy modes — a failed read just means
      // the arc draws again, which is the harmless direction to fail in.
      try {
        seen = window.sessionStorage.getItem(SIGNATURE_SEEN_KEY) === "1";
      } catch {
        seen = false;
      }
      if (seen) {
        setDrawn(true);
        return;
      }
      try {
        window.sessionStorage.setItem(SIGNATURE_SEEN_KEY, "1");
      } catch {
        /* no-op */
      }
    }
    setAnimated(true);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [once]);

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
      ? `Cycle ${active.number} of ${n}, day ${Math.max(dayOfActive ?? 1, 1)} of ${daysInCycle}${paused ? ", paused" : ending ? ", ending soon" : ""}`
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
                stroke={paused || ending ? "var(--warning)" : "var(--primary)"}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={drawn ? circumference * (1 - fraction) : circumference}
                transform={`rotate(-90 ${c} ${c})`}
                style={
                  animated
                    ? {
                        transition:
                          "stroke-dashoffset var(--motion-signature) var(--motion-ease-out)",
                      }
                    : undefined
                }
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
