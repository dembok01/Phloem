"use client";

// Failure boundary for every signed-in surface except /portal, which has its own
// with the family's voice. Renders inside the app shell. Note this does NOT catch
// errors thrown by `app/(app)/layout.tsx` itself — those bubble to global-error.
import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { logError } from "@/lib/observe";
import { cn } from "@/lib/utils";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    logError("app.render_failed", error, { digest: error.digest });
  }, [error]);

  return (
    <section className="mx-auto max-w-2xl py-4">
      <ErrorState
        icon={AlertTriangle}
        title="This page couldn't load"
        description="Something went wrong loading this view. No data was changed. Try again, or head back to your dashboard — quote the reference below if you report it."
        digest={error.digest}
        action={
          <>
            <Button onClick={reset}>Try again</Button>
            {/* Middleware maps "/" to the signed-in user's role home. */}
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to dashboard
            </Link>
          </>
        }
      />
    </section>
  );
}
