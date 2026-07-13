import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ToastProvider } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { ROLE_ACCENT_BAR, ROLE_CHIP, ROLE_LABEL, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ROLE_HOME: Record<UserRole, string> = {
  admin: "/admin",
  coordinator: "/coordinator",
  doctor: "/clinician/clients",
  nutritionist: "/clinician/clients",
  trainer: "/clinician/clients",
  psychologist: "/clinician/clients",
  caregiver: "/portal",
  member: "/portal",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status === "suspended") redirect("/login?notice=suspended");

  const role = profile.role as UserRole;

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-pop"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              href={ROLE_HOME[role]}
              className="flex shrink-0 items-center rounded-md"
              aria-label="PHLOEM home"
            >
              <Image
                src="/phloem-logo.png"
                alt="PHLOEM"
                width={120}
                height={40}
                className="h-8 w-auto"
                priority
              />
            </Link>
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
              <NotificationBell />
              <span className="hidden min-w-0 items-center gap-2 sm:flex">
                <span className="truncate font-medium">{profile.full_name}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
                    ROLE_CHIP[role],
                  )}
                >
                  {ROLE_LABEL[role]}
                </span>
              </span>
              <form action={logout}>
                <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
          {/* Role context line — each shell carries its hue (DESIGN-SYSTEM §1). */}
          <div className={cn("h-0.5 w-full", ROLE_ACCENT_BAR[role])} aria-hidden />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
