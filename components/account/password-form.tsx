"use client";

// Supabase's updateUser({ password }) does NOT ask for the current password.
// Without the re-check below, anyone reaching an unattended logged-in device
// could silently take the account over — so the current password is verified
// with signInWithPassword first. Both calls run in the browser against the
// user's own session: no server action, no service-role key.
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm({ email }: { email: string }) {
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("current") ?? "");
    const next = String(data.get("next") ?? "");

    if (!email) {
      toast("error", "We couldn't read your sign-in address. Please reload and try again.");
      return;
    }
    if (next.length < 8) {
      toast("error", "Choose a password of at least 8 characters.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: reauth } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (reauth) {
        toast("error", "That current password is not right.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        toast("error", "Could not change the password. Please try again.");
        return;
      }
      form.reset();
      toast("success", "Password changed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pw-current">Current password</Label>
        <Input
          id="pw-current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-next">New password</Label>
        <Input
          id="pw-next"
          name="next"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="h-11"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
