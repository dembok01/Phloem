import { PageHeader } from "@/components/page-header";
import { AuditTable, type AuditRow } from "@/components/admin/audit-table";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

// §10 admin audit view — the audit_log (admin-only via audit_admin RLS). actor_id
// has no FK to profiles, so actor names are resolved in a second scoped query.
//
// The window is 400 rows rather than 100: the table pages through them 50 at a
// time client-side, so searching the log no longer means searching only its most
// recent page.
const WINDOW = 400;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const supabase = await createClient();

  const { data: log } = await supabase
    .from("audit_log")
    .select("id, actor_id, action, entity_type, created_at, meta")
    .order("created_at", { ascending: false })
    .limit(WINDOW);
  const list = log ?? [];

  const actorIds = [...new Set(list.map((r) => r.actor_id).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }

  const rows: AuditRow[] = list.map((r) => ({
    id: Number(r.id),
    when: formatDateTimeIST(r.created_at),
    whenIso: r.created_at,
    actor: r.actor_id ? (names.get(r.actor_id) ?? "—") : "System",
    action: r.action,
    entity: humanize(r.entity_type),
    entityType: r.entity_type,
  }));

  return (
    <section className="space-y-6">
      <PageHeader
        title="Audit log"
        description={`Every recorded action, newest first — the last ${WINDOW}.`}
      />
      <AuditTable rows={rows} initialEntity={entity ?? null} />
    </section>
  );
}
