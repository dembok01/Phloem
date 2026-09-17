"use client";

// Two states. With no change pending: ask for the new address, which sends a
// link to the current inbox and a code to the new one. With a change pending:
// take the code. The change lands only when both halves are confirmed, in either
// order, so the copy names both rather than implying one step is enough.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  confirmEmailCodeAction,
  requestEmailChangeAction,
} from "@/app/(app)/account/email-actions";

export function EmailForm({ current, pending }: { current: string; pending: string | null }) {
  const [busy, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function request(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const next = String(new FormData(form).get("email") ?? "");
    start(async () => {
      const result = await requestEmailChangeAction(next);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      form.reset();
      router.refresh();
      toast("success", "Check both inboxes to finish the change");
    });
  }

  function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") ?? "");
    start(async () => {
      const result = await confirmEmailCodeAction(code);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      form.reset();
      router.refresh();
      toast(
        "success",
        result.data.completed
          ? "Sign-in address changed"
          : `Code accepted — now open the link we sent to ${current}`,
      );
    });
  }

  if (pending) {
    return (
      <form onSubmit={confirm} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Changing your sign-in address to{" "}
          <span className="font-medium text-foreground">{pending}</span>. To finish, open the link
          we sent to <span className="font-medium text-foreground">{current}</span> and enter the
          6-digit code we sent to the new address.
        </p>
        <div className="space-y-2">
          <Label htmlFor="email-code">Code from your new inbox</Label>
          <Input
            id="email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className="h-11 max-w-[10rem] tracking-widest"
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Confirming…" : "Confirm code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={request} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You sign in with <span className="font-medium text-foreground">{current}</span>. Changing it
        needs a link from this inbox and a code from the new one — the address only moves once both
        are confirmed.
      </p>
      <div className="space-y-2">
        <Label htmlFor="email-next">New sign-in address</Label>
        <Input id="email-next" name="email" type="email" required autoComplete="email" className="h-11" />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send confirmations"}
      </Button>
    </form>
  );
}
