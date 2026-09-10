# Post-enrolment record correction — design

**Date:** 2026-09-10
**Status:** approved, awaiting implementation plan
**Relationship to the spec:** `PHLOEM-BUILD-SPEC.md` remains the source of truth.
This document adds a capability §15 never covered and changes no §3 permission.

---

## 1 · Problem

Every identity field in PHLOEM is write-once at enrolment and then frozen.

| Field | Written by | Editable afterwards |
|---|---|---|
| `members.full_name, age, gender, language, occupation, city, country, relationship_to_caregiver` | `create_member_with_invite`, then overwritten once by `submit_onboarding` (`0003_rpcs.sql:172`) | no RPC, no UI, no role |
| `member_contacts.*` | `submit_onboarding` upsert only | no UI — **though `con_cg_update` already permits it** |
| `profiles.full_name, phone, whatsapp` | `accept_invite` at signup (`0003_rpcs.sql:120`) | nothing anywhere |

Consequences observed today:

- Correcting a typo in a member's name requires **deleting the member and
  re-enrolling them** — the same mis-enrolment path migration `0034` was built
  to clean up after.
- `0002_rls.sql:58` grants caregivers `UPDATE` on `member_contacts`. No code has
  ever called it. The permission exists; the screen does not.
- There is no `/account` or `/settings` route for any role. The header in
  `app/(app)/layout.tsx` is a name, a role chip and Sign out — nothing clickable.
- `/admin/members/[id]` renders **no contact identifiers at all**. When a family
  telephones the office, the admin has no screen showing their number, despite
  §3 granting admin `✅ full` on contact identifiers.

## 2 · Scope

In scope (one coherent subsystem: correcting a record after enrolment):

1. Edit member demographics and contacts.
2. An account page for every role: own name, phone, WhatsApp, password.
3. Admin edit of a care-team professional's profile.
4. Change the login email — self-service and admin-initiated.
5. Transfer a member to a different caregiver.
6. Amend submitted onboarding answers.

Explicitly deferred to later specs: role changes for an existing user, a
caregiver-account list, invites for coordinators/admins, report
regenerate/supersede as an admin control, cycle overrides, audit-log filtering
and export, system-health surfaces, and any configuration UI.

## 3 · Permission-matrix impact: none

Admin is already `✅ full` and caregiver `✅ own` for both member demographics
and contact identifiers. This work **implements** those cells rather than
widening them. Coordinator is `👁` and is therefore given no write path here; a
coordinator edit would be a genuine §3 divergence and is out of scope.

Clinicians gain nothing. `member_contacts` remains a table their policies do not
cover — the structural mechanism behind the §3 rule that clinicians never see
contact identifiers.

## 4 · Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Family edit rights | Split by field | Contacts and soft demographics are the family's own data; name/age/gender are what clinicians read and reports print. |
| Enforcement shape | One jsonb-patch RPC per entity, role-gated inside the function | Matches every existing §6 RPC. The alternative (typed RPC per role) reproduces `create_member_with_invite`'s 17-positional-argument problem; direct `UPDATE` under RLS cannot express the field split, because Postgres column grants are per database role and every app user is `authenticated`. |
| Forbidden field in a patch | Raise, do not silently drop | The UI mirror should never send one; if it does, that is a bug worth surfacing. |
| Fields a role may see but not edit | Rendered disabled with a one-line reason | A family screen that silently omits the member's age reads as a bug and generates the support call the feature exists to prevent. |
| `specialization` | Admin-only, not self-editable | Coordinators read it when choosing who to assign. |
| Demographics duplicated in `answers` | The edit RPC mirrors them | `get_onboarding_scoped` hands the whole answers blob to admin, the caregiver and the assigned doctor, and per §4 demographics stay in it. Editing `members` alone would show a doctor a stale age in one panel and a fresh one in another. |

---

## 5 · Data layer — migration `0035_record_correction.sql`

The four core edit RPCs live here. The later workstreams carry their own
migrations so each stage in §12 ships independently: `0036` for the email sync
(§8), `0037` for the transfer plus the `accept_invite` fix (§9), `0038` for the
amendment (§10).

House style throughout: `security definer`, `set search_path = public`,
snake_case exception codes, `_audit(...)` on success, and a
`revoke execute … from public, anon` line per the `0033` lockdown.

**Every one of these four RPCs opens with `if auth_role() is null then raise
exception 'not_allowed'; end if;`** — see §9.

### 5.1 `update_member(p_member uuid, p_patch jsonb) returns void`

| Caller | May patch |
|---|---|
| `admin` | `full_name, age, gender, language, occupation, city, country, relationship_to_caregiver` |
| caregiver (`is_caregiver_of(p_member)`) | `language, occupation, city, country` |
| any other role | `not_allowed` |

- A key outside the caller's list raises `field_not_allowed`.
- An empty patch, or one that changes nothing, raises `no_changes`.
- `full_name` is trimmed and must be non-empty → `name_required`.
- `age` must be between 1 and 120 → `bad_age`.
- **A rename re-runs `_norm_name` against the `0034` duplicate guard** and raises
  `duplicate_member` on a collision. Without this, editing becomes a back door
  into the duplicate state `0034` closed.
- On success, the same keys are written into the latest submitted onboarding
  `form_responses.answers` for this member, so `get_onboarding_scoped` and the
  member header cannot disagree. If the member has no submitted onboarding
  response, this step is skipped.
- Audits `member.updated` with `{ before, after }` restricted to changed keys.

### 5.2 `update_member_contacts(p_member uuid, p_patch jsonb) returns void`

- Callers: `admin`, or `is_caregiver_of(p_member)`. Everyone else `not_allowed`.
- Fields: `phone, whatsapp, email, address, pin_code, emergency_contact_name,
  emergency_contact_phone` — the same full set for both callers.
- Upserts, because a member enrolled but not yet onboarded has no contacts row.
- **Audits changed field NAMES only, never values.** `member_contacts` being a
  separate table is the one structural guarantee keeping identifiers away from
  clinicians; copying phone numbers into `audit_log` would move them back out of
  it. This asymmetry with 5.1 is deliberate.

### 5.3 `update_my_profile(p_patch jsonb) returns void`

- Any authenticated role, own row only (`id = auth.uid()`).
- Fields: `full_name, phone, whatsapp`. Not `email` (see §7), not `role`, not
  `status`, not `specialization`.
- Audits `profile.updated`.

### 5.4 `admin_update_profile(p_user uuid, p_patch jsonb) returns void`

- `admin` only.
- Fields: `full_name, phone, whatsapp, specialization`.
- Not `role` and not `status`: status has `set_account_status`, and role changes
  are out of scope.
- Audits `profile.updated` with the target user as the entity.

### 5.5 Error registry

`lib/rpc-errors.ts` gains `field_not_allowed`, `name_required`, `bad_age`,
`no_changes`. Reused across `0035`–`0038`: `not_allowed`, `not_found`, `duplicate_member`,
`role_mismatch_or_inactive`, `summary_required`, `invalid_response`.
`lib/rpc-errors.test.ts` already asserts the registry matches the migrations, so
this stays honest without new machinery.

---

## 6 · Field manifest — `lib/member-fields.ts`

A new module declaring, per field: key, label, input type, options (gender,
language), and `editableBy: UserRole[]`.

It is a **cosmetic mirror** of the SQL whitelist in the `lib/permissions.ts`
tradition — the enforcement boundary stays in the RPC. A unit test asserts the
manifest and the migration's whitelist do not drift.

One manifest drives every edit form in §7, so adding a field later is a change in
two places rather than six.

---

## 7 · UI surfaces

### 7.1 `<EditRecordSheet>` — the shared component

Manifest-driven form inside `components/ui/sheet.tsx`, modelled on
`components/coordinator/schedule-sheet.tsx`, which is already the house pattern
for "act without leaving the page" (focus trap, portal, scroll lock, dismissal
all come from Base UI's Drawer).

Takes a field group, the current values and a server action. Renders editable
inputs for fields the caller may change and **disabled inputs with a one-line
reason** for fields they may see but not change. Submits through `SubmitButton`
with `pendingText`, and toasts the `ActionResult`.

### 7.2 `/admin/members/[id]`

- `PageHeader` gains an **Edit details** action opening the demographics group.
- A new **Contact details card**, placed above Care team: phone, WhatsApp,
  email, address, PIN, emergency contact, plus the linked caregiver's name and
  number, with its own Edit. This card closes the gap described in §1 — the page
  currently queries `member_contacts` not at all.

### 7.3 `/portal` — a "Their details" card

Beneath the existing member header. Contacts and the four soft demographic
fields carry Edit; `full_name`, `age` and `gender` render disabled with "Your
coordinator can change this". Elderly-mode typography comes from the shell.

### 7.4 `/account` — new route, every role

`app/(app)/account/page.tsx`: own name, phone, WhatsApp, password change, and
the email change from §8.

**No middleware change is required.** The shell guard in `middleware.ts` only
fences paths under `APP_PREFIXES`; `/account` is reachable by any signed-in user
exactly as `/notifications` and `/reports/[id]` already are.

Reaching it needs one change to `app/(app)/layout.tsx`: the name + role chip
becomes a small menu holding **Account** and **Sign out**, reusing the menu
primitive in `components/care-team-switcher-menu.tsx` rather than introducing a
second one.

Password change uses `supabase.auth.updateUser({ password })` on an
already-authenticated session — it does not go through the emailed recovery
flow, which stays as-is for people who are locked out. The form asks for the
current password first and verifies it with `signInWithPassword`, because
Supabase does not require it: without that step, anyone reaching an unattended
logged-in device could silently take the account over.

### 7.5 `/admin/care-team`

`CareTeamTable` already carries suspend/reactivate row actions. **Edit profile**
joins them, opening the same sheet against `admin_update_profile`.

---

## 8 · Changing the login email

### 8.1 Self-service

`supabase.auth.updateUser({ email })` from `/account`, which mails a
confirmation link.

`app/auth/confirm/route.ts` currently rejects anything that is not
`type === "recovery"` and hard-codes `/reset-password` as the destination — a
deliberate defence so no `next` parameter can smuggle an off-site redirect. It
gains a **second fixed pair**: `email_change` → `/account?ok=email`. The
type→destination mapping stays closed; no general redirect is introduced.

That route then calls a new `sync_my_email()` RPC, which sets
`profiles.email` from the authenticated user's `auth.users.email` and audits
`profile.email_changed`. Running as the now-authenticated user means the audit
row carries a real actor.

### 8.2 Admin-initiated

For a family that has lost access to its inbox. A server action using the
existing service-role client (`lib/supabase/admin.ts`):

1. `auth.admin.updateUserById(id, { email, email_confirm: true })`
2. then the audited `admin_set_profile_email(p_user, p_email)` RPC.

Auth first, then profiles, deliberately: `profiles.email` is display and record
only and is never the login credential, so a failure between the two steps
leaves a cosmetic mismatch the admin can re-apply — not a locked-out user.

---

## 9 · Transferring a caregiver

### 9.1 To an existing account

`transfer_caregiver(p_member uuid, p_new_user uuid)` — `admin` only:

- validates that `p_new_user` is an active profile with role `caregiver`,
  raising the existing `role_mismatch_or_inactive` if not, and `not_found` if
  the member does not exist;
- flips `members.caregiver_id`;
- audits `member.caregiver_transferred` with from/to;
- notifies both the outgoing and incoming caregiver.

Access moves immediately, because every gate in the system reads
`is_caregiver_of()`. The admin UI states plainly that the outgoing caregiver
loses access to this record on confirmation. Their account is untouched — they
may still be caregiver for another member. `members.member_user_id` (the elderly
person's own view-only login) is untouched.

### 9.2 To someone with no account yet

An invite bound to the member, created from the member page and visible on
`/admin/invites`. The invite row **is** the pending state; no new status is
introduced, and the outgoing caregiver keeps access until the new one accepts.

### 9.3 Bug fixed en route

`accept_invite` (`0003_rpcs.sql:123`) runs
`update members set caregiver_id = p_user_id, status = 'signed_up'`
**unconditionally**. Accepting a caregiver invite for an already-active member
would throw them back to `signed_up` and derail the lifecycle machine. The status
write becomes conditional on the member still being `invited`; `caregiver_id` is
still always set.

---

## 10 · Amending onboarding answers

Not a wizard re-run: resetting an active member's status to `onboarding` would
fight the §9 lifecycle machine.

`amend_onboarding(p_member uuid, p_patch jsonb, p_reason text)` — `admin` only,
`p_reason` required (`summary_required` if blank; `invalid_response` if the
member has no submitted onboarding to amend):

1. clones the latest submitted `form_responses` row for this member with the
   patch applied, `submitted_at = now()`, `respondent_id = auth.uid()`;
2. recomputes `members.red_flags` through the existing `_red_flags`;
3. writes a **new** `onboarding_summary` report with `version = old.version + 1`
   and `supersedes = old.id` — the first use of those two schema columns, which
   have been dormant since `0001`;
4. audits `onboarding.amended` with the reason and the changed keys — keys, not
   values;
5. notifies the assigned doctor and the coordinator that red flags were
   rechecked.

`get_onboarding_scoped` already selects `order by fr.submitted_at desc limit 1`,
so **every clinician view picks up the amendment with no code change**.

UI: a new `/admin/members/[id]/onboarding` route reusing
`components/forms/DynamicForm.tsx` pre-filled with current answers plus a
mandatory reason field. The onboarding schema is far too large to place in a
sheet honestly.

The reports card on `/admin/members/[id]` gains a superseded-version affordance
(`v2 · supersedes v1`, the older row marked superseded). The PDF regenerates on
demand through the existing `/api/reports/[id]/pdf` route.

---

## 11 · Verification

### 11.1 The fail-closed rule

Per `0017_rpc_fail_closed`: `auth_role()` returns NULL for a suspended profile,
and a guard written as `if auth_role() not in (...)` evaluates to NULL, so the
`IF` is skipped and **the function proceeds**. A suspended admin bypassed every
write-path check within their unexpired-JWT window.

Eight new write RPCs across `0035`–`0038` is eight new chances to reintroduce that bypass. Each one
therefore opens with an explicit `if auth_role() is null then raise exception
'not_allowed'; end if;`, and ownership checks go through the strict-boolean
`is_caregiver_of()`.

### 11.2 §16 RLS suite additions

| Case | Expected |
|---|---|
| clinician calls `update_member` | `not_allowed` |
| caregiver patches `full_name` | `field_not_allowed` |
| caregiver patches a member that is not theirs | `not_allowed` |
| coordinator calls `update_member_contacts` | `not_allowed` |
| **suspended admin calls each of the eight new RPCs** | `not_allowed` |
| rename colliding with an existing member | `duplicate_member` |
| non-admin calls `amend_onboarding` / `transfer_caregiver` | `not_allowed` |

Results pasted into `PROGRESS.md` per §16 discipline.

### 11.3 Unit tests

- `lib/member-fields.ts` manifest matches the SQL whitelist.
- `lib/rpc-errors.ts` matches the migration (existing test, extended list).
- Patch-building helpers drop unchanged keys, so `no_changes` is reachable only
  when the user genuinely changed nothing.

---

## 12 · Order of work

Staged so each stage is independently shippable:

1. **Migration `0035` + error registry + field manifest** — the contract, with
   the §16 cases green before any UI exists.
2. **`<EditRecordSheet>` + `/admin/members/[id]` demographics and contacts** —
   the admin's correction path, which retires delete-and-re-enrol.
3. **`/portal` details card** — the family's half of the same contract.
4. **`/account` + header menu + `/admin/care-team` edit** — profile editing for
   every role, password change included.
5. **Email change** (§8) — self-service, then admin-initiated.
6. **Caregiver transfer** (§9), including the `accept_invite` fix.
7. **Amend onboarding** (§10) — last, and the largest.

## 13 · Assumptions

- Coordinator gets no write path, because §3 gives them `👁`. If coordinators
  turn out to need it operationally, that is a matrix change and its own
  decision.
- `profiles.email` is display and record only; `auth.users.email` is the
  credential. §8 depends on this.
- Supabase's secure-email-change setting (confirmation required on the new
  address) is left at its project default; §8.1 works either way, and the
  admin path in §8.2 bypasses confirmation intentionally with
  `email_confirm: true`.
- Amending onboarding does not re-run report generation for cycles already
  closed. Past reports are immutable per §4 and stay as issued; only the
  onboarding summary is superseded.
