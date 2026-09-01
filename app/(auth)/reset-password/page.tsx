import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { AuthNotice, AuthShell } from "../auth-shell";
import { updatePassword } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Please choose a password of at least 8 characters.",
  mismatch: "Those two passwords don't match. Please type them again.",
  failed: "Something went wrong saving your new password. Please try again.",
};

// Reached only through the emailed link, which /auth/confirm turns into a real
// session. No session means the link was never opened, was already used, or has
// expired — all of which look the same from here, and all of which are fixed the
// same way: ask for a fresh one.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthShell title="Reset your password" subtitle="About this link">
        <div className="space-y-4 text-center">
          {/* Not the visitor's mistake — a state of the link, paired with its
              next action. Informational (Water), not danger. */}
          <AuthNotice tone="info">
            This reset link has expired or has already been used. Request a new one and it will
            arrive in a moment.
          </AuthNotice>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full text-base")}
          >
            Send a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  const message = error ? (ERRORS[error] ?? null) : null;
  const errorId = message ? "reset-error" : undefined;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={`Setting a new password for ${user.email ?? "your account"}.`}
    >
      {message ? <AuthNotice id={errorId}>{message}</AuthNotice> : null}
      <form action={updatePassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-base">
            New password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-describedby={`password-hint${errorId ? ` ${errorId}` : ""}`}
            aria-invalid={errorId ? true : undefined}
            className="h-11 text-base"
          />
          <p id="password-hint" className="text-sm text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-base">
            Type it again
          </Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-describedby={errorId}
            aria-invalid={errorId ? true : undefined}
            className="h-11 text-base"
          />
        </div>
        <SubmitButton className="h-11 w-full text-base" pendingText="Saving…">
          Save new password
        </SubmitButton>
        {/* Say what comes after the button, so signing out again isn't a surprise. */}
        <p className="text-center text-sm text-muted-foreground">
          You&apos;ll sign in once with the new password to finish.
        </p>
      </form>
    </AuthShell>
  );
}
