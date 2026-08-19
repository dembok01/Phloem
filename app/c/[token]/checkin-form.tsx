"use client";

// W3.2 — the check-in form. Portal type scale (18px+), large targets, and the
// two required questions answerable with one tap each, because this is opened on a
// phone by someone standing in a kitchen.
//
// The scale is worded, not numbered: "how has the week been, 1 to 5" asks a family
// member to invent a rubric. Words don't.
import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitCheckin, type CheckinResult } from "./actions";

const FEELING: { value: "1" | "2" | "3" | "4" | "5"; label: string }[] = [
  { value: "1", label: "A bad week" },
  { value: "2", label: "Not great" },
  { value: "3", label: "About the same" },
  { value: "4", label: "Pretty good" },
  { value: "5", label: "A good week" },
];

const PLAN: { value: "well" | "mostly" | "struggling"; label: string }[] = [
  { value: "well", label: "Going well" },
  { value: "mostly", label: "Mostly, with gaps" },
  { value: "struggling", label: "Struggling to keep up" },
];

export function CheckinForm({ token, firstName }: { token: string; firstName: string }) {
  const [feeling, setFeeling] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<string | null>(null);
  const [concerns, setConcerns] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [needsCall, setNeedsCall] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<CheckinResult | null>(null);

  if (result?.ok) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-card">
        <p className="flex items-center gap-2 font-display text-2xl font-semibold">
          <CheckCircle2 className="size-6 text-success" aria-hidden /> Sent — thank you
        </p>
        <p className="mt-2 text-lg text-muted-foreground">
          {result.concern
            ? `The care team has been alerted and will follow up about ${firstName} shortly.`
            : `The care team will see this with ${firstName}'s next review.`}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !feeling || !plan) return;
        startTransition(async () => {
          setResult(
            await submitCheckin({
              token,
              how_is_feeling: feeling,
              following_plan: plan,
              concerns,
              question,
              needs_call: needsCall,
            }),
          );
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-lg font-medium">How has the last week been?</legend>
        <div className="grid gap-2">
          {FEELING.map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              selected={feeling === o.value}
              onSelect={() => setFeeling(o.value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-lg font-medium">How is the plan going?</legend>
        <div className="grid gap-2">
          {PLAN.map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              selected={plan === o.value}
              onSelect={() => setPlan(o.value)}
            />
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="concerns" className="text-lg font-medium">
          Anything worrying you?
        </label>
        <p className="text-base text-muted-foreground">
          Symptoms, side effects, anything that has changed. Leave it blank if all is well.
        </p>
        <textarea
          id="concerns"
          value={concerns}
          onChange={(e) => setConcerns(e.target.value)}
          rows={3}
          className="w-full rounded-lg border bg-card px-3 py-2.5 text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="question" className="text-lg font-medium">
          Any question for the care team?
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="w-full rounded-lg border bg-card px-3 py-2.5 text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={needsCall}
        onClick={() => setNeedsCall((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left text-lg hover:border-primary/40"
      >
        <span
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
            needsCall ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 rounded-full bg-card shadow transition-transform",
              needsCall ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </span>
        I&apos;d like someone to call me
      </button>

      {result && !result.ok ? (
        <p role="alert" className="rounded-lg bg-warning-tint px-4 py-3 text-base text-warning">
          {result.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={pending}
        disabled={pending || !feeling || !plan}
      >
        Send to the care team
      </Button>
      {!feeling || !plan ? (
        <p className="text-center text-base text-muted-foreground">
          Answer the first two questions to send.
        </p>
      ) : null}
    </form>
  );
}

function Choice({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-lg border px-4 py-3 text-left text-lg font-medium transition-colors",
        selected
          ? "border-primary bg-secondary text-secondary-foreground"
          : "bg-card hover:border-primary/40",
      )}
    >
      {label}
    </button>
  );
}
