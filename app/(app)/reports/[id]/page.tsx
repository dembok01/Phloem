import { notFound } from "next/navigation";
import { after } from "next/server";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ReportView } from "@/components/reports/ReportView";
import { REPORT_CSS } from "@/lib/reports/styles";
import { parseReportContent } from "@/lib/reports/types";

// Shared report web view (§8): reachable by any authenticated role, but a normal
// RLS-scoped read is the access boundary — if the viewer's `rep_*` policy doesn't
// grant this report, the read returns nothing and we 404. Every view is audited
// via log_report_view.
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("reports")
    .select("id, content")
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();

  // Audit the view server-side (§6 log_report_view) without blocking the render.
  after(async () => {
    await supabase.rpc("log_report_view", { p_report: id });
  });

  const content = parseReportContent(report.content);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* REPORT_CSS is a static developer-authored constant (no user data) — safe to inline. */}
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      <div className="flex items-center justify-end print:hidden">
        <a
          href={`/api/reports/${id}/pdf`}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Download className="size-4" aria-hidden /> Download PDF
        </a>
      </div>
      <div className="rounded-xl bg-card p-6 shadow-card ring-1 ring-foreground/10 sm:p-10">
        <ReportView content={content} />
      </div>
    </div>
  );
}
