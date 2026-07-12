import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ReportView } from "@/components/reports/ReportView";
import { REPORT_CSS } from "@/lib/reports/styles";
import { parseReportContent } from "@/lib/reports/types";
import { PrintButton } from "@/components/portal/print-button";

// §10 caregiver/elderly "Plans" — nutrition & training plans front and centre,
// printable. RLS (rep_cg / rep_member) is the access boundary.
export default async function PortalPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase.from("members").select("id, full_name").eq("id", id).maybeSingle();
  if (!member) notFound();

  const { data: reports } = await supabase
    .from("reports")
    .select("id, type, content, created_at")
    .eq("member_id", id)
    .in("type", ["nutrition_plan", "nutrition_review", "training_plan", "training_review"])
    .order("created_at", { ascending: false });

  const latest = (prefixes: string[]) =>
    (reports ?? []).find((r) => prefixes.some((p) => r.type.startsWith(p)));
  const nutrition = latest(["nutrition"]);
  const training = latest(["training"]);
  const plans = [nutrition, training].filter(Boolean) as NonNullable<typeof nutrition>[];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      <div className="flex items-center justify-between print:hidden">
        <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Portal
        </Link>
        {plans.length > 0 ? <PrintButton label="Print plans" /> : null}
      </div>

      <h1 className="text-2xl font-semibold">{member.full_name} — Plans</h1>

      {plans.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center text-muted-foreground ring-1 ring-foreground/10">
          <p className="text-base">No plans yet. They&apos;ll appear here once your care team creates them.</p>
        </div>
      ) : (
        plans.map((r) => (
          <div key={r.id} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
            <ReportView content={parseReportContent(r.content)} />
          </div>
        ))
      )}
    </div>
  );
}
