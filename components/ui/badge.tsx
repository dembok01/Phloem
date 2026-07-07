import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        muted: "border-transparent bg-muted text-muted-foreground",
        success: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warning: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-400",
        danger: "border-transparent bg-destructive/10 text-destructive",
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
