# CODE-REVIEW.md — PHLOEM Chronic-Care Dashboard

Independent senior review & security audit. Reviewer assumed no authorship; every
claim below was verified against the actual code (migrations, RPCs, server actions,
React components) and against `PHLOEM-BUILD-SPEC.md`, not against `PROGRESS.md`,
commit messages, or code comments. Local tooling was executed; the live database
suite was traced statically (see the note in Pass 1).

**Date:** 2026-07-13 · **Scope:** full repo at `HEAD` (`cff7023`).

---

## How to read this

Severities:

- **CRITICAL** — data leak, permission bypass, data corruption, exposed secret.
- **HIGH** — a spec business rule is broken or bypassable.
- **MEDIUM** — edge-case bug, missing validation / error handling.
- **LOW** — code quality, performance, UX polish.

Each finding is `SEVERITY — short title` followed by file:line, what is wrong, why
it matters, and a concrete fix. Nothing was changed in this pass — review only.

---

## Executive summary

The security core is genuinely well-built and I found **no CRITICAL issue**. The
service-role key is confined to `server-only` modules; enforcement lives in Postgres
RLS + security-definer RPCs exactly as the spec demands; every server action
Zod-validates its input; `accept_invite` can never take a client-supplied role; the
`member_contacts` / wellbeing / psych-response isolations are structurally correct.
`npm run build`, `tsc --noEmit`, `eslint`, and the red-flag unit suite all pass clean.

The material defects are two HIGH business-logic bugs and one HIGH spec gap:

1. A doctor's **unchanged monthly review wipes the stored clearance to `""`**, which
   then **blocks the trainer's review submission at the database** for the rest of the
   program (the trainer gate reads that empty clearance).
2. **Suspending a caregiver or elderly-member account is not a database lockout** —
   their RLS access runs through ownership checks that never consult
   `profiles.status`, so the spec's "instant lockout everywhere" holds only for the
   four clinical roles + admin/coordinator, not for caregivers.
3. **`share_with_caregiver` has no toggle anywhere in the app** — the §10 admin
   control was never built — so caregivers can structurally never see doctor or
   performance reports even when a clinician intends to share them.

Everything else is MEDIUM/LOW: a check-then-insert race that can compile two
performance reports under concurrent feedback submits, a total absence of secondary
indexes on hot paths, and a handful of UTC-vs-IST day-boundary computations.

---

# PASS 1 — SECURITY

## 1.1 §16 RLS suite

**Execution status.** The environment override routes all DB work through the
Supabase MCP `execute_sql` tool against the hosted dev project
(`nrhteqnaaijuwdgermsx`). That MCP server requires a one-time browser OAuth that
only the user can complete; it was not authorized during this session, and there is
no `SUPABASE_DB_URL` in `.env.local` for the `pg`-based `npm run test:rls` fallback.
The suite therefore could **not be executed live** in this pass. I traced every
assertion by hand against the policies in `0002_rls.sql` / `0008_member_portal.sql`
and the fixtures the suite builds; the trace is below, and the exact command to run
it live follows.

**To run it live (either path):**

```
# via MCP (preferred, matches CLAUDE.md override):
#   paste the full contents of supabase/tests/rls.test.sql into the
#   Supabase MCP execute_sql tool (it is one transaction, rolled back at the end).

# or via the bundled runner, after adding a direct connection string:
echo 'SUPABASE_DB_URL=postgresql://postgres:<pw>@db.nrhteqnaaijuwdgermsx.supabase.co:5432/postgres' >> .env.local
npm run test:rls
```

**Static trace of `supabase/tests/rls.test.sql` (all expected PASS):**

| Persona | Assertion | Policy that enforces it | Expected |
|---|---|---|---|
| Doctor | `member_contacts` count = 0 | no clinician policy on `member_contacts` | PASS |
| Doctor | wellbeing reports = 0 | `rep_doctor` has `type <> 'wellbeing'` | PASS |
| Doctor | psych_checkin responses = 0 | no `form_responses` policy grants psych rows to doctor | PASS |
| Doctor | assigned member visible = 1 | `mem_clinician` + `is_assigned_to` | PASS |
| Doctor | full onboarding answers = 1 | `fr_doctor_onboarding` | PASS |
| Doctor | onboarding answers hold no `contact_number` | §4 split in `submit_onboarding` | PASS |
| Doctor | unassigned member / reports / consults = 0 | all gated on `is_assigned_to` | PASS |
| Doctor | sees performance report = 1 | `rep_doctor` allows non-wellbeing | PASS |
| Doctor | sees both feedback responses = 2 | `fr_feedback_doctor` | PASS |
| Nutritionist | `member_contacts` = 0 | no policy | PASS |
| Nutritionist | raw onboarding `form_responses` = 0 | only `fr_own_clinical`/feedback/admin apply | PASS |
| Nutritionist | scoped RPC returns diet keys only | `get_onboarding_scoped` nutrition branch | PASS |
| Nutritionist | wellbeing reports = 0 | `rep_nutri` type list excludes wellbeing | PASS |
| Nutritionist | performance report = 1; own feedback draft = 1 | `rep_nutri`, `fr_own_clinical` | PASS |
| Trainer | `member_contacts` = 0; wellbeing = 0 | no policy; `rep_trainer` excludes wellbeing | PASS |
| Trainer | scoped RPC returns activity keys only | `get_onboarding_scoped` trainer branch | PASS |
| Trainer | performance = 1; own feedback draft = 1 | `rep_trainer`, `fr_own_clinical` | PASS |
| Psychologist | `member_contacts` = 0 | no policy | PASS |
| Psychologist | wellbeing = 1; non-wellbeing = 0 | `rep_psych` (`type='wellbeing'` only) | PASS |
| Psychologist | scoped RPC minimal (reason/condition_names, no meds) | `get_onboarding_scoped` psych branch | PASS |
| Caregiver | sees only own member = 1; other member = 0 | `mem_caregiver` | PASS |
| Caregiver | own contacts = 1 | `con_caregiver` | PASS |
| Caregiver | onboarding summary = 1; wellbeing = 0 | `rep_cg` | PASS |
| Caregiver | doctor_initial hidden (no share) = 0; performance hidden = 0 | `rep_cg` requires `share_with_caregiver` | PASS |
| Coordinator | 0 reports of any type | no coordinator `reports` policy | PASS |
| Coordinator | 0 onboarding answers | no coordinator `form_responses` policy | PASS |
| Coordinator | all members = 2; all contacts = 2 | `mem_coord`, `con_coord` | PASS |
| Member (elderly) | own member = 1; other = 0; contacts = 0 | `mem_self`, `is_member_self`; no member `member_contacts` policy | PASS |
| Member | plan-type reports = 3; wellbeing/doctor/performance = 0 | `rep_member` type list | PASS |
| Member | raw onboarding = 0; own consults = 1; care team via RPC = 4 | no member `form_responses` policy; `cons_member`; `get_care_team` | PASS |
| Suspended doctor | members/contacts/reports/consults = 0 | `auth_role()` → NULL fails closed | PASS |
| service-only | `run_daily_jobs`/`_build_performance`/`get_care_team(anon)` not executable | `revoke execute` in 0006/0008/0009 | PASS |

**Gaps in the suite (cases it does not cover — see finding S-2):** the suspended-user
test exercises only a **doctor**. It never asserts that a **suspended caregiver** or a
**suspended elderly member** loses access, and that is precisely the persona whose
RLS is *not* gated on `auth_role()`. Add:

```sql
-- suspended caregiver must also see 0 rows (currently FAILS — see S-2)
update profiles set status='suspended' where email='caregiver@phloem.local';
-- ... set jwt to caregiver ...
select pg_temp.assert_eq('suspended caregiver: 0 members', (select count(*) from members), 0);
select pg_temp.assert_eq('suspended caregiver: 0 member_contacts', (select count(*) from member_contacts), 0);
```

## 1.2 Service-role key confinement — PASS

`grep -rn SUPABASE_SERVICE_ROLE_KEY` and every importer of `lib/supabase/admin.ts`
resolve to server-only surfaces:

- `lib/supabase/admin.ts:3` starts with `import "server-only"` — a client import is a
  build error.
- Importers: `app/api/cron/daily/route.ts`, `app/api/reports/[id]/pdf/route.ts`,
  `app/(auth)/invite/[token]/actions.ts` (`"use server"`), `app/(auth)/invite/[token]/page.tsx`
  (async server component), and `scripts/seed.ts` (Node script). None is a client
  component; none re-exports the client. The key is never `NEXT_PUBLIC_`.

**No finding.**

## 1.3 RPC auth audit — PASS (with one note)

Every §6 mutating RPC validates the caller before doing work:

- `create_member_with_invite`, `assign_care_team`, `set_consultation_schedule`,
  `mark_meeting_done`, `activate_program`, `pause_program`, `resume_program`,
  `set_package_duration` → `if auth_role() not in ('admin','coordinator') raise`.
- `deactivate_member`, `reactivate_member`, `set_account_status` → `auth_role() <> 'admin'`.
- `submit_clinical_form` → `auth_role()::text <> type AND is_assigned_to`.
- `submit_feedback` → owns the draft, correct role, assigned.
- `close_cycle_open_next`, `compile_performance_report`, `run_daily_jobs` → callable
  only by the service path (`auth.uid() IS NULL`) or admin, and `revoke execute … from
  public, anon, authenticated`.
- `accept_invite` — **role always comes from the invite row** (`0003_rpcs.sql:120-121`);
  it is revoked from `anon`/`authenticated` and only the service client calls it after
  re-validating the token server-side (`actions.ts:38-58`). There is no path for a
  client-supplied role. **PASS.**

Workflow state is only ever changed through these RPCs; I found no raw
`update … set status`/`insert into cycles|packages|consultations` in any server action
(the `form_responses.answers` autosave and the `pdf_path`/`read_at` writes are the only
direct table writes, and none is workflow state). **PASS.**

*Note:* the account suspend/reactivate transition is an added RPC (`set_account_status`,
`0005`) not enumerated in §6; it is correctly audited and admin-only with a
self-lockout guard. Reasonable, and logged as an assumption in PROGRESS.md.

## 1.4 Isolation checks — structurally PASS (see trace 1.1)

- `member_contacts` has **no policy for any clinical role** (`0002_rls.sql:55-58`); the
  four clinical roles get 0 rows by construction.
- Wellbeing reports: only `rep_psych` grants `type='wellbeing'`; `rep_doctor` excludes
  it and `rep_nutri`/`rep_trainer` type-lists omit it.
- psych_checkin `form_responses`: no policy grants them to doctor/nutritionist/
  trainer/coordinator (only `fr_own_clinical` = the psychologist themselves, plus admin
  and the member's caregiver — and the caregiver never has an assigned psychologist
  writing to *their* member unless it's their own member, which is intended).
- Seeded member's onboarding `answers` (`scripts/seed.ts:101-161`) contain no
  `contact_number`, `pin_code`, or emergency-contact fields; the §4 split in
  `submit_onboarding` (`0003_rpcs.sql:169-170`) strips exactly those keys.

## 1.5 Storage / cron / invites / suspended / Zod

- **Reports have no UPDATE/DELETE policy for clinicians** — only `rep_insert` (with
  `created_by = auth.uid()`), so reports are immutable to them; amendments must
  `insert … supersedes`. **PASS.**
- **Bucket private + short signed URL:** `scripts/seed.ts:360` creates `reports` with
  `public:false`; the PDF route serves a **600 s** signed URL
  (`app/api/reports/[id]/pdf/route.ts`) after an RLS-scoped read that 404s anything the
  caller cannot see. **PASS.**
- **Cron secret:** `app/api/cron/daily/route.ts` returns 500 if `CRON_SECRET` is unset
  and 401 unless `Authorization: Bearer <secret>` matches. **PASS.**
- **Invite single-use + server-side expiry:** `accept_invite` selects `… where used_at
  is null and expires_at > now() … for update` and burns the token; the server action
  re-checks before creating the auth user. **PASS.**
- **Suspended user:** works for clinical/admin/coordinator (via `auth_role()`), **but
  not for caregivers/members** — see **S-2 (HIGH)**.
- **Zod on every server action:** confirmed in all eight action files
  (`program-actions`, `admin/members`, `admin/care-team`, `admin/invites`,
  `coordinator/members/[id]`, `clinician/clients/[id]`, `notifications`,
  `portal/onboarding/[memberId]`). **PASS.**

### Security findings

#### S-2 — HIGH — Suspending a caregiver/member is not a database lockout

**Files:** `supabase/migrations/0002_rls.sql:18-21, 52, 57-58, 75-79, 94-95, 114, 121`

`auth_role()` filters on `status='active'`, so a suspended clinician/admin/coordinator
correctly gets NULL and every `auth_role()`-based policy fails closed. But the
caregiver-facing policies are gated on **ownership**, not `auth_role()`:

```sql
create policy mem_caregiver on members for select using (caregiver_id = auth.uid());
create policy con_caregiver on member_contacts for select using (is_caregiver_of(member_id));
create policy con_cg_update on member_contacts for update using (is_caregiver_of(member_id));
create policy rep_cg  on reports for select using (is_caregiver_of(member_id) and (...));
create policy fr_cg   on form_responses for all using (is_caregiver_of(member_id));
```

`is_caregiver_of(m)` (line 18) checks only `caregiver_id = auth.uid()` — it never
consults `profiles.status`. **A suspended caregiver holding an unexpired access token
(access tokens live ~1 h and are not revoked on suspend) can still read and write their
member's data by hitting PostgREST directly**, bypassing the middleware/layout checks
that are the *only* thing enforcing suspension for this role. This contradicts the
spec's own claim ("Suspend switch = instant lockout", `0002_rls.sql:10`) and Phase 2's
acceptance ("suspended user is locked out everywhere"). Blast radius is limited to the
caregiver's own member (no cross-tenant leak), which is why this is HIGH not CRITICAL.
The elderly `member` role is *not* affected — `is_member_self` (`0008:11-16`) does check
`auth_role()='member'`.

**Fix:** gate the caregiver ownership on active status. Either add the check inside the
helper —

```sql
create or replace function is_caregiver_of(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members mem
                 join profiles p on p.id = auth.uid() and p.status = 'active'
                 where mem.id = m and mem.caregiver_id = auth.uid())
$$;
```

— and change `mem_caregiver` to `using (is_caregiver_of(id))` so it, too, is
status-aware. Then add the suspended-caregiver assertions from 1.1 to the §16 suite.

#### S-3 — LOW — `fr_own_clinical` INSERT check does not verify assignment

**File:** `supabase/migrations/0002_rls.sql:99-100`

`create policy fr_own_clinical on form_responses for all using (respondent_id =
auth.uid())`. Because there is no explicit `WITH CHECK`, Postgres reuses the `USING`
predicate for inserts, so a clinician can insert a `form_responses` row for **any**
`member_id` as long as `respondent_id` is themselves (the clinician page does this at
`clinician/clients/[id]/page.tsx:452-462`). This cannot read another member's data and
`submit_clinical_form` re-checks `is_assigned_to`, so it is only junk-row insertion, not
a leak. **Fix:** add `with check (respondent_id = auth.uid() and is_assigned_to(member_id))`.

#### S-4 — LOW — `notif_own` is not status-aware

**File:** `supabase/migrations/0002_rls.sql:107` — `notif_own` uses `user_id =
auth.uid()` with no status check, so a suspended user with a live token can still read
their own notifications. Own-data only; cosmetic. Fold into the S-2 fix if desired.

---

# PASS 2 — BUSINESS LOGIC

Live execution against the seeded accounts with the `?today=` time-travel helper was
not possible this session (same MCP-auth blocker as 1.1). Each item below was traced
through the actual RPC/SQL; where a defect exists it is called out with the exact
failing interleaving or input.

### 2.1 `activate_program` — CORRECT

`0003_rpcs.sql:357-402`: `v_start := current_date + 1` (tomorrow ✓);
`v_end := start + duration_months months` (matches §6 verbatim); cycles
`n in 1..duration_months`, `start + (n-1)*30 … +29`, cycle 1 `active`, rest `upcoming`
(✓); psych override recorded (`psych_override = v_psych_pending`) and audited with a
distinct `program.psych_override` row when pending (✓). Eligibility requires the three
initial doctor/nutritionist/trainer reports submitted (✓). *(See L-7 for the benign
package-end vs 30-day-cycle divergence — spec-conformant, not a bug.)*

### 2.2 Trainer gate — enforced at the DB, but see H-1

Calling `submit_clinical_form` for the trainer with no cleared doctor report raises
`awaiting_doctor_clearance` at the database (`0003_rpcs.sql:295-302`), independent of
the UI lock. **PASS for the initial round.** But the gate reads
`content->>'clearance'` from the *latest* doctor report, and the review builder writes
an empty clearance on an unchanged review — **H-1 below.**

### 2.3 Pause math — CORRECT (minor TZ caveat)

`pause_program` requires `status='active'` (pausing while paused → `not_active`, ✓);
`resume_program` requires `status='paused'` (resuming while active → `not_paused`, ✓).
Resume shifts the active cycle end, all upcoming cycles' start+end, and the package
end_date by `d`, and adds `d` to `total_paused_days` (`0003_rpcs.sql:429-436`). A 5-day
pause shifts everything by exactly 5. The day-count `current_date - paused_at::date`
(line 429) is computed in the DB session timezone (UTC on hosted) — see **M-3** for the
IST boundary caveat.

### 2.4 Cron idempotency — CORRECT

`run_daily_jobs` re-runs are no-ops: every notification goes through `_notify … on
conflict (dedupe_key) do nothing`; feedback drafts (job 2) are guarded by
`not exists (… form_responses where cycle_id and template_id)`; rollover (job 4) only
selects `status='active'` cycles past end_date and `close_cycle_open_next` flips them to
`closed`, so a second same-day run finds nothing. Running the same simulated day twice
produces zero duplicate notifications or drafts. **PASS.**

### 2.5 Performance report compile — race, see M-1

Sequential double-submit is safe (the second `compile_performance_report` sees the
first report and returns it). Soft-block "pending" callout is correct
(`_build_performance` → `Feedback Pending` callout, fixed in `0007`). **But a
near-simultaneous submit is not safe — M-1 below.**

### 2.6 Cycle rollover / reactivation — CORRECT (one idempotency caveat)

`close_cycle_open_next` creates exactly the four review consultations
(doctor/nutritionist/trainer/psychologist) for the next cycle and resets their
meeting/report status; the final rollover marks the package `completed` and the member
`inactive` and notifies admin+coordinator; `reactivate_member` opens a new
`not_started` package, sets the member `assigned`, and creates fresh initial
consultations while leaving all history intact. **PASS.** Caveat: `close_cycle_open_next`
itself is not idempotent — see **M-2**.

### 2.7 Timezone — mostly clean; see M-3

The cron and cycle logic compute offsets from **date** columns against a **date**
`p_today` (no `new Date()` instant comparisons), which is the correct approach. IST is
handled in the report/portal formatters and in `isTodayIST`. Two spots compute a
calendar date in UTC rather than IST — see **M-3**.

### Business-logic findings

#### H-1 — HIGH — An unchanged doctor review erases clearance and blocks the trainer for the rest of the program

**Files:** `lib/reports/build/clinical.ts:165` (doctor_review) & `:198` (nutrition path
uses same pattern), gate at `supabase/migrations/0003_rpcs.sql:295-302`, UI lock at
`app/(app)/clinician/clients/[id]/page.tsx:473-484`.

The `doctor_review` builder always sets `clearance: textOr(a.clearance, "")`. In the
`doctor_review` template (`doctor_review.v1.json`), `clearance` is only present when
`clearance_change = "updated"` (it is behind a `showIf`). So on a routine review where
the doctor leaves clearance **unchanged**, `a.clearance` is undefined and the stored
report content is `clearance: ""`.

The trainer gate reads the **latest** doctor report:

```sql
select content->>'clearance' into v_clearance from reports
 where member_id = … and type in ('doctor_initial','doctor_review')
 order by created_at desc limit 1;
if v_clearance is null or v_clearance not in ('cleared','cleared_with_restrictions') then
  raise exception 'awaiting_doctor_clearance';
```

Once the doctor submits any unchanged monthly review, `v_clearance` becomes `""` and
**every subsequent trainer submission is rejected at the database** — and the UI
`ClearancePanel`/`FormPanel` lock (which reads the same field) locks the trainer form
too. A member cleared at intake is silently blocked from training from the first review
cycle onward whenever the doctor's review lands before the trainer's. The code comment
at `clinical.ts:161-162` admits this ("Phase 7 refines carry-forward…") but the
carry-forward was never implemented.

**Fix:** carry the prior clearance forward when the review does not update it. In the
`doctor_review` builder, only set `clearance` when `a.clearance_change === "updated"`;
otherwise omit it (or look it up from the last report that actually has one).
Symmetrically, make the gate/lock resolve "latest report **whose content has a
non-empty clearance**" rather than "latest doctor report":

```sql
select content->>'clearance' into v_clearance from reports
 where member_id = … and type in ('doctor_initial','doctor_review')
   and coalesce(content->>'clearance','') <> ''
 order by created_at desc limit 1;
```

#### H-3 — HIGH — `share_with_caregiver` has no toggle; caregivers can never receive doctor/performance reports

**Files:** absent from all UI; only `scripts/seed.ts:309,334` (hardcoded `true` on the
seed plans) and the generated types reference it. `rep_cg`
(`0002_rls.sql:75-79`) gates doctor/performance reports on `share_with_caregiver`.

§3 says a caregiver may see doctor and performance reports "🔸 if
`share_with_caregiver`", and §10 explicitly lists "share_with_caregiver toggles" on the
admin `members/[id]` screen. That control was never built — `grep -rn
share_with_caregiver` finds no server action and no UI. There is no RPC and no raw write
that ever sets the flag. Consequently the entire "share with caregiver" branch of the
permission matrix is dead: a doctor/admin can never actually share a doctor or
performance report, and caregivers structurally never see them. Phase 8's acceptance
("caregiver sees … permitted reports only") is only half-met — plans work, sharing does
not.

**Fix:** add an admin/doctor server action + toggle that flips
`reports.share_with_caregiver` for a report (ideally through an audited
`set_report_sharing(report_id, bool)` security-definer RPC so it stays inside the §6
write-path discipline, since a clinician has no UPDATE policy on `reports`). Surface it
on `admin/members/[id]` per §10.

#### M-1 — MEDIUM — Concurrent feedback submits can compile two performance reports (or zero)

**File:** `supabase/migrations/0006_cycle_jobs.sql:180-208` (`compile_performance_report`).

The idempotency guard is a check-then-insert with no lock and no unique constraint:

```sql
select id into v_report from reports where cycle_id = p_cycle and type = 'performance' …;
if v_report is not null then return v_report; end if;
… insert into reports(… 'performance' …);
```

`submit_feedback` calls this whenever it observes the counterpart feedback as submitted.
If the nutritionist and trainer submit near-simultaneously, both transactions can (under
READ COMMITTED) each see the other's committed feedback, both call
`compile_performance_report`, both pass the `select … is null` check before either
inserts, and **both insert → two performance reports for the cycle**. There is no
`unique(cycle_id, type)` to stop it. The mirror case (each commits its own update but
neither sees the other's before its `SELECT`) yields **zero** reports until the cron
backstop. The review brief specifically requires "a double-submit or near-simultaneous
submit must not create two reports"; sequential double-submit is safe, concurrent is
not.

**Fix:** add a partial unique index and insert defensively:

```sql
create unique index reports_one_performance_per_cycle
  on reports (cycle_id) where type = 'performance';
-- then: insert … on conflict do nothing; if not inserted, re-select and return it.
```

Alternatively take `pg_advisory_xact_lock(hashtext('perf:'||p_cycle))` at the top of
`compile_performance_report`.

#### M-2 — MEDIUM — `close_cycle_open_next` is not idempotent

**File:** `supabase/migrations/0003_rpcs.sql:452-480`. Calling it twice on the same
cycle re-activates the next cycle and inserts **another four** review consultations
(no `not exists` guard around the `foreach … insert into consultations`, unlike
`reactivate_member` at `:557-562` which does guard). The cron's job-4 query only selects
`status='active'` cycles so it won't double-fire in normal operation, but any manual or
retried invocation duplicates the review round. **Fix:** guard the insert with the same
`not exists (… cycle_id = v_next.id and type = r …)` pattern used in
`reactivate_member`.

#### M-3 — MEDIUM — UTC-vs-IST day boundaries in resume math and admin analytics

**Files:** `supabase/migrations/0003_rpcs.sql:429`
(`d := greatest(1, current_date - v_pkg.paused_at::date)`), `app/(app)/admin/page.tsx:11-12`
(`new Date(Date.now()+…).toISOString().slice(0,10)`), `app/(app)/admin/page.tsx:9-10`.

`current_date`, `paused_at::date`, and `new Date().toISOString().slice(0,10)` all resolve
in **UTC**, not Asia/Kolkata. §11 mandates IST everywhere. A pause created at, say, 23:00
IST is stored as 17:30 UTC (same date) but a resume computed near IST midnight can be off
by one day; the admin "today"/"in 30 days" renewal-radar bounds likewise shift at UTC
midnight (05:30 IST) rather than IST midnight, so a package renewing "today" in IST can
appear/disappear 5.5 h early. Low data-impact, but it is a genuine correctness gap versus
the "IST everywhere" rule and the exact kind of boundary the brief asked to hunt for.
**Fix:** compute the IST calendar date explicitly (e.g. `(now() at time zone
'Asia/Kolkata')::date` in SQL; a `Asia/Kolkata`-formatted `Intl` date in TS) and diff
those.

---

# PASS 3 — SPEC CONFORMANCE

## 3.1 §3 permission matrix — policies vs UI

Walked cell by cell. The **policies** match the matrix (verified in the 1.1 trace):
contact identifiers hidden from all clinicians; demographics visible to assigned
clinicians via `mem_clinician`; onboarding health answers full to doctor
(`fr_doctor_onboarding`) and diet/activity/minimal-scoped to the others via
`get_onboarding_scoped`; per-type report visibility exactly as tabulated; consultations
scoped by own type; care-team contacts to admin/coordinator only, names+roles to
caregiver/member via `get_care_team`; assign/schedule/trigger/pause gated to
admin+coordinator; deactivate/reactivate/audit/suspend to admin; coordinator invites
limited to caregivers (`inv_coord` requires `role='caregiver'`).

The **UI** mirrors this (middleware `allowedPrefix` keeps each role in its shell;
clinician tabs are role-configured; coordinator sees contacts + wa.me links; caregiver
portal shows plans/reports/schedule). Two matrix cells are only partially realized in
the UI:

- **Caregiver "🔸 if share_with_caregiver"** for doctor/performance reports — un-actionable
  (see **H-3**).
- Everything else conforms.

## 3.2 §7 templates — diffed field-by-field

All ten seeded templates in `supabase/templates/*.v1.json` were diffed against §7.2.
Every field id, `required` flag, option list, and `showIf` condition matches, including:
the onboarding data-split fields (`contact_number`/`pin_code`/emergency → contacts), the
deduplicated single `activity_level`/`conditions`/`medications`/`food_frequency` rows,
split smoking/alcohol with `showIf` frequency, the WHO-5 five `scale_0_5` items, the
psych domains, and `feedback_training` matching §7.1 verbatim. `feedback_nutrition` has
all §7.2 fields. **No discrepancy found.** (`trainer_initial` even carries the
`meta.requires_doctor_clearance` marker and `psych_checkin` the
`meta.visibility` marker, which are advisory only.)

## 3.3 §8 reports — assessment-first + callouts

Every clinical builder leads with the free-text assessment
(`ASSESSMENT_FIELD`/`assessmentSection`, `clinical.ts:41-95`): Doctor's Assessment,
Nutritionist's Assessment, Trainer's Assessment, Session Notes (Confidential),
review summaries. Callouts exist for: red flags (onboarding-summary, danger/warning by
severity), adverse events (performance, `_build_performance` danger callout), exercise
clearance restrictions (doctor, warning/danger for restricted/on-hold), feedback-pending
(performance, warning), psych escalation (wellbeing, danger). **PASS.**

## 3.4 §12 notifications — rows + dedupe keys

Every §12 event is emitted with a dedupe key: onboarded, assigned, consult
scheduled, meeting-done, report-late (72 h hygiene), feedback-unlocked (T-3),
feedback-nudge (T-1) / overdue (D30), performance-ready, reviews-due (T-7),
program-activated, paused/resumed, renewal (T-14), package-completed, psych-escalation.
**Deviation (accepted):** fan-out notifications append the recipient id to the dedupe
key (e.g. `start:{package}:{care_user_id}` instead of the literal `start:{package}`) so
concurrent recipients don't collide on the unique constraint — documented as an
assumption in `0003_rpcs.sql:2-4`. Functionally correct; only the literal key string
differs from §12. No finding.

## 3.5 §15 Phase 7 & Phase 8 acceptance — re-verified explicitly

**Phase 7** (cycle engine): `activate_program` start=tomorrow + psych-override dialog
(`program-card.tsx:82-87`) ✓; cycles generated ✓; cron route + all six §9 jobs with
`?today=` dev time-travel ✓; feedback drafts at T-3 ✓; `submit_feedback` →
performance compile ✓ (with the M-1 race caveat); `close_cycle_open_next` resets the
checklist + 4 fresh consults ✓ (M-2 caveat); pause/resume date-shift ✓; duration
change ✓; renewal/inactive flow ✓; `reactivate_member` restores with history ✓. The
one Phase-7 defect is **H-1** (trainer clearance carry-forward).

**Phase 8** (portal & polish): caregiver portal is plans-first with reports (RLS-
filtered) + schedule + progress bar + member switcher (`portal/page.tsx`) ✓; elderly
`member` login shows exactly three items (My Plans / My Schedule / My Care Team) at
≥18 px (`portal/page.tsx:208-238`) ✓; admin analytics tiles (active members, consults
this week, overdue, renewals 30 d) + renewal radar ✓; audit view ✓; `notify()` behind
Resend with dev console fallback ✓; README present ✓. The Phase-8 gap is **H-3**
(share toggle missing) and the `recharts` dependency named in §2 was never added — but
§15's Phase-8 acceptance only requires "analytics tiles," which the plain-number tiles
satisfy, so that is a non-issue (noted L-8).

---

# PASS 4 — CODE QUALITY & ROBUSTNESS

- **`tsc --noEmit`: clean (exit 0).** No `any`, no `@ts-ignore`/`@ts-expect-error`, no
  `eslint-disable` anywhere in `app/`, `lib/`, `components/`, `scripts/`, `middleware.ts`.
- **RPC/DB errors surfaced as friendly messages:** the clinical, onboarding, program,
  and coordinator actions map raw exception substrings to human copy
  (`RPC_MESSAGES`/`CODES`/`ERRORS` maps) and never leak stack traces to the UI. Good.
- **Multi-step RPCs are atomic:** each security-definer function is one transaction;
  `activate_program`, `submit_onboarding`, `close_cycle_open_next` all commit-or-rollback
  as a unit. `activate_program`/`resume_program`/`set_package_duration` take `FOR UPDATE`
  on the package. See L-6 for the one two-statement server action.
- **Findings:** M-1 (perf race), M-2 (rollover idempotency) above; index/N+1 and
  cleanup items below.

#### M-4 — MEDIUM — No secondary indexes on any hot path

**File:** `supabase/migrations/*` — the only non-constraint index in the entire schema is
`one_active_per_role` (`0001_init.sql:87`). Every foreign-key / filter column used on hot
paths is unindexed:

- `assignments(care_user_id)` — read by `is_assigned_to()`, which RLS calls **per row**
  on `members`, `reports`, `consultations`, `form_responses` for every clinician query.
- `notifications(user_id)` / `(user_id, read_at)` — the bell polls
  `order by created_at desc limit 15` under the `notif_own` filter on every page.
- `consultations(member_id)` and `(cycle_id)` — read on nearly every coordinator/
  clinician/portal page.
- `reports(member_id)` — read on every report list and the trainer-gate lookup.
- `form_responses(member_id, template_id)`, `(consultation_id)`, `(cycle_id)`,
  `(respondent_id)` — read by the feedback/clinical panels and `_build_performance`'s
  lateral joins.

At seed scale this is invisible; at real volume these become sequential scans, and the
per-row `is_assigned_to` makes clinician report reads O(reports × assignments).
**Fix:** add btree indexes on the columns above (partial `where active` for
`assignments(care_user_id)`; `(user_id, read_at)` for notifications).

#### L-5 — LOW — Duplicated `hasHighFlag`

`app/(app)/admin/members/page.tsx:9-16` re-implements `hasHighFlag` inline instead of
importing `parseRedFlags`/`hasHighFlag` from `lib/red-flags.ts` like every other page.
Dead-simple divergence risk. **Fix:** import the shared helpers.

#### L-6 — LOW — `submitOnboarding` save + RPC are not one transaction

`app/(app)/portal/onboarding/[memberId]/actions.ts:78-95` does an authoritative
`update form_responses … answers` and then a separate `rpc('submit_onboarding')`. If the
update commits but the RPC throws, the draft holds the un-split answers (including
contact fields) until the caregiver retries; the next successful submit strips them, so
there is no lasting leak, but the intermediate state is inconsistent. **Fix:** pass the
final answers into the RPC and let it do the single authoritative write, or wrap both in
one RPC call.

#### L-7 — LOW — Package end_date (calendar months) vs cycles (30-day) diverge by 1–3 days

`activate_program` sets `end_date = start + N months` (`0003_rpcs.sql:377`) while cycles
span `30·N` days, so for a 3-month package the last cycle ends ~1–3 days before
`packages.end_date`. This is exactly what §6 specifies (end_date verbatim = `start +
months*interval`; cycles verbatim = 30-day), so it is **spec-conformant, not a bug** —
flagged only because it makes the member go `inactive` (cycle rollover) a few days before
the nominal package end, and renewal T-14 keys off the package end_date. Worth a comment
in the code so the next reader doesn't "fix" it.

#### L-8 — LOW — Unused/mis-scoped dependencies

`package.json`: `recharts` (named in §2 for Phase-8 charts) was never added and the
analytics uses plain tiles — fine per §15, noted for completeness. `shadcn` (a CLI) is
listed under `dependencies` rather than `devDependencies`. `date-fns-tz` (spec §2/§11)
was intentionally replaced by `Intl` — acceptable, saves a dep. **Fix:** move `shadcn`
to devDependencies.

#### L-9 — LOW — UX polish

- Base `Button` is `h-8`/`text-sm` (14 px); §11 wants ≥16 px base. The critical elderly/
  onboarding/invite flows override with `h-11 text-base`, but admin/coordinator table
  buttons stay at 14 px. Minor.
- The onboarding wizard and the mobile pipeline board are responsive (per-section
  screens, `overflow-x-auto`); elderly mode is `text-lg`+ with three items — meets §10.
- Loading and empty states exist across the shells (`loading.tsx` skeletons, "No clients
  yet…" empties). Good.

---

# PASS 5 — RUN EVERYTHING

| Command | Result |
|---|---|
| `npm run build` (`next build --turbopack`, production) | **PASS** — compiled successfully, 17/17 static pages generated, exit 0 |
| `tsc --noEmit` | **PASS** — exit 0, no errors, no `any` |
| `eslint .` | **PASS** — exit 0, no warnings |
| `npm run test:unit` (red-flag parity suite) | **PASS** — 8/8 tests |
| `npm run test:rls` (§16 suite) | **Not run** — needs Supabase MCP OAuth or `SUPABASE_DB_URL`; statically traced in 1.1 |
| `npm run seed` | Not run (would write to the shared hosted dev project; not executed unprompted) |

**Seeded-account walkthrough (static, per role — the dev server was not driven live):**

- **Admin** → `/admin`: overview tiles + renewal radar, members list, care-team CRUD +
  suspend, invites with copyable links, audit log, member page with full program
  controls incl. reactivate. Coherent. Gap: no `share_with_caregiver` toggle (H-3).
- **Coordinator** → `/coordinator`: today queue (static rules), pipeline board (status
  columns + N/4 chip), member page with contacts + wa.me, assign/schedule/mark-done,
  Start Program with psych-override confirm, pause/resume. Coherent.
- **Doctor/Nutritionist/Trainer/Psychologist** → `/clinician/clients`: assigned-only
  list with pending-form badge + red-flag dot; role-configured tabs; scoped onboarding
  via RPC; directives/clearance read-only cards; consult form gated on meeting-done;
  trainer form locks without clearance (**but H-1 mis-locks it after an unchanged
  review**); psych confidentiality intact.
- **Caregiver** → `/portal`: member switcher, status card, onboarding CTA (video gate →
  wizard with autosave/resume), plans/reports/schedule, progress bar, care-team names.
  Coherent; only permitted report types appear.
- **Member (elderly)** → `/portal`: exactly My Plans / My Schedule / My Care Team at
  ≥18 px, view-only. Meets §10.

---

# Summary

## Finding counts by severity

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 3 | S-2, H-1, H-3 |
| MEDIUM | 4 | M-1, M-2, M-3, M-4 |
| LOW | 6 | S-3, S-4, L-5, L-6, L-8, L-9 (+ L-7 non-bug note) |

## Top 5 riskiest issues, in plain language

1. **A routine doctor review locks the trainer out (H-1).** When a doctor files a
   monthly review without changing the exercise clearance, the report saves an empty
   clearance, and the trainer's own review submission is then rejected by the database
   with "awaiting doctor clearance." A member who was cleared at intake gets blocked from
   training from the first review cycle onward. This breaks the core monthly loop and was
   knowingly left as a stub.

2. **Suspending a caregiver doesn't actually lock them out at the database (S-2).** The
   spec's whole security promise is "enforcement is in the database, suspension is
   instant." That holds for doctors/coordinators/admins, but caregiver access is checked
   by "do you own this member," which never looks at whether the account is suspended. A
   suspended caregiver with a still-valid session token can keep reading and editing
   their member's data by calling the API directly. Limited to their own data, but it
   contradicts the stated model and the §16 suite never tests for it.

3. **"Share this report with the caregiver" was never built (H-3).** The permission
   matrix and the admin screen spec both describe a toggle that lets a doctor/admin share
   doctor and performance reports with the family. No such control exists anywhere in the
   app, so those reports can never reach caregivers — an entire branch of the permission
   model is inert.

4. **Two performance reports can be generated for one cycle (M-1).** If the nutritionist
   and trainer submit their monthly feedback at nearly the same moment, the "only compile
   once" guard can be bypassed and the cycle ends up with duplicate performance reports
   (or, on a different interleaving, none until the nightly job catches it). There is no
   database constraint preventing the duplicate.

5. **No indexes on the busy tables (M-4).** The schema has essentially one index. Every
   clinician page re-checks assignment per row, and reads by member/user/cycle all do
   sequential scans. Fine for the demo seed; it will degrade badly with real patient
   volume.

## Recommended fix order

1. **H-1** — carry clearance forward on unchanged reviews (and make the gate look for the
   last non-empty clearance). Small change, unblocks the trainer; ship first.
2. **S-2** — make `is_caregiver_of` (and `mem_caregiver`) status-aware; add the
   suspended-caregiver/member assertions to `rls.test.sql`. Closes the lockout gap.
3. **M-1** — add `unique (cycle_id) where type='performance'` and insert with
   `on conflict do nothing`. One migration, removes the duplicate-report race.
4. **H-3** — add the audited `set_report_sharing` RPC + admin toggle so the share branch
   of §3 actually works.
5. **M-4** — one migration adding the hot-path indexes (assignments.care_user_id,
   notifications(user_id,read_at), consultations(member_id/cycle_id), reports(member_id),
   form_responses(member_id,…)).
6. **M-2 / M-3** — guard `close_cycle_open_next`'s consult inserts; move the resume/
   analytics date math to Asia/Kolkata.
7. **LOW cleanup** — S-3/S-4 WITH CHECK + status on the remaining owner policies, L-5/L-6/
   L-8/L-9. Bundle opportunistically.

## Note on verification completeness

`npm run build`, `tsc --noEmit`, `eslint`, and the unit suite were **executed** and all
pass. The §16 RLS suite and the live time-travel business-logic runs were **not
executed** because the Supabase MCP server requires an interactive browser OAuth that
was not completed this session and no `SUPABASE_DB_URL` fallback is configured; those
sections were verified by close static analysis of the SQL and are marked as such. Once
the MCP is authorized, run `supabase/tests/rls.test.sql` via `execute_sql` (add the
suspended-caregiver cases from 1.1) and replay the Phase-7 month with `?today=` to
confirm H-1, M-1, and M-2 against live data.
