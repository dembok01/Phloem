"use client";

// Read a report without leaving the list you found it in.
//
// Every surface that lists reports — the family's Reports page, the clinician's
// report rail, the admin member page, the care timeline — used to push you to
// /reports/[id] and leave you to find your way back. That page is right for a
// deep read (contents rail, version history, print), but it is the wrong price
// for "what did the doctor write". This is the same document, in the same
// chrome-free popup the PDF and the uploaded scans now use.
//
// Content is fetched on open, not shipped with the list: report bodies are large
// and most rows are never opened. The fetch is an ordinary RLS-scoped read, so
// the access boundary is identical to the full page's — a report the viewer's
// rep_* policy does not grant simply comes back empty. The §6 audit is identical
// too: log_report_view fires here exactly as it does on the page, because a read
// is a read.
import * as React from "react";
import Link from "next/link";
import { FileQuestion, Loader2, Maximize2 } from "lucide-react";
import { Sheet, sheetAction } from "@/components/ui/sheet";
import { ReportView } from "@/components/reports/ReportView";
import { REPORT_CSS } from "@/lib/reports/styles";
import { parseReportContent, type ReportContent } from "@/lib/reports/types";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

type Loaded = { content: ReportContent; type: string; created_at: string; version: number };

export function ReportPeek({
  reportId,
  className,
  children,
}: {
  reportId: string;
  /** the trigger's styling — call sites vary from a full card row to an inline link */
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [report, setReport] = React.useState<Loaded | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);

    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("reports")
        .select("content, type, created_at, version")
        .eq("id", reportId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      setReport({
        content: parseReportContent(data.content),
        type: data.type,
        created_at: data.created_at,
        version: data.version,
      });
      // §6: every open is audited, whether it happened here or on the full page.
      void supabase.rpc("log_report_view", { p_report: reportId });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reportId]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      {open ? (
        <Sheet
          open
          onOpenChange={setOpen}
          title={report?.content.title ?? "Report"}
          description={
            report
              ? [
                  humanize(report.type),
                  formatDateTimeIST(report.created_at),
                  report.version > 1 ? `Version ${report.version}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Opening…"
          }
          className="h-[92svh] max-h-[92svh] max-w-3xl overflow-hidden"
          bodyClassName="px-0 pb-0"
          headerActions={
            <Link
              href={`/reports/${reportId}`}
              aria-label="Open the full report page"
              title="Open the full page — contents, versions and print"
              className={sheetAction}
            >
              <Maximize2 className="size-4" aria-hidden />
            </Link>
          }
        >
          {/* REPORT_CSS is a static developer-authored constant (no user data) —
              safe to inline, and the same sheet the full page uses so the
              document reads identically in both. */}
          <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
          <div className="h-full overflow-y-auto border-t bg-muted/40 p-4 sm:p-6">
            {failed ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                <FileQuestion className="size-7 text-danger" aria-hidden />
                <p className="font-medium">Couldn&rsquo;t open this report</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Please try again, or open the full page.
                </p>
              </div>
            ) : !report ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : (
              <article className="mx-auto max-w-2xl rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10 sm:p-8">
                <ReportView content={report.content} />
              </article>
            )}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
