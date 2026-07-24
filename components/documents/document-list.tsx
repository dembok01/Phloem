"use client";

// Read model for uploaded documents, grouped by category and dated. Download mints
// a short-lived signed URL (the storage read policy gates who can sign); delete is
// shown only when `canDelete` (caregiver on their own member, or admin). Rows are
// fetched RLS-scoped by the server component and passed in.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { formatDateIST } from "@/lib/datetime";
import { CATEGORY_LABEL, CATEGORY_ORDER, formatSize, type DocumentCategory } from "./constants";

export type DocumentRow = {
  id: string;
  category: DocumentCategory;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
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

  async function download(doc: DocumentRow) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 600, { download: doc.file_name });
    if (error || !data) {
      toast("error", "Couldn't open the file. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(doc: DocumentRow) {
    if (!window.confirm(`Delete "${doc.file_name}"? This can't be undone.`)) return;
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

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: documents.filter((d) => d.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map(({ cat, items }) => (
        <div key={cat} className="space-y-2">
          <p className="eyebrow">{CATEGORY_LABEL[cat]}</p>
          <ul className="overflow-hidden rounded-lg border border-border">
            {items.map((doc, i) => (
              <li
                key={doc.id}
                className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.file_name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDateIST(doc.created_at)} · {formatSize(doc.size_bytes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => download(doc)}
                  aria-label={`Download ${doc.file_name}`}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Download className="size-4" aria-hidden />
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => remove(doc)}
                    disabled={busyId === doc.id}
                    aria-label={`Delete ${doc.file_name}`}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-50"
                  >
                    {busyId === doc.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
