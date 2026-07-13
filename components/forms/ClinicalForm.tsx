"use client";

// Clinical form (§10, redesigned C4) — sticky section rail with per-section
// completion, always-visible autosave state, in-form progress, and a sticky
// submit bar. Autosaves the draft (fr_own_clinical) and submits through
// submit_clinical_form; when `locked` (trainer without doctor clearance) the
// whole form is UI-disabled and the RPC rejects it too.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, CircleCheck, Loader2, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { DynamicForm } from "./DynamicForm";
import { missingRequiredFields } from "./logic";
import type { FormTemplateSchema, FormValues } from "./types";
import { submitClinicalForm } from "@/app/(app)/clinician/clients/[id]/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ClinicalForm({
  template,
  memberId,
  consultationId,
  responseId,
  initialAnswers,
  locked = false,
  lockedReason,
}: {
  template: FormTemplateSchema;
  memberId: string;
  consultationId: string;
  responseId: string;
  initialAnswers: FormValues;
  locked?: boolean;
  lockedReason?: string;
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [values, setValues] = React.useState<FormValues>(initialAnswers);
  const [errors, setErrors] = React.useState<Set<string>>(new Set());
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (locked || !dirty.current) return;
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
  }, [values, supabase, responseId, locked]);

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

  // Per-section completion for the rail + overall progress for the bar.
  const sectionState = template.sections.map((section) => {
    const required = section.fields.filter((f) => f.required);
    const missing = missingRequiredFields(section.fields, values);
    return {
      id: section.id,
      title: section.title,
      requiredCount: required.length,
      missingCount: missing.length,
      hasError: section.fields.some((f) => errors.has(f.id)),
    };
  });
  const totalRequired = sectionState.reduce((n, s) => n + s.requiredCount, 0);
  const totalMissing = sectionState.reduce((n, s) => n + s.missingCount, 0);
  const progress = totalRequired === 0 ? 100 : Math.round(((totalRequired - totalMissing) / totalRequired) * 100);

  async function submit() {
    const allFields = template.sections.flatMap((s) => s.fields);
    const missing = missingRequiredFields(allFields, values);
    if (missing.length > 0) {
      setErrors(new Set(missing.map((f) => f.id)));
      const firstSection = template.sections.find((s) => s.fields.some((f) => f.id === missing[0]!.id));
      document.getElementById(`sec-${firstSection?.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setErrors(new Set());
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await submitClinicalForm({
        member_id: memberId,
        consultation_id: consultationId,
        answers: values,
      });
      if ("error" in result) {
        setSubmitError(result.error);
        setSubmitting(false);
        return;
      }
      router.push(`/reports/${result.reportId}`);
    } catch {
      setSubmitError("Something went wrong submitting the form. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:items-start lg:gap-6">
      {/* Section rail — sticky on desktop, hidden on small screens. */}
      <nav aria-label="Form sections" className="sticky top-20 hidden self-start lg:block">
        <ol className="space-y-0.5">
          {sectionState.map((s) => (
            <li key={s.id}>
              <a
                href={`#sec-${s.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
                  s.hasError ? "text-danger" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.requiredCount > 0 && s.missingCount === 0 ? (
                  <CircleCheck className="size-3.5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle
                    className={cn("size-3.5 shrink-0", s.hasError ? "text-danger" : "text-border")}
                    aria-hidden
                  />
                )}
                <span className="truncate">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-4">
        {locked ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger-tint p-4">
            <Lock className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">Form locked</p>
              <p>{lockedReason ?? "This form is not available yet."}</p>
            </div>
          </div>
        ) : null}

        <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
          {template.sections.map((section) => (
            <div
              key={section.id}
              id={`sec-${section.id}`}
              className="scroll-mt-24 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10"
            >
              <h2 className="mb-4 font-display text-lg font-semibold">{section.title}</h2>
              <DynamicForm fields={section.fields} values={values} onChange={onChange} errors={errors} />
            </div>
          ))}
        </fieldset>

        {errors.size > 0 ? (
          <p role="alert" className="text-sm text-danger">
            Please complete the required fields marked above before submitting.
          </p>
        ) : null}
        {submitError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-tint p-3 text-sm text-danger"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        {/* Sticky action bar: the §11 note, live save state, progress, submit. */}
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card/95 px-4 py-3 shadow-pop backdrop-blur">
          <p className="hidden text-xs text-muted-foreground sm:block sm:max-w-56">
            Your own assessment leads the report — structured fields standardize it.
          </p>
          <div className="ml-auto flex items-center gap-4">
            {!locked ? <SaveIndicator state={saveState} /> : null}
            <span
              className="hidden items-center gap-2 sm:inline-flex"
              aria-label={`${progress}% of required fields complete`}
            >
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="font-data text-xs text-muted-foreground">{progress}%</span>
            </span>
            <Button type="button" onClick={submit} disabled={locked || submitting}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {submitting ? "Submitting…" : "Submit & generate report"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-success" role="status">
        <Check className="size-3.5" aria-hidden /> Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="text-sm text-danger" role="status">
        Couldn&apos;t save
      </span>
    );
  }
  return (
    <span className="text-sm text-muted-foreground" role="status">
      Draft autosaves
    </span>
  );
}
