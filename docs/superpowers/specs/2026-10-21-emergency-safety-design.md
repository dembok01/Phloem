# Emergency & Safety — design (2026-10-21)

Client request, items 3–6: an Emergency & Safety section in onboarding, filled for every
current client by phone; a one-page safety card for trainers; emergency details in front of
the trainer during a session. Owner decisions from the 2026-10-21 conversation are marked
**(owner)**; the builder's own calls are marked **(builder)**.

## Why

Trainers run video sessions with elderly clients at home, often alone. When something
goes wrong mid-session the trainer has seconds, and today they have nothing: no local
contact, no hospital, and by design (§3) no phone number of any kind. An incident reaches
the doctor at best in the trainer's day-27 monthly feedback (`adverse_events`), weeks late,
and nothing stops training restarting before the doctor has looked.

## Goals

1. Every client has an Emergency & Safety record — new families fill it in onboarding;
   the coordinator fills it for the 22 current clients during a ~5-minute call each.
2. The assigned trainer and doctor see it pinned on the client's page, tap-to-call, without
   searching.
3. A one-page safety card in the client's own words, printable.
4. "No session today" tells the coordinator; "Report an incident" tells the doctor and the
   coordinator at once and shows sessions as **on hold** until the doctor clears them.

## Non-goals

- No session scheduling and no per-session logging — only the exceptions are logged.
- No SMS / WhatsApp / email alerts. Email has never been live (Resend deferred); alerts
  are in-app notifications. The card's steps are phone calls — the log is the record,
  not the alarm.
- Conditions and medicines are not asked again **(owner)**: the card shows what onboarding
  collected, updated by the doctor's reports.
- No other onboarding question changes (client rule: questions are frozen).
- The family editing its safety details after onboarding — later, if asked; the
  coordinator edits meanwhile.

## Anti-goals

- A trainer hunting for a number in an emergency.
- Numbers reaching the nutritionist or psychologist, or the client's own phone / WhatsApp
  / email reaching anyone new.
- An incident the doctor never hears of, or a restart with no doctor's clearance on record.

## What the trainer and doctor see (owner)

The assigned trainer and the assigned doctor see: the local contact, the hospital, the
ambulance numbers, the family emergency contact already collected at onboarding, and the
**home address + PIN** (so 108 can be told where to go). Not the client's own phone,
WhatsApp or email. Nutritionist and psychologist see none of it. `member_contacts` keeps its
policies; the card is read through one RPC.

## The fields

Section "Emergency & Safety", last in onboarding (after Goals, so earlier cards and the
saved resume position don't move) **(builder)**. All required except the private ambulance.

| Field | Type | Notes |
|---|---|---|
| Nearby contact — name | text | |
| Nearby contact — relation | text | |
| Nearby contact — phone | text | |
| How quickly can they reach the house? | select | Under 10 minutes / 10–30 minutes / Over 30 minutes **(builder)** |
| Nearest hospital — name | text | |
| Nearest hospital — phone | text | |
| Ambulance number | text | Pre-filled **108**, editable: 8 of 22 clients live in the UAE, UK, Oman or Canada, where 108 does not work. The coordinator corrects those on the call. |
| Private ambulance number | text | Optional — "Leave blank if none" |
| Is anyone else usually at home during session time? | boolean | |
| BP machine or glucometer at home? | boolean | One question, as the client wrote it **(owner, 2026-10-28: don't split)** |
| Emergency consent | boolean | Must be yes to save **(builder)** — without it there is no card, and the trainer sees "No emergency details — call the coordinator". Wording: see Consent below |

## Data (migration 0059)

`member_safety` — one row per member: the fields above, plus `consent_source`
(`family_form` | `coordinator_call`), `consent_recorded_by`, `consent_at`, `updated_by`,
`updated_at`. A phone "yes" is recorded as such, not as if the family ticked the box.

`safety_events` — `member_id`, `kind` (`skipped` | `incident`), `reasons text[]` (skipped:
chest pain, dizziness, breathlessness, very high BP, other), `detail` (incident: what
happened, what was done), `occurred_at`, `reported_by`; for incidents `cleared_at`,
`cleared_by`, `clear_note`. **Sessions are on hold** while an incident is uncleared.

Access, through RLS and security-definer RPCs only:

- `member_safety` read: admin, coordinator, the caregiver, the assigned trainer and doctor.
  Write `save_member_safety(member, fields)`: admin, coordinator (consent source
  `coordinator_call`); onboarding writes it as `family_form`.
- `emergency_card(member)`: the safety row + address, PIN and the family emergency
  contact, for the same readers as `member_safety`. For the trainer and doctor only, it adds
  conditions and medicines as given at onboarding, with a link to the latest doctor's report
  for later changes **(builder)**. The coordinator's card leaves them out (§3: no health
  answers). For the trainer, the full medicine list is a small widening of their
  activity-scoped view; it is what a hospital will ask for.
- `safety_events` read: admin, coordinator, assigned trainer and doctor.
  `report_safety_event`: the assigned trainer, coordinator, admin (a family may phone the
  coordinator) **(builder)**. `clear_safety_hold(event, note)`: the assigned doctor, admin.
- Notifications: skipped → coordinators; incident → the assigned doctor, coordinators,
  admin. Audit every write.

## Onboarding v2

`onboarding` v2 = v1 + the new section, as a new version (the 0023/0052 pattern). The
migration moves unsubmitted v1 drafts to v2 — the page finds drafts by template id, so a
draft left on v1 would silently restart (the 2026-10-16 stranded-draft lesson). 108 is
pre-filled. `submit_onboarding` moves the section's answers into `member_safety` and out of
`answers`, as it already does for contact details, so they never reach the Onboarding
Summary that clinicians read. The frozen-questions test reads v2 and asserts every v1 field
is unchanged.

## Screens

- **Trainer and doctor, client page:** the Emergency card above the tabs on every tab —
  numbers as tap-to-call buttons, the address, warnings ("Alone at home during sessions",
  "No BP machine or glucometer at home"), and a red **"Sessions on hold since … — waiting for the doctor"**
  banner when held. Trainer buttons: **No session today**, **Report an incident**, and a link
  to the safety card. The doctor gets **Clear to restart** (with a note) on the banner, and an
  uncleared incident lights the existing "Adverse event" chip in "Needs your attention".
- **Coordinator, member page:** an Emergency & Safety card with **Edit**, the event log, and
  **Copy for WhatsApp** (the details as text, to pin in the group). The member list gets a
  "Safety details missing" filter so the 22 calls can be worked through.
- **Safety card:** a print-friendly page in the client's words (before the session / if
  something happens / after), for trainers, doctors, coordinators and admin.

## Consent (owner, confirmed 2026-10-28)

The current onboarding notice tells families "Your contact details are never shared with
clinicians." That stops being true, so:

- New consent field: *"I agree that PHLOEM's care team may contact the people above in an
  emergency, and that the member's trainer and doctor may see these details and the home
  address for that purpose."*
- The notice gains: *"…never shared with clinicians, except the Emergency & Safety details,
  which the trainer and doctor can see so they can act in an emergency."*
- The coordinator reads the consent sentence on each of the 22 calls.

Design approved by the owner 2026-10-28.

## Left to the builder

Exact layout and copy beyond the client's wording; the RPC signatures; the §16 RLS block
for the two new tables (who reads, who cannot — nutritionist, psychologist, an unassigned
trainer); regenerated types; PROGRESS.md entry.
