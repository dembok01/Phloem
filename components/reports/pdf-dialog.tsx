"use client";

// "View PDF" used to hand the tab to the browser's PDF application — new tab,
// thumbnail sidebar, zoom toolbar, the report somewhere in the middle. It reads
// like leaving the dashboard. This keeps you where you were: a popup over the
// page holding nothing but the document, scrollable, with the sidebar and
// toolbar suppressed by PDF_CHROMELESS.
//
// The <iframe> is mounted only while open. The route regenerates the PDF with a
// headless Chromium on a cache miss, so mounting it eagerly would pay for a
// render nobody asked to see.
import * as React from "react";
import { Download, ExternalLink } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { PDF_CHROMELESS } from "@/lib/document-preview";

export function PdfDialog({ reportId, title }: { reportId: string; title: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ExternalLink className="size-4" aria-hidden /> View PDF
      </button>

      {open ? (
        <Sheet
          open
          onOpenChange={setOpen}
          title={title}
          description="The printed version of this report."
          className="h-[92svh] max-h-[92svh] max-w-5xl overflow-hidden"
          bodyClassName="p-0"
          headerActions={
            <a
              href={`/api/reports/${reportId}/pdf`}
              aria-label="Download this report as a PDF"
              className="pressable inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Download className="size-4" aria-hidden />
            </a>
          }
        >
          <div className="h-full border-t bg-muted/40">
            <iframe
              src={`/api/reports/${reportId}/pdf?view=1${PDF_CHROMELESS}`}
              title={title}
              className="size-full border-0"
            />
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
