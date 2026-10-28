// The coordinator's Emergency & Safety card (0059) on the member page: the record,
// the two ways to get it while it's missing (fill it in on a call, or ask the family
// to fill it in on their dashboard), the WhatsApp copy, and the session log. The
// coordinator's emergency_card carries no health answers (§3).
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";
import { waMeLink } from "@/lib/wa";
import {
  ETA_LABEL,
  SKIP_REASONS,
  askFamilyText,
  parseEmergencyCard,
  whatsappText,
  type EmergencyCard,
} from "@/lib/safety";
import { SafetyFormSheet } from "./safety-form-sheet";
import { CopyWhatsAppButton } from "./copy-whatsapp-button";
import { AskFamilyButton } from "./ask-family-button";
import { SafetyEventSheet } from "./safety-event-sheet";

const IN_ONBOARDING = new Set(["invited", "signed_up", "onboarding"]);
const REASON_LABEL = new Map(SKIP_REASONS.map((r) => [r.value as string, r.label]));
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

type EventRow = {
  id: string;
  kind: string;
  reasons: string[];
  detail: string | null;
  occurred_at: string;
  cleared_at: string | null;
  reporter: { full_name: string | null } | null;
  clearer: { full_name: string | null } | null;
};

export async function SafetyDetailsCard({
  memberId,
  memberName,
  status,
  caregiver,
  requestedAt,
}: {
  memberId: string;
  memberName: string;
  status: string;
  caregiver: { full_name: string | null; phone: string | null; whatsapp: string | null } | null;
  requestedAt: string | null;
}) {
  const supabase = await createClient();
  const [{ data: cardJson }, { data: events }] = await Promise.all([
    supabase.rpc("emergency_card", { p_member: memberId }),
    supabase
      .from("safety_events")
      .select(
        "id, kind, reasons, detail, occurred_at, cleared_at, reporter:profiles!safety_events_reported_by_fkey(full_name), clearer:profiles!safety_events_cleared_by_fkey(full_name)",
      )
      .eq("member_id", memberId)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);
  let card: EmergencyCard | null = null;
  try {
    card = parseEmergencyCard(cardJson);
  } catch {
    card = null;
  }
  const s = card?.safety ?? null;
  const first = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <Card id="safety" className="scroll-mt-24">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="inline-flex items-center gap-2">
          <ShieldAlert className="size-4 text-danger" aria-hidden /> Emergency &amp; Safety
        </CardTitle>
        {s && card ? (
          <span className="inline-flex flex-wrap gap-2">
            <CopyWhatsAppButton text={whatsappText(memberName, card)} />
            <SafetyFormSheet memberId={memberId} mode="call" record={s} triggerLabel="Edit" />
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {card?.hold ? (
          <p role="status" className="rounded-xl border border-danger/45 bg-danger-tint p-3 text-sm">
            <span className="font-semibold text-danger">
              Sessions on hold since {formatDateIST(card.hold.since)} — waiting for the doctor.
            </span>{" "}
            {card.hold.detail}
          </p>
        ) : null}

        {s ? (
          <>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <Row label="Nearby contact">
                {s.local_contact_name} ({s.local_contact_relation}) · {s.local_contact_phone} · reaches in{" "}
                {ETA_LABEL[s.local_contact_eta].toLowerCase()}
              </Row>
              <Row label="Hospital">
                {s.hospital_name} · {s.hospital_phone}
              </Row>
              <Row label="Ambulance">{s.ambulance_phone}</Row>
              <Row label="Private ambulance">{s.private_ambulance_phone ?? "None"}</Row>
              <Row label="Anyone else home in sessions">{s.someone_home ? "Yes" : "No"}</Row>
              <Row label="BP machine or glucometer">{s.bp_or_glucometer ? "Yes" : "No"}</Row>
            </dl>
            <p className="text-xs text-muted-foreground">
              {s.consent_source === "family_form"
                ? `Filled in by the family on ${formatDateIST(s.consent_at)}`
                : `Taken on a call on ${formatDateIST(s.consent_at)}`}
              {s.updated_at !== s.consent_at ? ` · last changed ${formatDateIST(s.updated_at)}` : ""}
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-danger">Missing</span> — the trainer has no one to call if something
              happens in a session.
              {IN_ONBOARDING.has(status) ? " The family fills this in as the last step of onboarding." : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SafetyFormSheet memberId={memberId} mode="call" record={null} triggerLabel="Fill it in on a call" />
              {IN_ONBOARDING.has(status) ? null : caregiver ? (
                <AskFamilyButton
                  memberId={memberId}
                  message={askFamilyText(first(caregiver.full_name), first(memberName), `${APP_URL}/portal`)}
                  waLink={waMeLink(caregiver.whatsapp ?? caregiver.phone)}
                  asked={Boolean(requestedAt)}
                />
              ) : (
                <span className="text-sm text-muted-foreground">No family login — fill it in on a call.</span>
              )}
            </div>
            {requestedAt ? (
              <p className="text-xs text-muted-foreground">Family asked on {formatDateIST(requestedAt)}</p>
            ) : null}
          </div>
        )}

        <div className="space-y-2 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Session log</p>
            <SafetyEventSheet memberId={memberId} kind="incident" triggerLabel="Report an incident" />
          </div>
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing logged. The trainer logs a day with no session, and any incident.
            </p>
          ) : (
            <ul className="space-y-2">
              {((events ?? []) as unknown as EventRow[]).map((e) => (
                <li key={e.id} className="rounded-lg border bg-background/60 px-3 py-2 text-sm">
                  <p>
                    <span className={e.kind === "incident" ? "font-semibold text-danger" : "font-medium"}>
                      {e.kind === "incident" ? "Incident" : "No session"}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatDateIST(e.occurred_at)}
                      {e.reporter?.full_name ? ` · ${e.reporter.full_name}` : ""}
                    </span>
                  </p>
                  {e.reasons.length > 0 ? (
                    <p>{e.reasons.map((r) => REASON_LABEL.get(r) ?? r).join(", ")}</p>
                  ) : null}
                  {e.detail ? <p className="whitespace-pre-line">{e.detail}</p> : null}
                  {e.kind === "incident" ? (
                    <p className="text-xs text-muted-foreground">
                      {e.cleared_at
                        ? `Cleared to restart ${formatDateIST(e.cleared_at)}${e.clearer?.full_name ? ` by ${e.clearer.full_name}` : ""}`
                        : "Waiting for the doctor"}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
