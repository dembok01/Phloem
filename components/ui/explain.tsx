"use client";

// A number on a dashboard is only useful if you know what it counts and what to
// do about it. `Explain` carries both, next to the thing itself, so nobody has
// to reverse-engineer a metric from its label.
//
// Built on Base UI's Tooltip, which opens on hover AND on keyboard focus — a
// hover-only explanation is invisible to anyone using a keyboard, and on touch
// the trigger is a real focusable button so a tap opens it too. The open delay
// comes from the app-layout-level Tooltip.Provider, which also groups them: once
// one explanation is open, moving to a neighbouring one is instant.
//
// Two shapes, because the host element decides which is legal:
//   · ExplainOn  — attaches to a focusable element you already have (a tile that
//     is already a link). Never nests a button inside an anchor.
//   · Explain    — a standalone (i) beside a word that is not itself interactive.
import * as React from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

function Panel({ what, next }: { what: string; next?: string }) {
  return (
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={8} className="z-50">
        <Tooltip.Popup className="max-w-72 rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-pop">
          <p className="text-xs leading-relaxed">{what}</p>
          {next ? (
            <p className="mt-1.5 border-t pt-1.5 text-xs leading-relaxed text-muted-foreground">
              {next}
            </p>
          ) : null}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  );
}

/** Attach an explanation to an element that is already focusable. */
export function ExplainOn({
  what,
  next,
  children,
}: {
  what: string;
  next?: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Panel what={what} next={next} />
    </Tooltip.Root>
  );
}

/** A standalone (i) for a label that is not interactive on its own. */
export function Explain({
  what,
  next,
  label,
  className,
}: {
  what: string;
  next?: string;
  /** What the icon is explaining, for screen readers. */
  label: string;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            aria-label={`What is ${label}?`}
            className={cn(
              "pressable inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              className,
            )}
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        }
      />
      <Panel what={what} next={next} />
    </Tooltip.Root>
  );
}
