"use client";

// P-4 — caregiver-facing switch for the elderly login's "Larger text & simpler
// view". Optimistic, with a toast; disabled (with a note) until the parent has
// their own login to apply it to. The change persists on the member's profile,
// so it follows them across devices.
import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { setMemberElderlyModeAction } from "@/app/(app)/portal/actions";

export function ElderlyModeToggle({
  memberId,
  memberFirstName,
  enabled,
  hasLogin,
}: {
  memberId: string;
  memberFirstName: string;
  enabled: boolean;
  hasLogin: boolean;
}) {
  const [on, setOn] = React.useState(enabled);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function flip() {
    if (!hasLogin || pending) return;
    const next = !on;
    setOn(next); // optimistic
    startTransition(async () => {
      const res = await setMemberElderlyModeAction(memberId, next);
      if (res.ok) {
        toast(
          "success",
          next
            ? `Larger text turned on for ${memberFirstName}'s login`
            : `Larger text turned off for ${memberFirstName}'s login`,
        );
        router.refresh();
      } else {
        setOn(!next); // revert
        toast("error", "Couldn't update that setting. Please try again.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium">Larger text &amp; simpler view</p>
        <p className="text-sm text-muted-foreground">
          {hasLogin
            ? `Applies to ${memberFirstName}'s own login, on every device.`
            : `Available once ${memberFirstName} has their own login.`}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Larger text and simpler view"
        disabled={!hasLogin || pending}
        onClick={flip}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-card shadow transition-transform",
            on ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
