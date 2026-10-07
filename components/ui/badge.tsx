import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// A Badge states a fact; it is never pressed. So it is shaped unlike anything
// you can press: a 6px tinted tag with no edge, where every interactive chip
// (components/ui/chip.tsx) is a bordered pill. Before 2026-10-07 both were pills,
// and "Active" (a status) and "Active 19" (a filter) were the same object.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        muted: "border-transparent bg-muted text-muted-foreground",
        success: "border-transparent bg-success-tint text-success",
        warning: "border-transparent bg-warning-tint text-warning",
        danger: "border-transparent bg-danger-tint text-danger",
        info: "border-transparent bg-info-tint text-info",
        outline: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
