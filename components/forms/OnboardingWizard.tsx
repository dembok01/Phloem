"use client";

// Onboarding wizard (§11) — a guided, one-small-card-at-a-time flow. The §7
// sections are chunked into bite-sized cards by the presentation-only flow map
// (`onboarding-flow.ts`), so the caregiver answers 2–4 related questions per
// screen instead of facing a wall of fields. Around it: a warm welcome, honest
// per-chapter progress with a growth-ring signature, a prefill "confirm the
// basics" card, calm between-chapter interludes, debounced autosave with an
// always-visible confidence indicator, resume-where-left-off, per-card required
// validation, the §11/§13 red-flag banner, final submit via `submit_onboarding`,
// and a quiet completion moment.
//
// Scope note: this file only changes *how* the existing template is presented.
// The questions, required rules, red-flag engine, data-split and reports are
// untouched — DynamicForm and `missingRequiredFields` already work over any
// subset of fields, which is what lets a card render a slice safely.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Loader2, AlertTriangle, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { computeRedFlags, hasHighFlag } from "@/lib/red-flags";
import { DynamicForm } from "./DynamicForm";
import { missingRequiredFields } from "./logic";
import { buildCards, cardIndexOfField, FIELD_HINTS } from "./onboarding-flow";
import type { FormTemplateSchema, FormValues } from "./types";
import { SaveIndicator, type SaveState } from "./onboarding/SaveIndicator";
import { OnboardingProgress } from "./onboarding/OnboardingProgress";
import { PrefillReviewCard } from "./onboarding/PrefillReviewCard";
import { InterludeCard } from "./onboarding/InterludeCard";
import { submitOnboarding } from "@/app/(app)/portal/onboarding/[memberId]/actions";

export function OnboardingWizard({
  template,
  memberId,
  memberName,
  responseId,
  initialAnswers,
}: {
  template: FormTemplateSchema;
  memberId: string;
  memberName?: string;
  responseId: string;
  initialAnswers: FormValues;
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const cards = React.useMemo(() => buildCards(template), [template]);
  // v2 key: card-indexed. Drafts saved under the old :section key fall back to the
  // welcome step once (answers are preserved server-side), rather than mis-resuming.
  const storageKey = `phloem:onboarding:${responseId}:card:v2`;

  const [values, setValues] = React.useState<FormValues>(initialAnswers);
  const [cardIndex, setCardIndex] = React.useState(0);
  const [welcome, setWelcome] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [errors, setErrors] = React.useState<Set<string>>(new Set());
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resume the card the caregiver last reached; first-ever visit gets the welcome.
  React.useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      setWelcome(true);
      return;
    }
    const saved = Number(raw);
    if (Number.isInteger(saved) && saved >= 0 && saved < cards.length) setCardIndex(saved);
  }, [storageKey, cards.length]);

  // Debounced autosave of the whole answer set to the draft row.
  React.useEffect(() => {
    if (!dirty.current) return;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("form_responses")
        .update({ answers: values as unknown as Json })
        .eq("id", responseId);
      setSaveState(error ? "error" : "saved");
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [values, supabase, responseId]);

  const current = cards[cardIndex];
  const isLast = cardIndex === cards.length - 1;
  const flags = computeRedFlags(values);
  const showFlagBanner = hasHighFlag(flags);
  // First name for warmth — but initialed names ("K. V. Gopalan") fall back to
  // the full name rather than a lone letter.
  const firstToken = (memberName ?? "").split(" ")[0] ?? "";
  const firstName = /^[A-Za-z]\.?$/.test(firstToken) ? (memberName ?? "") : firstToken;

  function onChange(key: string, value: unknown) {
    dirty.current = true;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function goTo(idx: number) {
    setCardIndex(idx);
    window.localStorage.setItem(storageKey, String(idx));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function begin() {
    setWelcome(false);
    window.localStorage.setItem(storageKey, "0");
  }

  function next() {
    const missing = missingRequiredFields(current.fields, values);
    if (missing.length > 0) {
      setErrors(new Set(missing.map((f) => f.id)));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors(new Set());
    goTo(Math.min(cardIndex + 1, cards.length - 1));
  }

  function back() {
    setErrors(new Set());
    goTo(Math.max(cardIndex - 1, 0));
  }

  function jumpToSection(sectionIndex: number) {
    const idx = cards.findIndex((c) => c.kind !== "interlude" && c.sectionIndex === sectionIndex);
    if (idx < 0) return;
    setErrors(new Set());
    goTo(idx);
  }

  async function submit() {
    // Validate every section; jump to the card holding the first gap.
    for (const section of template.sections) {
      const missing = missingRequiredFields(section.fields, values);
      if (missing.length > 0) {
        setErrors(new Set(missing.map((f) => f.id)));
        const target = cardIndexOfField(cards, missing[0].id);
        if (target >= 0) goTo(target);
        return;
      }
    }
    setErrors(new Set());
    setSubmitError(null);
    setSubmitting(true);
    try {
      // The action persists these answers authoritatively, then runs
      // submit_onboarding (data-split + red flags + report). On success we clear
      // the resume marker and show the completion moment.
      const result = await submitOnboarding({
        member_id: memberId,
        response_id: responseId,
        answers: values,
      });
      if ("error" in result) {
        setSubmitError(result.error);
        setSubmitting(false);
        return;
      }
      window.localStorage.removeItem(storageKey);
      setDone(true);
    } catch {
      setSubmitError(
        "Something went wrong submitting onboarding. Your answers are saved — please try again.",
      );
      setSubmitting(false);
    }
  }

  // The gentle completion moment — one card, one sentence, one door.
  if (done) {
    return (
      <div className="mx-auto flex max-w-md animate-in fade-in zoom-in-95 flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center shadow-card duration-200 ease-out">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-success-tint text-success">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-display text-2xl font-semibold">Thank you</p>
          <p className="text-muted-foreground">
            {firstName ? `${firstName}'s` : "The"} onboarding is complete. Your care coordinator
            reviews the answers and assembles the care team — you&apos;ll hear from us soon.
          </p>
        </div>
        <Button size="lg" onClick={() => router.push("/portal?onboarded=1")}>
          Go to the portal
        </Button>
      </div>
    );
  }

  // The warm welcome step (first visit only).
  if (welcome) {
    return (
      <div className="mx-auto max-w-2xl animate-in fade-in duration-200">
        <div className="flex flex-col items-start gap-5 rounded-2xl border bg-card p-8 shadow-card sm:p-10">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
            <HeartHandshake className="size-7" aria-hidden />
          </span>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-semibold">
              Let&apos;s get to know {firstName || "your family member"}
            </h2>
            <p className="text-muted-foreground">
              A few short questions at a time — about health, daily life and goals. Most families
              finish in around ten minutes, and the care team reads every word before they meet you.
            </p>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-success" aria-hidden /> Answers save automatically as you type
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-success" aria-hidden /> Stop anytime — you&apos;ll continue where you left off
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-success" aria-hidden /> Contact details stay private to your coordinator
            </li>
          </ul>
          <Button size="lg" onClick={begin}>
            Begin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="eyebrow truncate">{current.sectionTitle}</span>
            {current.kind !== "interlude" ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {current.indexWithinSection}/{current.cardsInSection}
              </span>
            ) : null}
          </span>
          <SaveIndicator state={saveState} />
        </div>
        <OnboardingProgress cards={cards} cardIndex={cardIndex} onJumpToSection={jumpToSection} />
      </div>

      {showFlagBanner ? (
        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning-tint p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">A doctor will review before any exercise begins.</p>
            <p>
              Based on your answers:{" "}
              {flags.filter((f) => f.severity === "high").map((f) => f.label).join(", ")}. This is
              only to keep the member safe — there is nothing you need to do right now.
            </p>
          </div>
        </div>
      ) : null}

      <div
        key={cardIndex}
        className="animate-in fade-in slide-in-from-right-4 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10 duration-200 ease-out sm:p-6"
      >
        {current.kind === "interlude" ? (
          <InterludeCard title={current.title ?? ""} lead={current.lead ?? ""} />
        ) : (
          <>
            {current.title ? (
              <h2 className="font-display text-xl font-semibold">{current.title}</h2>
            ) : null}
            {current.lead ? <p className="mt-1 text-muted-foreground">{current.lead}</p> : null}
            <div className={cn(current.title || current.lead ? "mt-4" : "")}>
              {current.kind === "review" ? (
                <PrefillReviewCard
                  fields={current.fields}
                  values={values}
                  onChange={onChange}
                  errors={errors}
                  hints={FIELD_HINTS}
                />
              ) : (
                <DynamicForm
                  fields={current.fields}
                  values={values}
                  onChange={onChange}
                  errors={errors}
                  hints={FIELD_HINTS}
                />
              )}
            </div>
          </>
        )}
      </div>

      {errors.size > 0 ? (
        <p role="alert" className="text-sm text-danger">
          Please complete the required fields marked above before continuing.
        </p>
      ) : null}
      {submitError ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-tint p-3 text-sm text-danger">
          {submitError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="lg" onClick={back} disabled={cardIndex === 0 || submitting}>
          Back
        </Button>
        {isLast ? (
          <Button type="button" size="lg" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {submitting ? "Submitting…" : "Finish onboarding"}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={next} disabled={submitting}>
            Continue
          </Button>
        )}
      </div>

      <div className="text-center">
        <Link
          href="/portal"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Finish later — your answers are saved
        </Link>
      </div>
    </div>
  );
}
