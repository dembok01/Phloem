"use client";

// Always-visible autosave confidence for the onboarding wizard: reassures the
// caregiver their answers are kept as they go, so leaving mid-flow feels safe.
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

const STATES: Record<SaveState, { tone: string; body: React.ReactNode }> = {
  idle: { tone: "text-muted-foreground", body: <>Saves automatically</> },
  saving: {
    tone: "text-muted-foreground",
    body: (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </>
    ),
  },
  saved: {
    tone: "text-success",
    body: (
      <>
        <Check className="size-3.5" aria-hidden /> Saved
      </>
    ),
  },
  error: { tone: "text-danger", body: <>Couldn&apos;t save — check your connection</> },
};

export function SaveIndicator({ state }: { state: SaveState }) {
  const { tone, body } = STATES[state];
  return (
    // The live region is the OUTER element and stays mounted: remounting a
    // role="status" node is unreliably announced, whereas changing the contents
    // of a stable one is exactly what screen readers listen for.
    <span role="status" className="inline-flex min-w-0">
      {/* The key remounts on each state change so `.fade-swap` replays — a blur
          bridge, so the swap reads as one element changing rather than two
          overlapping. Suppressed with everything else under reduced motion. */}
      <span key={state} className={cn("fade-swap inline-flex items-center gap-1", tone)}>
        {body}
      </span>
    </span>
  );
}
