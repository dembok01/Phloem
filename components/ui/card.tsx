import * as React from "react"

import { cn } from "@/lib/utils"

// V1/M1 — surface tiers. Before this every container in the product was the same
// object, so nothing could be more important than anything else. Four tiers now
// carry meaning: `panel` is the default workhorse (unchanged, so nothing that
// already exists shifts), `hero` is the ONE element per screen that outranks
// everything around it, `inset` is a recessed ground for lists, and `quiet` is a
// grouping with no chrome at all.
const CARD_VARIANT = {
  panel: "bg-card ring-1 ring-foreground/10",
  // shadow-2 is reserved for this tier and overlays, so elevation means something.
  hero: "bg-card ring-1 ring-foreground/10 shadow-pop rounded-2xl",
  inset: "bg-muted/35 ring-1 ring-foreground/[0.04]",
  quiet: "bg-transparent",
} as const

function Card({
  className,
  size = "default",
  variant = "panel",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: keyof typeof CARD_VARIANT
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl py-(--card-spacing) text-sm text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        CARD_VARIANT[variant],
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-display text-[17px] leading-snug font-semibold tracking-tight group-data-[size=sm]/card:text-sm group-data-[variant=hero]/card:text-2xl",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
