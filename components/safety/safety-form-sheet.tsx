"use client";

// The Emergency & Safety details form (0059 save_member_safety). The coordinator
// fills it on a call ("call") or the family on their dashboard ("family"); the RPC
// records which. A new record needs the consent: read out and confirmed on a call,
// ticked by the family themselves. Native required inputs — the RPC re-checks.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  EMERGENCY_CONSENT,
  ETA_LABEL,
  SAFETY_FIELD_LABELS as L,
  type Eta,
  type SafetyRecord,
} from "@/lib/safety";
import { saveMemberSafetyAction } from "@/app/(app)/safety-actions";

const CONTROL =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SafetyFormSheet({
  memberId,
  mode,
  record,
  triggerLabel,
  triggerSize = "sm",
}: {
  memberId: string;
  mode: "call" | "family";
  /** the record on file; null when there is none yet (consent is then asked) */
  record: SafetyRecord | null;
  triggerLabel: string;
  triggerSize?: "sm" | "lg";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const formId = React.useId();
  const id = (k: string) => `${formId}-${k}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const text = (k: string) => String(d.get(k) ?? "");
    start(async () => {
      const res = await saveMemberSafetyAction(memberId, {
        local_contact_name: text("local_contact_name"),
        local_contact_relation: text("local_contact_relation"),
        local_contact_phone: text("local_contact_phone"),
        local_contact_eta: text("local_contact_eta") as Eta,
        hospital_name: text("hospital_name"),
        hospital_phone: text("hospital_phone"),
        ambulance_phone: text("ambulance_phone"),
        private_ambulance_phone: text("private_ambulance_phone"),
        someone_home: text("someone_home") === "yes",
        bp_or_glucometer: text("bp_or_glucometer") === "yes",
        emergency_consent: d.get("emergency_consent") === "on",
      });
      if (!res.ok) {
        toast("error", res.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast(
        "success",
        mode === "family"
          ? "Thank you — the trainer and doctor can now see these details."
          : "Saved — the trainer and doctor can see these details now.",
      );
    });
  }

  const field = (k: keyof typeof L, type: "text" | "tel" = "text", opts: { required?: boolean; hint?: string } = {}) => (
    <div className="space-y-2">
      <Label htmlFor={id(k)}>{L[k]}</Label>
      <Input
        id={id(k)}
        name={k}
        type={type}
        required={opts.required ?? true}
        defaultValue={k === "ambulance_phone" ? (record?.ambulance_phone ?? "108") : ((record?.[k as keyof SafetyRecord] as string | null) ?? "")}
        autoComplete="off"
        className="h-11"
        aria-describedby={opts.hint ? id(`${k}-hint`) : undefined}
      />
      {opts.hint ? (
        <p id={id(`${k}-hint`)} className="text-xs text-muted-foreground">
          {opts.hint}
        </p>
      ) : null}
    </div>
  );

  const yesNo = (k: "someone_home" | "bp_or_glucometer") => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{L[k]}</legend>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map((v) => (
          <label key={v} className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border px-3 has-checked:border-primary has-checked:bg-secondary">
            <input
              type="radio"
              name={k}
              value={v}
              required
              defaultChecked={record ? record[k] === (v === "yes") : undefined}
              className="size-5 accent-primary"
            />
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <>
      <Button
        type="button"
        variant={record ? "outline" : "default"}
        size={triggerSize}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {record ? <Pencil className="size-3.5" aria-hidden /> : <Plus aria-hidden />} {triggerLabel}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Emergency & safety details"
        description={
          mode === "family"
            ? "Who the trainer should call if something happens during a session. Only the care team's trainer, doctor and coordinator see these."
            : "Fill these in with the family. Only the private ambulance can be left blank."
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {pending ? "Saving…" : "Save details"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-5">
          <fieldset className="space-y-4">
            <legend className="eyebrow mb-1">Someone nearby</legend>
            {field("local_contact_name")}
            {field("local_contact_relation")}
            {field("local_contact_phone", "tel")}
            <div className="space-y-2">
              <Label htmlFor={id("local_contact_eta")}>{L.local_contact_eta}</Label>
              <select
                id={id("local_contact_eta")}
                name="local_contact_eta"
                required
                defaultValue={record?.local_contact_eta ?? ""}
                className={CONTROL}
              >
                <option value="" disabled>
                  Choose one
                </option>
                {(Object.keys(ETA_LABEL) as Eta[]).map((k) => (
                  <option key={k} value={k}>
                    {ETA_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="eyebrow mb-1">Hospital & ambulance</legend>
            {field("hospital_name")}
            {field("hospital_phone", "tel")}
            {field("ambulance_phone", "tel", {
              hint: "108 in India. If the member lives outside India, enter the local ambulance number.",
            })}
            {field("private_ambulance_phone", "tel", {
              required: false,
              hint: "Only if they have one — leave blank if not.",
            })}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="eyebrow mb-1">At home during sessions</legend>
            {yesNo("someone_home")}
            {yesNo("bp_or_glucometer")}
          </fieldset>

          {record ? null : mode === "call" ? (
            <div className="space-y-3 rounded-xl border bg-muted/50 p-4">
              <p className="text-sm font-medium">Read this to the family:</p>
              <blockquote className="border-l-2 border-primary pl-3 text-sm">“{EMERGENCY_CONSENT}”</blockquote>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="emergency_consent" required className="size-5 accent-primary" />
                <span className="text-sm font-medium">I read this to the family and they agreed</span>
              </label>
            </div>
          ) : (
            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input type="checkbox" name="emergency_consent" required className="mt-0.5 size-5 shrink-0 accent-primary" />
              <span className="text-sm">{EMERGENCY_CONSENT}</span>
            </label>
          )}
        </form>
      </Sheet>
    </>
  );
}
