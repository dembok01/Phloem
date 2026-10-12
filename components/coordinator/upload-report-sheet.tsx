"use client";

// Upload a report as a file (0054/0055) — the coordinator's member page and the
// nutritionist's client page both use this. The uploader picks WHICH report from
// the member's own consultations and cycles, so the report's type follows from
// that choice: a first-consultation plan, a trainer or psychologist review, or a
// diet review (one per review meeting, so two a month is two uploads). Then the
// file, an optional note, and one line saying who will be able to open it,
// because sending it to the wrong member is the mistake that matters here.
import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { finishReportUpload, startReportUpload } from "@/app/(app)/reports/upload-actions";

export type UploadTarget = {
  kind: "slot" | "review";
  /** consultation id (slot) or cycle id (review) */
  id: string;
  /** "Nutritionist — first consultation (nutrition plan)" / "Diet review — cycle 2" */
  label: string;
  /** "met 12 Sep · waiting for the report" / "1 Oct – 30 Oct · 1 review so far" */
  detail: string;
  /** "family, doctor, nutritionist and trainer" */
  audience: string;
  /** An upload is already attached; this one replaces it (slots only). */
  replaces?: boolean;
  /** reviews: the cycle's dates, yyyy-mm-dd, to bound the meeting date */
  start?: string;
  end?: string;
  /** A doctor's report: the uploader states the exercise clearance it gives (0058). */
  clearance?: "initial" | "review";
};

// The doctor's form's own values. "" = not stated (initial) / unchanged (review).
const CLEARANCE_OPTIONS = [
  ["cleared", "Cleared for exercise"],
  ["cleared_with_restrictions", "Cleared with restrictions"],
  ["on_hold", "On hold — no exercise yet"],
] as const;
type Clearance = (typeof CLEARANCE_OPTIONS)[number][0];

const MIME_BY_EXT: Record<string, "application/pdf" | "image/jpeg" | "image/png"> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
const MAX_BYTES = 15 * 1024 * 1024;

function mimeOf(file: File) {
  if (file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png") {
    return file.type;
  }
  return MIME_BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Today in India, yyyy-mm-dd — the date the RPC checks against. */
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function UploadReportSheet({
  memberId,
  memberName,
  targets,
  preselect,
  triggerLabel = "Upload a report",
  triggerVariant = "outline",
  /** Added to the "who can open it" line — the coordinator, who isn't in the audience. */
  selfLine = "and so will you",
}: {
  memberId: string;
  memberName: string;
  targets: UploadTarget[];
  preselect?: string;
  triggerLabel?: string;
  triggerVariant?: "outline" | "secondary" | "default";
  selfLine?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState(preselect ?? (targets.length === 1 ? targets[0].id : ""));
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [reviewDate, setReviewDate] = React.useState(todayIST());
  // null = not chosen yet; "" = not stated / unchanged.
  const [clearance, setClearance] = React.useState<Clearance | "" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  const target = targets.find((t) => t.id === targetId) ?? null;
  const today = todayIST();

  // An image gets a thumbnail so the uploader can see it's the right page.
  React.useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f: File | null) {
    setError(null);
    if (f && !mimeOf(f)) {
      setError("Choose a PDF, JPG or PNG file.");
      setFile(null);
    } else if (f && f.size > MAX_BYTES) {
      setError("That file is over 15 MB. Send a smaller copy.");
      setFile(null);
    } else {
      setFile(f);
    }
  }

  function reset() {
    setFile(null);
    setNote("");
    setError(null);
    setBusy(false);
    setReviewDate(todayIST());
    setClearance(null);
  }

  async function upload() {
    const fileMime = file ? mimeOf(file) : null;
    if (!target || !file || !fileMime) return;
    setBusy(true);
    setError(null);
    try {
      const ref = { kind: target.kind, id: target.id };
      const start = await startReportUpload({ member_id: memberId, target: ref, mime: fileMime, size: file.size });
      if (!start.ok) throw new Error(start.error);

      const { error: upErr } = await createClient()
        .storage.from("reports")
        .uploadToSignedUrl(start.data.path, start.data.token, file, { contentType: fileMime });
      if (upErr) throw new Error("The file didn't upload. Check the connection and try again.");

      const done = await finishReportUpload({
        member_id: memberId,
        target: ref,
        path: start.data.path,
        file_name: file.name,
        mime: fileMime,
        size: file.size,
        note: note.trim() || undefined,
        review_date: target.kind === "review" ? reviewDate : undefined,
        clearance: target.clearance && clearance ? clearance : undefined,
      });
      if (!done.ok) throw new Error(done.error);

      setOpen(false);
      reset();
      toast(
        "success",
        target.kind === "review"
          ? "Diet review uploaded — it's with the member's reports"
          : target.replaces
            ? "File replaced — everyone now sees the new one"
            : "Report uploaded — it's with the member's reports",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the report. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <Upload className="size-3.5" aria-hidden /> {triggerLabel}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={`Upload a report for ${memberName}`}
        description="A PDF or a photo of the report, as it was written."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={upload}
              disabled={!target || !file || busy || (!!target.clearance && clearance === null)}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? "Uploading…" : target?.replaces ? "Replace the file" : "Upload report"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={`${id}-target`}>Which report is this?</Label>
            <select
              id={`${id}-target`}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              disabled={busy}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {target ? null : <option value="">Choose a report…</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {target ? <p className="text-sm text-muted-foreground">{target.detail}</p> : null}
          </div>

          {target?.clearance ? (
            <div className="space-y-2">
              <Label htmlFor={`${id}-clearance`}>Exercise clearance in this report</Label>
              <select
                id={`${id}-clearance`}
                value={clearance ?? "choose"}
                onChange={(e) => setClearance(e.target.value as Clearance | "")}
                disabled={busy}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {clearance === null ? <option value="choose">Choose what the report says…</option> : null}
                {CLEARANCE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                <option value="">
                  {target.clearance === "initial" ? "The report doesn't say" : "No change from before"}
                </option>
              </select>
              <p className="text-sm text-muted-foreground">
                {target.clearance === "initial"
                  ? "The trainer's plan stays locked until a doctor's report clears exercise. Uploading this report also starts the program, as the doctor's own report would."
                  : "The trainer works from the latest clearance a doctor's report gives."}
              </p>
            </div>
          ) : null}

          {target?.kind === "review" ? (
            <div className="space-y-2">
              <Label htmlFor={`${id}-date`}>Date of the review meeting</Label>
              <Input
                id={`${id}-date`}
                type="date"
                value={reviewDate}
                min={target.start}
                max={target.end && target.end < today ? target.end : today}
                onChange={(e) => setReviewDate(e.target.value)}
                disabled={busy}
                className="h-11"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`${id}-file`}>The file</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="h-auto py-2"
            />
            <p className="text-xs text-muted-foreground">PDF, JPG or PNG, up to 15 MB.</p>
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a page asset
                  <img src={preview} alt="" className="size-16 shrink-0 rounded-md object-cover" />
                ) : (
                  <FileText className="size-8 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-muted-foreground">{sizeLabel(file.size)}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-note`}>
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. Sent on WhatsApp, 20 Sep"
              disabled={busy}
              className="h-11"
            />
          </div>

          {target ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              {target.replaces ? "This replaces the file uploaded earlier. " : ""}
              <span className="font-medium">{memberName}</span>&apos;s {target.audience} will be able to
              open it{selfLine ? `, ${selfLine}` : ""}.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-tint p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
