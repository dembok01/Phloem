# Tier 2 · T2.5 — Lifecycle regression test

**Goal:** turn the `scripts/advance-demo.ts` real-RPC pattern into an **asserting**
integration test (`scripts/test-lifecycle.ts`, `npm run test:lifecycle`) that drives the
§6 workflow end-to-end against an **ephemeral** member and locks in the Tier-1 correctness
fixes as permanent regressions. Adds files only — no existing app code changes.

**Non-negotiables (from the execution plan):**
- Drives ONLY real RPCs, signed in as the actual seeded users (never raw workflow writes).
- Must **fail on a deliberate revert of the 0015 clearance gate** (H-1).
- Ephemeral member + full flow + **teardown** (safe to re-run against the shared dev project).

## Design

- **Clients:** a service-role client (`SUPABASE_SERVICE_ROLE_KEY`) for setup / reads / rollover /
  teardown; anon clients signed in as `coordinator@` + the four `*@phloem.local` clinicians
  (password `test12345!`, same as `advance-demo.ts`).
- **Isolation:** rollover is driven by calling `compile_performance_report(cycle)` and
  `close_cycle_open_next(cycle)` **on the ephemeral member's own cycle only** — NOT
  `run_daily_jobs`, which would sweep every active member in the shared demo DB.
- **0017 corollary:** the service client has `auth.uid() = NULL`, so it *cannot* call the
  role-guarded RPCs (they now raise `not_allowed`). That's why the flow signs in as real
  users — and the test asserts the service client is refused, doubling as a 0017 guard.
- **Package duration = 2** so `activate_program` creates cycle 1 (active) + cycle 2 (upcoming);
  closing cycle 1 promotes cycle 2 and opens its 4 review consults.

## Steps

- [ ] **Setup (service client):** create an ephemeral caregiver auth user (`admin.createUser`),
  its `caregiver` profile, an `onboarded` member linked to it, `member_contacts`, and a
  `not_started` package (duration 2). (Caregiver link is required — `activate_program` notifies
  `caregiver_id`, and `notifications.user_id` is NOT NULL.)
- [ ] **Assert 0017:** the **service** client calling `assign_care_team` raises `not_allowed`.
- [ ] **Initial consults (coordinator + clinicians):** assign all four clinicians; schedule +
  `mark_meeting_done` each initial consult; submit clinical forms signed in as each clinician,
  **doctor first** with `clearance:"cleared"`. Assert the trainer's initial submit **succeeds**
  (forward gate: clearance on file).
- [ ] **Activate (coordinator):** `activate_program`; assert cycle 1 active + cycle 2 upcoming.
- [ ] **M-1 (single performance report):** `compile_performance_report(cycle1)` **twice** →
  assert exactly **1** performance report for cycle 1.
- [ ] **M-2 (idempotent rollover):** `close_cycle_open_next(cycle1)` **twice** → assert cycle 2
  is active with exactly **4** consults (not 8), and cycle 1 is `closed`.
- [ ] **H-1 (clearance carry-forward):** schedule + done the cycle-2 doctor_review + trainer_review;
  doctor submits a review with `clearance_change:"unchanged"` (builder omits the clearance key —
  assert the stored review has no clearance); trainer submits the review → assert it **succeeds**.
  *This is the load-bearing regression check: reverting 0015 makes this exact submit raise
  `awaiting_doctor_clearance`.*
- [ ] **Teardown (finally):** delete notifications linking the member, invites for the member,
  the member (cascades contacts/assignments/packages→cycles/consultations/reports/responses),
  and the ephemeral caregiver auth user (cascades its profile). Runs even on assertion failure.
- [ ] **Wire up:** add `"test:lifecycle": "tsx scripts/test-lifecycle.ts"` to `package.json`.

## Verify

1. `npm run test:lifecycle` → all assertions pass, member torn down, exit 0.
2. **Fail-on-revert (proven read-only):** a live `create or replace` of the gate is *correctly*
   blocked by the auto-mode classifier (CLAUDE.md forbids ad-hoc schema changes via
   `execute_sql`). Instead, proven with a rolled-back read-only comparison against the test's exact
   report state (doctor_initial `cleared` + unchanged doctor_review with no clearance):
   the current gate resolves to `cleared` (trainer passes) while the pre-0015 gate resolves to
   `NULL` → `awaiting_doctor_clearance`. So the test's "trainer review submit SUCCEEDS" assertion
   is exactly what flips to a failure when 0015 is reverted.
