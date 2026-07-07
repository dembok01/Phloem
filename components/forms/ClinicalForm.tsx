"use client";

// Clinical form (§10) — renders a clinical template via DynamicForm (all sections
// stacked), autosaves the draft (fr_own_clinical), and submits through
// submit_clinical_form. When `locked` (trainer without doctor clearance), the whole
// form is UI-disabled (native fieldset[disabled]) and submit is blocked — the RPC
// rejects it too, so the gate holds at both layers.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
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

  async function submit() {
    const allFields = template.sections.flatMap((s) => s.fields);
    const missing = missingRequiredFields(allFields, values);
    if (missing.length > 0) {
      setErrors(new Set(missing.map((f) => f.id)));
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    <div className="space-y-4">
      {locked ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <Lock className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Form locked</p>
            <p>{lockedReason ?? "This form is not available yet."}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground">
            Your own assessment leads the report — structured fields standardize it.
          </p>
          <SaveIndicator state={saveState} />
        </div>
      )}

      <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
        {template.sections.map((section) => (
          <div key={section.id} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="mb-4 text-lg font-semibold">{section.title}</h2>
            <DynamicForm fields={section.fields} values={values} onChange={onChange} errors={errors} />
          </div>
        ))}
      </fieldset>

      {errors.size > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          Please complete the required fields marked above before submitting.
        </p>
      ) : null}
      {submitError ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {submitError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={submit} disabled={locked || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {submitting ? "Submitting…" : "Submit & generate report"}
        </Button>
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
  if (state === "error") return <span className="text-destructive">Couldn&apos;t save</span>;
  return null;
}
