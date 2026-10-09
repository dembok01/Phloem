"use client";

// Progress for the guided onboarding flow: one chapter rail whose segments fill
// by the cards done in each chapter, and let you tap back to a chapter you've
// reached. The chapter's name and card count sit above it, in the wizard.
//
// It used to share the job with a growth ring, an "X of Y done" count and a
// "time left" estimate — four signals saying one thing, and the estimate was a
// guess, not a measurement. The ring still closes on the completion screen.
// Segment fills are collapsed to an instant render under reduced-motion /
// elderly mode by the global CSS, per DESIGN-SYSTEM §4.
import { cn } from "@/lib/utils";
import type { Card } from "../onboarding-flow";

export function OnboardingProgress({
  cards,
  cardIndex,
  onJumpToSection,
}: {
  cards: Card[];
  cardIndex: number;
  onJumpToSection: (sectionIndex: number) => void;
}) {
  const currentSectionIndex = cards[cardIndex]?.sectionIndex ?? 0;
  const chapters = [...new Map(cards.map((c) => [c.sectionIndex, c.sectionTitle]))].map(
    ([index, title]) => {
      const inCh = cards.filter((c) => c.sectionIndex === index);
      const doneInCh = inCh.filter((c) => cards.indexOf(c) < cardIndex).length;
      return {
        index,
        title,
        progress: doneInCh / inCh.length,
        current: index === currentSectionIndex,
        reachable: index <= currentSectionIndex,
      };
    },
  );

  return (
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
          {/* scaleX, not width: width animates on the layout path every step.
              Rounding lives on the clipping parent so the scale cannot squash
              the cap radius. */}
          <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full w-full origin-left bg-primary transition-transform duration-300 ease-out"
              style={{
                transform: `scaleX(${Math.max(ch.progress, ch.current ? 0.08 : 0)})`,
              }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
