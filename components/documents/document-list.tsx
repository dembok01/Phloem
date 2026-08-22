"use client";

// Read model for uploaded documents, grouped by category and dated.
//
// Viewing opens the file inside the dashboard (DocumentViewer) rather than
// handing it to the browser as a download — the row is the primary affordance,
// so clicking the name opens it. Downloading stays available as its own action.
// Delete is shown only when `canDelete` (caregiver on their own member, or
// admin). Rows are fetched RLS-scoped by the server component and passed in.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileImage, FileText, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { formatDateIST } from "@/lib/datetime";
import { previewKind } from "@/lib/document-preview";
import { CATEGORY_LABEL, CATEGORY_ORDER, formatSize, type DocumentCategory } from "./constants";
import { DocumentViewer } from "./document-viewer";
import { cn } from "@/lib/utils";

export type DocumentRow = {
  id: string;
  category: DocumentCategory;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  /** Nullable: rows written before mime_type was recorded fall back to the filename. */
  mime_type: string | null;
};

export function DocumentList({
  documents,
  canDelete = false,
  emptyHint = "No documents yet.",
}: {
  documents: DocumentRow[];
  canDelete?: boolean;
  emptyHint?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  const groups = React.useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: documents.filter((d) => d.category === cat),
      })).filter((g) => g.items.length > 0),
    [documents],
  );

  // The viewer steps through documents in the order they are DISPLAYED, not the
  // order they arrived, so "next" means the next one on screen.
  const ordered = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const indexOf = React.useCallback(
    (id: string) => ordered.findIndex((d) => d.id === id),
    [ordered],
  );

  async function download(doc: DocumentRow) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 600, { download: doc.file_name });
    if (error || !data) {
      toast("error", "Couldn't download the file. Please try again.");
      return;
    }
    window.location.href = data.signedUrl;
  }

  // Deleting removes the stored object, so there is nothing to undo afterwards —
  // the confirmation has to come first. It is an inline step on the row rather
  // than window.confirm: the native dialog blocks the tab, is the only browser
  // chrome left in the app, and names the file in a box that looks nothing like
  // the thing it is about to delete.
  async function remove(doc: DocumentRow) {
    setConfirmId(null);
    setBusyId(doc.id);
    const supabase = createClient();
    await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("member_documents").delete().eq("id", doc.id);
    setBusyId(null);
    if (error) {
      toast("error", "Couldn't delete the document.");
      return;
    }
    toast("success", "Document deleted");
    router.refresh();
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <>
      <div className="space-y-5">
        {groups.map(({ cat, items }) => (
          <div key={cat} className="space-y-2">
            <p className="eyebrow">{CATEGORY_LABEL[cat]}</p>
            <ul className="overflow-hidden rounded-lg border border-border">
              {items.map((doc, i) => {
                const kind = previewKind(doc.mime_type, doc.file_name);
                const Icon = kind === "image" ? FileImage : FileText;
                return (
                  <li
                    key={doc.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
                      i > 0 && "border-t border-border",
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <button
                      type="button"
                      onClick={() => setOpenIndex(indexOf(doc.id))}
                      className="pressable min-w-0 flex-1 rounded-md text-left"
                    >
                      <span className="block truncate text-sm font-medium hover:text-primary">
                        {doc.file_name}
                      </span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {formatDateIST(doc.created_at)} · {formatSize(doc.size_bytes)}
                        {kind === "unsupported" ? " · no preview" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(indexOf(doc.id))}
                      aria-label={`View ${doc.file_name}`}
                      className="pressable inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Eye className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => download(doc)}
                      aria-label={`Download ${doc.file_name}`}
                      className="pressable inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Download className="size-4" aria-hidden />
                    </button>
                    {canDelete ? (
                      confirmId === doc.id ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            Delete for good?
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(doc)}
                            className="pressable rounded-lg bg-danger px-2.5 py-1.5 text-xs font-medium text-white"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="pressable rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(doc.id)}
                          disabled={busyId === doc.id}
                          aria-label={`Delete ${doc.file_name}`}
                          className="pressable inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-50"
                        >
                          {busyId === doc.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </button>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <DocumentViewer
        docs={ordered}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
