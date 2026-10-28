# Emergency & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every client gets an Emergency & Safety record (onboarding for new families, the coordinator's phone calls for current ones). The assigned trainer and doctor see it pinned on the client page. Trainers get a printable safety card, plus "No session today" and "Report an incident" buttons; an incident puts sessions on hold until the doctor clears them.

**Architecture:** Two new tables (`member_safety`, `safety_events`), read through RLS and written only through security-definer RPCs (migration 0059). The trainer's and doctor's view comes from one RPC, `emergency_card`, so `member_contacts` keeps its policies. Onboarding v2 (migration 0060) adds the section. `submit_onboarding` moves those answers into `member_safety`, the same way it already moves contact details into `member_contacts`. The UI is server components plus small client sheets, built with the existing `Sheet`, `Button` and `Callout` components and `ActionResult`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (hosted, via MCP), Zod, Tailwind, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-10-21-emergency-safety-design.md` (approved 2026-10-28)

## Global Constraints

- The hosted DB serves real clients. Write each migration file in `supabase/migrations/` first, then apply it with MCP `apply_migration`. Never probe `apply_migration`. Verify only in rolled-back transactions or with `@example.test` fixtures that are deleted afterwards. If MCP says "Invalid or expired requestState", run `select 1` and retry.
- Writes go through RPCs only, with no direct table writes from server actions. Zod-validate every server action. No `any`. Use npm.
- Every RPC starts with `if auth_role() is null then raise exception 'not_allowed'`. Then `revoke execute … from public, anon` and `grant … to authenticated`; internal helpers are revoked from `authenticated` too (0050 discipline).
- "Assigned trainer or doctor" = `auth_role() in ('trainer','doctor') and is_assigned_to(member)`.
- Copy that is fixed verbatim: the s6 labels in Task 2, the consent sentence, the consent-notice addition, and the safety-card text in Task 6.
- Ambulance is pre-filled `108` and editable. Nothing in the UI hard-codes 108 for display; always show the stored number.
- "BP machine or glucometer at home?" is ONE yes/no question (`bp_or_glucometer`).
- Times are IST (`formatDateIST` / `formatDateTimeIST` from `lib/datetime.ts`).
- Commit trailer, on every commit:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_012kfYjkByGv3JZSA13SK2d8`.
- Do NOT push. Pushing main is a production deploy and needs the owner's word.
- Machine quirks: `cmd | tail` hides exit codes, so redirect to a file and print `$?`. Delete `.next` before `npm run build`.

## Review Focus

1. **No record yet**, which is every current client on day one. The card must say "No emergency details yet — call the coordinator" and still show the address and family contact. Pinned in Task 3 (`parseEmergencyCard` with `safety: null`) and Task 1 (§16: `emergency_card` returns `safety` null).
2. **A client abroad.** The card and the WhatsApp text show the stored ambulance number, never a literal 108. Pinned in Task 3 (`whatsappText` with `ambulance_phone: "999"`).
3. **Phone numbers as families type them** ("+91 98470 12345", "0484-2345678"). The `tel:` link must dial. Pinned in Task 3 (`telHref`).
4. **People who must not see it:** nutritionist, psychologist, an unassigned trainer, anon. Pinned in Task 1 (§16).
5. **Two incidents before the doctor looks.** The hold stays until the doctor clears it, and one "Clear to restart" clears both. Pinned in Task 1 (§16).

---

### Task 1: Migration 0059: safety tables and RPCs

**Files:**
- Create: `supabase/migrations/0059_emergency_safety.sql`
- Modify: `supabase/tests/rls.test.sql` (new block before the final `select line from results;`)
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces (SQL):
  - `member_safety(member_id uuid pk → members on delete cascade, local_contact_name text not null, local_contact_relation text not null, local_contact_phone text not null, local_contact_eta text not null check in ('under_10','10_30','over_30'), hospital_name text not null, hospital_phone text not null, ambulance_phone text not null default '108', private_ambulance_phone text null, someone_home boolean not null, bp_or_glucometer boolean not null, consent_source text not null check in ('family_form','coordinator_call'), consent_recorded_by uuid → profiles, consent_at timestamptz not null, updated_by uuid → profiles, updated_at timestamptz not null default now())`
  - `safety_events(id uuid pk, member_id uuid not null → members on delete cascade, kind text not null check in ('skipped','incident'), reasons text[] not null default '{}', detail text, occurred_at timestamptz not null default now(), reported_by uuid not null → profiles, cleared_at timestamptz, cleared_by uuid → profiles, clear_note text)`, plus index `(member_id, occurred_at desc)` and a partial index on open incidents `(member_id) where kind = 'incident' and cleared_at is null`.
  - `_save_safety(p_member uuid, p_fields jsonb, p_source text) returns void`: internal. It upserts and validates. Errors: `safety_incomplete` (any required key blank), `bad_eta`, `emergency_consent_required` (`p_fields->>'emergency_consent'` is not `'true'`). On update it keeps the existing `consent_*` and does not re-ask consent. A blank `private_ambulance_phone` is stored as null. `ambulance_phone` defaults to `'108'` when blank.
  - `save_member_safety(p_member uuid, p_fields jsonb) returns void`: admin or coordinator only; source `coordinator_call`; audits `member_safety.saved`. `emergency_consent` is only required when no row exists yet.
  - `emergency_card(p_member uuid) returns jsonb`. Readers: admin, coordinator, assigned trainer or doctor. Anyone else gets `not_allowed`. Shape: `{ safety: {…row minus consent_recorded_by/updated_by} | null, address, pin_code, family_contact: {name, phone}, health: {conditions jsonb, medications jsonb, latest_doctor_report: {id, created_at} | null} | null, hold: {since timestamptz, detail text, reported_by_name text, open_count int} | null }`.
    - `health` is null for the coordinator.
    - `conditions` and `medications` come from the newest submitted `onboarding` response.
  - `report_safety_event(p_member uuid, p_kind text, p_reasons text[], p_detail text) returns uuid`. Callers: the assigned trainer, coordinator, admin.
    - Errors: `bad_kind`; `reasons_required` (skipped with no reason, or a reason outside `chest_pain, dizziness, breathlessness, high_bp, other`); `detail_required` (incident with blank detail).
    - Notifies with `_notify` / `_notify_roles`:
      - skipped → coordinators, type `safety_skipped`
      - incident → the assigned doctor plus coordinators and admin, type `safety_incident`
    - Dedupe `safety:<event id>`; links `/clinician/clients/<id>` for the doctor and `/coordinator/members/<id>` for staff. Audits.
  - `clear_safety_hold(p_member uuid, p_note text) returns int`. Callers: the assigned doctor, admin.
    - Errors: `note_required`; `not_on_hold` when there is no open incident.
    - Clears every open incident, notifies the assigned trainer and coordinators (`safety_cleared`), and returns the count.
  - RLS select:
    - `member_safety`: admin, coordinator, `is_caregiver_of`, assigned trainer or doctor.
    - `safety_events`: admin, coordinator, assigned trainer or doctor.
    - Neither table has insert, update or delete policies.

- [ ] **Step 1: Write the §16 block** `-- ============ 0059: emergency & safety ============`. Mirror the 0054 block's fixture style:
  - user ids `'0f0f0000-0000-4000-8000-0000000059' || k` for k in `c1` coordinator, `a1` admin, `d1` doctor, `e1` trainer, `e2` trainer (unassigned), `b1` nutritionist, `p1` psychologist, `61` caregiver
  - one member, with assignments `d1`, `e1`, `b1`, `p1`, and `member_contacts` holding an address
  - helpers `pg_temp.saf_as(k)` and `pg_temp.saf_try(q)`
  
  Assertions, each `insert into results select pg_temp.assert_true('<name>', <expr>)`:
  - `safety: the trainer's card before any record — safety null, address shown`: `emergency_card(m)->'safety' = 'null'` and `->>'address'` is not null, as `e1`
  - `safety: saving without consent is refused`: `save_member_safety` with `emergency_consent` false → `'emergency_consent_required'`, as `c1`
  - `safety: a blank hospital phone is refused` → `'safety_incomplete'`
  - `safety: the coordinator saves it from the call`: `'ok'`, and the row has `consent_source = 'coordinator_call'` and `ambulance_phone = '999'` (save with 999)
  - `safety: a second save keeps the consent and needs no tick`: save again without `emergency_consent` → `'ok'`
  - `safety: the coordinator's card leaves out health`: `emergency_card(m)->'health' = 'null'`, as `c1`
  - `safety: the trainer's card carries medicines`: `emergency_card(m)->'health'` is not `'null'`, as `e1`
  - `safety: an unassigned trainer, nutritionist, psychologist cannot`: `emergency_card` → `'not_allowed'` for `e2`, `b1`, `p1`, and `select count(*) from member_safety` = 0 for each
  - `safety: nobody writes the table directly`: `insert into member_safety …` as `c1` fails
  - `safety: a skipped session needs a reason`: `report_safety_event(m,'skipped','{}',null)` → `'reasons_required'`, as `e1`
  - `safety: a skipped session tells the coordinator`: with `'{dizziness}'` → ok; a `notifications` row of type `safety_skipped` exists for `c1`
  - `safety: two incidents, the doctor is told, sessions on hold`: two incidents → `emergency_card(m)->'hold'->>'open_count' = '2'`, and a `safety_incident` notification exists for `d1`
  - `safety: the trainer cannot clear it` → `'not_allowed'`; `safety: the doctor must say why` → `'note_required'`
  - `safety: the doctor clears both at once`: `clear_safety_hold(m,'Seen, fine to resume')` returns 2; `hold` is `'null'`; a `safety_cleared` notification exists for `e1`
  - `safety: clearing again` → `'not_on_hold'`
  - `safety: the psychologist sees no events`: `select count(*) from safety_events` = 0 as `p1`
  - `safety: anon cannot call; the helper is internal`: `has_function_privilege` checks for the four public RPCs (anon false) and `_save_safety` (authenticated false)

- [ ] **Step 2: Write `0059_emergency_safety.sql`** to the Interfaces above. Header comment: why, what, who reads.

- [ ] **Step 3: Apply** with MCP `apply_migration` (name `0059_emergency_safety`, query = the file's contents).

- [ ] **Step 4: Run the §16 suite.** Send the whole of `supabase/tests/rls.test.sql` through MCP `execute_sql`; it ends in `rollback`. Expected: every line `PASS`, no `FAIL`, including the 17 new ones.

- [ ] **Step 5: Regenerate types** with `supabase gen types typescript --linked > lib/supabase/database.types.ts`. If the CLI isn't logged in, hand-add the two tables and four functions in the existing style. Then `npx tsc --noEmit > $SCRATCH/tsc.out 2>&1; echo EXIT=$?` → `EXIT=0`.

- [ ] **Step 6: Commit** `feat(safety): emergency & safety records, incidents and holds (0059)`.

### Task 2: Migration 0060: onboarding v2 with the Emergency & Safety section

**Files:**
- Create: `supabase/templates/onboarding.v2.json` (v1 plus s6, and the consent_info sentence change)
- Create: `supabase/migrations/0060_onboarding_v2_safety.sql`
- Modify: `components/forms/onboarding-flow.ts` (FLOW: s5 opener, new s6)
- Modify: `components/forms/onboarding-flow.test.ts` (read v2)
- Modify: `app/(app)/portal/onboarding/[memberId]/page.tsx` (`prefillAnswers`: `ambulance_phone: "108"`)
- Modify: `app/(app)/portal/onboarding/[memberId]/actions.ts` (messages for `emergency_consent_required`, `safety_incomplete`)
- Modify: `lib/member-fields.ts` (`AMEND_REFUSED_KEYS` gains the 11 s6 keys)
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- Consumes: `_save_safety(member, fields, 'family_form')` from Task 1.
- Produces: onboarding v2 active, with s6 field ids `local_contact_name, local_contact_relation, local_contact_phone, local_contact_eta, hospital_name, hospital_phone, ambulance_phone, private_ambulance_phone, someone_home, bp_or_glucometer, emergency_consent`.

s6, section `{ id: "s6", title: "Emergency & Safety" }`. All fields are `required: true` except `private_ambulance_phone`:

| id | type | label | extra |
|---|---|---|---|
| local_contact_name | text | Name of a contact person who lives nearby | |
| local_contact_relation | text | Their relation to the member | |
| local_contact_phone | text | Their phone number | |
| local_contact_eta | select | How quickly can they reach the house? | options `under_10` "Under 10 minutes", `10_30` "10–30 minutes", `over_30` "Over 30 minutes" |
| hospital_name | text | Nearest hospital | |
| hospital_phone | text | Hospital phone number | |
| ambulance_phone | text | Ambulance number | hint "108 in India. If the member lives outside India, enter the local ambulance number." |
| private_ambulance_phone | text | Private ambulance number | hint "Only if they have one — leave blank if not." |
| someone_home | boolean | Is anyone else usually at home during session time? | |
| bp_or_glucometer | boolean | Is there a BP machine or glucometer at home? | |
| emergency_consent | boolean | I agree that PHLOEM's care team may contact the people above in an emergency, and that the member's trainer and doctor may see these details and the home address for that purpose. | |

consent_info change, v2 only: replace "Your contact details are never shared with clinicians." with "Your contact details are never shared with clinicians, except the Emergency & Safety details, which the trainer and doctor can see so they can act in an emergency."

FLOW changes:
- s5 opener becomes `{ title: "Next: your goals.", lead: "What you're hoping for — then a few safety details." }`.
- New entry `{ sectionId: "s6", opener: { title: "One last thing — safety.", lead: "Who to call if something happens during a session." }, cards: [...] }` with four cards:
  - "Someone nearby": the four `local_contact_*` fields
  - "Hospital & ambulance": `hospital_name, hospital_phone, ambulance_phone, private_ambulance_phone`
  - "At home during sessions": `someone_home, bp_or_glucometer`
  - "Your consent": `emergency_consent`

- [ ] **Step 1: Update the frozen-questions test** in `onboarding-flow.test.ts`. Load `onboarding.v2.json` for the existing tests, and add:
  - `v2 keeps every v1 field unchanged except the consent notice`: deep-equal per v1 field id, ignoring `consent_info.text`, which must contain "except the Emergency & Safety details"
  - `v2 adds exactly the Emergency & Safety section`: `sections[5].id === "s6"`, the 11 ids in order, the labels as in the table, and only `private_ambulance_phone` not required
  - `every s6 field lands on a card`: `buildCards(v2)` ids include all 11

- [ ] **Step 2: Run it.** `npx tsx --tsconfig tsconfig.test.json --test components/forms/onboarding-flow.test.ts` → FAIL (no v2 file).

- [ ] **Step 3: Write `onboarding.v2.json`** (v1 + s6 + consent_info), then the FLOW changes. Re-run → PASS.

- [ ] **Step 4: Write the §16 block** `-- ============ 0060: onboarding v2 ============`. Fixture: a caregiver, a member with `onboarding_video_watched_at = now()`, and a v2 draft holding the full Meera-style answers plus the s6 keys. Assertions:
  - `onboarding v2: the only active onboarding version` (`count(*) where key='onboarding' and active` = 1 and version = 2)
  - `onboarding v2: consent No is refused` (`submit_onboarding` → `'emergency_consent_required'`)
  - `onboarding v2: submit files the safety record as the family's` (after setting consent true → ok; `member_safety.consent_source = 'family_form'`)
  - `onboarding v2: no safety key is left in the answers` (`answers ?| array[...11 keys]` is false)

- [ ] **Step 5: Write `0060_onboarding_v2_safety.sql`:**
  - Insert v2 from the JSON contents, then deactivate v1.
  - Move unsubmitted v1 onboarding drafts to v2, adding `ambulance_phone: "108"` when absent.
  - Redefine `submit_onboarding`: copy the 0017 body verbatim, plus one block. When the response's template version is ≥ 2, call `_save_safety(p_member, v_ans, 'family_form')`, then strip the 11 keys from `v_ans`. Do this right after the contacts split.
  - Redefine `amend_onboarding`: copy the 0040 body verbatim, with the 11 keys added to the refused array.
  - Keep `AMEND_REFUSED_KEYS` in `lib/member-fields.ts` in step with the SQL; `lib/member-fields.test.ts` already asserts that.

- [ ] **Step 6: Apply** `0060_onboarding_v2_safety`, then run the §16 suite → all PASS. Read-only check: `select count(*) from form_responses fr join form_templates t on t.id=fr.template_id where t.key='onboarding' and t.version=1 and fr.submitted_at is null` → 0.

- [ ] **Step 7: Prefill and messages.**
  - `prefillAnswers` adds `ambulance_phone: "108"`.
  - The submit action maps `emergency_consent_required` → "Please agree to being contacted in an emergency — without it we can't keep the member safe in sessions."
  - It maps `safety_incomplete` → "Fill in every Emergency & Safety detail before submitting."
  - Run `npm run test:unit` → all pass.

- [ ] **Step 8: Commit** `feat(onboarding): Emergency & Safety section (onboarding v2, 0060)`.

### Task 3: `lib/safety.ts`, the shared shapes and pure helpers

**Files:**
- Create: `lib/safety.ts`, `lib/safety.test.ts`
- Modify: `lib/reports/build/onboarding-summary.ts` (export `conditionsSummary`; add and export `medicationsSummary(value): string`, "Name dose, frequency; …" or "—")
- Modify: `package.json` (add `lib/safety.test.ts` to `test:unit`)

**Interfaces:**
- Produces:
  - `type Eta = "under_10" | "10_30" | "over_30"`; `ETA_LABEL: Record<Eta, string>` (the labels in Task 2)
  - `type SkipReason = "chest_pain" | "dizziness" | "breathlessness" | "high_bp" | "other"`; `SKIP_REASONS: readonly { value: SkipReason; label: string }[]` (Chest pain, Dizziness, Breathlessness, Very high BP, Feeling unwell / other)
  - `safetyInputSchema` (Zod: the 11 fields, with phones trimmed and min 3 chars, `private_ambulance_phone` optional, booleans) → `type SafetyInput`
  - `parseEmergencyCard(json: unknown): EmergencyCard`: Zod, matching Task 1's `emergency_card` shape
  - `telHref(phone: string): string`: keeps a leading `+` and digits
  - `whatsappText(memberName: string, card: EmergencyCard): string`
  - `SAFETY_PROTOCOL: { before: string[]; during: string[]; after: string[] }`: the Task 6 copy

- [ ] **Step 1: Write `lib/safety.test.ts`:**
  - `telHref dials what families type`: `"+91 98470 12345"` → `"tel:+919847012345"`; `"0484-2345678"` → `"tel:04842345678"`
  - `a card with no record parses`: `parseEmergencyCard({ safety: null, address: "x", pin_code: "682001", family_contact: { name: "A", phone: "1" }, health: null, hold: null }).safety === null`
  - `the WhatsApp text uses the stored ambulance number`: with `ambulance_phone: "999"`, the text contains `"Ambulance: 999"` and does not contain `"108"`
  - `the WhatsApp text`: contains the member name, the address with PIN, `"Nearby contact: <name> (<relation>) — <phone> · reaches in Under 10 minutes"`, `"Hospital: <name> — <phone>"`, `"Private ambulance: none"` when null, `"Anyone else home during sessions: No"`, and `"BP machine or glucometer: Yes"`
  - `the schema leaves consent to the RPC`: `safetyInputSchema.safeParse({...all fields, emergency_consent: false}).success === true`. The RPC decides whether consent is needed (only for a new record).

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** run → PASS. Then `npm run test:unit` → all pass.

- [ ] **Step 5: Commit** `feat(safety): card shapes, WhatsApp text and tel links`.

### Task 4: Server actions

**Files:**
- Create: `app/(app)/safety-actions.ts`

**Interfaces:**
- Consumes: Task 1's RPCs, Task 3's `safetyInputSchema` and `SkipReason`.
- Produces:
  - `saveMemberSafetyAction(memberId: string, input: SafetyInput): Promise<ActionResult>`
  - `reportSafetyEventAction(input: { member_id: string; kind: "skipped" | "incident"; reasons: SkipReason[]; detail: string }): Promise<ActionResult<{ eventId: string }>>`
  - `clearSafetyHoldAction(input: { member_id: string; note: string }): Promise<ActionResult<{ cleared: number }>>`

  Each one Zod-parses the input, calls its RPC, and maps errors with `actionFromError`:
  - `not_allowed` → "Only the member's coordinator, trainer or doctor can do this."
  - `emergency_consent_required` → "Read the consent sentence to the family and tick that they agreed."
  - `safety_incomplete` → "Fill in every detail; only the private ambulance can be left blank."
  - `reasons_required` → "Choose why there's no session today."
  - `detail_required` → "Say what happened and what you did."
  - `note_required` → "Add a short note on why sessions can restart."
  - `not_on_hold` → "Sessions aren't on hold any more."
  
  Each then calls `revalidatePath` on `/clinician/clients/<id>`, `/coordinator/members/<id>` and `/coordinator`.

- [ ] **Step 1: Implement** in the style of `app/(app)/clinician/clients/[id]/actions.ts`.
- [ ] **Step 2: Typecheck and lint.** `npx tsc --noEmit` and `npx eslint app/(app)/safety-actions.ts` → both exit 0.
- [ ] **Step 3: Commit** `feat(safety): server actions`.

### Task 5: Emergency card on the trainer's and doctor's client page

**Files:**
- Create:
  - `components/safety/emergency-card.tsx` (server)
  - `components/safety/safety-event-sheet.tsx` (client)
  - `components/safety/clear-hold-button.tsx` (client)
- Modify:
  - `app/(app)/clinician/clients/[id]/page.tsx` (render the card between the hero `Card` and the tab `nav` when `role` is trainer or doctor; `adverseEvent` from an open incident)
  - `app/(app)/clinician/clients/page.tsx` (`adverseByMember` also adds members with an open incident; one `safety_events` select for the desk's members)

**Interfaces:**
- Consumes: `parseEmergencyCard`, `telHref`, `ETA_LABEL`, `conditionsSummary`, `medicationsSummary`, and the Task 4 actions.
- Produces: `<EmergencyCard memberId card role readOnly />`, `<SafetyEventSheet memberId kind triggerLabel />` and `<ClearHoldButton memberId />`. Task 6 reuses `SafetyEventSheet`.

Behaviour:
- **The card** is a bordered danger-tone card titled "Emergency".
  - Tap-to-call buttons (min 44px): nearby contact (name, relation, "reaches in …"), hospital, ambulance, private ambulance (if any), family contact.
  - The address with PIN.
  - Warnings: "Alone at home during sessions" when `someone_home` is false, and "No BP machine or glucometer at home" when false.
  - "Conditions: … · Medicines: …", and "Latest doctor's report" via `ReportPeek` when present.
  - A link "Safety card" to `/clinician/safety-card`.
- **No record:** "No emergency details yet — call the coordinator." The address and family contact still show.
- **Hold:** a red banner, "Sessions on hold since {formatDateIST} — waiting for the doctor", with the latest detail.
  - The doctor (not `readOnly`) gets `ClearHoldButton`: note textarea, then "Clear to restart", a two-step confirm like `RemoveUploadButton`.
- **Trainer** (not `readOnly`):
  - "No session today" opens a sheet with the `SKIP_REASONS` checkboxes and an optional note.
  - "Report an incident" opens a sheet with "What happened, and what did you do?" (required).
  - Success toasts: "The coordinator has been told." and "The doctor and coordinator have been told. Sessions are on hold until the doctor clears them."
- A borrowed admin desk (`isAdminView`) sees the card with no buttons.

- [ ] **Step 1: Implement** the three components and the two page changes.
- [ ] **Step 2: Verify.** `npx tsc --noEmit` and eslint on the touched files → exit 0.
- [ ] **Step 3: Commit** `feat(safety): emergency card for the trainer and doctor`.

### Task 6: Coordinator surfaces and the safety card page

**Files:**
- Create:
  - `components/safety/safety-details-card.tsx` (server)
  - `components/safety/safety-form-sheet.tsx` (client)
  - `components/safety/copy-whatsapp-button.tsx` (client)
  - `components/safety/safety-protocol.tsx` (server, print CSS)
  - `app/(app)/clinician/safety-card/page.tsx`
  - `app/(app)/coordinator/safety-card/page.tsx`
- Modify:
  - `app/(app)/coordinator/members/[id]/page.tsx`: `SafetyDetailsCard` after the Contacts card, with `id="safety"`
  - `app/(app)/coordinator/page.tsx`: one `Callout` listing members with no `member_safety` row (status not `inactive`), linking `/coordinator/members/<id>#safety`, and one listing members on hold. The spec's "Safety details missing" filter lands here: the coordinator has no member list, and Today is where her work queue already lives **(builder)**.

**Interfaces:**
- Consumes: the Task 4 actions, Task 5's `SafetyEventSheet`, and Task 3's `whatsappText`, `ETA_LABEL` and `SAFETY_PROTOCOL`.

Behaviour:
- **`SafetyDetailsCard`** shows the record or "Missing — fill it in on your call with the family".
  - **Edit** opens `SafetyFormSheet`. It has the 11 fields as native inputs with `required`; `ambulance_phone` defaults to 108; the two booleans are Yes/No radios.
  - When no record exists, the sheet shows the consent sentence in a box, plus the required checkbox "I read this to the family and they agreed".
  - The card also has "Copy for WhatsApp" (clipboard, then toast "Copied — paste it in the family's group and pin it"), the event log (last 10: kind, date, reporter, detail, cleared by/when), and the "Report an incident" sheet (a family may phone in).

`SAFETY_PROTOCOL` copy. Per the owner's approval this is the client's text, with "her" made neutral (flag this in the hand-off):
- before: `"How are you feeling today?"`; `Check sugar and BP where relevant.`; `Chest pain, dizziness, breathlessness or very high BP means no session that day — tell the coordinator.`
- during, titled "If something happens": `Stop.`; `Stay on video.`; `Sit or lie them down.`; `Call the local contact.`; `Call 108 or the hospital.`; `Call the son or daughter.`; `Inform the doctor.`
- after: `Log what happened the same day.`; `No restarting until the doctor clears it.`

The safety-card page renders `SafetyProtocol` with a Print button (`window.print`). On A4 it is one page and the app shell is hidden under `@media print`.

- [ ] **Step 1: Implement**, then `npx tsc --noEmit` and eslint → exit 0.
- [ ] **Step 2: Commit** `feat(safety): coordinator safety details, WhatsApp copy, printable safety card`.

### Task 7: Verify end to end, record it, hand over

**Files:**
- Create: `scripts/safety-fixtures.ts` (throwaway; deleted in Step 5)
- Modify: `PROGRESS.md`, `CLAUDE.md` (permission matrix: a row "Emergency & Safety record + incidents (0059)" — ✅ admin, ✅ coordinator edit, 👁 assigned doctor, ❌ nutritionist, 👁 assigned trainer + report, ❌ psychologist, ✅ own caregiver read), and the memory files

- [ ] **Step 1: Full checks.** Delete `.next`, then run `npm run test:unit`, `npx tsc --noEmit`, eslint on the touched files, and `npm run build`. Each must print `EXIT=0`. Then run the §16 suite once more → all PASS.

- [ ] **Step 2: Fixtures.** `scripts/safety-fixtures.ts up` uses the service role from `.env.local` (never printed). It creates `safety-{trainer,doctor,coord}@example.test` with a generated password written only to the scratchpad, plus a member "ZZ Safety check" with contacts, an onboarding answer and assignments, and a saved record. `down` deletes all of them, member cascade included.

- [ ] **Step 3: Browser check** against `npm run dev`, with screenshots in the scratchpad at 390 and 1280px:
  - trainer: the card at the top and tap targets ≥ 44px; both sheets open (do NOT submit, since an incident notifies the real coordinators)
  - doctor: the card shows
  - coordinator: the safety card fills, and Copy for WhatsApp works
  - the safety-card page prints on one page
  - a second fixture member with no record shows the "No emergency details yet" card

- [ ] **Step 4: Tear down.** Run `scripts/safety-fixtures.ts down`, then a read-only check that no `@example.test` profile or "ZZ Safety check" member remains.

- [ ] **Step 5: Record.**
  - Delete the fixtures script.
  - PROGRESS.md gets a section with the verification results.
  - Update the CLAUDE.md matrix row and the summary paragraph.
  - Memory: a new `phloem-emergency-safety.md` plus its index line.
  - Commit `docs: Emergency & Safety shipped — progress, matrix, verification`.

- [ ] **Step 6: Hand over.** Tell the owner what changed and what the coordinator does next: 22 calls, reading the consent sentence, correcting the ambulance number for the 8 clients abroad, and inviting the missing trainers. Ask before pushing.
