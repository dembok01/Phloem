import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthNotice, AuthShell } from "../auth-shell";
import { login } from "./actions";

const MESSAGES: Record<string, string> = {
  invalid: "Please enter a valid email and password.",
  credentials: "Email or password is incorrect.",
  suspended: "This account is suspended. Please contact PHLOEM support.",
};

const NOTICES: Record<string, string> = {
  password_updated: "Your password has been changed. Sign in with your new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? (NOTICES[params.notice] ?? null) : null;
  const message = notice ? null : (MESSAGES[params.error ?? params.notice ?? ""] ?? null);

  // One id, referenced by both fields: neither error the server returns is
  // field-specific, so pointing a screen reader at the real message beats
  // inventing a per-field one that would be a guess.
  const errorId = message ? "signin-error" : undefined;

  return (
    <AuthShell title="Sign in" subtitle="Your family's care, in one place.">
      {notice ? <AuthNotice tone="info">{notice}</AuthNotice> : null}
      {message ? <AuthNotice id={errorId}>{message}</AuthNotice> : null}
      <form action={login} className="space-y-4">
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
            aria-describedby={errorId}
            aria-invalid={message ? true : undefined}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-2">
          {/* The way out sits with the field it rescues, not buried under the
              button — someone who is already stuck shouldn't have to hunt. */}
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password" className="text-base">
              Password
            </Label>
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={errorId}
            aria-invalid={message ? true : undefined}
            className="h-11 text-base"
          />
        </div>
        <SubmitButton className="h-11 w-full text-base" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
