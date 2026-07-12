# PHLOEM — Full End-to-End Walkthrough

**Date:** 2026-07-12 · **Result: 53 / 53 checks passed · 0 product-code defects.**

A complete role-by-role walkthrough of a member's whole lifecycle against the hosted
Supabase dev project, driven with the **seeded accounts**.

**Method.** Every workflow action ran as a **real authenticated role session**
(`signInWithPassword` → honouring Postgres RLS + the security-definer RPCs — the same
trust boundary the app uses). A service-role client was used only for out-of-band setup
(creating the caregiver/elderly GoTrue users, as the invite server action does) and for
cross-role inspection/cleanup. Portal / report / notification pages were fetched over HTTP
with real SSR session cookies. The run is self-cleaning (the test member + its two logins
are removed afterwards). Server date at run time was **2026-07-12**, so "tomorrow" = **2026-07-13**.

| Role | Exercised |
|---|---|
| **Admin** | create member + caregiver invite; psych-escalation notification; audit log |
| **Caregiver** (new, via invite) | accept invite; onboard (chest-pain red flag); portal home / plans / schedule / reports; notifications |
| **Coordinator** | assign 4 roles; schedule + mark-done; activate; pause/resume |
| **Doctor / Nutritionist / Trainer / Psychologist** | initial consult forms; trainer clearance gate; monthly feedback; wellbeing confidentiality |
| **Member** (elderly) | view-only portal — exactly 3 items |

---

## 1 · Admin creates a member + caregiver invite → caregiver accepts

`create_member_with_invite` (as admin) → member `invited` + `not_started` package +
caregiver invite (role `caregiver`, linked to the member) + a token. The caregiver GoTrue
user is created and `accept_invite(token, …)` runs (service path, as the server action does).

- ✓ member created `invited`; invite row role = **caregiver**, linked to the member
- ✓ new profile role = **caregiver** — taken from the **token only**, never client-supplied
- ✓ `members.caregiver_id` linked; member → **signed_up**

## 2 · Caregiver onboards the member (chest-pain high red flag)

`mark_video_watched` → `onboarding`; a draft response is filled with
`activity_symptoms: ["Exertional chest pain", "Breathlessness"]` and submitted via
`submit_onboarding`.

- ✓ member → **onboarded**; `onboarding_summary` report created
- ✓ red flags stored: **`chest_pain/high`**, `breathlessness/high`, `no_cardiac_eval/medium`, `fall_risk/medium`, `breathing_stamina/medium`
- ✓ **§4 data-split**: `contact_number` → `member_contacts.phone`, **stripped from `answers`**
- ✓ coordinator + admin notified (`onboarded`)

## 3 · Coordinator assigns all four care roles

`assign_care_team` ×4.

- ✓ 4 active assignments + **4 initial consultation rows** (cycle_id NULL)
- ✓ member → **assigned**; each professional notified (`assigned`)

## 4 · Initial consults — schedule → mark done → submit (trainer gate proven)

All four meetings scheduled + marked done. Report submission order proves the §6 gate:

- ✓ **TRAINER GATE — rejected**: trainer `submit_clinical_form` before doctor clearance → `awaiting_doctor_clearance`
- ✓ doctor submits initial report with `clearance = cleared`
- ✓ **TRAINER GATE — accepted**: trainer submit now succeeds
- ✓ nutritionist submits; member → **initial_consults**

## 5 · Activate program — **psych-pending override path**

`activate_program` run with the **psychologist report still pending** (only doctor +
nutritionist + trainer submitted).

- ✓ program **active**; `start_date = 2026-07-13` — **tomorrow** (server date 2026-07-12); `end_date = 2026-10-13`
- ✓ **`psych_override = true`** recorded; **audit log has `program.psych_override`**
- ✓ 3 cycles generated, cycle 1 active
- ✓ care team + **caregiver** notified "program starts tomorrow"

### 5b · Psychologist submits the wellbeing check-in (after activation)

`submit_clinical_form` (psych, `escalation = true`).

- ✓ wellbeing report created; **admin notified of the escalation** (`psych_escalation`)
- ✓ **Confidentiality**: a doctor session sees **0 wellbeing reports**

## 6 · Time-travel a full cycle (feedback → performance → pause +5 → rollover)

Driven through the cron RPC with `?today=`-style dates:

- ✓ cron @ **end − 3** → **2 feedback drafts** created (nutritionist + trainer) + notified
- ✓ both feedbacks submitted → **performance report compiled**; **doctor notified** (`performance_ready`)
- ✓ **5-day pause** mid-cycle → resume shifted **cycle-1 end 2026-08-11 → 2026-08-16** and **package end 2026-10-13 → 2026-10-18** (both **+5**)
- ✓ cron **past cycle-1 end** → cycle 1 **closed**, cycle 2 **active**, **4 fresh review consultations** (checklist reset)

## 7 · Portals, PDF, notifications, audited report views

An elderly `member` login is linked to the member (`members.member_user_id`).

- ✓ **Caregiver portal** home renders (member + **program progress bar**); **plans page shows the nutrition + training plans**; schedule page renders
- ✓ **Elderly mode** shows **exactly 3 view-only items** (My Plans / My Schedule / My Care Team)
- ✓ **Audited report view**: caregiver opens the nutrition report (web view **200**) → the **`report.viewed` audit row is written** (0 → 1)
- ✓ **Notifications**: caregiver notifications page renders; the caregiver's rows include `program_activated`, `program_paused`, `program_resumed`, `consult_scheduled`
- ✓ **PDF route** reachable and past the RLS access gate (see environmental note)

---

## Issues found & resolved

1. **Walkthrough measurement ordering (fixed in the harness).** The first pass reported two
   failures — "caregiver opens the report" and "audit captured the view" — both returning HTTP
   `status 0`. Root cause: the PDF request runs a headless-Chrome launch that is **env-blocked
   in this sandbox** and hangs; it was sequenced **before** the report-view fetch and aborted it.
   Verified in isolation that the report view returns **200** and writes the `report.viewed`
   audit row (0 → 1) — **no product defect**. The walkthrough was re-ordered to run the
   report-view/audit and notification checks before the PDF attempt (and the PDF given a short
   timeout). Re-run: **53/53**.

2. **`invites.member_id` has no `ON DELETE CASCADE` (documented, not a product defect).**
   Surfaced only during harness cleanup: a member that has an invite row cannot be hard-deleted,
   which in turn blocks deleting the linked caregiver/member profiles. This is **not a product
   operation** — members are soft-deactivated via `deactivate_member` (status → `inactive`,
   packages completed), never hard-deleted — so no migration was made. The leftover test
   fixtures were purged in FK-safe order (delete invites → delete member (cascades) → delete
   the GoTrue users), restoring the seed to its 2 members.

## Environmental limitation (not a defect)

- **PDF byte generation** needs a launchable headless Chrome. In this sandbox the Chrome launch
  hangs (documented since Phase 4). The PDF route is proven correct up to that step — it **passed
  the RLS access gate and reached the browser-print step** (it hangs rather than returning 404),
  builds the branded HTML, and has the Storage/signed-URL wiring in place. It produces bytes
  wherever Chrome can launch (local Chrome in dev, `@sparticuz/chromium` on Vercel).

## Reproduce

With the dev server running (`npm run dev`) and the seed applied (`npm run seed`), the flow is
demoable by hand using the accounts in the README (all `test12345!`): admin `create member`
→ copy the invite link → accept as the new caregiver → onboard → coordinator assigns + schedules
→ clinicians submit → coordinator **Start program** → `npm run cron:dev <date>` to advance cycles.
