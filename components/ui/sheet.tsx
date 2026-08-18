"use client";

// Sheet — the shared "act without leaving the page" surface (Workspace Elevation
// E5). Built on Base UI's Drawer, which already ships the focus trap, the portal,
// scroll locking and swipe-to-dismiss; hand-rolling that with a gesture library
// would be more code and worse a11y.
//
// Presents as a centred modal: Base UI positions the popup itself, so the
// drag-to-dismiss handle was dropped rather than shipped as an affordance that
// promises a gesture it never performs. Escape, the close button and the backdrop
// all dismiss, and focus is trapped inside — verified in-browser.
import * as React from "react";
import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            className={cn(
              "flex max-h-[88svh] w-full max-w-xl flex-col rounded-2xl border bg-popover text-popover-foreground shadow-pop",
              "transition-transform duration-300 ease-drawer data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
              className,
            )}
          >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0 space-y-1">
              <Drawer.Title className="font-display text-lg font-semibold">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="text-sm text-muted-foreground">
                  {description}
                </Drawer.Description>
              ) : null}
            </div>
            <Drawer.Close
              aria-label="Close"
              className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Drawer.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>

          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t bg-muted/40 px-6 py-4">
              {footer}
            </div>
          ) : null}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
