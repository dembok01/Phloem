"use client";

// W1.4 — the doctor's controls on a case. Read-only roles never render this, and
// the RPCs re-check the caller regardless, so this is purely the authoring surface.
//
// Deliberately quiet: a case row is a reading surface first. The controls are a
// single row of small actions under the thread, and the note box only appears once
// you ask for it, so a member with eight tracked problems does not become a wall of
// textareas.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquarePlus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  addCaseNote,
  setCaseSharing,
  setCaseStatus,
} from "@/app/(app)/clinician/clients/[id]/actions";

export function CaseControls({
  caseId,
  memberId,
  status,
  shared,
}: {
  caseId: string;
  memberId: string;
  status: string;
  shared: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const router = useRouter();
  const { toast } = useToast();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast("success", success);
        router.refresh();
      } else {
        toast("error", res.error ?? "That didn't work. Please try again.");
      }
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "resolved" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => setCaseStatus({ case_id: caseId, member_id: memberId, status: "open" }), "Case reopened")
            }
          >
            <Undo2 className="size-3.5" aria-hidden /> Reopen
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    setCaseStatus({
                      case_id: caseId,
                      member_id: memberId,
                      status: status === "monitoring" ? "open" : "monitoring",
                    }),
                  status === "monitoring" ? "Moved back to active" : "Now monitoring",
                )
              }
            >
              {status === "monitoring" ? "Mark active" : "Just monitoring"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => setCaseStatus({ case_id: caseId, member_id: memberId, status: "resolved" }),
                  "Case resolved",
                )
              }
            >
              <Check className="size-3.5" aria-hidden /> Resolve
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setNoteOpen((v) => !v)}
          aria-expanded={noteOpen}
        >
          <MessageSquarePlus className="size-3.5" aria-hidden /> Add note
        </Button>

        <button
          type="button"
          role="switch"
          aria-checked={shared}
          disabled={pending}
          onClick={() =>
            run(
              () => setCaseSharing({ case_id: caseId, member_id: memberId, shared: !shared }),
              shared ? "Hidden from the family" : "Now visible to the family",
            )
          }
          className="ml-auto inline-flex items-center gap-2 text-xs font-medium disabled:opacity-60"
        >
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              shared ? "bg-primary" : "bg-input",
            )}
          >
            <span
              className={cn(
                "inline-block size-4 rounded-full bg-card shadow transition-transform",
                shared ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </span>
          <span className={shared ? "text-foreground" : "text-muted-foreground"}>
            {shared ? "Family can see this" : "Show to family"}
          </span>
        </button>
      </div>

      {noteOpen ? (
        <div className="space-y-2">
          <label htmlFor={`note-${caseId}`} className="sr-only">
            Note for this case
          </label>
          <textarea
            id={`note-${caseId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What changed, and what you did about it."
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pending}
              disabled={pending || note.trim() === ""}
              onClick={() =>
                run(async () => {
                  const res = await addCaseNote({
                    case_id: caseId,
                    member_id: memberId,
                    summary: note,
                  });
                  if (res.ok) {
                    setNote("");
                    setNoteOpen(false);
                  }
                  return res;
                }, "Note saved")
              }
            >
              Save note
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
