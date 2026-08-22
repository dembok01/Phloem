# Care Continuum — design spec

**Date:** 2026-08-18 · **Branch:** `feature/care-continuum` · **Status:** ✅ built and verified (2026-08-19) — see PROGRESS.md "Care Continuum" for results

Extends the shipped 8-phase system (`PHLOEM-BUILD-SPEC.md` remains the source of
truth for everything already built; this spec governs only what is added here).
Five workstreams, built in order — each ends with its acceptance checks and the
§16 RLS suite green before the next begins.

Non-goal, explicitly dropped by the owner: **Focuni / external consultant
integration**. Not designed, not built, not stubbed.

---

## Governing constraints (unchanged, and this spec obeys them)

1. **Postgres is the boundary.** Every new read path that crosses a permission
   line is an RLS policy or a security-definer RPC. UI checks stay cosmetic.
2. **Contact isolation is structural.** `member_contacts` stays the only home for
   identifiers; nothing added here carries a phone, email, or address into a
   clinician-readable row.
3. **Psych confidentiality is structural.** Wellbeing content never reaches a
   non-psychologist surface. Where a new surface would blur that, the
   psychologist is excluded from the surface rather than filtered inside it.
4. **Workflow state changes go through RPCs** (§0.4). No raw table updates from
   server actions.
5. **Migrations are repo files first**, then applied via MCP `apply_migration`.
6. TypeScript strict, no `any`, Zod on every server-action input.

---

## W1 — Reports, timeline, improvement tracking

### W1.1 Measure catalog

The templates already collect a longitudinal measure set; nothing names it. A
seeded catalog turns scattered `form_responses.answers` keys into tracked series.

```
measure_catalog(
  measure_key text primary key,     -- 'sit_to_stand'
  template_key text not null,       -- source template
  field_id text not null,           -- key inside answers
  domain text not null,             -- clinical | training | nutrition | psych
  label text not null,
  unit text,
  higher_is_better boolean,         -- null = neutral/no direction
  family_safe boolean not null,     -- may a caregiver see it
  sort int not null default 0
)
```

Seeded rows (v1):

| measure_key | template(s) | domain | unit | higher_is_better | family_safe |
|---|---|---|---|---|---|
| `weight_kg` | onboarding, doctor_initial, doctor_review(v2) | clinical | kg | null | yes |
| `pulse` | doctor_initial, doctor_review(v2) | clinical | bpm | null | no |
| `bp_systolic` / `bp_diastolic` | doctor_initial, doctor_review(v2) | clinical | mmHg | null | no |
| `falls_12mo` | doctor_initial | clinical | falls | false | no |
| `sit_to_stand` | trainer_initial, trainer_review, feedback_training | training | reps | true | yes |
| `balance_seconds` | trainer_initial, trainer_review, feedback_training | training | s | true | yes |
| `tug_seconds` | trainer_initial, trainer_review | training | s | **false** | yes |
| `training_adherence` | feedback_training | training | /5 | true | yes |
| `sessions_completed` | feedback_training | training | sessions | true | yes |
| `nutrition_adherence` | feedback_nutrition | nutrition | /5 | true | yes |
| `kcal_target` / `protein_target_g` / `hydration_l` | nutritionist_* | nutrition | — | null | yes |
| `mood`, `sleep_quality`, `stress_level`, `social_connection`, `engagement_purpose`, `motivation_program` | psych_checkin | psych | /5 | true (stress: false) | **no** |

`bp` is stored as free text (`"128/82"`); the catalog declares a `parse` of
`systolic`/`diastolic` handled in the extractor, not a template change.

### W1.2 `get_measure_series(p_member uuid, p_domain text default null)`

Security-definer RPC, **the access boundary**, modelled on `get_onboarding_scoped`:

- `auth_role()` resolves the caller; NULL role → empty (fail closed, per `0017`).
- admin → all domains. doctor → clinical + training + nutrition (assigned only).
  nutritionist → nutrition + clinical-subset. trainer → training + clinical-subset.
  **psychologist → psych only.** caregiver / member → `family_safe` only.
  coordinator → none (matrix: no clinical data).
- Returns `(measure_key, label, unit, higher_is_better, at timestamptz,
  cycle_number int, value numeric, source text)` ordered by measure then `at`.
- Direction-aware improvement is computed in TS from `higher_is_better`; the RPC
  returns facts, not judgements.

### W1.3 `doctor_review.v2` — vitals continuity

`doctor_review.v1` captures **no vitals**, so the doctor's own monthly review
contributes nothing to any series. v2 adds a Vitals section reusing the exact
field ids from `doctor_initial` (`bp`, `pulse`, `weight_kg`, `sugar_hba1c`) so the
series is continuous across initial → review. Templates are keyed `(key, version)`
and resolved by `active`; v1 is deactivated, historical responses keep their own
`template_id`. No data migration.

### W1.4 Cases (`member_cases`)

A "case" is a clinical problem carried over time.

```
member_cases(id, member_id, title, detail, status open|monitoring|resolved,
             severity low|medium|high, opened_at, opened_by, resolved_at,
             resolved_by, source_report uuid)
member_case_events(id, case_id, at, kind, summary, ref_type, ref_id, actor_id)
```

- Auto-seeded from the doctor's `problem_list` repeat-group on `doctor_initial`
  submit (inside `submit_clinical_form`, so it is one transaction with the report).
- Doctor may open / update / resolve a case and link a review note to it.
- RLS: admin full; doctor full on assigned members; nutritionist + trainer read;
  psychologist none; caregiver read only cases marked `share_with_caregiver`.
- Case timeline = `member_case_events` + measurements in the case's domain.

### W1.5 Timeline

`MemberTimeline` rebuilt as a real clinical timeline: month-grouped, kind-filterable,
sourced from consultations, reports, cases, red-flag transitions, documents,
measurements, program events (activation, pause/resume, cycle boundaries, renewal).
Every source is read under the caller's own RLS — the component adds no privilege.
Psych entries render as *"Wellbeing check-in completed — {date}"* for every role
except psychologist and admin (§3).

### W1.6 `progress_summary` report

New `report_type` value. The timeline-based report, and the family's monthly artifact.

Sections, in order:
1. `plain_language` — what changed this month, in family language (lead).
2. `timeline` (new kind) — dated entries for the cycle.
3. `measure_trend` (new kind) — per measure: sparkline, current, Δ vs baseline,
   Δ vs previous, direction-aware improve/decline wording.
4. `comparison` (new kind) — this cycle vs previous, two-column.
5. Cases — open / resolved this cycle.
6. Adherence — training + nutrition.

Contains **only** content every permitted viewer may see: no psych measures, no
contact identifiers. Generated at cycle close by the cron and on demand by
admin/doctor. `share_with_caregiver` defaults **true** for this type — it is
designed as the family's report. Visibility mirrors `performance` (§3 row):
admin ✅ · doctor/nutritionist/trainer 👁 · caregiver 🔸 per share flag ·
coordinator status only · psychologist ❌.

### W1.7 Report view + PDF

Three new `ReportSection` kinds — `measure_trend`, `timeline`, `comparison` — all
rendered with **pure inline SVG** (the existing `components/charts/sparkline.tsx`
pattern), never recharts, because the same components must render through
`renderToStaticMarkup` into puppeteer with no client JS. Additive to the union;
existing report types emit none of them and render byte-identically.

View also gains: sticky header (member · type · cycle · version), section TOC on
wide screens, "compare with previous version" when `supersedes` is set, and
print-clean page numbering in the PDF band.

---

## W2 — Care-team / family communication

### W2.1 Model

```
threads(id, member_id, kind, subject, audience care_role[] null,
        case_id uuid null, status open|resolved, created_by,
        created_at, last_message_at)
thread_messages(id, thread_id, author_id, body text, created_at, edited_at)
thread_reads(thread_id, user_id, last_read_at)   -- unread counts
```

`kind ∈ care_team | family | case | psych`.

Access is **derived from role + assignment** (`is_assigned_to`, `is_caregiver_of`),
not a participants table that can drift:

| kind | admin | coordinator | doctor/nutri/trainer | psychologist | caregiver |
|---|---|---|---|---|---|
| `care_team` | ✅ | ✅ | ✅ assigned | ❌ | ❌ |
| `family` | ✅ | ✅ | ✅ assigned, ∩ `audience` | ❌ | ✅ own member |
| `case` | ✅ | ❌ | ✅ assigned | ❌ | ❌ |
| `psych` | ✅ | ❌ | ❌ | ✅ assigned | ❌ |

**Assumption (logged):** the psychologist is excluded from `care_team` and
`family` threads rather than filtered within them. Other participants' messages
would otherwise carry onboarding health answers into a role the matrix grants only
🔸-minimal access, and no in-thread filter can be trusted to hold that line. The
psychologist's channel is `psych` (psychologist ↔ admin), mirroring the existing
psych-escalation-to-admin precedent.

### W2.2 RPCs

- `start_thread(p_member, p_kind, p_subject, p_audience, p_case)` → thread id.
  Validates the caller may open that kind for that member.
- `post_message(p_thread, p_body)` → message id. Validates thread visibility,
  writes the row, bumps `last_message_at`, notifies the other side with a
  dedupe key (`msg:{thread}:{message}`), audits.
- `mark_thread_read(p_thread)`.
- `resolve_thread(p_thread)` — coordinator/admin/author.

Realtime: `threads` + `thread_messages` added to the publication (pattern from
`0020_realtime_notifications`).

### W2.3 Surfaces

- **Portal:** "Ask your care team" — compose with a role picker (or "anyone"),
  thread list, unread badge. Plain language, portal type scale.
- **Clinician:** Messages tab on the client page + an inbox count in the shell.
- **Coordinator:** all threads for a member on the member page; can resolve.
- **Admin:** full visibility, including `psych`.

---

## W3 — Patient activity

### W3.1 Activity + engagement

```
activity_events(id, member_id, actor_id, kind, at, meta jsonb)
```

`kind ∈ portal_visit | report_view | form_submit | document_upload |
message_sent | checkin_response | consult_attended`.

Written through `record_activity(p_member, p_kind, p_meta)` (security definer,
callable by authenticated; validates the caller may touch that member).
`log_report_view` also emits one.

**Engagement is derived, never stored as a status:**
`engagement_state(member) ∈ engaged | quiet | at_risk`
- `engaged` — family activity within 14 days.
- `quiet` — 14–28 days, or one missed consult.
- `at_risk` — >28 days, or two missed consults, or feedback overdue >7 days.

Exposed by `get_engagement(p_member)` and a set-returning
`list_engagement()` for the coordinator/admin queues. **Deliberately not named
"inactive"** — `member_status.inactive` already means "package completed", and
colliding the two would make both unreadable.

### W3.2 Dynamic check-in link

```
checkin_links(id, member_id, token uuid unique, created_by, expires_at,
              revoked_at, last_used_at, uses int)
```

- Coordinator/admin/doctor creates one; it is shared over WhatsApp using the
  existing `wa.me` helper.
- Public route `/c/[token]` — **unauthenticated**. It never opens RLS: the page
  and the submit both go through `anon`-executable security-definer RPCs
  (`get_checkin_link(p_token)`, `submit_checkin(p_token, p_answers)`) that
  validate token + expiry + revocation and return only the member's **first name**.
- Writes a `family_checkin` template response + an `activity_event`; a concern
  answer notifies the coordinator and the assigned doctor.
- Hardening: expiry default 7 days, revocable, one submission per token per day,
  `uses` counter, and no enumeration surface (invalid token → the same generic page).

### W3.3 Monthly report for the family

`progress_summary` (W1.6) is the monthly artifact: generated at cycle close,
`share_with_caregiver` true, plain-language lead, caregiver notified with a deep
link. No second report type.

### W3.4 Quiet-case flags

Cron job 7: `at_risk` for the first time → notify coordinator; still `at_risk`
after 7 more days → escalate to admin. Deduped weekly
(`quiet:{member}:{iso-week}`). Coordinator gets a "Quiet families" queue; admin
gets a tile; the doctor sees it as an issue indicator (W5).

---

## W4 — Program lifecycle

### W4.1 Renewal

```
renewals(id, member_id, package_id, proposed_months int, status,
         proposed_by, proposed_at, note, decided_by, decided_at,
         decision_note, completed_package uuid)
```
`status ∈ proposed | interested | declined | completed | expired`.

- `propose_renewal(p_member, p_months, p_note)` — coordinator/admin.
- `respond_to_renewal(p_renewal, p_intent, p_note)` — caregiver
  (`interested` | `declined`). Notifies coordinator + admin.
- `complete_renewal(p_renewal)` — coordinator/admin. Wraps the existing
  `reactivate_member(member, months)`, which already creates the new package and
  four fresh consultations; no activation logic is duplicated.

**No payments** (owner decision). The renewal card presents duration options and
what continues; money is handled off-platform.

### W4.2 Ending indicators

`GrowthRings` gains an `ending` state — the final ring in Honey once the package
is within 14 days of `end_date`. The signature mark carries the message; no new
badge vocabulary. Alongside it, an explicit plain-language day count on the portal
hero, the coordinator member page, the doctor's member card, and the admin tile.

Cron: at T-14, `member_status → renewal_due` (already built) **and** auto-create a
`proposed` renewal row at the current duration so the coordinator has something to
act on; at T-7 with no response, escalate to admin.

---

## W5 — Doctor experience

### W5.1 Issue indicators

One computation, `lib/issues.ts`, over data the doctor's RLS already grants:

| issue | severity | source |
|---|---|---|
| High red flag, no clearance decision | danger | `red_flags` + `resolveClearance` |
| Adverse event this cycle | danger | `feedback_training.adverse_events` |
| Measure deterioration beyond threshold | warning | `get_measure_series` + direction |
| Consultation done, report pending >72h | warning | consultations |
| Family `at_risk` | warning | `get_engagement` |
| Program ending ≤14 days | info | packages |
| Unread messages | info | `thread_reads` |

Rendered as a compact indicator strip — icon + tint + text, never colour alone
(§5 of DESIGN-SYSTEM).

### W5.2 Doctor dashboard

`/clinician/clients` becomes a dashboard for the doctor role (other clinical roles
keep the queue list, which already fits their day):

- **Today** — consults today with join/mode, inline mark-done.
- **Decisions only you can make** — clearance queue (already built, promoted).
- **Issues** — the strip above, grouped by severity, each row a deep link.
- **Trends worth a look** — members whose measures moved beyond threshold.
- Then the existing four queues.

### W5.3 Client page

Adds **Trends** (measure series with direction-aware deltas), **Cases**
(case-wise timeline), **Messages** tabs. Clinical fields show the previous value
as reference text beside the input (*"last month: 128/82"*) — **never prefilled**.
Copy-forward is a known charting hazard; reference text gives the speed without
the risk.

---

## Migration plan

| # | file | contents |
|---|---|---|
| 0022 | `0022_measures.sql` | `measure_catalog` + seed, `get_measure_series` |
| 0023 | `0023_cases.sql` | `member_cases`, `member_case_events`, RLS, RPCs, `submit_clinical_form` hook |
| 0024 | `0024_threads.sql` | `threads`, `thread_messages`, `thread_reads`, RLS, RPCs, realtime |
| 0025 | `0025_activity.sql` | `activity_events`, `record_activity`, engagement functions |
| 0026 | `0026_checkin_links.sql` | `checkin_links`, anon RPCs, `family_checkin` template |
| 0027 | `0027_renewals.sql` | `renewals`, RPCs, cron additions |
| 0028 | `0028_progress_report.sql` | `progress_summary` enum value + builder + RLS policies |

Each is a repo file first, then applied via MCP. `npm run test:rls` must stay
green after every one, with new assertions added per workstream.

## Verification per workstream

1. **W1** — series RPC returns per-role correct domains (7 assertions); v2 template
   active and v1 responses still readable; `progress_summary` generated and
   renders in web + PDF; caregiver sees it, psychologist does not.
2. **W2** — each thread kind visible to exactly the roles in the table above
   (12 assertions); psychologist reads 0 `care_team`/`family` threads; caregiver
   reads 0 `care_team`; unread counts correct.
3. **W3** — engagement transitions at the day boundaries; check-in link works
   unauthenticated, rejects expired/revoked/second-use-today; anon still has no
   Data API access after the new grants.
4. **W4** — propose → respond → complete produces a new package + 4 consults with
   prior reports intact; T-14 cron creates exactly one renewal row (idempotent).
5. **W5** — issue strip matches a hand-computed fixture; doctor dashboard renders
   for a doctor with real assignments.

Plus, throughout: `npm run typecheck`, `npm run lint`, `npm run test:unit`, and
the §16 suite green before each workstream is called done.


---

## Divergences from this spec, as built

1. **`progress_summary` carries family-safe measures only.** The spec left the
   audience question open by making one artifact serve both the family and the care
   team. Built as: the report is the FAMILY's monthly artifact (shared by default,
   plain-language lead) and therefore excludes vitals and psych entirely; the care
   team gets full fidelity live in the Trends tab. One artifact, honest permissions,
   no leak surface in a document designed to be forwarded.

2. **Migration numbering shifted.** The spec's table listed 0022–0028; the build used
   0022–0033, because the `progress_summary` enum value needed its own migration
   (Postgres forbids referencing a new enum value in the transaction that adds it),
   the quiet-family and renewal cron jobs became their own RPCs rather than edits to
   the hardened `run_daily_jobs`, and `0033` closes an anon-execute regression that
   `0029` introduced.

3. **`complete_renewal` is admin-only.** The spec assigned it to
   "coordinator/admin". §3 gives reactivation to admin alone, and completing a
   renewal creates a package — so the build follows the matrix, and the coordinator
   sees the button as a disabled note explaining the handover.

4. **Cron job 7/8 are separate RPCs.** `flag_quiet_families` and
   `open_due_renewals` are called by the cron route alongside `run_daily_jobs`
   rather than folded into it: reproducing ~100 lines of hardened §9 logic verbatim
   to add one loop would put every existing job at risk for no benefit.
