"use client";

// Family-facing failure boundary for the whole /portal subtree. Renders inside
// the app shell, so the header and sign-out stay reachable. The voice is the
// portal's: reassure first (nothing was lost), then give one action.
import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { logError } from "@/lib/observe";
import { cn } from "@/lib/utils";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    logError("portal.render_failed", error, { digest: error.digest });
  }, [error]);

  return (
    <section className="mx-auto max-w-2xl py-4">
      <ErrorState
        icon={AlertTriangle}
        title="This page didn't load"
        description="Something went wrong on our side. Nothing you entered was lost, and your family's information is safe. Try again — if it keeps happening, your care coordinator can help."
        digest={error.digest}
        action={
          <>
            <Button size="lg" onClick={reset}>
              Try again
            </Button>
            <Link
              href="/portal"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Go to portal home
            </Link>
          </>
        }
      />
    </section>
  );
}
