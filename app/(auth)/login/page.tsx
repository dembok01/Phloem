import Image from "next/image";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

const MESSAGES: Record<string, string> = {
  invalid: "Please enter a valid email and password.",
  credentials: "Email or password is incorrect.",
  suspended: "This account is suspended. Please contact PHLOEM support.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const message = MESSAGES[params.error ?? params.notice ?? ""] ?? null;

  // One id, referenced by both fields: neither error the server returns is
  // field-specific, so pointing a screen reader at the real message beats
  // inventing a per-field one that would be a guess.
  const errorId = message ? "signin-error" : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-base">
      <Card className="w-full max-w-md shadow-pop">
        <CardHeader className="items-center text-center">
          <Image
            src="/phloem-logo.png"
            alt="PHLOEM"
            width={180}
            height={60}
            priority
            className="mx-auto h-14 w-auto"
          />
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground">Your family&apos;s care, in one place.</p>
        </CardHeader>
        <CardContent>
          {message ? (
            <p
              id={errorId}
              role="alert"
              className="mb-4 rounded-md border border-danger/30 bg-danger-tint p-3 text-foreground"
            >
              {message}
            </p>
          ) : null}
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
              <Label htmlFor="password" className="text-base">
                Password
              </Label>
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
        </CardContent>
      </Card>
    </main>
  );
}
