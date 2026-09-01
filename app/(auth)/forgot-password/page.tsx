import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthNotice, AuthShell } from "../auth-shell";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const error = params.error === "invalid" ? "Please enter a valid email address." : null;

  return (
    <AuthShell
      title="Reset your password"
      subtitle={
        sent
          ? "Check your email."
          : "Enter the email you sign in with and we'll send you a link to set a new password."
      }
    >
      {sent ? (
        <div className="space-y-4">
          {/* Deliberately says "if an account exists" — confirming the address is
              registered would leak who is in a care programme. */}
          <AuthNotice tone="info">
            If an account exists for that address, a reset link is on its way. It can be used once
            and expires in about an hour.
          </AuthNotice>
          <Link
            href="/login"
            className="block text-center text-base text-primary underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form action={requestPasswordReset} className="space-y-4">
          {error ? <AuthNotice id="forgot-error">{error}</AuthNotice> : null}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-base">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-describedby={error ? "forgot-error" : undefined}
              aria-invalid={error ? true : undefined}
              className="h-11 text-base"
            />
          </div>
          <SubmitButton className="h-11 w-full text-base" pendingText="Sending…">
            Send reset link
          </SubmitButton>
          <Link
            href="/login"
            className="block text-center text-base text-muted-foreground underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
