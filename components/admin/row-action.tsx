"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";

/**
 * A row's action: one click fires it, a toast confirms, and an Undo appears
 * only where a TRUE inverse exists.
 *
 * That last clause is the whole design. `set_account_status` has a real inverse
 * — suspend then reactivate leaves the account exactly where it started — so it
 * gets Undo. `revokeInvite` hard-deletes the row and `reactivate_member` mints a
 * fresh package; neither can be undone, so neither is offered one. An Undo that
 * quietly cannot undo is worse than no Undo.
 *
 * Both the action and its undo write audit rows, which is the accepted cost of
 * single-click: the log records what happened, including the reversal.
 *
 * On success the button itself says it worked ("✓ Revoked") for a beat before
 * the row refreshes, so the confirmation sits where the eye already is, not
 * only in a toast at the screen's edge.
 */
export function RowAction({
  children,
  pendingText,
  variant = "outline",
  run,
  success,
  doneText,
  undo,
  className,
}: {
  children: React.ReactNode;
  pendingText: string;
  variant?: "outline" | "destructive" | "secondary" | "ghost";
  run: () => Promise<ActionResult<unknown>>;
  /** Toast copy on success — repeats the verb of the button (DESIGN-SYSTEM §5). */
  success: string;
  /** What the button says for a beat once it has worked, e.g. "Revoked". */
  doneText: string;
  undo?: { label: string; run: () => Promise<ActionResult<unknown>>; success: string };
  className?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [done, setDone] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  function fire() {
    start(async () => {
      const result = await run();
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setDone(true);
      // The refresh and the label's reset land in one transition, so the button
      // never flashes its old verb before the row redraws.
      timer.current = setTimeout(
        () =>
          start(() => {
            setDone(false);
            router.refresh();
          }),
        1200,
      );
      toast(
        "success",
        success,
        undo
          ? {
              label: undo.label,
              run: async () => {
                const back = await undo.run();
                router.refresh();
                if (!back.ok) toast("error", back.error);
                else toast("success", undo.success);
              },
            }
          : undefined,
      );
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending && !done}
      onClick={done ? undefined : fire}
      className={className}
    >
      {done ? (
        <span className="inline-flex items-center gap-1.5">
          <Check className="mark-in size-3.5" aria-hidden />
          {doneText}
        </span>
      ) : pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
