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

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4 text-base">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Image
            src="/phloem-logo.png"
            alt="PHLOEM"
            width={180}
            height={60}
            priority
            className="mx-auto h-14 w-auto"
          />
          <p className="text-muted-foreground">Personalised chronic care, one login away.</p>
        </CardHeader>
        <CardContent>
          {message ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
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
