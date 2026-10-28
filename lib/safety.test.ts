import test from "node:test";
import assert from "node:assert/strict";
import { askFamilyText, parseEmergencyCard, safetyInputSchema, whatsappText, type EmergencyCard } from "./safety";
import { medicationsSummary } from "./reports/build/onboarding-summary";

const record = {
  local_contact_name: "Suma",
  local_contact_relation: "Neighbour",
  local_contact_phone: "+91 98470 12345",
  local_contact_eta: "under_10",
  hospital_name: "Lakeshore Hospital",
  hospital_phone: "0484-2345678",
  ambulance_phone: "108",
  private_ambulance_phone: null,
  someone_home: false,
  bp_or_glucometer: true,
  consent_source: "coordinator_call",
  consent_at: "2026-10-28T09:00:00+00:00",
  updated_at: "2026-10-28T09:00:00+00:00",
};
const card = (over: Partial<Record<keyof typeof record, unknown>> = {}): EmergencyCard =>
  parseEmergencyCard({
    safety: { ...record, ...over },
    address: "12 Test Road, Kochi",
    pin_code: "682001",
    family_contact: { name: "Anil", phone: "+91 90000 00001" },
    health: null,
    hold: null,
  });

test("a card with no record parses", () => {
  const c = parseEmergencyCard({
    safety: null,
    address: "x",
    pin_code: "682001",
    family_contact: { name: "A", phone: "1" },
    health: null,
    hold: null,
  });
  assert.equal(c.safety, null);
  assert.equal(c.address, "x");
});

test("a held card carries the hold and the medicines", () => {
  const c = parseEmergencyCard({
    safety: record,
    address: null,
    pin_code: null,
    family_contact: { name: null, phone: null },
    health: {
      conditions: [{ condition: "Diabetes", duration: "5 years" }],
      medications: [{ name: "Metformin", dose: "500 mg", frequency: "twice daily" }],
      latest_doctor_report: { id: "r1", created_at: "2026-10-01T00:00:00+00:00" },
    },
    hold: { since: "2026-10-27T10:00:00+00:00", open_count: 2, detail: "Felt faint", reported_by_name: "Ravi" },
  });
  assert.equal(c.hold?.open_count, 2);
  assert.equal(c.health?.latest_doctor_report?.id, "r1");
});

test("the WhatsApp text uses the stored ambulance number", () => {
  const text = whatsappText("Leela Varma", card({ ambulance_phone: "999" }));
  assert.ok(text.includes("Ambulance: 999"));
  assert.ok(!text.includes("108"));
});

test("the WhatsApp text has everything the trainer needs, on its own lines", () => {
  const text = whatsappText("Leela Varma", card());
  for (const line of [
    "Emergency details — Leela Varma",
    "Address: 12 Test Road, Kochi, PIN 682001",
    "Nearby contact: Suma (Neighbour) — +91 98470 12345 · reaches in under 10 minutes",
    "Hospital: Lakeshore Hospital — 0484-2345678",
    "Ambulance: 108",
    "Private ambulance: none",
    "Family contact: Anil — +91 90000 00001",
    "Anyone else home during sessions: No",
    "BP machine or glucometer: Yes",
  ]) {
    assert.ok(text.split("\n").includes(line), `missing line: ${line}`);
  }
});

test("the ask-the-family message names both and links the dashboard", () => {
  const text = askFamilyText("Anil", "Leela", "https://app.example/portal");
  assert.ok(text.startsWith("Hello Anil"));
  assert.ok(text.includes("For Leela's safety"));
  assert.ok(text.includes("https://app.example/portal"));
});

test("the schema leaves consent to the RPC and the private ambulance optional", () => {
  const input = { ...record, emergency_consent: false } as Record<string, unknown>;
  delete input.private_ambulance_phone;
  const parsed = safetyInputSchema.safeParse({ ...input, local_contact_name: "  Suma  " });
  assert.ok(parsed.success);
  assert.equal(parsed.data.local_contact_name, "Suma");
  assert.equal(parsed.data.private_ambulance_phone, "");
  assert.equal(safetyInputSchema.safeParse({ ...input, hospital_phone: " " }).success, false);
  assert.equal(safetyInputSchema.safeParse({ ...input, local_contact_eta: "soon" }).success, false);
});

test("medicines in one line", () => {
  assert.equal(
    medicationsSummary([
      { name: "Metformin", dose: "500 mg", frequency: "twice daily" },
      { name: "Amlodipine", dose: "", frequency: "" },
    ]),
    "Metformin 500 mg, twice daily; Amlodipine",
  );
  assert.equal(medicationsSummary([]), "—");
});
