"use client";

// 0045 — the correction form. Deliberately NOT ClinicalForm: that one autosaves
// into a draft response, which here would quietly rewrite the very answers the
// original report was built from. Nothing is written until the clinician saves,
// and saving goes through amend_clinical_report, which supersedes rather than
// overwrites. Modelled on the onboarding AmendForm so the two corrections feel
// like one feature.
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DynamicForm } from "@/components/forms/DynamicForm";
import { missingRequiredFields } from "@/components/forms/logic";
import type { FormSection, FormValues } from "@/components/forms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { amendClinicalReport } from "@/app/(app)/clinician/clients/[id]/actions";

/** Stable form of an answer: object keys sorted, undefined as null — so reordering
 *  keys is not a "change", and a cleared value is not dropped in transit. */
function canonical(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

export function AmendClinicalForm({
  memberId,
  reportId,
  sections,
  answers,
}: {
  memberId: string;
  reportId: string;
  sections: FormSection[];
  answers: FormValues;
}) {
  const [values, setValues] = React.useState<FormValues>(answers);
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Set<string>>(new Set());
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const changed = React.useMemo(() => {
    const keys = new Set([...Object.keys(values), ...Object.keys(answers)]);
    return [...keys].filter((k) => canonical(values[k]) !== canonical(answers[k]));
  }, [values, answers]);

  function onChange(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function save() {
    // A correction has to leave a valid report behind, so the same required-field
    // rule the original submission passed is applied again.
    const missing = sections.flatMap((s) => missingRequiredFields(s.fields, values));
    if (missing.length > 0) {
      setErrors(new Set(missing.map((f) => f.id)));
      toast("error", `${missing.length} required answer${missing.length === 1 ? "" : "s"} still missing.`);
      document.getElementById(`amend-${missing[0].id}`)?.scrollIntoView({ block: "center" });
      return;
    }
    start(async () => {
      const result = await amendClinicalReport({
        member_id: memberId,
        report_id: reportId,
        answers: values,
        reason,
      });
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      toast("success", "Corrected — a new version of the report has been issued");
      router.push(`/reports/${result.data.reportId}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl bg-warning-tint p-4 text-sm ring-1 ring-warning/20">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          The version you are correcting is never deleted. Colleagues who can read this report are
          notified, and the family is told if it is one they can open.
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.id} className="rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10">
          <h2 className="mb-4 font-display text-lg font-semibold">{section.title}</h2>
          <DynamicForm
            fields={section.fields}
            values={values}
            onChange={onChange}
            errors={errors}
            idPrefix="amend-"
          />
        </div>
      ))}

      <div className="space-y-2 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10">
        <Label htmlFor="amend-reason">What are you correcting?</Label>
        <Input
          id="amend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. blood pressure was typed as 184/92 instead of 148/92"
          maxLength={500}
          required
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">
          Recorded in the audit log and printed on the corrected report.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {changed.length === 0
            ? "No answers changed yet."
            : `${changed.length} answer${changed.length === 1 ? "" : "s"} changed.`}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending || changed.length === 0 || !reason.trim()}>
            {pending ? "Saving…" : "Save correction"}
          </Button>
        </div>
      </div>
    </div>
  );
}
