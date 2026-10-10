"use client";

// The onboarding schema is far too large for a sheet, so the amendment gets a
// page. Only answers the admin actually changed are sent: amend_onboarding
// merges the patch onto the original, so an untouched answer is not rewritten.
import * as React from "react";
import { useRouter } from "next/navigation";
import { DynamicForm } from "@/components/forms/DynamicForm";
import type { FormSection, FormValues } from "@/components/forms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { amendOnboardingAction } from "./actions";

/** Stable form of an answer: object keys sorted, undefined as null — so reordering
 *  keys is not a "change", and a cleared value is not dropped in transit. */
function canonical(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

export function AmendForm({
  memberId,
  sections,
  answers,
}: {
  memberId: string;
  sections: FormSection[];
  answers: Record<string, unknown>;
}) {
  const [values, setValues] = React.useState<FormValues>(answers);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const patch = React.useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(values)) {
      if (canonical(values[key]) !== canonical(answers[key])) out[key] = values[key] ?? null;
    }
    return out;
  }, [values, answers]);
  const changed = Object.keys(patch).length;

  function save() {
    start(async () => {
      const result = await amendOnboardingAction(memberId, patch, reason);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      toast("success", "Answers corrected and the summary reissued");
      router.push(`/admin/members/${memberId}`);
    });
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.id} className="rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10">
          <h2 className="mb-4 font-display text-lg font-semibold">{section.title}</h2>
          <DynamicForm
            fields={section.fields}
            values={values}
            onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
            idPrefix="amend-"
          />
        </div>
      ))}

      <div className="space-y-2 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10">
        <Label htmlFor="amend-reason">Why is this being corrected?</Label>
        <Input
          id="amend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. sleep was entered as 4 hours instead of 7"
          maxLength={500}
          required
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">
          Recorded in the audit log and on the reissued summary. The care team is notified.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {changed === 0 ? "No answers changed yet." : `${changed} answer${changed === 1 ? "" : "s"} changed.`}
        </p>
        <Button type="button" onClick={save} disabled={pending || changed === 0 || !reason.trim()}>
          {pending ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </div>
  );
}
