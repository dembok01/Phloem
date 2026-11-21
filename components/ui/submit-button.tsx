"use client";

// Pending-aware submit button for server-action <form>s. Reads the parent form's
// pending state via useFormStatus (React) and drives the shared Button's `loading`
// affordance — a spinner + disabled — so every mutation shows it's working while
// the action + redirect round-trip runs. Optional `pendingText` swaps the label.
import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type SubmitButtonProps = Omit<React.ComponentProps<typeof Button>, "type" | "loading"> & {
  pendingText?: string;
};

export function SubmitButton({ children, pendingText, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={disabled} {...props}>
      {pendingText ? (
        // "Save" → "Saving…" is one label changing its mind, not two labels
        // swapping: a 200ms crossfade with a 2px blur (globals.css .fade-swap).
        <span key={pending ? "pending" : "idle"} className="fade-swap inline-block">
          {pending ? pendingText : children}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
