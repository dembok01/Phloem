"use client";

// Onboarding wizard (§11) — a guided, one-small-card-at-a-time flow. The §7
// sections are chunked into bite-sized cards by the presentation-only flow map
// (`onboarding-flow.ts`), so the caregiver answers 2–4 related questions per
// screen instead of facing a wall of fields. Around it: a warm welcome, honest
// per-chapter progress with a growth-ring signature, a prefill "confirm the
// basics" card, calm between-chapter interludes, debounced autosave with an
// always-visible confidence indicator, resume-where-left-off, per-card required
// validation that names what is missing and puts the caret on it, the §11/§13
// red-flag banner, a review of every answer before the final submit via
// `submit_onboarding`, and a quiet completion moment.
//
// `preview` runs the same wizard over synthetic answers with autosave paused and
// no submit (the dev-only /dev/onboarding-preview route), so the questionnaire can
// be seen and checked without a real member in onboarding.
//
// Scope note: this file only changes *how* the existing template is presented.
// The questions, required rules, red-flag engine, data-split and reports are
// untouched — DynamicForm and `missingRequiredFields` already work over any
// subset of fields, which is what lets a card render a slice safely.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, CheckCircle2, Loader2, AlertTriangle, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GrowthRings } from "@/components/growth-rings";
import { useCalmMotion } from "@/components/use-calm-motion";
import { cn } from "@/lib/utils";
import { computeRedFlags, hasHighFlag } from "@/lib/red-flags";
import { DynamicForm } from "./DynamicForm";
import { missingRequiredFields } from "./logic";
import {
  buildCards,
  cardIndexOfField,
  FIELD_HINTS,
  firstNameOf,
  voiceOf,
  withListButtons,
} from "./onboarding-flow";
import type { FormTemplateSchema, FormValues } from "./types";
import { SaveIndicator } from "./onboarding/SaveIndicator";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { OnboardingProgress } from "./onboarding/OnboardingProgress";
import { PrefillReviewCard } from "./onboarding/PrefillReviewCard";
import { InterludeCard } from "./onboarding/InterludeCard";
import { ReviewAnswers } from "./onboarding/ReviewAnswers";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { submitOnboarding } from "@/app/(app)/portal/onboarding/[memberId]/actions";

export function OnboardingWizard({
  template,
  memberId,
  memberName,
  responseId,
  initialAnswers,
  preview = false,
}: {
  template: FormTemplateSchema;
  memberId: string;
  memberName?: string;
  responseId: string;
  initialAnswers: FormValues;
  /** Synthetic run: nothing is saved and nothing is submitted. */
  preview?: boolean;
}) {
  const router = useRouter();
  const cards = React.useMemo(() => buildCards(template), [template]);
  // v2 key: card-indexed. Drafts saved under the old :section key fall back to the
  // welcome step once (answers are preserved server-side), rather than mis-resuming.
  const storageKey = `phloem:onboarding:${responseId}:card:v2`;

  const [values, setValues] = React.useState<FormValues>(initialAnswers);
  const [cardIndex, setCardIndex] = React.useState(0);
  const [welcome, setWelcome] = React.useState(false);
  // The review-before-submit screen, and whether an Edit from it is in progress
  // (that card's Continue then returns straight to the review).
  const [reviewing, setReviewing] = React.useState(false);
  const [returnToReview, setReturnToReview] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [errors, setErrors] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // Which way the caregiver is travelling, so the card enters from the side they
  // came from. The old fixed `slide-in-from-right` animated Back as though it
  // were Forward, quietly breaking the wizard's spatial model.
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const calm = useCalmMotion();
  const saveState = useAutosaveDraft(responseId, values, { paused: preview });
  // Where focus goes after the next render: the new card's heading after a move,
  // or the first unanswered question after a blocked Continue. A ref, not state:
  // the render that needs it is already being caused by the move or the errors.
  const pendingFocus = React.useRef<{ field: string } | "heading" | null>(null);

  // Resume the card the caregiver last reached; first-ever visit gets the welcome.
  React.useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      setWelcome(true);
      return;
    }
    if (raw === "review") {
      setReviewing(true);
      return;
    }
    const saved = Number(raw);
    if (Number.isInteger(saved) && saved >= 0 && saved < cards.length) setCardIndex(saved);
  }, [storageKey, cards.length]);

  React.useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === "heading") {
      document.getElementById("onboarding-card-heading")?.focus({ preventScroll: true });
      return;
    }
    const block = document.querySelector<HTMLElement>(`[data-field="${target.field}"]`);
    if (!block) return;
    block.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    // In priority order, not document order: a textarea's "None" shortcut and a
    // number's "−" stepper come first in the DOM but are not the answer itself.
    const control = [
      '[role="radio"][tabindex="0"]',
      '[role="checkbox"]',
      'input:not([type="hidden"])',
      "textarea",
      "select",
      "button",
    ]
      .map((sel) => block.querySelector<HTMLElement>(sel))
      .find(Boolean);
    control?.focus({ preventScroll: true });
  });

  const current = cards[cardIndex];
  const isLast = cardIndex === cards.length - 1;
  const flags = computeRedFlags(values);
  const showFlagBanner = hasHighFlag(flags);
  // The wizard's own headings speak to whoever is answering ("Check your
  // answers" / "Check Leela's answers"). The questions are shown exactly as
  // configured; only the list buttons get their words ("Add a medicine").
  const voice = voiceOf(values, memberName);
  const present = withListButtons;
  const firstName = firstNameOf(memberName) ?? "";
  const possessive = voice.self ? "your" : firstName ? `${firstName}'s` : "the";
  const currentErrors = current.fields.filter((f) => errors.has(f.id)).length;

  function onChange(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function goTo(idx: number, { scroll = true } = {}) {
    setDirection(idx >= cardIndex ? 1 : -1);
    setCardIndex(idx);
    window.localStorage.setItem(storageKey, String(idx));
    if (scroll) {
      window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
      pendingFocus.current = "heading";
    }
  }

  function begin() {
    setWelcome(false);
    window.localStorage.setItem(storageKey, "0");
    pendingFocus.current = "heading";
  }

  /** Mark a card's unanswered questions, take the caregiver to that card, and
   * put the caret on the first one — scrolled to it, not to the top. */
  function flagCard(idx: number) {
    const missing = missingRequiredFields(cards[idx].fields, values);
    setErrors(new Set(missing.map((f) => f.id)));
    if (idx !== cardIndex) {
      setReviewing(false);
      goTo(idx, { scroll: false });
    }
    if (missing[0]) pendingFocus.current = { field: missing[0].id };
  }

  /** The card holding the first unanswered required question, or -1. */
  function firstGapCard(): number {
    for (const section of template.sections) {
      const missing = missingRequiredFields(section.fields, values);
      if (missing.length > 0) return cardIndexOfField(cards, missing[0].id);
    }
    return -1;
  }

  function openReview() {
    const gap = firstGapCard();
    if (gap >= 0) {
      flagCard(gap);
      return;
    }
    setErrors(new Set());
    setReturnToReview(false);
    setReviewing(true);
    window.localStorage.setItem(storageKey, "review");
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
    pendingFocus.current = "heading";
  }

  function next() {
    if (missingRequiredFields(current.fields, values).length > 0) {
      flagCard(cardIndex);
      return;
    }
    setErrors(new Set());
    if (isLast || returnToReview) {
      openReview();
      return;
    }
    goTo(cardIndex + 1);
  }

  function back() {
    setErrors(new Set());
    goTo(Math.max(cardIndex - 1, 0));
  }

  function editFromReview(idx: number) {
    setReviewing(false);
    setReturnToReview(true);
    setErrors(new Set());
    goTo(idx);
  }

  function leaveReview() {
    setReviewing(false);
    goTo(cards.length - 1);
  }

  function jumpToSection(sectionIndex: number) {
    const idx = cards.findIndex((c) => c.kind !== "interlude" && c.sectionIndex === sectionIndex);
    if (idx < 0) return;
    setErrors(new Set());
    goTo(idx);
  }

  async function submit() {
    // The review is only reachable with every card valid, but answers can be
    // edited in another tab; check once more and go to the gap if there is one.
    const gap = firstGapCard();
    if (gap >= 0) {
      flagCard(gap);
      return;
    }
    setErrors(new Set());
    setSubmitError(null);
    if (preview) {
      window.localStorage.removeItem(storageKey);
      setDone(true);
      return;
    }
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
      if (!result.ok) {
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

  // The gentle completion moment — thank you, an optional "add recent reports"
  // invitation, then the door to the portal.
  if (done) {
    return (
      /* The delight budget, spent in the one place it is earned: a family reaches
         this screen exactly once. The ring sweeps closed — the same mark that will
         carry their cycles in the portal, so the handoff from "filling in forms"
         to "you now have a care team" is made in the product's own vocabulary —
         and the three blocks arrive behind it on a 40ms stagger. */
      <div className="stagger-in mx-auto max-w-lg space-y-5">
        <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-card sm:p-10">
          <span className="relative inline-flex">
            <GrowthRings
              cycles={[{ number: 1, status: "active" }]}
              dayOfActive={1}
              daysInCycle={1}
              size={72}
              title="Onboarding complete"
            />
            <CheckCircle2
              className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-success"
              aria-hidden
            />
          </span>
          <div className="space-y-1">
            <p className="font-display text-2xl font-semibold">Thank you</p>
            <p className="text-muted-foreground">
              {possessive.charAt(0).toUpperCase() + possessive.slice(1)} onboarding is complete. Your care coordinator reviews the answers and assembles the
              care team — you&apos;ll hear from us soon.
            </p>
          </div>
        </div>

        {preview ? (
          <div className="text-center">
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setDone(false);
                setReviewing(false);
                setCardIndex(0);
                setWelcome(true);
              }}
            >
              Start the preview again
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
              <h3 className="font-display text-lg font-semibold">Have any recent reports?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add blood work, prescriptions or discharge summaries now — or anytime from your
                dashboard.
              </p>
              <div className="mt-4">
                <DocumentUploader memberId={memberId} />
              </div>
            </div>

            <div className="text-center">
              <Button size="lg" onClick={() => router.push("/portal?onboarded=1")}>
                Go to the portal
              </Button>
            </div>
          </>
        )}
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
              Let&apos;s get to know {voice.self ? "you" : firstName || "your family member"}
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

  const saveSlot = preview ? (
    <span className="text-xs text-muted-foreground">Preview — nothing is saved</span>
  ) : (
    <SaveIndicator state={saveState} />
  );

  const flagBanner = showFlagBanner ? (
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
  ) : null;

  if (reviewing) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="eyebrow">Review</span>
          {saveSlot}
        </div>
        <div className="space-y-1">
          <h2
            id="onboarding-card-heading"
            tabIndex={-1}
            className="font-display text-xl font-semibold outline-none sm:text-2xl"
          >
            Check {possessive} answers
          </h2>
          <p className="text-muted-foreground">
            This is what the care team will read. Tap Edit to change anything — you&apos;ll come
            straight back here.
          </p>
        </div>

        {flagBanner}

        <ReviewAnswers
          cards={cards}
          values={values}
          hints={FIELD_HINTS}
          present={present}
          onEdit={editFromReview}
        />

        {submitError ? (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger-tint p-3 text-sm text-danger">
            {submitError}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="lg" onClick={leaveReview} disabled={submitting}>
            Back
          </Button>
          <Button type="button" size="lg" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {submitting ? "Sending…" : "Send to the care team"}
          </Button>
        </div>

        {preview ? null : (
          <div className="text-center">
            <Link
              href="/portal"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Finish later — your answers are saved
            </Link>
          </div>
        )}
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
          {saveSlot}
        </div>
        <OnboardingProgress cards={cards} cardIndex={cardIndex} onJumpToSection={jumpToSection} />
      </div>

      {flagBanner}

      {/* Enter-only, deliberately. AnimatePresence with mode="wait" would hold the
          new card back until the old one left, doubling the felt latency on a
          control the caregiver taps dozens of times. The card is replaced in
          place, so there is no gap where they see nothing — nothing teleports.
          Full transform string, not Motion's x/y shorthand: the shorthands are
          not hardware-accelerated and drop frames while the page is busy. */}
      <motion.div
        key={cardIndex}
        initial={calm ? false : { opacity: 0, transform: `translateX(${direction * 16}px)` }}
        animate={{ opacity: 1, transform: "translateX(0px)" }}
        transition={calm ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.15 }}
        className="rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10 sm:p-6"
      >
        {current.kind === "interlude" ? (
          <InterludeCard title={current.title ?? ""} lead={current.lead ?? ""} />
        ) : (
          <>
            {current.title ? (
              <h2
                id="onboarding-card-heading"
                tabIndex={-1}
                className="font-display text-xl font-semibold outline-none"
              >
                {current.title}
              </h2>
            ) : null}
            {current.lead ? <p className="mt-1 text-muted-foreground">{current.lead}</p> : null}
            <div className={cn(current.title || current.lead ? "mt-4" : "")}>
              {current.kind === "review" ? (
                <PrefillReviewCard
                  fields={present(current.fields)}
                  values={values}
                  onChange={onChange}
                  errors={errors}
                  hints={FIELD_HINTS}
                />
              ) : (
                <DynamicForm
                  fields={present(current.fields)}
                  values={values}
                  onChange={onChange}
                  errors={errors}
                  hints={FIELD_HINTS}
                  markOptional
                />
              )}
            </div>
          </>
        )}
      </motion.div>

      {currentErrors > 0 ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {currentErrors === 1
            ? "One question above still needs an answer."
            : `${currentErrors} questions above still need an answer.`}
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
        <Button type="button" size="lg" onClick={next} disabled={submitting}>
          {returnToReview ? "Back to review" : isLast ? "Review answers" : "Continue"}
        </Button>
      </div>

      {preview ? null : (
        <div className="text-center">
          <Link
            href="/portal"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Finish later — your answers are saved
          </Link>
        </div>
      )}
    </div>
  );
}
