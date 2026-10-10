"use client";

// One editing surface for every record in the app (design §7.1), modelled on
// components/coordinator/schedule-sheet.tsx — the house pattern for acting
// without leaving the page.
//
// Fields the role may SEE but not CHANGE render disabled with their reason
// rather than being hidden: a family screen that silently omits the member's
// age reads as a bug, and generates the support call this feature exists to
// prevent.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { buildPatch, canEdit, type FieldGroup, type FieldSpec } from "@/lib/member-fields";
import type { ActionResult } from "@/lib/action-result";
import type { UserRole } from "@/lib/roles";

const CONTROL =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

export function EditRecordSheet({
  group,
  role,
  values,
  title,
  description,
  triggerLabel = "Edit",
  successText,
  onSave,
}: {
  group: FieldGroup;
  role: UserRole;
  /** Any row: only the group's own keys are read, so extra columns (a JSON
   *  red_flags, a boolean suspended) are ignored rather than rejected. */
  values: Record<string, unknown>;
  title: string;
  description?: string;
  triggerLabel?: string;
  /** Toast copy on success — repeats the verb of the button (DESIGN-SYSTEM §5). */
  successText: string;
  onSave: (patch: Record<string, string>) => Promise<ActionResult>;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();
  // useId, not the group name: the care-team table renders one ADMIN_PROFILE
  // sheet PER ROW, and a name-derived id would repeat across rows — every row's
  // Save button would then submit the first row's form.
  const formId = React.useId();

  const current = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of group.fields) {
      const v = values[f.key];
      out[f.key] = v == null ? "" : String(v);
    }
    return out;
  }, [group, values]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Record<string, string> = {};
    for (const f of group.fields) {
      if (canEdit(f, role)) next[f.key] = String(data.get(f.key) ?? "");
    }
    const patch = buildPatch(group, role, next, current);
    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }
    start(async () => {
      const result = await onSave(patch);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast("success", successText);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Pencil className="size-3.5" aria-hidden /> {triggerLabel}
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {/* A plain Button: outside the <form>, SubmitButton's useFormStatus
                never sees the pending state. */}
            <Button type="submit" form={formId} loading={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-4">
          {group.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              formId={formId}
              editable={canEdit(field, role)}
              defaultValue={current[field.key]}
            />
          ))}
        </form>
      </Sheet>
    </>
  );
}

function FieldRow({
  field,
  formId,
  editable,
  defaultValue,
}: {
  field: FieldSpec;
  formId: string;
  editable: boolean;
  defaultValue: string;
}) {
  const id = `${formId}-${field.key}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "select" ? (
        <select id={id} name={field.key} defaultValue={defaultValue} disabled={!editable} className={CONTROL}>
          <option value="">Not set</option>
          {/* Enrolment stored some of these as free text ("femaile", "male"). A value
              missing from the options would show "Not set" and be erased on the
              next save, so the stored value is always offered as-is. */}
          {(defaultValue && !(field.options ?? []).includes(defaultValue)
            ? [defaultValue, ...(field.options ?? [])]
            : (field.options ?? [])
          ).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          name={field.key}
          defaultValue={defaultValue}
          disabled={!editable}
          rows={3}
          className={`${CONTROL} h-auto py-2`}
        />
      ) : (
        <Input
          id={id}
          name={field.key}
          type={field.type === "number" ? "number" : field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text"}
          defaultValue={defaultValue}
          disabled={!editable}
          className="h-11"
        />
      )}
      {!editable && field.lockedReason ? (
        <p className="text-xs text-muted-foreground">{field.lockedReason}</p>
      ) : null}
    </div>
  );
}
