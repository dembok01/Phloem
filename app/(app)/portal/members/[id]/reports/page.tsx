import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

// §10 caregiver "Reports" — every report the viewer's rep_* policy permits, no
// more (RLS is the filter, so only allowed types ever appear).
export default async function PortalReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase.from("members").select("id, full_name").eq("id", id).maybeSingle();
  if (!member) notFound();

  const { data: reports } = await supabase
    .from("reports")
    .select("id, type, created_at")
    .eq("member_id", id)
    .order("created_at", { ascending: false });
  const list = reports ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Portal
      </Link>
      <h1 className="text-2xl font-semibold">{member.full_name} — Reports</h1>

      {list.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center text-muted-foreground ring-1 ring-foreground/10">
          <p className="text-base">No reports available yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reports/${r.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">{humanize(r.type)}</p>
                  <p className="text-sm text-muted-foreground">{formatDateIST(r.created_at)}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
