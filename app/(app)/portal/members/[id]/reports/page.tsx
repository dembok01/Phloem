import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

// What each report type means to a family, in one line.
const REPORT_HINT: Record<string, string> = {
  onboarding_summary: "Everything you told us at the start, in one document",
  nutrition_plan: "The eating pattern to follow day to day",
  nutrition_review: "How nutrition went this cycle, and what changes",
  training_plan: "The exercise programme, with safety notes",
  training_review: "How training went this cycle, and what changes",
  doctor_initial: "The doctor's assessment and directions",
  doctor_review: "The doctor's monthly review",
  performance: "The monthly progress summary",
};

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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Reports"
        description={`Documents from ${member.full_name.split(" ")[0]}'s care team, shared with your family.`}
        crumbs={[{ label: "Portal", href: "/portal" }, { label: "Reports" }]}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Reports build up as care happens"
          description="The onboarding summary, plans, and cycle reviews are added here as the care team writes them."
        />
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reports/${r.id}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-secondary/40"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">{humanize(r.type)}</p>
                  <p className="text-sm text-muted-foreground">
                    {REPORT_HINT[r.type] ?? "From the care team"} · {formatDateIST(r.created_at)}
                  </p>
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
