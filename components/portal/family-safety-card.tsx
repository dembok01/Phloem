// The family's Emergency & Safety details on their dashboard (0059). While they're
// missing — and onboarding, which asks for them, is behind the family — a prompt
// near the top; once filled, the details with Edit, so a changed number gets
// updated. The coordinator's "Ask the family" links here (#safety).
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ETA_LABEL, type SafetyRecord } from "@/lib/safety";
import { SafetyFormSheet } from "@/components/safety/safety-form-sheet";

export function FamilySafetyCard({
  memberId,
  firstName,
  safety,
}: {
  memberId: string;
  firstName: string;
  safety: SafetyRecord | null;
}) {
  if (!safety) {
    return (
      <Card id="safety" className="scroll-mt-24 border-warning/45 bg-warning-tint">
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
          <ShieldCheck className="size-8 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-semibold">Add emergency details for {firstName}</p>
            <p className="text-base text-muted-foreground">
              If something happens during a training session, the trainer needs to know who to call and which hospital
              is nearest. It takes about 2 minutes.
            </p>
          </div>
          <SafetyFormSheet memberId={memberId} mode="family" record={null} triggerLabel="Add details" triggerSize="lg" />
        </CardContent>
      </Card>
    );
  }

  const rows: [string, string][] = [
    ["Nearby contact", `${safety.local_contact_name} (${safety.local_contact_relation}) · ${safety.local_contact_phone}`],
    ["Reaches the house in", ETA_LABEL[safety.local_contact_eta]],
    ["Nearest hospital", `${safety.hospital_name} · ${safety.hospital_phone}`],
    ["Ambulance", safety.ambulance_phone],
    ["Private ambulance", safety.private_ambulance_phone ?? "None"],
    ["Someone else at home during sessions", safety.someone_home ? "Yes" : "No"],
    ["BP machine or glucometer at home", safety.bp_or_glucometer ? "Yes" : "No"],
  ];
  return (
    <Card id="safety" className="scroll-mt-24">
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-semibold">Emergency &amp; safety</p>
          <SafetyFormSheet memberId={memberId} mode="family" record={safety} triggerLabel="Edit" />
        </div>
        <p className="text-sm text-muted-foreground">
          Only {firstName}&apos;s trainer, doctor and coordinator see these, so they can act in an emergency.
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
