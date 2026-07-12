"use client";

// Monthly feedback form (§9 T-3 draft → §6 submit_feedback). Renders the
// feedback template via DynamicForm, autosaves the draft (fr_own_clinical:
// respondent_id = self), and submits through submit_feedback. Submitting the
// second of the two feedbacks compiles the cycle's performance report (server-side).
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { DynamicForm } from "./DynamicForm";
import { missingRequiredFields } from "./logic";
import type { FormTemplateSchema, FormValues } from "./types";
import { submitFeedback } from "@/app/(app)/clinician/clients/[id]/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

export function FeedbackForm({
  template,
  responseId,
  initialAnswers,
}: {
  template: FormTemplateSchema;
  responseId: string;
  initialAnswers: FormValues;
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [values, setValues] = React.useState<FormValues>(initialAnswers);
  const [errors, setErrors] = React.useState<Set<string>>(new Set());
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Persist the latest answers, then submit through the RPC.
    await supabase.from("form_responses").update({ answers: values as unknown as Json }).eq("id", responseId);
    try {
      const result = await submitFeedback({ response_id: responseId });
      if ("error" in result) {
        setSubmitError(result.error);
        setSubmitting(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setSubmitError("Something went wrong submitting your feedback. Please try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300">
        <Check className="mt-0.5 size-5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Feedback submitted</p>
          <p>The performance report compiles once both this month&apos;s feedback forms are in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="text-muted-foreground">Your monthly feedback feeds this cycle&apos;s performance report.</p>
        <SaveIndicator state={saveState} />
      </div>

      <div className="space-y-4">
        {template.sections.map((section) => (
          <div key={section.id} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="mb-4 text-lg font-semibold">{section.title}</h2>
            <DynamicForm fields={section.fields} values={values} onChange={onChange} errors={errors} />
          </div>
        ))}
      </div>

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
        <Button type="button" size="lg" onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {submitting ? "Submitting…" : "Submit feedback"}
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
