import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Download, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ReportView } from "@/components/reports/ReportView";
import { REPORT_CSS } from "@/lib/reports/styles";
import { parseReportContent } from "@/lib/reports/types";
import { formatDateTimeIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";
import { PrintButton } from "@/components/portal/print-button";

// Shared report web view (§8): reachable by any authenticated role, but a normal
// RLS-scoped read is the access boundary — if the viewer's `rep_*` policy doesn't
// grant this report, the read returns nothing and we 404. Every view is audited
// via log_report_view.
//
// W1.7 chrome: the document is the page, so the chrome stays out of its way — one
// action bar that sticks while you read, a contents rail on wide screens (a progress
// summary runs long), and a link to the version this one replaced. All of it is
// print:hidden, so what comes out of the printer is the document alone.
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("reports")
    .select("id, content, type, cycle_id, version, supersedes, created_at, member_id")
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();

  // Audit the view server-side (§6 log_report_view) without blocking the render.
  after(async () => {
    await supabase.rpc("log_report_view", { p_report: id });
  });

  // Both reads are RLS-scoped and may legitimately return nothing (a role that can
  // see the report but not the member row) — the header degrades rather than fails.
  const [{ data: member }, { data: newer }] = await Promise.all([
    supabase.from("members").select("full_name").eq("id", report.member_id).maybeSingle(),
    supabase
      .from("reports")
      .select("id, version")
      .eq("supersedes", report.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const content = parseReportContent(report.content);
  const headings = content.sections.map((s) => s.heading).filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl">
      {/* REPORT_CSS is a static developer-authored constant (no user data) — safe to inline. */}
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />

      <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start lg:gap-8">
        <aside className="lg:sticky lg:top-6 lg:w-56 lg:shrink-0 print:hidden">
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
            <div>
              <p className="eyebrow">{humanize(report.type)}</p>
              <p className="text-sm font-medium">{member?.full_name ?? "Report"}</p>
              <p className="font-data text-xs text-muted-foreground">
                {content.cycle != null ? `Cycle ${content.cycle} · ` : ""}
                {formatDateTimeIST(report.created_at)}
              </p>
              {report.version > 1 ? (
                <p className="font-data text-xs text-muted-foreground">Version {report.version}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <a
                href={`/api/reports/${id}/pdf`}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Download className="size-4" aria-hidden /> Download PDF
              </a>
              <PrintButton label="Print this report" />
            </div>

            {headings.length > 2 ? (
              <nav aria-label="Sections" className="border-t pt-3">
                <p className="eyebrow mb-1.5">Contents</p>
                <ol className="space-y-1">
                  {headings.map((h, i) => (
                    <li key={i}>
                      <a
                        href={`#section-${i}`}
                        className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {h}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            {report.supersedes || newer ? (
              <div className="space-y-1 border-t pt-3">
                <p className="eyebrow flex items-center gap-1.5">
                  <History className="size-3" aria-hidden /> Versions
                </p>
                {newer ? (
                  <Link
                    href={`/reports/${newer.id}`}
                    className="block text-xs text-primary hover:underline"
                  >
                    A newer version (v{newer.version}) replaced this one
                  </Link>
                ) : null}
                {report.supersedes ? (
                  <Link
                    href={`/reports/${report.supersedes}`}
                    className="block text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Read the version this replaced
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <article className="min-w-0 flex-1 rounded-xl bg-card p-6 shadow-card ring-1 ring-foreground/10 sm:p-10 print:p-0 print:shadow-none print:ring-0">
          <ReportView content={content} sectionIdPrefix="section-" />
        </article>
      </div>
    </div>
  );
}
