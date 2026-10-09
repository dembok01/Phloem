"use client";

// Every answer, by chapter, as the care team will read it. Two places use it:
//  - the last screen before the irreversible submit, where each card's answers
//    carry an Edit that goes back to that card and — once it is valid — straight
//    back here, never through the cards in between;
//  - the "Your answers" sheet during the flow (`answeredOnly`), which lists only
//    what has been answered so far, without the card chrome.
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isFieldVisible } from "../logic";
import type { Card } from "../onboarding-flow";
import type { FieldHint, FormField, FormValues } from "../types";
import { displayValue } from "./PrefillReviewCard";

export function ReviewAnswers({
  cards,
  values,
  hints,
  present,
  onEdit,
  answeredOnly = false,
}: {
  cards: Card[];
  values: FormValues;
  hints: Record<string, FieldHint>;
  /** A card's fields exactly as the card itself showed them. */
  present: (fields: FormField[]) => FormField[];
  onEdit: (cardIndex: number) => void;
  /** Leave out unanswered questions, and cards and chapters left empty by that. */
  answeredOnly?: boolean;
}) {
  type Row = { field: FormField; answer: string };
  const chapters: { title: string; items: { card: Card; index: number; rows: Row[] }[] }[] = [];
  cards.forEach((card, index) => {
    const rows = present(card.fields)
      .filter((f) => f.type !== "info" && isFieldVisible(f, values))
      .map((field) => ({ field, answer: displayValue(field, values, hints[field.id]) }))
      .filter((r) => !answeredOnly || r.answer !== "—");
    if (rows.length === 0) return;
    const last = chapters.at(-1);
    if (last && last.title === card.sectionTitle) last.items.push({ card, index, rows });
    else chapters.push({ title: card.sectionTitle, items: [{ card, index, rows }] });
  });

  if (chapters.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing answered yet.</p>;
  }

  return (
    <div className="space-y-4">
      {chapters.map((ch) => (
        <section
          key={ch.title}
          aria-label={ch.title}
          className={cn(!answeredOnly && "rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10 sm:p-6")}
        >
          <h3 className="eyebrow">{ch.title}</h3>
          <div className="mt-2 divide-y divide-border">
            {ch.items.map(({ card, index, rows }) => (
              <div key={card.id} className="py-4 first:pt-2 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{card.title ?? ch.title}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(index)}
                    aria-label={`Edit ${card.title ?? ch.title}`}
                  >
                    <Pencil aria-hidden /> Edit
                  </Button>
                </div>
                <dl className="mt-2 space-y-2">
                  {rows.map(({ field: f, answer }) => (
                    <div key={f.id} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                      <dt className="text-sm text-muted-foreground">{f.label}</dt>
                      <dd
                        className={
                          answer === "—"
                            ? "text-sm text-muted-foreground"
                            : "text-sm font-medium whitespace-pre-line"
                        }
                      >
                        {answer === "—" ? "Not answered" : answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
