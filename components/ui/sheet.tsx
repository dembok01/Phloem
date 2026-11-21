"use client";

// Sheet — the shared "act without leaving the page" surface (Workspace Elevation
// E5). Built on Base UI's Drawer, which already ships the focus trap, the portal,
// scroll locking and swipe-to-dismiss; hand-rolling that with a gesture library
// would be more code and worse a11y.
//
// Bottom-aligned on phones, centred on larger screens. Base UI keeps focus and
// dismissal behavior consistent across both presentations.
import * as React from "react";
import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The icon-button style for `headerActions`. Lives here because the header bar is
 * the only place it belongs, and three viewers were about to declare it locally.
 */
export const sheetAction =
  "pressable inline-flex size-11 items-center justify-center rounded-xl border border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:size-9";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  headerActions,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Overrides the body's default padding — pass `p-0` for a flush surface. */
  bodyClassName?: string;
  /** Sits beside the close button, for viewers whose only actions are chrome. */
  headerActions?: React.ReactNode;
  /** Where focus goes on close (Base UI's `finalFocus`); defaults to the trigger. */
  finalFocus?: React.ComponentProps<typeof Drawer.Popup>["finalFocus"];
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[3px] transition-opacity duration-(--motion-pop) ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Drawer.Popup
            finalFocus={finalFocus}
            className={cn(
              "flex max-h-[90svh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-border/80 bg-popover text-popover-foreground shadow-pop outline-none sm:rounded-3xl",
              "transition-[opacity,translate,scale] duration-(--motion-pop) ease-drawer data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full sm:data-[ending-style]:translate-y-2 sm:data-[starting-style]:translate-y-2 sm:data-[ending-style]:scale-[0.98] sm:data-[starting-style]:scale-[0.98] sm:data-[ending-style]:opacity-0 sm:data-[starting-style]:opacity-0",
              className,
            )}
          >
          <div className="flex items-start justify-between gap-4 border-b border-border/65 bg-muted/25 px-6 py-5">
            <div className="min-w-0 space-y-1">
              <Drawer.Title className="font-display text-xl font-semibold tracking-tight text-balance">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  {description}
                </Drawer.Description>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerActions}
              <Drawer.Close
                aria-label="Close"
                className={sheetAction}
              >
                <X className="size-4" aria-hidden />
              </Drawer.Close>
            </div>
          </div>

          <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/65 bg-muted/30 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
