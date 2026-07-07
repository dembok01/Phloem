"use client";

// Onboarding wizard — one §7 section per screen with a progress bar, debounced
// autosave to the draft form_responses row (browser client, caregiver RLS), a
// live "Saving/Saved ✓" indicator, resume-where-left-off (section persisted in
// localStorage; answers restored from the draft), per-section required
// validation, a §11/§13 red-flag banner, and final submit via `submit_onboarding`.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { computeRedFlags, hasHighFlag } from "@/lib/red-flags";
import { DynamicForm } from "./DynamicForm";
import { missingRequiredFields } from "./logic";
import type { FormTemplateSchema, FormValues } from "./types";
import { submitOnboarding } from "@/app/(app)/portal/onboarding/[memberId]/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

export function OnboardingWizard({
  template,
  memberId,
  responseId,
  initialAnswers,
}: {
  template: FormTemplateSchema;
  memberId: string;
  responseId: string;
  initialAnswers: FormValues;
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const sections = template.sections;
  const storageKey = `phloem:onboarding:${responseId}:section`;

  const [values, setValues] = React.useState<FormValues>(initialAnswers);
  const [section, setSection] = React.useState(0);
  const [errors, setErrors] = React.useState<Set<string>>(new Set());
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resume the section the caregiver last reached (answers already restored).
  React.useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isInteger(saved) && saved >= 0 && saved < sections.length) setSection(saved);
  }, [storageKey, sections.length]);

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

  const current = sections[section];
  const isLast = section === sections.length - 1;
  const progress = Math.round(((section + 1) / sections.length) * 100);
  const flags = computeRedFlags(values);
  const showFlagBanner = hasHighFlag(flags);

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
    setSection(idx);
    window.localStorage.setItem(storageKey, String(idx));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    const missing = missingRequiredFields(current.fields, values);
    if (missing.length > 0) {
      setErrors(new Set(missing.map((f) => f.id)));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors(new Set());
    goTo(Math.min(section + 1, sections.length - 1));
  }

  function back() {
    setErrors(new Set());
    goTo(Math.max(section - 1, 0));
  }

  async function submit() {
    // Validate every section; jump to the first with a gap.
    for (let i = 0; i < sections.length; i++) {
      const missing = missingRequiredFields(sections[i].fields, values);
      if (missing.length > 0) {
        setErrors(new Set(missing.map((f) => f.id)));
        goTo(i);
        return;
      }
    }
    setErrors(new Set());
    setSubmitError(null);
    setSubmitting(true);
    try {
      // The action persists these answers authoritatively, then runs
      // submit_onboarding (data-split + red flags + report). On success we clear
      // the resume marker and head to the portal; otherwise show the message.
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
      router.push("/portal?onboarded=1");
    } catch {
      setSubmitError(
        "Something went wrong submitting onboarding. Your answers are saved — please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {section + 1} of {sections.length} · {current.title}
          </span>
          <SaveIndicator state={saveState} />
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {showFlagBanner ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
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

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
        <h2 className="mb-4 text-xl font-semibold">{current.title}</h2>
        <DynamicForm fields={current.fields} values={values} onChange={onChange} errors={errors} />
      </div>

      {errors.size > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          Please complete the required fields marked above before continuing.
        </p>
      ) : null}
      {submitError ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="lg" onClick={back} disabled={section === 0 || submitting}>
          Back
        </Button>
        {isLast ? (
          <Button type="button" size="lg" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "Submitting…" : "Submit onboarding"}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={next} disabled={submitting}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" /> Saved
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-destructive">Couldn&apos;t save — check your connection</span>;
  }
  return null;
}
