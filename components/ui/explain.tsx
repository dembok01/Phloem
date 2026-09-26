"use client";

// A number on a dashboard is only useful if you know what it counts and what to
// do about it. `Explain` carries both, next to the thing itself, so nobody has
// to reverse-engineer a metric from its label.
//
// The standalone (i) is a Popover that also opens on hover: a tooltip never opens
// from a tap (measured on a touch phone, 2026-09-26), so on a phone the
// explanation was unreachable. ExplainOn stays a tooltip — its host is a link,
// and on a phone the tap belongs to the link.
//
// Two shapes, because the host element decides which is legal:
//   · ExplainOn  — attaches to a focusable element you already have (a tile that
//     is already a link). Never nests a button inside an anchor.
//   · Explain    — a standalone (i) beside a word that is not itself interactive.
import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const POPUP = "max-w-72 rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-pop";

function Body({ what, next }: { what: string; next?: string }) {
  return (
    <>
      <p className="text-xs leading-relaxed">{what}</p>
      {next ? (
        <p className="mt-1.5 border-t pt-1.5 text-xs leading-relaxed text-muted-foreground">
          {next}
        </p>
      ) : null}
    </>
  );
}

function Panel({ what, next }: { what: string; next?: string }) {
  return (
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={8} className="z-50">
        <Tooltip.Popup className={POPUP}>
          <Body what={what} next={next} />
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
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={250}
        render={
          <button
            type="button"
            aria-label={`What is ${label}?`}
            className={cn(
              // The icon stays 16px; the ::after gives the finger a 32px target.
              "pressable relative inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 after:absolute after:-inset-2 after:content-[''] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              className,
            )}
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="z-50">
          <Popover.Popup className={POPUP}>
            <Body what={what} next={next} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
