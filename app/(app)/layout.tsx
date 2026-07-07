import Image from "next/image";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";

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

  return (
    <div className="min-h-screen bg-muted/20 text-base">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <Image src="/phloem-logo.png" alt="PHLOEM" width={120} height={40} className="h-9 w-auto" />
        <div className="flex items-center gap-4">
          <NotificationBell />
          <span>
            {profile.full_name}
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-sm capitalize text-muted-foreground">
              {profile.role}
            </span>
          </span>
          <form action={logout}>
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
