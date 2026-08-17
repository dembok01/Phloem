"use client";

// Failure boundary for the sign-in and invite-accept doors. These are the first
// two screens a family ever sees, so a raw error page here is the worst possible
// first impression — this keeps it a designed surface with a way forward.
import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { logError } from "@/lib/observe";
import { cn } from "@/lib/utils";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    logError("auth.render_failed", error, { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <ErrorState
        className="w-full max-w-md"
        icon={AlertTriangle}
        title="We couldn't load this page"
        description="Something went wrong on our side — this isn't anything you did. Try again in a moment. If you were opening an invitation, your coordinator can send a fresh link."
        digest={error.digest}
        action={
          <>
            <Button size="lg" onClick={reset}>
              Try again
            </Button>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Go to sign in
            </Link>
          </>
        }
      />
    </main>
  );
}
