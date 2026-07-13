import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

// §10 admin audit view — the audit_log (admin-only via audit_admin RLS). actor_id
// has no FK to profiles, so actor names are resolved in a second scoped query.
export default async function AdminAuditPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("audit_log")
    .select("id, actor_id, action, entity_type, created_at, meta")
    .order("created_at", { ascending: false })
    .limit(100);
  const list = rows ?? [];

  const actorIds = [...new Set(list.map((r) => r.actor_id).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Audit log" description="The 100 most recent recorded actions." />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTimeIST(r.created_at)}</td>
                    <td className="px-4 py-3">{r.actor_id ? (names.get(r.actor_id) ?? "—") : "System"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="muted">{r.action}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{humanize(r.entity_type)}</td>
                  </tr>
                ))}
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      No audit entries yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
