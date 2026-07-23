"use client";

// Always-visible autosave confidence for the onboarding wizard: reassures the
// caregiver their answers are kept as they go, so leaving mid-flow feels safe.
import { Check, Loader2 } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-success" role="status">
        <Check className="size-3.5" aria-hidden /> Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="text-danger" role="status">
        Couldn&apos;t save — check your connection
      </span>
    );
  }
  return (
    <span className="text-muted-foreground" role="status">
      Saves automatically
    </span>
  );
}
