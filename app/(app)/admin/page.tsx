import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

async function counts() {
  const supabase = await createClient();
  const [members, team, pendingInvites] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["doctor", "nutritionist", "trainer", "psychologist"]),
    supabase
      .from("invites")
      .select("id", { count: "exact", head: true })
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return {
    members: members.count ?? 0,
    team: team.count ?? 0,
    pendingInvites: pendingInvites.count ?? 0,
  };
}

export default async function AdminOverviewPage() {
  const c = await counts();
  const tiles = [
    { href: "/admin/members", label: "Members", value: c.members },
    { href: "/admin/care-team", label: "Care team", value: c.team },
    { href: "/admin/invites", label: "Pending invites", value: c.pendingInvites },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Admin overview</h1>
        <p className="text-muted-foreground">
          Manage members, the care team and invitations. Pipeline analytics and the renewal radar
          arrive in Phase 8.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="text-muted-foreground">{t.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-semibold">{t.value}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
