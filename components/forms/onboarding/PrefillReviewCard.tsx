"use client";

// The Personal chapter opens with what enrollment already captured. Rather than a
// screen of ~13 inputs that read as fresh work, we show a tidy "does this look
// right?" summary the caregiver confirms in seconds — Edit expands the real inputs.
// It auto-expands if any required detail is actually missing, and whenever the
// wizard flags a validation gap here, so nothing can be skipped.
import * as React from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { DynamicForm } from "../DynamicForm";
import { isAnswered, isFieldVisible } from "../logic";
import type { FieldHint, FormField, FormValues } from "../types";

function displayValue(field: FormField, values: FormValues, hint?: FieldHint): string {
  const raw = values[field.id];
  switch (field.type) {
    case "boolean":
      return raw === true ? "Yes" : raw === false ? "No" : "—";
    case "multiselect": {
      const arr = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
      return arr.length > 0 ? arr.join(", ") : "—";
    }
    case "select": {
      if (typeof raw !== "string" || raw === "") return "—";
      if (field.allowOther && raw === "Other") {
        const other = values[`${field.id}_other`];
        return typeof other === "string" && other.trim() ? other : "Other";
      }
      return field.options?.find((o) => o.value === raw)?.label ?? raw;
    }
    case "number":
      if (typeof raw !== "number" || Number.isNaN(raw)) return "—";
      return hint?.unit ? `${raw} ${hint.unit}` : String(raw);
    default:
      return typeof raw === "string" && raw.trim() ? raw : "—";
  }
}

export function PrefillReviewCard({
  fields,
  values,
  onChange,
  errors,
  hints,
}: {
  fields: FormField[];
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  errors?: Set<string>;
  hints?: Record<string, FieldHint>;
}) {
  const hasGap = fields.some(
    (f) => f.required && isFieldVisible(f, values) && !isAnswered(f, values[f.id]),
  );
  const [editing, setEditing] = React.useState(hasGap);

  // If the wizard surfaces a validation error on one of these fields, open to edit.
  const flagged = !!errors && fields.some((f) => errors.has(f.id));
  React.useEffect(() => {
    if (flagged) setEditing(true);
  }, [flagged]);

  if (editing) {
    return (
      <DynamicForm
        fields={fields}
        values={values}
        onChange={onChange}
        errors={errors}
        hints={hints}
      />
    );
  }

  const shown = fields.filter((f) => f.type !== "info" && isFieldVisible(f, values));

  return (
    <div className="space-y-4">
      <dl className="overflow-hidden rounded-lg border border-border">
        {shown.map((f, i) => (
          <div
            key={f.id}
            className={cn(
              "flex items-baseline justify-between gap-4 px-3 py-2.5",
              i > 0 && "border-t border-border",
            )}
          >
            <dt className="text-sm text-muted-foreground">{f.label}</dt>
            <dd className="text-right text-sm font-medium">{displayValue(f, values, hints?.[f.id])}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        <Pencil className="size-4" aria-hidden /> Edit these details
      </button>
    </div>
  );
}
