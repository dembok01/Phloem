"use client";

// Honest progress for the guided onboarding flow. Three quiet signals:
//   1. a growth ring (the product signature, reused) that fills toward done —
//      foreshadowing the cycle rings the family sees later in the portal;
//   2. a chapter rail whose segments fill by *real* work done per chapter (not a
//      flat 20%-each lie), and let you tap back to a chapter you've reached;
//   3. a plain-words "X of Y · time left".
// Motion (the ring arc, segment fills) is collapsed to an instant render under
// reduced-motion / elderly mode by the global CSS, per DESIGN-SYSTEM §4.
import * as React from "react";
import { cn } from "@/lib/utils";
import { GrowthRings } from "@/components/growth-rings";
import { timeLeftLabel, type Card } from "../onboarding-flow";

type Chapter = {
  index: number;
  title: string;
  progress: number; // 0..1 of answerable cards done in this chapter
  current: boolean;
  reachable: boolean;
};

export function OnboardingProgress({
  cards,
  cardIndex,
  onJumpToSection,
}: {
  cards: Card[];
  cardIndex: number;
  onJumpToSection: (sectionIndex: number) => void;
}) {
  const answerable = cards.filter((c) => c.kind !== "interlude");
  const total = answerable.length;
  const done = cards.filter((c, i) => c.kind !== "interlude" && i < cardIndex).length;
  const currentSectionIndex = cards[cardIndex]?.sectionIndex ?? 0;

  const chapters: Chapter[] = [];
  for (const card of cards) {
    if (card.kind === "interlude") continue;
    let ch = chapters.find((c) => c.index === card.sectionIndex);
    if (!ch) {
      ch = {
        index: card.sectionIndex,
        title: card.sectionTitle,
        progress: 0,
        current: false,
        reachable: card.sectionIndex <= currentSectionIndex,
      };
      chapters.push(ch);
    }
  }
  for (const ch of chapters) {
    const inCh = answerable.filter((c) => c.sectionIndex === ch.index);
    const doneInCh = inCh.filter((c) => cards.indexOf(c) < cardIndex).length;
    ch.progress = inCh.length > 0 ? doneInCh / inCh.length : 0;
    ch.current = ch.index === currentSectionIndex;
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex items-center gap-4">
      <GrowthRings
        cycles={[{ number: 1, status: "active" }]}
        dayOfActive={done}
        daysInCycle={Math.max(total, 1)}
        size={44}
        title={`Onboarding ${pct}% complete`}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex gap-1.5">
          {chapters.map((ch) => (
            <button
              key={ch.index}
              type="button"
              disabled={!ch.reachable}
              onClick={() => onJumpToSection(ch.index)}
              aria-current={ch.current ? "step" : undefined}
              aria-label={`${ch.title} — ${Math.round(ch.progress * 100)}% done${ch.current ? " (current)" : ""}`}
              className={cn(
                "flex-1 rounded-full py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                ch.reachable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(ch.progress * 100, ch.current ? 8 : 0)}%` }}
                />
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            {done} of {total} done
          </span>
          <span>{timeLeftLabel(cards, cardIndex)}</span>
        </div>
      </div>
    </div>
  );
}
