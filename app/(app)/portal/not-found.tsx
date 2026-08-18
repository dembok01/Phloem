// Catches `notFound()` from the portal's member pages (plans, reports, schedule,
// documents), which throw it when RLS returns no member for the id in the URL.
// The copy has to cover that case honestly without confirming or denying that a
// member exists — "shared with you" is the truthful framing either way.
import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

export default function PortalNotFound() {
  return (
    <section className="mx-auto max-w-2xl py-4">
      <ErrorState
        icon={Compass}
        tone="info"
        title="We couldn't find that page"
        description="The link may be out of date, or it may point somewhere that isn't shared with you. Your portal home has everything your care team has shared."
        action={
          <Link href="/portal" className={cn(buttonVariants({ size: "lg" }))}>
            Go to portal home
          </Link>
        }
      />
    </section>
  );
}
