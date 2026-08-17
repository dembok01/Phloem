// Root 404. Renders inside RootLayout only — no app shell — so it carries its own
// centred page chrome, like the sign-in door. Signed-in visitors who follow the
// action land on their role home; signed-out ones are sent to /login by middleware.
import Image from "next/image";
import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-4">
      <Image
        src="/phloem-logo.png"
        alt="PHLOEM"
        width={180}
        height={60}
        priority
        className="h-12 w-auto"
      />
      <ErrorState
        className="w-full max-w-md"
        icon={Compass}
        tone="info"
        title="Page not found"
        description="This link may be out of date or mistyped. Everything shared with you is reachable from your home page."
        action={
          <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
            Take me home
          </Link>
        }
      />
    </main>
  );
}
