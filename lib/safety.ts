// Emergency & Safety (0059/0060): the record's shape, the trainer's card, and the
// text the coordinator copies into the family's WhatsApp group. The database decides
// who reads and writes it; this file only shapes and words it.
import { z } from "zod";

export const ETA_LABEL = {
  under_10: "Under 10 minutes",
  "10_30": "10–30 minutes",
  over_30: "Over 30 minutes",
} as const;
export type Eta = keyof typeof ETA_LABEL;
const ETAS = Object.keys(ETA_LABEL) as [Eta, ...Eta[]];

export type SkipReason = "chest_pain" | "dizziness" | "breathlessness" | "high_bp" | "other";
export const SKIP_REASONS: readonly { value: SkipReason; label: string }[] = [
  { value: "chest_pain", label: "Chest pain" },
  { value: "dizziness", label: "Dizziness" },
  { value: "breathlessness", label: "Breathlessness" },
  { value: "high_bp", label: "Very high BP" },
  { value: "other", label: "Feeling unwell / other" },
];

/** The consent sentence (owner-confirmed 2026-10-28), as the onboarding form words it. */
export const EMERGENCY_CONSENT =
  "I agree that PHLOEM's care team may contact the people above in an emergency, and that the member's trainer and doctor may see these details and the home address for that purpose.";

const filled = z.string().trim().min(1, "Required.");
const phone = z.string().trim().min(3, "Enter a phone number.");

/** What the form sends. Consent is only needed for a new record — the RPC decides. */
export const safetyInputSchema = z.object({
  local_contact_name: filled,
  local_contact_relation: filled,
  local_contact_phone: phone,
  local_contact_eta: z.enum(ETAS),
  hospital_name: filled,
  hospital_phone: phone,
  ambulance_phone: phone,
  private_ambulance_phone: z.string().trim().default(""),
  someone_home: z.boolean(),
  bp_or_glucometer: z.boolean(),
  emergency_consent: z.boolean(),
});
export type SafetyInput = z.infer<typeof safetyInputSchema>;

/** A member_safety row as its readers see it. */
export const safetyRecordSchema = z.object({
  local_contact_name: z.string(),
  local_contact_relation: z.string(),
  local_contact_phone: z.string(),
  local_contact_eta: z.enum(ETAS),
  hospital_name: z.string(),
  hospital_phone: z.string(),
  ambulance_phone: z.string(),
  private_ambulance_phone: z.string().nullable(),
  someone_home: z.boolean(),
  bp_or_glucometer: z.boolean(),
  consent_source: z.enum(["family_form", "coordinator_call"]),
  consent_at: z.string(),
  updated_at: z.string(),
});
export type SafetyRecord = z.infer<typeof safetyRecordSchema>;

const cardSchema = z.object({
  safety: safetyRecordSchema.nullable(),
  address: z.string().nullable(),
  pin_code: z.string().nullable(),
  family_contact: z.object({ name: z.string().nullable(), phone: z.string().nullable() }),
  health: z
    .object({
      conditions: z.unknown(),
      medications: z.unknown(),
      latest_doctor_report: z.object({ id: z.string(), created_at: z.string() }).nullable(),
    })
    .nullable(),
  hold: z
    .object({
      since: z.string(),
      open_count: z.number(),
      detail: z.string().nullable(),
      reported_by_name: z.string().nullable(),
    })
    .nullable(),
});
export type EmergencyCard = z.infer<typeof cardSchema>;

/** emergency_card(member) → typed. Throws on a shape the RPC never returns. */
export function parseEmergencyCard(json: unknown): EmergencyCard {
  return cardSchema.parse(json);
}

const yes = (b: boolean) => (b ? "Yes" : "No");

/** The details as plain text, to paste and pin in the family's WhatsApp group. */
export function whatsappText(memberName: string, card: EmergencyCard): string {
  const s = card.safety;
  const { name, phone: famPhone } = card.family_contact;
  const lines = [
    `Emergency details — ${memberName}`,
    `Address: ${card.address ? `${card.address}${card.pin_code ? `, PIN ${card.pin_code}` : ""}` : "not on file"}`,
  ];
  if (s) {
    lines.push(
      `Nearby contact: ${s.local_contact_name} (${s.local_contact_relation}) — ${s.local_contact_phone} · reaches in ${ETA_LABEL[s.local_contact_eta].toLowerCase()}`,
      `Hospital: ${s.hospital_name} — ${s.hospital_phone}`,
      `Ambulance: ${s.ambulance_phone}`,
      `Private ambulance: ${s.private_ambulance_phone ?? "none"}`,
    );
  }
  lines.push(`Family contact: ${name || famPhone ? `${name ?? "—"} — ${famPhone ?? "—"}` : "not on file"}`);
  if (s) {
    lines.push(
      `Anyone else home during sessions: ${yes(s.someone_home)}`,
      `BP machine or glucometer: ${yes(s.bp_or_glucometer)}`,
    );
  }
  return lines.join("\n");
}

/** The coordinator's WhatsApp message asking the family to fill it in themselves. */
export function askFamilyText(caregiverFirstName: string, memberFirstName: string, url: string): string {
  return `Hello ${caregiverFirstName}, this is PHLOEM. For ${memberFirstName}'s safety during training sessions, please add a nearby contact, the nearest hospital and the ambulance number on the PHLOEM dashboard — it takes about 2 minutes: ${url}. If it's easier, reply here and we'll call you to fill it in together.`;
}

/** The one-page safety card, in the client's words ("her" made neutral). */
export const SAFETY_PROTOCOL = {
  before: [
    "“How are you feeling today?”",
    "Check sugar and BP where relevant.",
    "Chest pain, dizziness, breathlessness or very high BP means no session that day — tell the coordinator.",
  ],
  during: [
    "Stop.",
    "Stay on video.",
    "Sit or lie them down.",
    "Call the local contact.",
    "Call 108 or the hospital.",
    "Call the son or daughter.",
    "Inform the doctor.",
  ],
  after: ["Log what happened the same day.", "No restarting until the doctor clears it."],
} as const;
