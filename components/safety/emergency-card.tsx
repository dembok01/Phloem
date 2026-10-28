// The trainer's and doctor's emergency card (0059), pinned above the client's tabs
// so nobody searches for a number under stress. Read through emergency_card, which
// gives the assigned trainer and doctor the address and family contact without
// opening member_contacts to them.
import Link from "next/link";
import { AlertTriangle, FileText, Phone, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";
import { telHref } from "@/lib/wa";
import { ETA_LABEL, parseEmergencyCard, type EmergencyCard as Card } from "@/lib/safety";
import { conditionsSummary, medicationsSummary } from "@/lib/reports/build/onboarding-summary";
import { ReportPeek } from "@/components/reports/report-peek";
import { SafetyEventSheet } from "./safety-event-sheet";
import { ClearHoldButton } from "./clear-hold-button";

async function loadCard(memberId: string): Promise<Card | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emergency_card", { p_member: memberId });
  if (error) return null;
  try {
    return parseEmergencyCard(data);
  } catch {
    return null;
  }
}

export async function EmergencyCard({
  memberId,
  role,
  readOnly,
}: {
  memberId: string;
  role: "trainer" | "doctor";
  /** a borrowed admin desk: the card, no buttons */
  readOnly: boolean;
}) {
  const card = await loadCard(memberId);
  const s = card?.safety ?? null;

  return (
    <section
      aria-labelledby="emergency-title"
      className="space-y-3 rounded-2xl border border-danger/35 bg-card p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="emergency-title" className="inline-flex items-center gap-2 text-base font-semibold text-danger">
          <ShieldAlert className="size-4" aria-hidden /> Emergency
        </h2>
        <Link href="/clinician/safety-card" className="text-sm font-medium text-primary hover:underline">
          Safety card
        </Link>
      </div>

      {card?.hold ? (
        <div role="status" className="space-y-2 rounded-xl border border-danger/45 bg-danger-tint p-3">
          <p className="font-semibold text-danger">
            Sessions on hold since {formatDateIST(card.hold.since)} — waiting for the doctor
          </p>
          {card.hold.detail ? (
            <p className="text-sm">
              {card.hold.reported_by_name ? `${card.hold.reported_by_name}: ` : ""}
              {card.hold.detail}
              {card.hold.open_count > 1 ? ` (${card.hold.open_count} incidents)` : ""}
            </p>
          ) : null}
          {role === "doctor" && !readOnly ? <ClearHoldButton memberId={memberId} /> : null}
        </div>
      ) : null}

      {!card ? (
        <p className="text-sm text-muted-foreground">Emergency details couldn&apos;t load — call the coordinator.</p>
      ) : (
        <>
          {s ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <CallTile
                label="Nearby contact"
                name={`${s.local_contact_name} (${s.local_contact_relation})`}
                phone={s.local_contact_phone}
                note={`Reaches in ${ETA_LABEL[s.local_contact_eta].toLowerCase()}`}
              />
              <CallTile label="Hospital" name={s.hospital_name} phone={s.hospital_phone} />
              {/* Emergency numbers reach the service where the CALLER is, and sessions
                  are by video — so the trainer's own call may reach the wrong place. */}
              <CallTile
                label="Ambulance"
                phone={s.ambulance_phone}
                note="Reaches the service where the caller is. Not near the client? Ask the person at home or the nearby contact to call it."
              />
              {s.private_ambulance_phone ? (
                <CallTile label="Private ambulance" phone={s.private_ambulance_phone} />
              ) : null}
              {card.family_contact.phone ? (
                <CallTile label="Family" name={card.family_contact.name} phone={card.family_contact.phone} />
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">No emergency details yet — call the coordinator.</p>
              {card.family_contact.phone ? (
                <CallTile label="Family" name={card.family_contact.name} phone={card.family_contact.phone} />
              ) : null}
            </div>
          )}

          <p className="text-sm">
            <span className="text-muted-foreground">Address: </span>
            {card.address ? `${card.address}${card.pin_code ? ` · PIN ${card.pin_code}` : ""}` : "not on file"}
          </p>

          {s && (!s.someone_home || !s.bp_or_glucometer) ? (
            <ul className="flex flex-wrap gap-2">
              {!s.someone_home ? <Warning>Alone at home during sessions</Warning> : null}
              {!s.bp_or_glucometer ? <Warning>No BP machine or glucometer at home</Warning> : null}
            </ul>
          ) : null}

          {card.health ? (
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Conditions: </span>
                {conditionsSummary(card.health.conditions)}
              </p>
              <p>
                <span className="text-muted-foreground">Medicines (at onboarding): </span>
                {medicationsSummary(card.health.medications)}
              </p>
              {card.health.latest_doctor_report ? (
                <ReportPeek
                  reportId={card.health.latest_doctor_report.id}
                  className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <FileText className="size-4" aria-hidden /> Latest doctor&apos;s report ·{" "}
                  {formatDateIST(card.health.latest_doctor_report.created_at)}
                </ReportPeek>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {role === "trainer" && !readOnly ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <SafetyEventSheet memberId={memberId} kind="skipped" triggerLabel="No session today" />
          <SafetyEventSheet memberId={memberId} kind="incident" triggerLabel="Report an incident" />
        </div>
      ) : null}
    </section>
  );
}

function CallTile({
  label,
  name,
  phone,
  note,
}: {
  label: string;
  name?: string | null;
  phone: string;
  note?: string;
}) {
  const href = telHref(phone);
  const body = (
    <>
      <span className="eyebrow">{label}</span>
      {name ? <span className="font-medium">{name}</span> : null}
      <span className="inline-flex items-center gap-1.5 font-data text-base font-semibold">
        <Phone className="size-4 text-danger" aria-hidden /> {phone}
      </span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </>
  );
  const tile = "flex min-h-11 flex-col gap-0.5 rounded-xl border bg-background px-3 py-2";
  return href ? (
    <a href={href} className={`${tile} pressable hover:border-danger/50`} aria-label={`Call ${label}: ${phone}`}>
      {body}
    </a>
  ) : (
    <div className={tile}>{body}</div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-warning-tint px-3 py-1 text-sm font-medium text-warning">
      <AlertTriangle className="size-4" aria-hidden /> {children}
    </li>
  );
}
