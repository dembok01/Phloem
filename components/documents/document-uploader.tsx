"use client";

// Caregiver document upload. Bytes go straight to the private `documents` bucket
// from the browser (storage RLS authorises the write by the "<member_id>/…" path),
// then a `member_documents` row records the metadata (its RLS insert policy is the
// real boundary). Supports selecting/dropping several files at once; one category
// applies to the batch. Client-side type/size checks are courtesy — the bucket and
// RLS enforce the same limits.
import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_ATTR,
  ACCEPTED_EXT,
  ACCEPTED_MIME,
  contentTypeFor,
  DOCUMENT_CATEGORIES,
  MAX_BYTES,
  type DocumentCategory,
} from "./constants";

export function DocumentUploader({
  memberId,
  onUploaded,
  className,
}: {
  memberId: string;
  onUploaded?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [category, setCategory] = React.useState<DocumentCategory>("blood_work");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  async function uploadFiles(files: File[]) {
    const valid: File[] = [];
    for (const f of files) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ACCEPTED_MIME.includes(f.type) && !ACCEPTED_EXT.includes(ext)) {
        toast("error", `${f.name}: unsupported file type.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast("error", `${f.name} is over 15 MB.`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    setBusy(true);
    setProgress({ done: 0, total: valid.length });
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let ok = 0;
    for (const file of valid) {
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${memberId}/${crypto.randomUUID()}.${ext}`;
      const contentType = contentTypeFor(file, ext);

      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType });
      if (upErr) {
        toast("error", `Couldn't upload ${file.name}.`);
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        continue;
      }

      const { error: rowErr } = await supabase.from("member_documents").insert({
        member_id: memberId,
        category,
        file_name: file.name,
        storage_path: path,
        mime_type: contentType,
        size_bytes: file.size,
        uploaded_by: user?.id ?? null,
      });
      if (rowErr) {
        // Don't leave an orphaned object behind if the metadata write is refused.
        await supabase.storage.from("documents").remove([path]);
        toast("error", `Couldn't save ${file.name}.`);
      } else {
        ok += 1;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    setBusy(false);
    setProgress(null);
    if (ok > 0) {
      toast("success", ok === 1 ? "Document uploaded" : `${ok} documents uploaded`);
      onUploaded?.();
      router.refresh();
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same files
    if (files.length > 0) void uploadFiles(files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void uploadFiles(files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-xl border border-dashed p-5 transition-colors",
        dragging ? "border-primary bg-secondary" : "border-input bg-muted/30",
        className,
      )}
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium sm:flex-row sm:items-center sm:gap-2">
          <span>Type of document</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            disabled={busy}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:h-9 sm:text-sm"
          >
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_ATTR}
          className="hidden"
          onChange={onPick}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <UploadCloud className="size-5" aria-hidden />
          )}
          {busy
            ? progress
              ? `Uploading ${progress.done}/${progress.total}…`
              : "Uploading…"
            : "Choose files to upload"}
        </button>
        <p className="text-xs text-muted-foreground">
          PDF, JPG, PNG or HEIC · up to 15 MB each · you can add several at once, or drag them here.
        </p>
      </div>
    </div>
  );
}
