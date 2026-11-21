import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// A chip you press: a filter, a toggle, a choice. The counterpart of Badge,
// which only states a fact. The two must never be mistaken for each other, so
// they differ in every channel at once: a chip is a bordered pill with a white
// face, a hand cursor, a hover and a press; a badge is a flat 6px tint with none
// of those.
//
// `selected` fills it. `check` adds a tick when selected, for groups where
// several can be on at once, so "choose many" looks different from "choose one".

const ON: Record<NonNullable<ChipProps["tone"]>, string> = {
  neutral: "border-foreground bg-foreground text-background",
  primary: "border-primary bg-primary text-primary-foreground",
  danger: "border-danger bg-danger text-white",
  warning: "border-warning bg-warning text-white",
  success: "border-success bg-success text-white",
};

export type ChipProps = React.ComponentProps<"button"> & {
  selected?: boolean;
  tone?: "neutral" | "primary" | "danger" | "warning" | "success";
  /** Trailing tabular count, e.g. how many rows the filter matches. */
  count?: number;
  /** Show a tick when selected (multi-select groups). */
  check?: boolean;
};

export function Chip({
  selected = false,
  tone = "neutral",
  count,
  check = false,
  className,
  children,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      data-slot="chip"
      aria-pressed={selected}
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap shadow-xs outline-none select-none",
        "transition-[color,background-color,border-color,box-shadow,scale] duration-(--motion-press) ease-out",
        "active:scale-[0.97] motion-reduce:active:scale-100 elderly:active:scale-100",
        "focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        selected
          ? ON[tone]
          : "border-input/60 bg-card text-foreground hover:border-input hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_4%)]",
        className,
      )}
      {...props}
    >
      {check && selected ? (
        <Check className="mark-in size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      ) : null}
      {children}
      {count != null ? (
        <span
          className={cn(
            "-mr-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-data text-[11px] leading-none tabular-nums",
            selected ? "bg-white/15" : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
