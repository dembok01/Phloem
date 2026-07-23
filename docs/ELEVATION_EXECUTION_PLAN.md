# PHLOEM Elevation — Execution Plan (Phase 1 / Tier 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Tier-1 correctness + hardening bundle from `docs/ELEVATION_BLUEPRINT.md` — CI, four migrations (`0010`–`0013`), the TS clearance mirror, the typed RPC-error registry, the report-sharing feature, and per-request query dedupe — without changing any external behavior except the documented bug fixes.

**Architecture:** All authorization lives in Postgres (RLS + security-definer RPCs); the app layer is thin Zod→RPC wrappers. Every task here either fixes a DB-side defect via a numbered migration, or tightens the TS layer around the DB's existing contracts. Nothing in this plan adds a new write path.

**Tech stack:** Next.js 15 App Router, TypeScript strict, hosted Supabase via MCP tools, Zod 4, npm, `tsx --test` for unit tests.

## Global Constraints (apply to every task — read before starting)

- **npm, never pnpm.** Commands: `npx tsc --noEmit` (typecheck), `npm run lint`, `npm run test:unit`, `npm run test:rls`, `npm run cron:dev [YYYY-MM-DD]`.
- **Migrations:** write the SQL file in `supabase/migrations/` FIRST, commit-worthy, then apply to the hosted project with the MCP tool `mcp__supabase__apply_migration` (name = filename without `.sql`). **Never** make schema changes through `mcp__supabase__execute_sql`. `execute_sql` is allowed for read-only inspection and for running test SQL.
- **After every applied migration:** (1) regenerate types via MCP `mcp__supabase__generate_typescript_types` and overwrite `lib/supabase/database.types.ts` with the output; (2) run the §16 RLS suite (`npm run test:rls` if `SUPABASE_DB_URL` is set in `.env.local`, otherwise run the contents of `supabase/tests/rls.test.sql` via MCP `execute_sql` and confirm the final output contains no `ASSERT FAIL`); (3) run `npx tsc --noEmit`.
- **TypeScript strict, no `any`.** All server-action inputs Zod-validated. Service-role key never in client code; never print it.
- **Do not invent scope.** If something in this plan contradicts what you find in the code, STOP, record the discrepancy in this file under a `## Divergences` section, fix the plan text, and continue only if the fix is unambiguous.
- **Commit at the end of every task** with the message given in the task. Do not batch tasks into one commit.
- **PL/pgSQL editing rule:** when a task says "reproduce the function with this change", open the source migration file, copy the ENTIRE current function definition verbatim into the new migration, and apply only the exact edits shown. Do not retype from memory; do not "improve" anything else.

---

### Task 1: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (add `typecheck` script)

**Interfaces:**
- Produces: a `typecheck` npm script used by CI and later tasks' verification steps.

- [ ] **Step 1: Add the typecheck script**

In `package.json`, inside `"scripts"`, add:

```json
"typecheck": "tsc --noEmit",
```

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit

  # The RLS suite needs a direct Postgres connection to the hosted dev project.
  # It runs only when the SUPABASE_DB_URL secret is configured; otherwise it
  # skips cleanly (the suite is still run manually via MCP after migrations).
  rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: RLS suite (skips if secret unset)
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          if [ -z "$SUPABASE_DB_URL" ]; then
            echo "SUPABASE_DB_URL secret not set — skipping RLS suite."
            exit 0
          fi
          npm run test:rls
```

Note: `npm run build` is deliberately NOT in CI — the build needs live Supabase env vars this workflow doesn't have.

- [ ] **Step 3: Verify locally**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: typecheck clean, lint 0 problems, 8/8 unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "elevate(t1.1): lightweight CI — typecheck, lint, unit; secret-gated RLS job"
```

---

### Task 2: Migration `0010_correctness.sql` — H-1 gate, M-1 race, M-2 idempotency, M-3 IST

**Files:**
- Create: `supabase/migrations/0010_correctness.sql`
- Reference (copy function bodies FROM, do not edit): `supabase/migrations/0003_rpcs.sql`, `supabase/migrations/0006_cycle_jobs.sql`

**Interfaces:**
- Produces: trainer gate that reads the **last non-empty** clearance; unique index `reports_one_performance_per_cycle`; idempotent `close_cycle_open_next`; IST-correct `resume_program`. Task 3 mirrors the gate semantics in TS.

- [ ] **Step 1: Pre-check for duplicate performance reports (the unique index would fail on them)**

Run via MCP `execute_sql`:

```sql
select cycle_id, count(*) from reports where type = 'performance' group by 1 having count(*) > 1;
```

Expected: 0 rows. **If any rows return, STOP and report them to the user — do not delete data on your own.**

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/0010_correctness.sql` with four parts.

**Part (a) — H-1: trainer gate reads the last NON-EMPTY clearance.** Copy the entire `submit_clinical_form` definition from `0003_rpcs.sql` (starts at line 280, `create or replace function submit_clinical_form(`) verbatim, changing ONLY the gate query. Current gate (0003_rpcs.sql:294-302):

```sql
  -- Trainer gate: latest doctor report must carry clearance.
  if v_cons.type = 'trainer' then
    select content->>'clearance' into v_clearance from reports
     where member_id = v_cons.member_id and type in ('doctor_initial','doctor_review')
     order by created_at desc limit 1;
    if v_clearance is null or v_clearance not in ('cleared','cleared_with_restrictions') then
      raise exception 'awaiting_doctor_clearance';
    end if;
  end if;
```

Replace with:

```sql
  -- Trainer gate (H-1 fix): a doctor_review that did not change clearance stores
  -- no clearance key; the gate reads the LAST NON-EMPTY clearance so an
  -- unchanged review carries the prior clearance forward instead of revoking it.
  if v_cons.type = 'trainer' then
    select content->>'clearance' into v_clearance from reports
     where member_id = v_cons.member_id and type in ('doctor_initial','doctor_review')
       and coalesce(content->>'clearance', '') <> ''
     order by created_at desc limit 1;
    if v_clearance is null or v_clearance not in ('cleared','cleared_with_restrictions') then
      raise exception 'awaiting_doctor_clearance';
    end if;
  end if;
```

Everything else in the function stays byte-identical to 0003.

**Part (b) — M-1: one performance report per cycle, race-proof.**

```sql
-- M-1: the compile path was check-then-insert; concurrent submit_feedback calls
-- could both pass the check. The partial unique index makes the DB the arbiter.
create unique index reports_one_performance_per_cycle
  on reports (cycle_id) where type = 'performance';
```

Then copy the entire `compile_performance_report` definition from `0006_cycle_jobs.sql` (starts at line 180) verbatim, changing ONLY the insert. Current insert (0006:192-195):

```sql
  insert into reports(member_id, cycle_id, type, content, created_by)
  values (v_member, p_cycle, 'performance', _build_performance(p_cycle), auth.uid())
  returning id into v_report;
```

Replace with:

```sql
  insert into reports(member_id, cycle_id, type, content, created_by)
  values (v_member, p_cycle, 'performance', _build_performance(p_cycle), auth.uid())
  on conflict (cycle_id) where type = 'performance' do nothing
  returning id into v_report;
  if v_report is null then
    -- Lost the race: another transaction compiled it first. Return that one.
    select id into v_report from reports
     where cycle_id = p_cycle and type = 'performance'
     order by created_at limit 1;
    return v_report;
  end if;
```

Keep the existing early-return (`if v_report is not null then return v_report; end if;` near the top) — it remains the fast path.

**Part (c) — M-2: idempotent `close_cycle_open_next`.** Copy the entire definition from `0003_rpcs.sql` (starts at line 452) verbatim, with TWO edits.

Edit 1 — after `if not found then raise exception 'not_found'; end if;` (the cycle lookup), add:

```sql
  if v_cyc.status = 'closed' then return; end if;  -- M-2: re-calls are no-ops
```

Edit 2 — the consultation loop. Current (0003:463-466):

```sql
    foreach r in array array['doctor','nutritionist','trainer','psychologist']::care_role[] loop
      insert into consultations(member_id, cycle_id, type)
      values (v_pkg.member_id, v_next.id, r);
    end loop;
```

Replace with (same `not exists` pattern as `reactivate_member`, 0003:558-563):

```sql
    foreach r in array array['doctor','nutritionist','trainer','psychologist']::care_role[] loop
      if not exists (select 1 from consultations
                     where member_id = v_pkg.member_id and cycle_id = v_next.id and type = r) then
        insert into consultations(member_id, cycle_id, type)
        values (v_pkg.member_id, v_next.id, r);
      end if;
    end loop;
```

**Part (d) — M-3: IST resume math.** Copy the entire `resume_program` definition from `0003_rpcs.sql` (starts at line 422) verbatim, changing ONLY this line (0003:429):

```sql
  d := greatest(1, current_date - v_pkg.paused_at::date);
```

to:

```sql
  -- M-3: "Asia/Kolkata everywhere" — day counts computed on IST calendar days.
  d := greatest(1, (now() at time zone 'Asia/Kolkata')::date
                   - (v_pkg.paused_at at time zone 'Asia/Kolkata')::date);
```

- [ ] **Step 3: Apply the migration**

MCP `apply_migration` with name `0010_correctness` and the file's content.
Expected: success.

- [ ] **Step 4: Regenerate types + run the suites**

1. MCP `generate_typescript_types` → overwrite `lib/supabase/database.types.ts`.
2. Run the §16 suite (see Global Constraints). Expected: all assertions pass, no `ASSERT FAIL`.
3. `npx tsc --noEmit` — clean.

- [ ] **Step 5: Behavioral verification via `execute_sql`**

Run each check; all inside explicit transactions you roll back, so the hosted project stays clean:

```sql
-- (b) double-compile → exactly one report. Pick any real cycle id first:
--     select id from cycles limit 1;
begin;
select compile_performance_report('<cycle-id>');
select compile_performance_report('<cycle-id>');
select count(*) from reports where cycle_id = '<cycle-id>' and type = 'performance';  -- must be 1
rollback;

-- (c) double-close → 4 consultations, not 8 (use a cycle that has a successor):
begin;
select close_cycle_open_next('<cycle-id>');
select close_cycle_open_next('<cycle-id>');
select count(*) from consultations where cycle_id = '<next-cycle-id>';  -- must be 4
rollback;
```

For (a), the DB-level check is Task 3 Step 6 (it needs the TS builder change to construct the scenario end-to-end).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_correctness.sql lib/supabase/database.types.ts
git commit -m "elevate(t1.2): 0010 — clearance carry-forward gate, unique performance report, idempotent cycle close, IST resume math"
```

---

### Task 3: TS clearance pairing — builder omits empty clearance; shared UI resolver with parity test

**Files:**
- Create: `lib/clearance.ts`, `lib/clearance.test.ts`
- Modify: `lib/reports/build/clinical.ts` (line ~198, the `doctor_review` return), `app/(app)/clinician/clients/[id]/page.tsx` (ClearancePanel ~lines 317-326, FormPanel trainer gate ~lines 544-556), `package.json` (`test:unit`)

**Interfaces:**
- Consumes: the 0010 gate semantics ("last non-empty clearance wins").
- Produces: `resolveClearance(reports: { content: unknown }[]): string | null` and `CLEARED: Set<string>` — the TS mirror of the DB gate, used anywhere the UI shows clearance state.

- [ ] **Step 1: Create the mirror helper**

Create `lib/clearance.ts`:

```ts
/**
 * TS mirror of the §6 trainer-clearance gate as fixed in migration 0010:
 * the LAST NON-EMPTY `content.clearance` across doctor reports (newest first)
 * governs. The DB gate in submit_clinical_form is the enforcement boundary;
 * this mirror only drives UI lock/badge state. Keep the two in lockstep
 * (parity-tested in lib/clearance.test.ts, same convention as lib/red-flags.ts).
 */
export const CLEARED = new Set(["cleared", "cleared_with_restrictions"]);

/** `reports` must be doctor_initial/doctor_review rows ordered created_at DESC. */
export function resolveClearance(reports: { content: unknown }[]): string | null {
  for (const r of reports) {
    const c =
      r.content && typeof r.content === "object"
        ? (r.content as Record<string, unknown>)["clearance"]
        : undefined;
    if (typeof c === "string" && c !== "") return c;
  }
  return null;
}
```

- [ ] **Step 2: Write the failing parity test**

Create `lib/clearance.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { CLEARED, resolveClearance } from "./clearance";

// Rows are newest-first, matching `order by created_at desc`.
test("empty clearance on the newest review does not revoke the prior clearance (H-1)", () => {
  const rows = [
    { content: { clearance: "" } }, // unchanged doctor_review (pre-0010 builder output)
    { content: { clearance: "cleared" } }, // initial report
  ];
  assert.equal(resolveClearance(rows), "cleared");
});

test("a missing clearance key is skipped, like the SQL coalesce filter", () => {
  const rows = [{ content: {} }, { content: { clearance: "cleared_with_restrictions" } }];
  assert.equal(resolveClearance(rows), "cleared_with_restrictions");
});

test("newest non-empty clearance wins", () => {
  const rows = [
    { content: { clearance: "on_hold" } },
    { content: { clearance: "cleared" } },
  ];
  assert.equal(resolveClearance(rows), "on_hold");
  assert.equal(CLEARED.has("on_hold"), false);
});

test("no doctor reports → null (gate stays locked)", () => {
  assert.equal(resolveClearance([]), null);
});

test("non-object content is tolerated", () => {
  assert.equal(resolveClearance([{ content: null }, { content: "x" }]), null);
});
```

Update `package.json`:

```json
"test:unit": "tsx --test lib/red-flags.test.ts lib/clearance.test.ts",
```

Run: `npm run test:unit` — the new tests must PASS already (Step 1 wrote the implementation first because the helper is trivial; the tests are the parity contract going forward). All 13 tests green.

- [ ] **Step 3: Stop the builder writing empty clearance**

In `lib/reports/build/clinical.ts`, the `doctor_review` case currently ends (line ~196-198):

```ts
      // Carry the new clearance when the doctor updated it (Phase 7 refines
      // carry-forward of an unchanged clearance across cycles).
      return { ...base, sections, clearance: textOr(a.clearance, "") };
```

Replace with:

```ts
      // An unchanged review stores NO clearance key; the DB gate (migration
      // 0010) and resolveClearance() then carry the prior clearance forward.
      const reviewClearance = a.clearance_change === "updated" ? textOr(a.clearance, "") : "";
      return reviewClearance !== ""
        ? { ...base, sections, clearance: reviewClearance }
        : { ...base, sections };
```

Leave the `doctor_initial` case (line ~165) unchanged — clearance is a required field there. If `tsc` now errors because the function's return type requires `clearance`, find that type (the function's declared return in this file or `lib/reports/types.ts`) and make the property optional (`clearance?: string`).

- [ ] **Step 4: Point both UI clearance readers at the resolver**

In `app/(app)/clinician/clients/[id]/page.tsx` there are two places that fetch the latest doctor report and read `content.clearance` directly:
1. `ClearancePanel` (~lines 317-326): `const clearance = ... (report.content as Record<string, unknown>).clearance ...`
2. `FormPanel`'s trainer gate (~lines 544-556), which has its own local `CLEARED` set.

For each: change the doctor-report query from `.limit(1)` to `.limit(6)` (keeping `order by created_at desc` and the `doctor_initial`/`doctor_review` type filter), import `{ CLEARED, resolveClearance }` from `@/lib/clearance`, and compute `const clearance = resolveClearance(reports)`. Delete the local `CLEARED` set in FormPanel. `ClearancePanel` also renders the "Exercise Clearance" section from the report — for that section, keep using the newest report row (index 0) as before; only the *clearance value* comes from the resolver. Do not restructure anything else.

- [ ] **Step 5: Typecheck + unit + lint**

Run: `npx tsc --noEmit && npm run test:unit && npm run lint`
Expected: all clean/green.

- [ ] **Step 6: End-to-end H-1 verification (the acceptance for Task 2a + this task)**

Via `execute_sql`, in one transaction you roll back, simulate the H-1 scenario at the DB layer:

```sql
begin;
-- Fixture: pick the seeded member with an assigned doctor+trainer, or build one:
-- insert an initial doctor report with clearance, then an "unchanged review" WITHOUT the key,
-- then verify the gate query resolves to the initial clearance.
insert into reports (member_id, type, content)
values ('<member-id>', 'doctor_initial', '{"title":"t","sections":[],"clearance":"cleared"}'),
       ('<member-id>', 'doctor_review',  '{"title":"t","sections":[]}');
select content->>'clearance' from reports
 where member_id = '<member-id>' and type in ('doctor_initial','doctor_review')
   and coalesce(content->>'clearance','') <> ''
 order by created_at desc limit 1;   -- must return 'cleared'
rollback;
```

Expected: `cleared` — an unchanged review no longer revokes clearance.

- [ ] **Step 7: Commit**

```bash
git add lib/clearance.ts lib/clearance.test.ts lib/reports/build/clinical.ts "app/(app)/clinician/clients/[id]/page.tsx" package.json
git commit -m "elevate(t1.3): clearance carry-forward in builder + shared resolveClearance mirror with parity tests"
```

---

### Task 4: Migration `0011_fail_closed_owners.sql` — S-2/S-3/S-4 + suite assertions

**Files:**
- Create: `supabase/migrations/0011_fail_closed_owners.sql`
- Modify: `supabase/tests/rls.test.sql` (add a suspended-caregiver persona block)

**Interfaces:**
- Consumes: `auth_role()` (NULL for suspended — `0002_rls.sql:6-10`) and the `is_member_self` template (`0008_member_portal.sql:11-16`).
- Produces: `is_caregiver_of` that fails closed for suspended/role-mismatched users. Every policy and RPC already calling it (`rep_cg`, `con_caregiver`, `con_cg_update`, `fr_cg`, `pkg_cg`, `cyc_read`, `asg_cg`, `mark_video_watched`, `submit_onboarding`, `get_care_team`) inherits the fix with no further edits.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0011_fail_closed_owners.sql`:

```sql
-- PHLOEM migration 0011_fail_closed_owners.sql — S-2/S-3/S-4 (CODE-REVIEW.md):
-- extend the auth_role() fail-closed discipline (0002) to caregiver ownership
-- and to the two owned-row policies that bypassed it. After this migration,
-- "suspend = instant lockout" is true for every persona, matching the
-- is_member_self pattern introduced in 0008.

-- S-2: is_caregiver_of now requires an ACTIVE caregiver-role profile.
-- auth_role() returns NULL for suspended accounts ⇒ fails closed.
create or replace function is_caregiver_of(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'caregiver'
     and exists (select 1 from members where id = m and caregiver_id = auth.uid())
$$;

-- S-2: the one policy that used the raw column instead of the helper.
drop policy mem_caregiver on members;
create policy mem_caregiver on members for select using (is_caregiver_of(id));

-- S-3: clinicians' own-draft policy — status-aware, and WITH CHECK so a row
-- can only be created/moved onto (respondent = self AND assigned member).
drop policy fr_own_clinical on form_responses;
create policy fr_own_clinical on form_responses for all
  using (auth_role() is not null and respondent_id = auth.uid())
  with check (auth_role() is not null and respondent_id = auth.uid()
              and is_assigned_to(member_id));

-- S-4: notifications — suspended users can no longer read or mark their rows.
drop policy notif_own on notifications;
create policy notif_own on notifications for all
  using (auth_role() is not null and user_id = auth.uid())
  with check (auth_role() is not null and user_id = auth.uid());
```

- [ ] **Step 2: Apply + regenerate + suites**

MCP `apply_migration` (`0011_fail_closed_owners`); regenerate types; run the §16 suite; `npx tsc --noEmit`. All green — note the existing suite must still pass unchanged (active caregivers keep exactly their prior access).

- [ ] **Step 3: Add the suspended-caregiver assertions to the suite**

Open `supabase/tests/rls.test.sql` and find the suspended-doctor block (~lines 247-265) — replicate its structure for the caregiver persona. Inside the suite's transaction, after the existing personas: suspend the seeded caregiver profile (`update profiles set status = 'suspended' where id = '<caregiver-uuid-var>'`), switch the JWT claims to the caregiver (same `set_config('request.jwt.claims', ...)` + `set local role authenticated` pattern the file already uses), then assert **0 rows** from: `members`, `member_contacts`, `reports`, `consultations`, `form_responses`, `notifications`, and that `get_care_team('<member-uuid>')` returns `[]` or empty. Then restore `status = 'active'` before the next persona (the whole file rolls back anyway, but keep the file's existing hygiene style). Use the file's existing assert helpers exactly as the other blocks do.

- [ ] **Step 4: Run the extended suite**

Run the §16 suite again. Expected: all original assertions + the new suspended-caregiver block pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_fail_closed_owners.sql supabase/tests/rls.test.sql lib/supabase/database.types.ts
git commit -m "elevate(t1.4): 0011 — fail-closed caregiver ownership, WITH CHECK on clinical drafts, status-aware notifications + suite coverage"
```

---

### Task 5: Migration `0012_hot_path_indexes.sql` — indexes + cron advisory lock

**Files:**
- Create: `supabase/migrations/0012_hot_path_indexes.sql`
- Reference: `supabase/migrations/0006_cycle_jobs.sql` (lines 211-363, `run_daily_jobs`)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_hot_path_indexes.sql`. Part one — indexes:

```sql
-- PHLOEM migration 0012_hot_path_indexes.sql — M-4 (CODE-REVIEW.md): the schema
-- had no secondary indexes; RLS helpers (is_assigned_to / is_caregiver_of) run
-- per-row EXISTS probes and the cron joins cycles→packages→members daily.

create index idx_assignments_care_user   on assignments (care_user_id) where active;
create index idx_assignments_member      on assignments (member_id) where active;
create index idx_members_caregiver       on members (caregiver_id);
create index idx_members_member_user     on members (member_user_id);
create index idx_consultations_member    on consultations (member_id);
create index idx_consultations_cycle     on consultations (cycle_id);
create index idx_reports_member_type     on reports (member_id, type);
create index idx_reports_cycle           on reports (cycle_id);
create index idx_cycles_package          on cycles (package_id);
create index idx_packages_member         on packages (member_id);
create index idx_form_responses_member   on form_responses (member_id, template_id);
create index idx_form_responses_cycle    on form_responses (cycle_id);
create index idx_form_responses_resp     on form_responses (respondent_id);
create index idx_notifications_user_unread on notifications (user_id, read_at);
create index idx_invites_token           on invites (token);
```

Part two — advisory lock. Copy the ENTIRE `run_daily_jobs` definition from `0006_cycle_jobs.sql` (from `create or replace function run_daily_jobs(p_today date default current_date)` at line 213 through its closing `end $$;`) verbatim, inserting ONE line directly after the authorization check. The check reads (0006:219):

```sql
  if auth.uid() is not null and auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
```

Insert after it:

```sql
  -- 0012: overlapping cron invocations (Vercel retry, manual + scheduled) serialize.
  perform pg_advisory_xact_lock(hashtext('phloem_run_daily_jobs'));
```

- [ ] **Step 2: Apply + regenerate + suites**

MCP `apply_migration` (`0012_hot_path_indexes`); regenerate types (no signature changes expected — diff should be empty or trivial); §16 suite; `npx tsc --noEmit`.

- [ ] **Step 3: Verify index use and lock behavior**

Via `execute_sql`:

```sql
explain analyze select * from reports where member_id = (select id from members limit 1);
```

Expected: an Index Scan on `idx_reports_member_type` (not Seq Scan). Then run MCP `get_advisors` (performance): previously-flagged unindexed-FK warnings should be gone.

Lock check: run `npm run cron:dev 2031-01-01` twice back-to-back (a far-future date whose jobs are all no-ops). Both return 200 with identical zero-count summaries; no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_hot_path_indexes.sql lib/supabase/database.types.ts
git commit -m "elevate(t1.5): 0012 — secondary indexes on all hot FKs + advisory lock on run_daily_jobs"
```

---

### Task 6: Typed RPC error registry

**Files:**
- Create: `lib/rpc-errors.ts`, `lib/rpc-errors.test.ts`
- Modify: `app/(app)/program-actions.ts` (lines 16-27), `app/(app)/clinician/clients/[id]/actions.ts` (RPC_MESSAGES ~31-37, submitFeedback ~55, friendly ~62-65), `app/(app)/portal/onboarding/[memberId]/actions.ts` (RPC_MESSAGES ~28-35), `app/(app)/notifications/actions.ts`, `package.json` (`test:unit`)

**Interfaces:**
- Produces: `RpcErrorCode` (string-literal union), `rpcErrorCode(error): RpcErrorCode | null`, `RPC_ERROR_COPY: Record<RpcErrorCode, string>`. Task 7's new RPC adds its codes here. All future actions use this module — never `message.includes()` inline.

- [ ] **Step 1: Create the registry**

Create `lib/rpc-errors.ts`:

```ts
/**
 * The §6 RPCs signal failures with uniform snake_case exception codes
 * (`raise exception 'not_allowed'` etc.). This registry is the single,
 * typed home for those codes and their user-facing copy. Postgres surfaces
 * the code inside error.message, so parsing is a substring match — but it
 * happens in exactly one place, and lib/rpc-errors.test.ts asserts the list
 * stays in sync with the migrations.
 */
export const RPC_ERROR_CODES = [
  "not_allowed",
  "not_found",
  "invalid_invite",
  "video_not_watched",
  "invalid_response",
  "role_mismatch_or_inactive",
  "not_scheduled",
  "meeting_not_done",
  "awaiting_doctor_clearance",
  "template_missing",
  "no_package_to_start",
  "initial_reports_incomplete",
  "not_active",
  "not_paused",
  "cannot_change_own_status",
] as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

export function rpcErrorCode(
  error: { message: string } | null | undefined
): RpcErrorCode | null {
  if (!error) return null;
  for (const code of RPC_ERROR_CODES) if (error.message.includes(code)) return code;
  return null;
}

/** Default user copy per code. Callers may override per-context. */
export const RPC_ERROR_COPY: Record<RpcErrorCode, string> = {
  not_allowed: "You don't have permission to do that.",
  not_found: "That record could not be found.",
  invalid_invite: "This invite link is invalid, expired, or already used.",
  video_not_watched: "Please watch the welcome video first.",
  invalid_response: "We couldn't find your saved answers. Please refresh and try again.",
  role_mismatch_or_inactive: "That professional's role doesn't match, or their account is inactive.",
  not_scheduled: "This consultation hasn't been scheduled yet.",
  meeting_not_done: "This meeting hasn't been marked done by the coordinator yet.",
  awaiting_doctor_clearance:
    "The doctor has not cleared this member for exercise yet — the form stays locked until then.",
  template_missing: "The form template is missing. Please contact support.",
  no_package_to_start: "There is no package ready to start for this member.",
  initial_reports_incomplete:
    "Doctor, nutritionist and trainer reports must all be submitted before starting the program.",
  not_active: "The program isn't active.",
  not_paused: "The program isn't paused.",
  cannot_change_own_status: "You can't change your own account status.",
};

export function rpcErrorMessage(
  error: { message: string } | null | undefined,
  fallback: string,
  overrides?: Partial<Record<RpcErrorCode, string>>
): string {
  const code = rpcErrorCode(error);
  if (!code) return fallback;
  return overrides?.[code] ?? RPC_ERROR_COPY[code];
}
```

- [ ] **Step 2: Write the sync test (fails if a migration adds a code the registry misses)**

Create `lib/rpc-errors.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RPC_ERROR_CODES, rpcErrorCode, rpcErrorMessage } from "./rpc-errors";

test("every raise exception code in the migrations is registered", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const codes = new Set<string>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/raise exception '([a-z_]+)[':]/g)) codes.add(m[1]);
  }
  const registered = new Set<string>(RPC_ERROR_CODES);
  const missing = [...codes].filter((c) => !registered.has(c));
  assert.deepEqual(missing, [], `codes raised in migrations but not registered: ${missing}`);
});

test("parses a code out of a real PostgREST-style message", () => {
  assert.equal(
    rpcErrorCode({ message: "awaiting_doctor_clearance" }),
    "awaiting_doctor_clearance"
  );
  assert.equal(rpcErrorCode({ message: "P0001: not_allowed" }), "not_allowed");
  assert.equal(rpcErrorCode({ message: "network timeout" }), null);
  assert.equal(rpcErrorCode(null), null);
});

test("overrides win, fallback covers unknowns", () => {
  assert.equal(
    rpcErrorMessage({ message: "not_allowed" }, "fallback", { not_allowed: "custom" }),
    "custom"
  );
  assert.equal(rpcErrorMessage({ message: "???" }, "fallback"), "fallback");
});
```

Add the file to `test:unit` in `package.json`:

```json
"test:unit": "tsx --test lib/red-flags.test.ts lib/clearance.test.ts lib/rpc-errors.test.ts",
```

Run: `npm run test:unit`. Expected: PASS. If the sync test reports a missing code, ADD it to `RPC_ERROR_CODES` and `RPC_ERROR_COPY` (do not weaken the test).

- [ ] **Step 3: Convert the consumers (behavior-preserving)**

**`app/(app)/program-actions.ts`** — replace the `CODES` array and `code()` function (lines 16-27) with:

```ts
import { rpcErrorCode, type RpcErrorCode } from "@/lib/rpc-errors";

// Redirect codes stay identical so the pages' ERROR copy maps keep working.
const REDIRECT_CODE: Partial<Record<RpcErrorCode, string>> = {
  initial_reports_incomplete: "initial_incomplete",
  no_package_to_start: "no_package",
  not_active: "not_active",
  not_paused: "not_paused",
  not_allowed: "not_allowed",
};
function code(message: string): string {
  const c = rpcErrorCode({ message });
  return (c && REDIRECT_CODE[c]) ?? "failed";
}
```

**`app/(app)/clinician/clients/[id]/actions.ts`** — retype the local map and rewrite `friendly()` and the `submitFeedback` error branch:

```ts
import { rpcErrorMessage, type RpcErrorCode } from "@/lib/rpc-errors";

const RPC_MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  awaiting_doctor_clearance:
    "The doctor has not cleared this member for exercise yet — the form stays locked until then.",
  meeting_not_done: "This meeting hasn't been marked done by the coordinator yet.",
  not_allowed: "You are not assigned to this member for this consultation.",
  template_missing: "The form template is missing.",
};

function friendly(message: string): string {
  return rpcErrorMessage({ message }, "Could not submit the form. Please try again.", RPC_MESSAGES);
}
```

and in `submitFeedback`, replace the `error.message.includes("not_allowed") ? ... : ...` ternary with:

```ts
    return {
      error: rpcErrorMessage(error, "Could not submit your feedback. Please try again.", {
        not_allowed: "You can only submit your own feedback for a member you're assigned to.",
      }),
    };
```

**`app/(app)/portal/onboarding/[memberId]/actions.ts`** — same conversion: retype its `RPC_MESSAGES` as `Partial<Record<RpcErrorCode, string>>` and make its `friendly()` delegate to `rpcErrorMessage` with those overrides.

**`app/(app)/notifications/actions.ts`** — surface failures instead of swallowing them: capture `const { error } = await supabase.from("notifications")...` in both actions and add `if (error) console.error("[notifications] update failed:", error.message);` before `revalidatePath`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run test:unit && npm run lint` — all green.
Then behavioral spot-check: with the dev server (`npm run dev`), as a seeded trainer whose member lacks clearance, submitting the consult form must still show the exact "doctor has not cleared" message (copy unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/rpc-errors.ts lib/rpc-errors.test.ts "app/(app)/program-actions.ts" "app/(app)/clinician/clients/[id]/actions.ts" "app/(app)/portal/onboarding/[memberId]/actions.ts" "app/(app)/notifications/actions.ts" package.json
git commit -m "elevate(t1.6): typed RPC error registry with migration-sync test; delete inline message matching"
```

---

### Task 7: Migration `0013_report_sharing.sql` — H-3 `set_report_sharing` + admin toggle

**Files:**
- Create: `supabase/migrations/0013_report_sharing.sql`
- Modify: `app/(app)/admin/members/actions.ts` (add action), `app/(app)/admin/members/[id]/page.tsx` (add sharing section), `lib/rpc-errors.ts` (+`not_shareable`), `supabase/tests/rls.test.sql` (+share-toggle assertions)

**Interfaces:**
- Consumes: `_audit` / `_notify` helpers (signatures visible in `0003_rpcs.sql:8-37`), `rpc-errors` registry from Task 6.
- Produces: `set_report_sharing(p_report uuid, p_share boolean)` RPC (admin-only), server action `setReportSharing(formData)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0013_report_sharing.sql`:

```sql
-- PHLOEM migration 0013_report_sharing.sql — H-3 (CODE-REVIEW.md): the §3
-- matrix gives caregivers doctor/performance reports "if share_with_caregiver",
-- and rep_cg (0002) enforces it — but no RPC/UI ever set the flag. §10 places
-- the toggle on the admin member page, so the RPC is admin-only (v1).

create or replace function set_report_sharing(p_report uuid, p_share boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_rep reports%rowtype; v_name text; v_cg uuid;
begin
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  select * into v_rep from reports where id = p_report for update;
  if not found then raise exception 'not_found'; end if;
  -- Only the gated types are toggleable; plan-type reports are always caregiver-
  -- visible via rep_cg, and wellbeing must never be shareable (§3).
  if v_rep.type not in ('doctor_initial','doctor_review','performance') then
    raise exception 'not_shareable';
  end if;
  update reports set share_with_caregiver = p_share where id = p_report;
  perform _audit(auth.uid(), 'report.sharing_set', 'report', p_report,
                 jsonb_build_object('share', p_share, 'type', v_rep.type));
  if p_share then
    select m.full_name, m.caregiver_id into v_name, v_cg
      from members m where m.id = v_rep.member_id;
    if v_cg is not null then
      perform _notify(v_cg, 'report_shared', 'A report was shared with you',
                      'A ' || replace(v_rep.type::text, '_', ' ') || ' report for '
                        || v_name || ' is now available.',
                      '/reports/' || p_report, 'share:' || p_report);
    end if;
  end if;
end $$;

revoke execute on function set_report_sharing(uuid, boolean) from public, anon;
grant execute on function set_report_sharing(uuid, boolean) to authenticated;
```

Before applying, open `0003_rpcs.sql:8-37` and confirm `_notify`'s parameter order matches the call above (`user, type, title, body, link, dedupe_key`). If it differs, match the actual signature.

- [ ] **Step 2: Apply + regenerate + register the new code**

MCP `apply_migration` (`0013_report_sharing`); regenerate types. Add `"not_shareable"` to `RPC_ERROR_CODES` and `RPC_ERROR_COPY` in `lib/rpc-errors.ts` (copy: `"Only doctor and performance reports can be shared — plans are always visible to the family."`). Run `npm run test:unit` — the sync test must pass.

- [ ] **Step 3: Server action**

In `app/(app)/admin/members/actions.ts`, add:

```ts
const sharingSchema = z.object({
  member_id: z.string().uuid(),
  report_id: z.string().uuid(),
  share: z.enum(["true", "false"]),
});

/** H-3: §6-style audited toggle; the RPC is the boundary (admin-only). */
export async function setReportSharing(formData: FormData): Promise<void> {
  const parsed = sharingSchema.safeParse({
    member_id: formData.get("member_id"),
    report_id: formData.get("report_id"),
    share: formData.get("share"),
  });
  if (!parsed.success) redirect("/admin/members?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_report_sharing", {
    p_report: parsed.data.report_id,
    p_share: parsed.data.share === "true",
  });
  revalidatePath(`/admin/members/${parsed.data.member_id}`);
  redirect(
    `/admin/members/${parsed.data.member_id}?${
      error ? "error=share_failed" : parsed.data.share === "true" ? "ok=shared" : "ok=unshared"
    }`
  );
}
```

Match the file's existing imports (`z`, `createClient`, `revalidatePath`, `redirect`) and its existing `?ok=/?error=` flash conventions; add `shared`/`unshared`/`share_failed` entries to the member page's `OKS`/`ERRORS` maps (`app/(app)/admin/members/[id]/page.tsx`, ~lines 32-51) with copy: "Report shared with the family." / "Report no longer shared." / "Could not update sharing.".

- [ ] **Step 4: Admin UI section**

In `app/(app)/admin/members/[id]/page.tsx`, add a "Family sharing" card. Fetch the member's gated reports (admin RLS sees all):

```ts
const { data: shareable } = await supabase
  .from("reports")
  .select("id, type, created_at, share_with_caregiver, cycle_id")
  .eq("member_id", id)
  .in("type", ["doctor_initial", "doctor_review", "performance"])
  .order("created_at", { ascending: false });
```

Render each row: human type label (`type.replace(/_/g, " ")`), `formatDateIST(created_at)` (helper already imported in this page or in `lib/datetime.ts`), a badge "Shared with family" when `share_with_caregiver`, and a one-button form:

```tsx
<form action={setReportSharing}>
  <input type="hidden" name="member_id" value={id} />
  <input type="hidden" name="report_id" value={r.id} />
  <input type="hidden" name="share" value={r.share_with_caregiver ? "false" : "true"} />
  <Button type="submit" variant="outline" size="sm">
    {r.share_with_caregiver ? "Stop sharing" : "Share with family"}
  </Button>
</form>
```

Follow the page's existing Card/section markup exactly (copy an adjacent card's structure). Empty state per §11: "No doctor or performance reports yet — they appear here once submitted."

- [ ] **Step 5: Suite assertions**

In `supabase/tests/rls.test.sql`, inside the transaction, using the seeded caregiver + member and a doctor report fixture (the suite already creates report fixtures — follow its pattern): assert as caregiver **0** doctor-type reports visible; then as service (reset role) `update reports set share_with_caregiver = true where id = '<fixture>'`; as caregiver assert **1** visible; set back to false; assert **0**. Also assert `has_function_privilege('anon', 'set_report_sharing(uuid, boolean)', 'execute')` is false (same style as the suite's existing function-privilege checks, ~lines 269-277).

- [ ] **Step 6: Verify**

§16 suite green (with new assertions); `npx tsc --noEmit`; `npm run lint`. Live check with `npm run dev`: admin member page shows the card; toggling flips the badge; as the seeded caregiver, `/reports/<id>` for that doctor report 404s when unshared and renders when shared.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0013_report_sharing.sql "app/(app)/admin/members/actions.ts" "app/(app)/admin/members/[id]/page.tsx" lib/rpc-errors.ts supabase/tests/rls.test.sql lib/supabase/database.types.ts
git commit -m "elevate(t1.7): 0013 — set_report_sharing RPC + admin family-sharing toggle (H-3 branch now live)"
```

---

### Task 8: `React.cache()` per-request dedupe

**Files:**
- Create: `lib/queries/session.ts`
- Modify: `app/(app)/layout.tsx` (~lines 24-38), `app/(app)/clinician/clients/[id]/page.tsx` (profile fetch ~line 73 and the three doctor-report fetch sites ~lines 290/317/548), `app/(app)/portal/page.tsx` (~lines 98-102)

**Interfaces:**
- Produces: `getSessionProfile()` — the ONLY way RSC pages/layouts read the current user's profile from now on (middleware keeps its own copy; different runtime). Tier 2's `lib/queries/*` DAL grows from this module.

- [ ] **Step 1: Create the memoized session query**

Create `lib/queries/session.ts`:

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request memoized auth user + profile (React.cache — one DB round-trip
 * per request no matter how many layouts/pages/actions call it). Deliberately
 * NOT cross-request cached: role/status changes (suspension!) must bite on the
 * very next request. Select is a superset of every current call site's needs.
 */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, status, specialization")
    .eq("id", user.id)
    .single();
  return profile;
});
```

- [ ] **Step 2: Convert the three RSC call sites**

In each of `app/(app)/layout.tsx`, `app/(app)/clinician/clients/[id]/page.tsx`, `app/(app)/portal/page.tsx`: find the block that calls `supabase.auth.getUser()` and then queries `profiles` by that id, and replace both with `const profile = await getSessionProfile();` keeping the surrounding null-handling/redirect logic identical (e.g. layout signs out/redirects when profile is null or suspended — preserve exactly). Do NOT touch `middleware.ts` or `login/actions.ts` (different runtime / pre-session context).

- [ ] **Step 3: Dedupe the clinician page's doctor-report fetches**

Task 3 already routed ClearancePanel and FormPanel through a `.limit(6)` doctor-reports query. Hoist that query into one module-level memo in `app/(app)/clinician/clients/[id]/page.tsx`:

```ts
const getDoctorReports = cache(async (memberId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("id, type, content, created_at")
    .eq("member_id", memberId)
    .in("type", ["doctor_initial", "doctor_review"])
    .order("created_at", { ascending: false })
    .limit(6);
  return data ?? [];
});
```

(`import { cache } from "react"` at top.) Point `DirectivesPanel` (~line 290), `ClearancePanel`, and `FormPanel`'s gate at `getDoctorReports(memberId)`, adapting each to take the newest row where it previously used a single `report`. The select list must be a superset of every panel's current needs — check `DirectivesPanel` before deleting its query and extend the select if it reads more columns.

- [ ] **Step 4: Verify**

`npx tsc --noEmit && npm run lint` clean. With `npm run dev`, load a clinician client page as the seeded doctor and the portal as the seeded caregiver — pages render identically to before. Temporarily add `console.log("profile fetch")` inside `getSessionProfile` before the query, load one page, confirm it logs once per request; remove the log.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/session.ts "app/(app)/layout.tsx" "app/(app)/clinician/clients/[id]/page.tsx" "app/(app)/portal/page.tsx"
git commit -m "elevate(t1.8): React.cache session profile + single doctor-reports fetch per clinician page render"
```

---

### Task 9: Close out Phase 1

- [ ] **Step 1: Full verification sweep**

Run, in order: `npx tsc --noEmit` · `npm run lint` · `npm run test:unit` · §16 suite (must include the Task 4 + Task 7 additions) · `npm run cron:dev 2031-01-01` (200, zero-count summary).

- [ ] **Step 2: Update the living documents**

In `docs/ELEVATION_BLUEPRINT.md`, mark Tier 1 rows done (add a `✅ done <date>` note per row). Record any divergences encountered in both documents.

- [ ] **Step 3: Commit**

```bash
git add docs/ELEVATION_BLUEPRINT.md docs/ELEVATION_EXECUTION_PLAN.md
git commit -m "elevate(phase-1): Tier 1 complete — verification sweep green, docs updated"
```

---

## Phase 2 & Phase 3 — directives (NOT yet expanded into steps)

Tier 2 (structural: DAL, Suspense, forms engine v2, ActionResult, lifecycle test, Realtime, observability, document engine) and Tier 3 (AI: foundation, drafted assessments, plain-language summaries, daily brief) are specified with files, interfaces, acceptance criteria, dependencies, and risks in `docs/ELEVATION_BLUEPRINT.md` §4.

**Rule for the executing agent:** before starting a Tier-2 or Tier-3 item, expand it into a task file of the same granularity as this document (bite-sized checkboxed steps, complete code, exact commands) at `docs/plans/tier2-<item>.md` / `docs/plans/tier3-<item>.md`, grounded in the then-current code, and get it approved. Do not implement Tier-2/3 items directly from the blueprint's summary lines — they intentionally omit code-level detail that must be derived from post-Tier-1 reality. Non-negotiables that survive any expansion:

- Tier-2 lifecycle test drives ONLY real RPCs (the `advance-demo.ts` pattern) and must fail on a deliberate revert of the 0010 gate fix.
- Tier-3 AI: server-only, caller's RLS client, no `member_contacts` access in any context-assembly module, drafts only, human signs, every generation audited, `AI_ENABLED` kill-switch.

## Divergences

(Record any plan-vs-reality discrepancies here as you execute, with the resolution taken.)
