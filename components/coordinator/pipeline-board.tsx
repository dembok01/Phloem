"use client";

// P-2 — the pipeline board with real drag-and-drop.
//
// Cards are draggable and columns are drop targets. Dropping a *ready* member on
// the Active column starts their program (the one input-free §6 transition);
// every other drop hands off to the member page, where the side-effect-heavy
// steps live behind their dialogs. Cards stay links, so click and keyboard reach
// the same destinations — drag is a progressive enhancement, never the only path.
//
// Shaped for a lopsided board (2026-10-13): members spend days in the early stages
// and months in Active, so Active is the long column. A stage nobody is in shrinks
// to a slim strip (still a drop target); the stages with people share the width by
// how many they hold, and lay cards out several across. With 20 Active members the
// board went from ~1,900px wide and ~20 rows to one screen wide and ~6 rows.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical, Search } from "lucide-react";
import { Monogram } from "@/components/monogram";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { movePipelineCard } from "@/app/(app)/coordinator/pipeline/actions";
import type { MemberStatus } from "@/lib/member-status";
import type { ActiveProgress } from "@/lib/pipeline-progress";

export type PipelineColumn = { key: string; label: string; statuses: MemberStatus[] };
export type PipelineCard = {
  id: string;
  full_name: string;
  status: MemberStatus;
  high: boolean;
  hasFlags: boolean;
  nextAction: string;
  /** Active members: cycle, day and end date (lib/pipeline-progress). */
  progress?: ActiveProgress | null;
};

/** Ends within this many days: the date turns amber. */
const ENDING_SOON = 14;

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
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? cards.filter((c) => c.full_name.toLowerCase().includes(q)) : cards;

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
          toast("error", "The doctor's initial report must be submitted before starting.");
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search members</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none transition-colors duration-(--motion-press) hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        {q ? (
          <p className="text-sm text-muted-foreground" role="status">
            {shown.length === 0 ? "No member matches" : `${shown.length} of ${cards.length} members`}
          </p>
        ) : null}
      </div>

      {/* Phones: the stages stack as sections, and empty ones are left out. Side by
          side the board was 1,896px wide at 360, and drag-and-drop does not work on
          touch anyway, so a card there simply opens the member. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-2 md:overflow-x-auto md:pb-3">
        {cards.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground md:hidden">
            No members in the pipeline yet.
          </p>
        ) : null}
        {columns.map((col) => {
          // Whether a stage is empty is decided before the search, so the board's
          // shape holds still while someone types.
          const total = cards.filter((m) => col.statuses.includes(m.status)).length;
          const colCards = shown.filter((m) => col.statuses.includes(m.status));
          const hot = col.key === "renewal" && total > 0;
          const isOver = overCol === col.key;
          // A ready member being dragged can drop onto Active for a real transition.
          const draggingCard = cards.find((c) => c.id === dragId);
          const isActiveTarget =
            isOver && col.key === "active" && draggingCard?.status === "ready_to_start";
          const dropProps = {
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault();
              setOverCol(col.key);
            },
            onDragLeave: (e: React.DragEvent<HTMLElement>) => {
              // Only clear when leaving the column, not when entering a child.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((c) => (c === col.key ? null : c));
            },
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              handleDrop(col.key);
            },
          };

          if (total === 0) {
            // A slim strip: the stage stays visible and droppable, at a sixth of the width.
            return (
              <div key={col.key} className="max-md:hidden md:w-10 md:shrink-0">
                <div
                  {...dropProps}
                  title={isActiveTarget ? "Drop to start the program" : `${col.label} — no one here right now`}
                  className={cn(
                    "flex h-full min-h-40 flex-col items-center gap-3 rounded-xl border bg-sidebar/60 py-3 transition-colors",
                    isOver && "border-primary/50 bg-secondary/40",
                    isActiveTarget && "border-success/60 bg-success-tint",
                  )}
                >
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-1.5 font-data text-xs text-muted-foreground">
                    0
                  </span>
                  <h2 className="eyebrow rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{col.label}</h2>
                </div>
              </div>
            );
          }

          return (
            <div
              key={col.key}
              // The stages with people share the width by how many they hold (up to 4×),
              // so a long Active column gets the room and the others stay readable.
              style={{ flexGrow: Math.min(Math.max(total, 1), 4) }}
              className="md:min-w-52 md:basis-0"
            >
              <div
                {...dropProps}
                className={cn(
                  "flex h-full flex-col rounded-xl border bg-sidebar/60 p-2 transition-colors md:min-h-40",
                  hot && "border-warning/40",
                  isOver && "border-primary/50 bg-secondary/40",
                  isActiveTarget && "border-success/60 bg-success-tint",
                )}
              >
                <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                  <h2 className="eyebrow">{col.label}</h2>
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-1.5 font-data text-xs text-secondary-foreground">
                    {q ? `${colCards.length}/${total}` : total}
                  </span>
                </div>
                {colCards.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No match here
                  </p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
                    {colCards.map((m) => (
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
                          "group relative block cursor-grab rounded-lg border border-input/50 bg-card p-2.5 shadow-card transition-[translate,box-shadow,border-color] duration-(--motion-press) ease-out hover:-translate-y-px hover:border-primary/60 hover:shadow-pop active:cursor-grabbing",
                          dragId === m.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Monogram name={m.full_name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 pr-3">
                              {/* Two lines rather than an ellipsis: the name is how a
                                  coordinator finds someone. */}
                              <span className="line-clamp-2 font-medium leading-snug break-words">{m.full_name}</span>
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
                            {m.progress && !m.progress.paused ? null : (
                              <span className="block truncate text-xs text-muted-foreground">{m.nextAction}</span>
                            )}
                          </span>
                          {/* Shown on hover, out of the flow, so it takes no width from the name. */}
                          <GripVertical
                            className="absolute top-2 right-1.5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:hidden"
                            aria-hidden
                          />
                        </div>
                        {/* Under the name, at the card's full width, so it never truncates. */}
                        {m.progress && !m.progress.paused ? <ProgressLine progress={m.progress} /> : null}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Cycle 2 of 3 · Day 14/30", a thin bar for the day, and when the program ends. */
function ProgressLine({ progress: p }: { progress: ActiveProgress }) {
  const soon = p.daysLeft !== null && p.daysLeft <= ENDING_SOON;
  return (
    <span className="mt-2 block space-y-0.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-2 tabular-nums">
        <span className="shrink-0">
          Cycle {p.cycle} of {p.cycles}
        </span>
        <span
          className="block h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Day ${p.day} of ${p.days}`}
        >
          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(p.day / p.days) * 100}%` }} />
        </span>
        <span className="shrink-0">
          Day {p.day}/{p.days}
        </span>
      </span>
      {p.ends ? (
        <span className={cn("block truncate tabular-nums", soon && "font-medium text-warning")}>
          {p.daysLeft !== null && p.daysLeft <= 0
            ? "Ends today"
            : soon
              ? `Ends in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} · ${p.ends}`
              : `Ends ${p.ends}`}
        </span>
      ) : null}
    </span>
  );
}
