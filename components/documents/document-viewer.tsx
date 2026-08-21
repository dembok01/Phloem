"use client";

// In-dashboard viewer for family-uploaded documents.
//
// Everything here exists because the previous behaviour was download-only: the
// list minted its signed URL with Supabase's `download` option, which sets
// Content-Disposition: attachment, so the browser saved the file instead of
// showing it. Viewing needs the SAME signed URL without that flag — the stored
// Content-Type (set at upload by contentTypeFor) then lets the browser render
// it. No re-upload, no migration; just two different URLs for two intents.
import * as React from "react";
import { Download, FileQuestion, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { previewKind, unsupportedReason } from "@/lib/document-preview";
import { formatDateIST } from "@/lib/datetime";
import { CATEGORY_LABEL, formatSize } from "./constants";
import type { DocumentRow } from "./document-list";

/** Ten minutes: long enough to read a scan, short enough that a copied URL rots. */
const TTL_SECONDS = 600;

export function DocumentViewer({
  docs,
  index,
  onIndexChange,
  onClose,
}: {
  docs: DocumentRow[];
  /** null = closed. */
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const doc = index === null ? null : (docs[index] ?? null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  const kind = doc ? previewKind(doc.mime_type, doc.file_name) : "unsupported";

  // Mint a fresh VIEW url (no `download` flag) whenever the open document
  // changes. Unsupported types never get one — there is nothing to render.
  React.useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (!doc || kind === "unsupported") return;

    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, TTL_SECONDS);
      if (cancelled) return;
      if (error || !data) setFailed(true);
      else setUrl(data.signedUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, kind]);

  const hasPrev = index !== null && index > 0;
  const hasNext = index !== null && index < docs.length - 1;

  // Left/right step through the list without closing — the whole reason a
  // reviewer opens this thing is usually "show me all of them".
  React.useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index! - 1);
      if (e.key === "ArrowRight" && hasNext) onIndexChange(index! + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onIndexChange]);

  if (!doc) return null;

  return (
    <Sheet
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={doc.file_name}
      description={`${CATEGORY_LABEL[doc.category]} · ${formatDateIST(doc.created_at)} · ${formatSize(doc.size_bytes)}`}
      className="max-w-5xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasPrev}
              onClick={() => hasPrev && onIndexChange(index! - 1)}
              aria-label="Previous document"
              className="pressable"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {index! + 1} of {docs.length}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasNext}
              onClick={() => hasNext && onIndexChange(index! + 1)}
              aria-label="Next document"
              className="pressable"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
          <DownloadButton doc={doc} />
        </div>
      }
    >
      <div className="h-[68svh] overflow-hidden rounded-lg border bg-muted/40">
        {kind === "unsupported" ? (
          <Message
            icon={<FileQuestion className="size-7 text-muted-foreground" aria-hidden />}
            title="No preview available"
            body={unsupportedReason(doc.mime_type, doc.file_name)}
          />
        ) : failed ? (
          <Message
            icon={<FileQuestion className="size-7 text-danger" aria-hidden />}
            title="Couldn't open this file"
            body="The link could not be created. Please try again, or download the file instead."
          />
        ) : !url ? (
          <Message
            icon={<Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />}
            title="Opening…"
          />
        ) : kind === "pdf" ? (
          // <iframe> rather than <embed>: it is the only one that reliably shows
          // the browser's own PDF toolbar (page count, zoom, print) on all of
          // Chrome, Firefox and Safari.
          <iframe src={url} title={doc.file_name} className="size-full border-0" />
        ) : (
          <div className="size-full overflow-auto p-2">
            {/* Not next/image: this is a short-lived signed URL on a private
                bucket, so there is nothing for the optimizer to cache. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={doc.file_name}
              className="mx-auto max-h-full w-auto object-contain"
              onError={() => setFailed(true)}
            />
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Message({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
    </div>
  );
}

/** Downloading is a separate intent, so it keeps the `download` flag. */
function DownloadButton({ doc }: { doc: DocumentRow }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      type="button"
      size="sm"
      disabled={busy}
      className="pressable"
      onClick={async () => {
        setBusy(true);
        const supabase = createClient();
        const { data } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, TTL_SECONDS, { download: doc.file_name });
        setBusy(false);
        if (data) window.location.href = data.signedUrl;
      }}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      Download
    </Button>
  );
}
