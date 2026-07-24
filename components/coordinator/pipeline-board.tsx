"use client";

// P-2 — the pipeline board with real drag-and-drop.
//
// Cards are draggable and columns are drop targets. Dropping a *ready* member on
// the Active column starts their program (the one input-free §6 transition);
// every other drop hands off to the member page, where the side-effect-heavy
// steps live behind their dialogs. Cards stay links, so click and keyboard reach
// the same destinations — drag is a progressive enhancement, never the only path.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { Monogram } from "@/components/monogram";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { movePipelineCard } from "@/app/(app)/coordinator/pipeline/actions";
import type { MemberStatus } from "@/lib/member-status";

export type PipelineColumn = { key: string; label: string; statuses: MemberStatus[] };
export type PipelineCard = {
  id: string;
  full_name: string;
  status: MemberStatus;
  high: boolean;
  hasFlags: boolean;
  nextAction: string;
};

export function PipelineBoard({
  columns,
  cards,
}: {
  columns: PipelineColumn[];
  cards: PipelineCard[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const columnOf = React.useCallback(
    (status: MemberStatus) => columns.find((c) => c.statuses.includes(status))?.key ?? null,
    [columns],
  );

  function handleDrop(colKey: string) {
    const card = cards.find((c) => c.id === dragId);
    setDragId(null);
    setOverCol(null);
    if (!card || pending) return;
    if (columnOf(card.status) === colKey) return; // dropped back where it started

    // The only transition performed in place: start a ready member's program.
    if (colKey === "active" && card.status === "ready_to_start") {
      startTransition(async () => {
        const res = await movePipelineCard(card.id, "active");
        if (res.ok) {
          toast("success", res.message);
          router.refresh();
        } else if (res.reason === "ineligible") {
          toast("error", "All three initial reports must be submitted before starting.");
        } else {
          toast("error", "Couldn't start the program. Please try again.");
        }
      });
      return;
    }

    // Everything else is dialog-driven — open the member to finish the step.
    toast("info", `Opening ${card.full_name.split(" ")[0]} — complete this step there.`);
    router.push(`/coordinator/members/${card.id}`);
  }

  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
      {columns.map((col) => {
        const colCards = cards.filter((m) => col.statuses.includes(m.status));
        const hot = col.key === "renewal" && colCards.length > 0;
        const isOver = overCol === col.key;
        // A ready member being dragged can drop onto Active for a real transition.
        const draggingCard = cards.find((c) => c.id === dragId);
        const isActiveTarget =
          isOver && col.key === "active" && draggingCard?.status === "ready_to_start";
        return (
          <div key={col.key} className="w-64 shrink-0 snap-start">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={(e) => {
                // Only clear when leaving the column, not when entering a child.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((c) => (c === col.key ? null : c));
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.key);
              }}
              className={cn(
                "flex h-full min-h-40 flex-col rounded-xl border bg-sidebar/60 p-2 transition-colors",
                hot && "border-warning/40",
                isOver && "border-primary/50 bg-secondary/40",
                isActiveTarget && "border-success/60 bg-success-tint",
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <h2 className="eyebrow">{col.label}</h2>
                <span
                  className={cn(
                    "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 font-data text-xs",
                    colCards.length > 0
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {colCards.length}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                {colCards.length === 0 ? (
                  <p
                    className={cn(
                      "rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground",
                      isActiveTarget && "border-success/60 text-success",
                    )}
                  >
                    {isActiveTarget ? "Drop to start the program" : "No one here right now"}
                  </p>
                ) : (
                  colCards.map((m) => (
                    <Link
                      key={m.id}
                      href={`/coordinator/members/${m.id}`}
                      draggable
                      onDragStart={(e) => {
                        setDragId(m.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", m.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      aria-disabled={pending}
                      className={cn(
                        "group block cursor-grab rounded-lg border bg-card p-3 shadow-card transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-pop active:cursor-grabbing",
                        dragId === m.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Monogram name={m.full_name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{m.full_name}</span>
                            {m.high ? (
                              <span
                                className="size-2.5 shrink-0 rounded-full bg-danger ring-2 ring-danger/20"
                                title="High red flag on file"
                                aria-label="High red flag on file"
                              />
                            ) : m.hasFlags ? (
                              <span
                                className="size-2.5 shrink-0 rounded-full bg-warning ring-2 ring-warning/20"
                                title="Red flags on file"
                                aria-label="Red flags on file"
                              />
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{m.nextAction}</span>
                        </span>
                        <GripVertical
                          className="size-4 shrink-0 text-border transition-colors group-hover:text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
