import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Press = scale(.97) at the press duration (DESIGN-SYSTEM §3) — the one press
  // convention for every Button, so `.pressable` is never added on top of it.
  // `relative` anchors the 44px touch hit area (globals.css, pointer: coarse).
  // Reduced motion and elderly mode keep the colour change and drop the movement.
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale,translate] duration-(--motion-press) ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.97] motion-reduce:active:scale-100 elderly:active:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Hover DARKENS. It used to fade to 80%, which reads as "going disabled".
        // The 1px lift is the one place a Button moves on hover: it marks the
        // primary action as the thing to press.
        default:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover hover:-translate-y-px motion-reduce:hover:translate-y-0 elderly:hover:translate-y-0",
        // Raised, not drawn: a white face, an edge at ~2:1 and the card shadow, so
        // it reads as a button on white cards AND on the recessed list ground
        // (it used to be a 1.2:1 hairline there — the least visible thing in the row).
        outline:
          "border-input/60 bg-card shadow-xs hover:border-input hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_4%)] aria-expanded:border-input aria-expanded:bg-muted dark:bg-input/20 dark:hover:bg-input/35",
        // Tonal: the row-level primary action (Schedule, Create a link). A Phloem
        // tint with an inset edge, so it outranks outline without shouting like
        // the solid primary.
        secondary:
          "bg-secondary text-secondary-foreground ring-1 ring-primary/20 ring-inset hover:bg-[color-mix(in_oklab,var(--secondary),var(--primary)_14%)] hover:ring-primary/35 aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--primary)_14%)]",
        ghost:
          "hover:bg-foreground/[0.07] hover:text-foreground aria-expanded:bg-foreground/[0.07] aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline decoration-primary/35 underline-offset-4 hover:text-primary-hover hover:decoration-current",
      },
      size: {
        /* §11 / audit G-7: 40px default target at 16px text; lg = 48px for
           portal & elderly surfaces (rem-based, so elderly mode scales further).
           sm is 36px (was 32); on touch every size reaches 44px via the hit area. */
        default:
          "h-10 gap-1.5 px-4 text-base has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1 rounded-[min(var(--radius-md),12px)] px-3 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        "icon-xs":
          "size-7 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
