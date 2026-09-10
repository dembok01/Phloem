# Record Correction — Core Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make member demographics, member contacts and user profiles editable after enrolment, so correcting a typo no longer means deleting the member and re-enrolling them.

**Architecture:** Four role-gated jsonb-patch RPCs in one migration are the enforcement boundary. A single field manifest (`lib/member-fields.ts`) mirrors their whitelists cosmetically and drives one shared `<EditRecordSheet>` component, which appears on four surfaces: the admin member page, the family portal, a new `/account` route, and the admin care-team table.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (hosted dev project via MCP), Zod 4, Tailwind + Base UI, `node:test` via tsx.

**Spec:** `docs/superpowers/specs/2026-09-10-record-correction-design.md`

**Covers spec stages 1–4.** Stages 5–7 (email change, caregiver transfer, amend onboarding) are planned in `2026-09-10-record-correction-identity-ops.md` and must be executed after this plan lands.

## Global Constraints

- **Migrations first, then apply.** Every schema change exists as a numbered SQL file in `supabase/migrations/` in the repo FIRST, then is applied to the hosted project via the Supabase MCP `apply_migration` tool. Never make ad-hoc schema changes through `execute_sql`.
- **No Docker, no `supabase start`, no local Supabase.** All database work targets the hosted Supabase dev project.
- **npm, not pnpm.**
- **TypeScript strict, no `any`. Zod-validate all server action inputs.**
- **Every workflow state transition goes through a §6 RPC** — no raw table updates from server actions.
- **Every new RPC opens with `if auth_role() is null then raise exception 'not_allowed'; end if;`** — per `0017_rpc_fail_closed`, `auth_role()` returns NULL for a suspended profile and `NULL not in (...)` evaluates to NULL, so a guard written the other way is SKIPPED and the function proceeds.
- **Ownership checks use `is_caregiver_of()`**, which returns a strict boolean (coalesced) since `0017`.
- **New RPC grants follow `0033`/`0034` discipline:** `revoke execute … from public, anon;` then `grant execute … to authenticated;`.
- **Service-role key never reaches client code.**
- Every new test file must be added to the `test:unit` script list in `package.json` — the runner takes an explicit file list, not a glob.
- Commit at every task with a message in the repo's voice (`feat(admin): …`, `fix(portal): …`).

---

### Task 1: Migration 0035 — the four edit RPCs

**Files:**
- Create: `supabase/migrations/0035_record_correction.sql`
- Modify: `lib/rpc-errors.ts` (add four codes + their copy)
- Test: `lib/rpc-errors.test.ts` (existing test covers the new codes automatically)

**Interfaces:**
- Consumes: `auth_role()`, `is_caregiver_of(uuid)`, `_audit(uuid,text,text,uuid,jsonb)`, `_norm_name(text)` — all existing.
- Produces: `update_member(uuid, jsonb)`, `update_member_contacts(uuid, jsonb)`, `update_my_profile(jsonb)`, `admin_update_profile(uuid, jsonb)`, all `returns void`. Error codes `field_not_allowed`, `name_required`, `bad_age`, `no_changes`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0035_record_correction.sql`:

```sql
-- PHLOEM migration 0035_record_correction.sql
-- Post-enrolment record correction (design: docs/superpowers/specs/2026-09-10-record-correction-design.md).
--
-- Members, contacts and profiles were write-once at enrolment: fixing a typo in
-- a name meant deleting the member and re-enrolling them, which is the very
-- mis-enrolment path 0034 exists to clean up after.
--
-- Shape: one jsonb-patch RPC per entity. The CALLER'S ROLE chooses the field
-- whitelist inside the function, so the boundary is one readable list rather
-- than a column grant (Postgres column grants are per database role, and every
-- app user is `authenticated`).
--
-- Every function opens with an explicit NULL check on auth_role(): per 0017, a
-- suspended profile yields NULL and `NULL not in (...)` is NULL, so the guard
-- would be skipped and the function would proceed.

-- ============ 1. update_member ============
create or replace function update_member(p_member uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
  v_before  jsonb;
  v_after   jsonb;
  v_cg      uuid;
  v_resp    uuid;
  v_age     int;
begin
  if v_role is null then raise exception 'not_allowed'; end if;

  if v_role = 'admin' then
    -- manifest:member:admin
    v_allowed := array['full_name','age','gender','language','occupation',
                       'city','country','relationship_to_caregiver'];
  elsif is_caregiver_of(p_member) then
    -- manifest:member:caregiver
    v_allowed := array['language','occupation','city','country'];
  else
    raise exception 'not_allowed';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  select to_jsonb(m) into v_before from members m where id = p_member;
  if v_before is null then raise exception 'not_found'; end if;

  if p_patch ? 'full_name' and btrim(coalesce(p_patch->>'full_name','')) = '' then
    raise exception 'name_required';
  end if;

  if p_patch ? 'age' then
    v_age := nullif(btrim(coalesce(p_patch->>'age','')), '')::int;
    if v_age is not null and (v_age < 1 or v_age > 120) then raise exception 'bad_age'; end if;
  end if;

  -- A rename must not become a back door into the duplicate state 0034 closed.
  -- Narrower than the enrolment guard on purpose: that one can fall back to the
  -- pending invite's email, but a member already has a caregiver row or does not,
  -- and matching on a NULL caregiver would collide every unclaimed member.
  if p_patch ? 'full_name' then
    select caregiver_id into v_cg from members where id = p_member;
    if v_cg is not null and exists (
      select 1 from members m
       where m.id <> p_member
         and m.caregiver_id = v_cg
         and m.status in ('invited','signed_up','onboarding')
         and _norm_name(m.full_name) = _norm_name(p_patch->>'full_name')
    ) then
      raise exception 'duplicate_member';
    end if;
  end if;

  update members set
    full_name = case when p_patch ? 'full_name'
                     then btrim(p_patch->>'full_name') else full_name end,
    age       = case when p_patch ? 'age'
                     then nullif(btrim(coalesce(p_patch->>'age','')), '')::int else age end,
    gender    = case when p_patch ? 'gender'
                     then nullif(btrim(coalesce(p_patch->>'gender','')), '') else gender end,
    language  = case when p_patch ? 'language'
                     then nullif(btrim(coalesce(p_patch->>'language','')), '') else language end,
    occupation= case when p_patch ? 'occupation'
                     then nullif(btrim(coalesce(p_patch->>'occupation','')), '') else occupation end,
    city      = case when p_patch ? 'city'
                     then nullif(btrim(coalesce(p_patch->>'city','')), '') else city end,
    country   = case when p_patch ? 'country'
                     then nullif(btrim(coalesce(p_patch->>'country','')), '') else country end,
    relationship_to_caregiver = case when p_patch ? 'relationship_to_caregiver'
                     then nullif(btrim(coalesce(p_patch->>'relationship_to_caregiver','')), '')
                     else relationship_to_caregiver end
  where id = p_member;

  select to_jsonb(m) into v_after from members m where id = p_member;

  -- Nothing actually moved: fail rather than write a meaningless audit row. The
  -- UPDATE above rolls back with the exception.
  if (select jsonb_object_agg(k, v_before->k) from jsonb_object_keys(p_patch) k)
   = (select jsonb_object_agg(k, v_after->k)  from jsonb_object_keys(p_patch) k) then
    raise exception 'no_changes';
  end if;

  -- §4 keeps demographics in BOTH members and the onboarding answers, and
  -- get_onboarding_scoped hands the whole blob to admin, the caregiver and the
  -- assigned doctor. Editing one copy alone would show a doctor a stale age in
  -- one panel and a fresh one in another.
  select fr.id into v_resp
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.member_id = p_member and t.key = 'onboarding' and fr.submitted_at is not null
   order by fr.submitted_at desc limit 1;
  if v_resp is not null then
    update form_responses set answers = answers || p_patch where id = v_resp;
  end if;

  perform _audit(auth.uid(), 'member.updated', 'member', p_member,
    jsonb_build_object(
      'before', (select jsonb_object_agg(k, v_before->k) from jsonb_object_keys(p_patch) k),
      'after',  (select jsonb_object_agg(k, v_after->k)  from jsonb_object_keys(p_patch) k)));
end $$;

-- ============ 2. update_member_contacts ============
create or replace function update_member_contacts(p_member uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if not (v_role = 'admin' or is_caregiver_of(p_member)) then raise exception 'not_allowed'; end if;

  -- manifest:contacts:admin
  -- manifest:contacts:caregiver
  v_allowed := array['phone','whatsapp','email','address','pin_code',
                     'emergency_contact_name','emergency_contact_phone'];

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  if not exists (select 1 from members where id = p_member) then raise exception 'not_found'; end if;

  -- Upsert: a member enrolled but not yet onboarded has no contacts row.
  insert into member_contacts(member_id) values (p_member)
  on conflict (member_id) do nothing;

  update member_contacts set
    phone   = case when p_patch ? 'phone'
                   then nullif(btrim(coalesce(p_patch->>'phone','')), '') else phone end,
    whatsapp= case when p_patch ? 'whatsapp'
                   then nullif(btrim(coalesce(p_patch->>'whatsapp','')), '') else whatsapp end,
    email   = case when p_patch ? 'email'
                   then nullif(btrim(coalesce(p_patch->>'email','')), '') else email end,
    address = case when p_patch ? 'address'
                   then nullif(btrim(coalesce(p_patch->>'address','')), '') else address end,
    pin_code= case when p_patch ? 'pin_code'
                   then nullif(btrim(coalesce(p_patch->>'pin_code','')), '') else pin_code end,
    emergency_contact_name = case when p_patch ? 'emergency_contact_name'
                   then nullif(btrim(coalesce(p_patch->>'emergency_contact_name','')), '')
                   else emergency_contact_name end,
    emergency_contact_phone = case when p_patch ? 'emergency_contact_phone'
                   then nullif(btrim(coalesce(p_patch->>'emergency_contact_phone','')), '')
                   else emergency_contact_phone end
  where member_id = p_member;

  -- FIELD NAMES ONLY, never values. member_contacts being a table clinicians'
  -- policies do not cover is the structural mechanism behind the §3 rule that
  -- they never see contact identifiers; copying phone numbers into audit_log
  -- would move them right back out of it.
  perform _audit(auth.uid(), 'member.contacts_updated', 'member', p_member,
    jsonb_build_object('fields',
      (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k)));
end $$;

-- ============ 3. update_my_profile ============
create or replace function update_my_profile(p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;

  -- manifest:profile:self
  v_allowed := array['full_name','phone','whatsapp'];

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  if p_patch ? 'full_name' and btrim(coalesce(p_patch->>'full_name','')) = '' then
    raise exception 'name_required';
  end if;

  update profiles set
    full_name = case when p_patch ? 'full_name'
                     then btrim(p_patch->>'full_name') else full_name end,
    phone     = case when p_patch ? 'phone'
                     then nullif(btrim(coalesce(p_patch->>'phone','')), '') else phone end,
    whatsapp  = case when p_patch ? 'whatsapp'
                     then nullif(btrim(coalesce(p_patch->>'whatsapp','')), '') else whatsapp end
  where id = auth.uid();
  if not found then raise exception 'not_found'; end if;

  perform _audit(auth.uid(), 'profile.updated', 'profile', auth.uid(),
    jsonb_build_object('fields',
      (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k), 'self', true));
end $$;

-- ============ 4. admin_update_profile ============
create or replace function admin_update_profile(p_user uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_allowed text[];
  v_key     text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if v_role <> 'admin' then raise exception 'not_allowed'; end if;

  -- manifest:profile:admin
  v_allowed := array['full_name','phone','whatsapp','specialization'];

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'field_not_allowed'; end if;
  end loop;

  if p_patch ? 'full_name' and btrim(coalesce(p_patch->>'full_name','')) = '' then
    raise exception 'name_required';
  end if;

  update profiles set
    full_name = case when p_patch ? 'full_name'
                     then btrim(p_patch->>'full_name') else full_name end,
    phone     = case when p_patch ? 'phone'
                     then nullif(btrim(coalesce(p_patch->>'phone','')), '') else phone end,
    whatsapp  = case when p_patch ? 'whatsapp'
                     then nullif(btrim(coalesce(p_patch->>'whatsapp','')), '') else whatsapp end,
    specialization = case when p_patch ? 'specialization'
                     then nullif(btrim(coalesce(p_patch->>'specialization','')), '')
                     else specialization end
  where id = p_user;
  if not found then raise exception 'not_found'; end if;

  perform _audit(auth.uid(), 'profile.updated', 'profile', p_user,
    jsonb_build_object('fields',
      (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k), 'self', false));
end $$;

-- ============ grants (0033/0034 discipline: nothing inherits PUBLIC) ============
revoke execute on function update_member(uuid,jsonb)           from public, anon;
grant  execute on function update_member(uuid,jsonb)           to authenticated;
revoke execute on function update_member_contacts(uuid,jsonb)  from public, anon;
grant  execute on function update_member_contacts(uuid,jsonb)  to authenticated;
revoke execute on function update_my_profile(jsonb)            from public, anon;
grant  execute on function update_my_profile(jsonb)            to authenticated;
revoke execute on function admin_update_profile(uuid,jsonb)    from public, anon;
grant  execute on function admin_update_profile(uuid,jsonb)    to authenticated;
```

- [ ] **Step 2: Register the new error codes**

In `lib/rpc-errors.ts`, append to the `RPC_ERROR_CODES` array before the closing `] as const;`:

```ts
  // 0035 record correction
  "field_not_allowed",
  "name_required",
  "bad_age",
  "no_changes",
```

And add to `RPC_ERROR_COPY`:

```ts
  field_not_allowed: "You can't change that field. Ask your coordinator if it needs correcting.",
  name_required: "A name is required.",
  bad_age: "Age must be between 1 and 120.",
  no_changes: "Nothing changed, so there was nothing to save.",
```

- [ ] **Step 3: Run the registry test to verify it passes**

Run: `npm run test:unit`
Expected: PASS, including "every raise exception code in the migrations is registered". If it FAILS listing `field_not_allowed`/`name_required`/`bad_age`/`no_changes`, Step 2 was not applied.

- [ ] **Step 4: Apply the migration to the hosted project**

Use the Supabase MCP `apply_migration` tool with name `0035_record_correction` and the file's contents as the query. Do not use `execute_sql` for this.

- [ ] **Step 5: Verify the functions exist**

Use the Supabase MCP `execute_sql` tool:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('update_member','update_member_contacts','update_my_profile','admin_update_profile')
order by p.proname;
```

Expected: four rows, with args `p_member uuid, p_patch jsonb`, `p_member uuid, p_patch jsonb`, `p_patch jsonb`, `p_user uuid, p_patch jsonb`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0035_record_correction.sql lib/rpc-errors.ts
git commit -m "feat(db): edit RPCs for members, contacts and profiles"
```

---

### Task 2: The field manifest

**Files:**
- Create: `lib/member-fields.ts`
- Create: `lib/member-fields.test.ts`
- Modify: `package.json` (add the test file to `test:unit`)

**Interfaces:**
- Consumes: `UserRole` from `lib/roles.ts`; the `-- manifest:<group>:<role>` markers written in Task 1.
- Produces: `FieldSpec`, `FieldGroup`, `MEMBER_DEMOGRAPHICS`, `MEMBER_CONTACTS`, `OWN_PROFILE`, `ADMIN_PROFILE`, `canEdit(field, role)`, `buildPatch(group, role, next, current)`.

- [ ] **Step 1: Write the failing test**

Create `lib/member-fields.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBER_DEMOGRAPHICS,
  MEMBER_CONTACTS,
  OWN_PROFILE,
  ADMIN_PROFILE,
  buildPatch,
  canEdit,
  type FieldGroup,
} from "./member-fields";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0035_record_correction.sql"),
  "utf8",
);

/** Pull `v_allowed := array['a','b']` that follows a `-- manifest:<marker>` line. */
function sqlWhitelist(marker: string): string[] {
  const re = new RegExp(
    `-- manifest:${marker}\\b[\\s\\S]*?v_allowed := array\\[([^\\]]*)\\]`,
  );
  const m = SQL.match(re);
  assert.ok(m, `no whitelist found in 0035 for marker ${marker}`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
}

function manifestKeys(group: FieldGroup, role: Parameters<typeof canEdit>[1]): string[] {
  return group.fields.filter((f) => canEdit(f, role)).map((f) => f.key).sort();
}

test("the manifest matches the SQL whitelist for every group", () => {
  assert.deepEqual(manifestKeys(MEMBER_DEMOGRAPHICS, "admin"), sqlWhitelist("member:admin"));
  assert.deepEqual(manifestKeys(MEMBER_DEMOGRAPHICS, "caregiver"), sqlWhitelist("member:caregiver"));
  assert.deepEqual(manifestKeys(MEMBER_CONTACTS, "admin"), sqlWhitelist("contacts:admin"));
  assert.deepEqual(manifestKeys(MEMBER_CONTACTS, "caregiver"), sqlWhitelist("contacts:caregiver"));
  assert.deepEqual(manifestKeys(OWN_PROFILE, "caregiver"), sqlWhitelist("profile:self"));
  assert.deepEqual(manifestKeys(ADMIN_PROFILE, "admin"), sqlWhitelist("profile:admin"));
});

test("a clinician may edit nothing on a member", () => {
  assert.deepEqual(manifestKeys(MEMBER_DEMOGRAPHICS, "doctor"), []);
  assert.deepEqual(manifestKeys(MEMBER_CONTACTS, "nutritionist"), []);
});

test("buildPatch keeps only fields that changed AND the role may edit", () => {
  const current = { language: "Malayalam", city: "Kochi", full_name: "Meera Nair" };
  const next = { language: "Tamil", city: "Kochi", full_name: "Meera R Nair" };
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "caregiver", next, current), {
    language: "Tamil",
  });
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "admin", next, current), {
    language: "Tamil",
    full_name: "Meera R Nair",
  });
});

test("buildPatch trims, treats blank as a cleared value, and ignores unknown keys", () => {
  const current = { city: "Kochi", occupation: "Teacher" };
  const next = { city: "  Kochi  ", occupation: "", nonsense: "x" };
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "admin", next, current), {
    occupation: "",
  });
});

test("buildPatch returns an empty object when nothing moved", () => {
  const current = { city: "Kochi" };
  assert.deepEqual(buildPatch(MEMBER_DEMOGRAPHICS, "admin", { city: "Kochi" }, current), {});
});
```

- [ ] **Step 2: Register the test file and run it to verify it fails**

In `package.json`, add `lib/member-fields.test.ts` to the `test:unit` file list (immediately after `lib/member-duplicates.test.ts`).

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './member-fields'`.

- [ ] **Step 3: Write the manifest**

Create `lib/member-fields.ts`:

```ts
// Cosmetic mirror of migration 0035's field whitelists, in the tradition of
// lib/permissions.ts: the enforcement boundary is the RPC, this only decides
// what the UI offers. lib/member-fields.test.ts asserts the two never drift.
import type { UserRole } from "@/lib/roles";

export type FieldType = "text" | "number" | "tel" | "email" | "select" | "textarea";

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  /** Only for `select`. */
  options?: readonly string[];
  editableBy: readonly UserRole[];
  /** Shown under a field the current role may see but not change. */
  lockedReason?: string;
};

export type FieldGroup = {
  /** Used for form ids and the sheet's title. */
  name: string;
  fields: readonly FieldSpec[];
};

const ASK_COORDINATOR = "Your coordinator can change this.";

export const MEMBER_DEMOGRAPHICS: FieldGroup = {
  name: "Details",
  fields: [
    { key: "full_name", label: "Full name", type: "text",
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
    { key: "age", label: "Age", type: "number",
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
    { key: "gender", label: "Gender", type: "select",
      options: ["Female", "Male", "Other"],
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
    { key: "language", label: "Preferred language", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "occupation", label: "Occupation", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "city", label: "City", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "country", label: "Country", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "relationship_to_caregiver", label: "Relationship to you", type: "text",
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
  ],
};

export const MEMBER_CONTACTS: FieldGroup = {
  name: "Contact details",
  fields: [
    { key: "phone", label: "Phone", type: "tel", editableBy: ["admin", "caregiver"] },
    { key: "whatsapp", label: "WhatsApp", type: "tel", editableBy: ["admin", "caregiver"] },
    { key: "email", label: "Email", type: "email", editableBy: ["admin", "caregiver"] },
    { key: "address", label: "Address", type: "textarea", editableBy: ["admin", "caregiver"] },
    { key: "pin_code", label: "PIN code", type: "text", editableBy: ["admin", "caregiver"] },
    { key: "emergency_contact_name", label: "Emergency contact name", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "emergency_contact_phone", label: "Emergency contact phone", type: "tel",
      editableBy: ["admin", "caregiver"] },
  ],
};

const EVERY_ROLE: readonly UserRole[] = [
  "admin", "coordinator", "doctor", "nutritionist",
  "trainer", "psychologist", "caregiver", "member",
];

export const OWN_PROFILE: FieldGroup = {
  name: "Your details",
  fields: [
    { key: "full_name", label: "Full name", type: "text", editableBy: EVERY_ROLE },
    { key: "phone", label: "Phone", type: "tel", editableBy: EVERY_ROLE },
    { key: "whatsapp", label: "WhatsApp", type: "tel", editableBy: EVERY_ROLE },
  ],
};

export const ADMIN_PROFILE: FieldGroup = {
  name: "Profile",
  fields: [
    { key: "full_name", label: "Full name", type: "text", editableBy: ["admin"] },
    { key: "phone", label: "Phone", type: "tel", editableBy: ["admin"] },
    { key: "whatsapp", label: "WhatsApp", type: "tel", editableBy: ["admin"] },
    { key: "specialization", label: "Specialisation", type: "text", editableBy: ["admin"] },
  ],
};

export function canEdit(field: FieldSpec, role: UserRole): boolean {
  return field.editableBy.includes(role);
}

/**
 * The patch the RPC receives: trimmed, only fields this role may edit, and only
 * those whose value actually moved. Dropping unchanged keys is what makes the
 * RPC's `no_changes` mean "you changed nothing" rather than "you resubmitted".
 */
export function buildPatch(
  group: FieldGroup,
  role: UserRole,
  next: Record<string, string>,
  current: Record<string, string | null | undefined>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const field of group.fields) {
    if (!canEdit(field, role)) continue;
    if (!(field.key in next)) continue;
    const value = (next[field.key] ?? "").trim();
    const before = (current[field.key] ?? "").toString().trim();
    if (value === before) continue;
    patch[field.key] = value;
  }
  return patch;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS, five new assertions from `member-fields.test.ts` included.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/member-fields.ts lib/member-fields.test.ts package.json
git commit -m "feat(fields): one manifest for what each role may edit"
```

---

### Task 3: §16 RLS suite additions

**Files:**
- Modify: `supabase/tests/rls.test.sql` (append a section before the final `select line from results; rollback;`)

**Interfaces:**
- Consumes: `update_member`, `update_member_contacts`, `update_my_profile`, `admin_update_profile` from Task 1; the suite's existing `ids` and `results` temp tables and its `set_config('request.jwt.claims', …)` persona pattern.
- Produces: PASS lines proving the field split and the fail-closed guard.

- [ ] **Step 1: Append the new assertions**

In `supabase/tests/rls.test.sql`, insert this block immediately BEFORE the final `reset role;` / `select line from results;` / `rollback;` lines:

```sql
-- ============ 0035 record correction ============
-- M1 = seeded onboarded member (Meera); her caregiver is the seeded caregiver.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'doctor' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  begin
    perform update_member('11111111-1111-4111-8111-111111111111'::uuid,
                          '{"city":"Chennai"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: doctor must be refused update_member — got %', msg;
  end if;
  insert into results values ('PASS  edit: doctor REFUSED update_member');
end $$;

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'coordinator' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  begin
    perform update_member_contacts('11111111-1111-4111-8111-111111111111'::uuid,
                                   '{"phone":"+910000000001"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: coordinator must be refused update_member_contacts — got %', msg;
  end if;
  insert into results values ('PASS  edit: coordinator REFUSED update_member_contacts');
end $$;

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select caregiver_id from members
                             where id = '11111111-1111-4111-8111-111111111111'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  -- Allowed: a soft field on their own parent. A distinctive value, because an
  -- edit to the value already stored raises no_changes and would fail this test
  -- for the wrong reason. Safe to reuse: the suite rolls back.
  perform update_member('11111111-1111-4111-8111-111111111111'::uuid,
                        '{"city":"RLS-Test-City"}'::jsonb);
  insert into results values ('PASS  edit: caregiver CAN change city on their own member');

  begin
    perform update_member('11111111-1111-4111-8111-111111111111'::uuid,
                          '{"full_name":"Someone Else"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'field_not_allowed' then
    raise exception 'RLS TEST FAILED: caregiver must not rename a member — got %', msg;
  end if;
  insert into results values ('PASS  edit: caregiver REFUSED full_name (field_not_allowed)');

  begin
    perform update_member('22222222-2222-4222-8222-222222222222'::uuid,
                          '{"city":"Chennai"}'::jsonb);
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: caregiver must not edit another member — got %', msg;
  end if;
  insert into results values ('PASS  edit: caregiver REFUSED a member that is not theirs');
end $$;

-- A rename must not become a back door into the duplicate state 0034 closed.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'admin' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text; v_cg uuid; v_twin uuid;
begin
  select caregiver_id into v_cg from members where id = '11111111-1111-4111-8111-111111111111';
  -- A second, still-onboarding member under the SAME caregiver, named differently.
  insert into members(full_name, caregiver_id, status)
  values ('Twin Fixture', v_cg, 'onboarding') returning id into v_twin;

  begin
    -- Renaming the twin onto the first member's name must be refused.
    perform update_member(v_twin,
      jsonb_build_object('full_name',
        (select full_name from members where id = '11111111-1111-4111-8111-111111111111')));
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'duplicate_member' then
    raise exception 'RLS TEST FAILED: rename onto a twin must raise duplicate_member — got %', msg;
  end if;
  insert into results values ('PASS  edit: rename onto an existing member REFUSED (duplicate_member)');
end $$;

-- The 0017 regression that matters most: a suspended admin must be refused
-- every one of the four, because auth_role() is NULL for them.
reset role;
update profiles set status = 'suspended' where role = 'admin';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'admin' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text; fn text;
begin
  foreach fn in array array['update_member','update_member_contacts',
                            'update_my_profile','admin_update_profile'] loop
    begin
      if fn = 'update_member' then
        perform update_member('11111111-1111-4111-8111-111111111111'::uuid, '{"city":"X"}'::jsonb);
      elsif fn = 'update_member_contacts' then
        perform update_member_contacts('11111111-1111-4111-8111-111111111111'::uuid, '{"phone":"1"}'::jsonb);
      elsif fn = 'update_my_profile' then
        perform update_my_profile('{"full_name":"X"}'::jsonb);
      else
        perform admin_update_profile((select id from ids where role = 'doctor' limit 1),
                                     '{"full_name":"X"}'::jsonb);
      end if;
      msg := 'no error';
    exception when others then msg := SQLERRM;
    end;
    if msg <> 'not_allowed' then
      raise exception 'RLS TEST FAILED: suspended admin must be refused % — got %', fn, msg;
    end if;
    insert into results values ('PASS  edit: suspended admin REFUSED ' || fn);
  end loop;
end $$;
reset role;
update profiles set status = 'active' where role = 'admin';
```

- [ ] **Step 2: Run the suite**

Run: `npm run test:rls`

If `SUPABASE_DB_URL` is not set, run `supabase/tests/rls.test.sql` through the Supabase MCP `execute_sql` tool instead (the environment override in CLAUDE.md).

Expected: every existing PASS line, plus nine new `PASS  edit: …` lines, ending with `§16 RLS suite: PASS`.

- [ ] **Step 3: Record the results**

Append the new PASS lines to `PROGRESS.md` under a `### Record correction — §16 additions` heading, per the §16 discipline.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls.test.sql PROGRESS.md
git commit -m "test(rls): the field split, and a suspended admin refused all four"
```

---

### Task 4: Server actions and the shared edit sheet

**Files:**
- Create: `app/(app)/record-actions.ts`
- Create: `components/edit-record-sheet.tsx`

**Interfaces:**
- Consumes: `buildPatch`, `canEdit`, `FieldGroup`, `FieldSpec` (Task 2); `ActionResult`, `actionOk`, `actionFail`, `actionFromError`; `Sheet`, `Button`, `SubmitButton`, `Input`, `Label`, `useToast`.
- Produces: `updateMemberAction(memberId, patch)`, `updateMemberContactsAction(memberId, patch)`, `updateMyProfileAction(patch)`, `adminUpdateProfileAction(userId, patch)` — each `Promise<ActionResult>`. Component `<EditRecordSheet group role values triggerLabel title description onSave />`.

- [ ] **Step 1: Write the server actions**

Create `app/(app)/record-actions.ts`:

```ts
"use server";

// Correcting a record after enrolment (design §5). Every one of these is a thin
// shell over an 0035 RPC: the role-by-role field whitelist lives in SQL, and
// these only refuse obviously malformed input so a typo cannot spend a round
// trip. Shared by the admin desk, the family portal and /account.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

/** A patch is a flat map of field key → string; SQL does the casting. */
const patchSchema = z.record(z.string().regex(/^[a-z_]{1,40}$/), z.string().max(500));
const memberPatchSchema = z.object({
  memberId: z.string().uuid(),
  patch: patchSchema,
});

const EDIT_FALLBACK = "Could not save those changes. Please try again.";

export async function updateMemberAction(
  memberId: string,
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = memberPatchSchema.safeParse({ memberId, patch });
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    p_member: parsed.data.memberId,
    p_patch: parsed.data.patch,
  });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/portal");
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return actionOk(undefined);
}

export async function updateMemberContactsAction(
  memberId: string,
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = memberPatchSchema.safeParse({ memberId, patch });
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_contacts", {
    p_member: parsed.data.memberId,
    p_patch: parsed.data.patch,
  });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/portal");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return actionOk(undefined);
}

export async function updateMyProfileAction(
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", { p_patch: parsed.data });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/account");
  return actionOk(undefined);
}

export async function adminUpdateProfileAction(
  userId: string,
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = z.object({ userId: z.string().uuid(), patch: patchSchema })
    .safeParse({ userId, patch });
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_profile", {
    p_user: parsed.data.userId,
    p_patch: parsed.data.patch,
  });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/admin/care-team");
  return actionOk(undefined);
}
```

- [ ] **Step 2: Write the shared sheet**

Create `components/edit-record-sheet.tsx`:

```tsx
"use client";

// One editing surface for every record in the app (design §7.1), modelled on
// components/coordinator/schedule-sheet.tsx — the house pattern for acting
// without leaving the page.
//
// Fields the role may SEE but not CHANGE render disabled with their reason
// rather than being hidden: a family screen that silently omits the member's
// age reads as a bug, and generates the support call this feature exists to
// prevent.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { buildPatch, canEdit, type FieldGroup, type FieldSpec } from "@/lib/member-fields";
import type { ActionResult } from "@/lib/action-result";
import type { UserRole } from "@/lib/roles";

const CONTROL =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

export function EditRecordSheet({
  group,
  role,
  values,
  title,
  description,
  triggerLabel = "Edit",
  successText,
  onSave,
}: {
  group: FieldGroup;
  role: UserRole;
  values: Record<string, string | number | null | undefined>;
  title: string;
  description?: string;
  triggerLabel?: string;
  /** Toast copy on success — repeats the verb of the button (DESIGN-SYSTEM §5). */
  successText: string;
  onSave: (patch: Record<string, string>) => Promise<ActionResult>;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const formId = `edit-${group.name.replace(/\s+/g, "-").toLowerCase()}`;

  const current = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of group.fields) out[f.key] = values[f.key]?.toString() ?? "";
    return out;
  }, [group, values]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Record<string, string> = {};
    for (const f of group.fields) {
      if (canEdit(f, role)) next[f.key] = String(data.get(f.key) ?? "");
    }
    const patch = buildPatch(group, role, next, current);
    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }
    start(async () => {
      const result = await onSave(patch);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast("success", successText);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Pencil className="size-3.5" aria-hidden /> {triggerLabel}
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pendingText="Saving…" disabled={pending}>
              Save changes
            </SubmitButton>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-4">
          {group.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              formId={formId}
              editable={canEdit(field, role)}
              defaultValue={current[field.key]}
            />
          ))}
        </form>
      </Sheet>
    </>
  );
}

function FieldRow({
  field,
  formId,
  editable,
  defaultValue,
}: {
  field: FieldSpec;
  formId: string;
  editable: boolean;
  defaultValue: string;
}) {
  const id = `${formId}-${field.key}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "select" ? (
        <select id={id} name={field.key} defaultValue={defaultValue} disabled={!editable} className={CONTROL}>
          <option value="">Not set</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          name={field.key}
          defaultValue={defaultValue}
          disabled={!editable}
          rows={3}
          className={`${CONTROL} h-auto py-2`}
        />
      ) : (
        <Input
          id={id}
          name={field.key}
          type={field.type === "number" ? "number" : field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text"}
          defaultValue={defaultValue}
          disabled={!editable}
          className="h-11"
        />
      )}
      {!editable && field.lockedReason ? (
        <p className="text-xs text-muted-foreground">{field.lockedReason}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. If `SubmitButton` rejects `disabled`, drop that prop — the transition already guards double submits.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/record-actions.ts" components/edit-record-sheet.tsx
git commit -m "feat(edit): one sheet and four actions for correcting a record"
```

---

### Task 5: The admin member page — Edit details and a Contact details card

**Files:**
- Modify: `app/(app)/admin/members/[id]/page.tsx`

**Interfaces:**
- Consumes: `EditRecordSheet` (Task 4), `MEMBER_DEMOGRAPHICS`, `MEMBER_CONTACTS` (Task 2), `updateMemberAction`, `updateMemberContactsAction` (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Read the contact row alongside the member**

The page already resolves `member` before rendering. Add these two reads next to the existing `Promise.all` block that fetches assignments/consultations, using the same `supabase` client:

```tsx
const [{ data: contacts }, { data: caregiver }] = await Promise.all([
  supabase
    .from("member_contacts")
    .select("phone, whatsapp, email, address, pin_code, emergency_contact_name, emergency_contact_phone")
    .eq("member_id", id)
    .maybeSingle(),
  member.caregiver_id
    ? supabase.from("profiles").select("full_name, phone, email").eq("id", member.caregiver_id).maybeSingle()
    : Promise.resolve({ data: null }),
]);
```

Also widen the member `select` on this page to include the demographic columns the sheet edits: `full_name, age, gender, language, occupation, city, country, relationship_to_caregiver`.

- [ ] **Step 2: Add Edit details to the page header**

Replace the `actions={…}` prop of the existing `<PageHeader>` with:

```tsx
actions={
  <div className="flex items-center gap-2">
    <Badge variant={memberStatusVariant(member.status as MemberStatus)}>
      {MEMBER_STATUS_LABEL[member.status as MemberStatus]}
    </Badge>
    <EditRecordSheet
      group={MEMBER_DEMOGRAPHICS}
      role="admin"
      values={member}
      title="Edit member details"
      description="Corrections apply everywhere, including the onboarding answers the doctor reads."
      triggerLabel="Edit details"
      successText="Member details updated"
      onSave={async (patch) => updateMemberAction(member.id, patch)}
    />
  </div>
}
```

Add the imports at the top of the file:

```tsx
import { EditRecordSheet } from "@/components/edit-record-sheet";
import { MEMBER_DEMOGRAPHICS, MEMBER_CONTACTS } from "@/lib/member-fields";
import { updateMemberAction, updateMemberContactsAction } from "@/app/(app)/record-actions";
```

- [ ] **Step 3: Add the Contact details card above Care team**

Insert this immediately before the existing `{/* Care team (read-only summary) */}` card:

```tsx
{/* Contact details. This page previously rendered none at all: when a family
    telephoned the office the admin had no screen showing their number, despite
    §3 granting admin full access to contact identifiers. */}
<Card>
  <CardHeader className="flex flex-row items-center justify-between gap-3">
    <CardTitle>Contact details</CardTitle>
    <EditRecordSheet
      group={MEMBER_CONTACTS}
      role="admin"
      values={contacts ?? {}}
      title="Edit contact details"
      description="Only the family, the coordinator and you can see these."
      successText="Contact details updated"
      onSave={async (patch) => updateMemberContactsAction(member.id, patch)}
    />
  </CardHeader>
  <CardContent className="grid gap-2 sm:grid-cols-2">
    {MEMBER_CONTACTS.fields.map((f) => (
      <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
        <span className="text-muted-foreground">{f.label}</span>
        <span className="truncate font-medium">
          {(contacts as Record<string, string | null> | null)?.[f.key] ?? "—"}
        </span>
      </div>
    ))}
    <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm sm:col-span-2">
      <span className="text-muted-foreground">Family login</span>
      <span className="truncate font-medium">
        {caregiver ? `${caregiver.full_name} · ${caregiver.phone ?? caregiver.email}` : "Not linked yet"}
      </span>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 4: Verify in the running app**

Run: `npm run dev`, sign in as the seeded admin, open `/admin/members/<a seeded member id>`.
Expected: the header carries an **Edit details** button; a **Contact details** card sits above Care team showing the seeded phone. Change the city, save, and confirm the toast reads "Member details updated" and the header's description line updates.

- [ ] **Step 5: Confirm the answers mirror worked**

Use the Supabase MCP `execute_sql` tool:

```sql
select m.city as members_city, fr.answers->>'city' as answers_city
from members m
join form_responses fr on fr.member_id = m.id
join form_templates t on t.id = fr.template_id and t.key = 'onboarding'
where m.id = '11111111-1111-4111-8111-111111111111' and fr.submitted_at is not null
order by fr.submitted_at desc limit 1;
```

Expected: both columns show the new city. If `answers_city` is stale, the mirror block in `update_member` did not run.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/admin/members/[id]/page.tsx"
git commit -m "feat(admin): edit a member, and finally show their contact details"
```

---

### Task 6: The portal "Their details" card

**Files:**
- Modify: `app/(app)/portal/page.tsx`

**Interfaces:**
- Consumes: `EditRecordSheet`, `MEMBER_DEMOGRAPHICS`, `MEMBER_CONTACTS`, `updateMemberAction`, `updateMemberContactsAction`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Read the contacts row for the member being shown**

Alongside the existing member query in `app/(app)/portal/page.tsx`, add:

```tsx
const { data: contacts } = await supabase
  .from("member_contacts")
  .select("phone, whatsapp, email, address, pin_code, emergency_contact_name, emergency_contact_phone")
  .eq("member_id", member.id)
  .maybeSingle();
```

Widen the member select to include `language, occupation, city, country, relationship_to_caregiver, gender, age` if any are missing.

- [ ] **Step 2: Add the card beneath the member header**

Insert after the member header block (the one rendering `MemberPhoto` and `MemberPhotoUpload`), and add the same three imports used in Task 5:

```tsx
{/* What the family gave us, and what they may correct themselves. Name, age and
    gender render disabled with their reason rather than being hidden — an
    omitted age reads as a bug and generates the call this card prevents. */}
<Card>
  <CardContent className="space-y-4 pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-lg font-semibold">Their details</h2>
      <EditRecordSheet
        group={MEMBER_DEMOGRAPHICS}
        role="caregiver"
        values={member}
        title="Edit details"
        description="Some details are set by the care team — those show as locked."
        successText="Details updated"
        onSave={async (patch) => updateMemberAction(member.id, patch)}
      />
    </div>
    <dl className="grid gap-2 sm:grid-cols-2">
      {MEMBER_DEMOGRAPHICS.fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className="truncate font-medium">
            {(member as Record<string, string | number | null>)[f.key] ?? "—"}
          </dd>
        </div>
      ))}
    </dl>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <h3 className="font-medium">How we reach you</h3>
      <EditRecordSheet
        group={MEMBER_CONTACTS}
        role="caregiver"
        values={contacts ?? {}}
        title="Edit contact details"
        description="Only your care coordinator and the PHLOEM team can see these."
        successText="Contact details updated"
        onSave={async (patch) => updateMemberContactsAction(member.id, patch)}
      />
    </div>
    <dl className="grid gap-2 sm:grid-cols-2">
      {MEMBER_CONTACTS.fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className="truncate font-medium">
            {(contacts as Record<string, string | null> | null)?.[f.key] ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  </CardContent>
</Card>
```

- [ ] **Step 3: Verify both halves of the split in the browser**

Run: `npm run dev`, sign in as the seeded caregiver, open `/portal`.
Expected: **Their details** shows every field; opening its editor shows *Full name*, *Age*, *Gender* and *Relationship to you* disabled with "Your coordinator can change this", while *Preferred language*, *Occupation*, *City* and *Country* are editable. Change the city and save — the toast reads "Details updated".

- [ ] **Step 4: Verify the boundary is real, not cosmetic**

Use the Supabase MCP `execute_sql` tool to prove the RPC refuses a rename even when the UI is bypassed:

```sql
select set_config('request.jwt.claims',
  json_build_object('sub', (select caregiver_id from members
                            where id = '11111111-1111-4111-8111-111111111111'),
                    'role', 'authenticated')::text, false);
set role authenticated;
select update_member('11111111-1111-4111-8111-111111111111'::uuid, '{"full_name":"Hacked"}'::jsonb);
```

Expected: `ERROR: field_not_allowed`. Then `reset role;`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/portal/page.tsx"
git commit -m "feat(portal): the family can correct what they told us"
```

---

### Task 7: The `/account` route and the header menu

**Files:**
- Create: `app/(app)/account/page.tsx`
- Create: `components/account/password-form.tsx`
- Create: `components/account-menu.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `getSessionProfile()`, `OWN_PROFILE`, `updateMyProfileAction`, `EditRecordSheet`, `logout` from `app/(auth)/login/actions`.
- Produces: the `/account` route. No middleware change: the shell guard only fences paths under `APP_PREFIXES`, so `/account` behaves like `/notifications`.

- [ ] **Step 1: Write the account page**

Create `app/(app)/account/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EditRecordSheet } from "@/components/edit-record-sheet";
import { PasswordForm } from "@/components/account/password-form";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { OWN_PROFILE } from "@/lib/member-fields";
import { updateMyProfileAction } from "@/app/(app)/record-actions";
import { ROLE_LABEL } from "@/lib/roles";

export default async function AccountPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("profiles")
    .select("full_name, email, phone, whatsapp, specialization")
    .eq("id", profile.user.id)
    .single();

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Your account"
        description={`Signed in as ${ROLE_LABEL[profile.role]}.`}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Your details</CardTitle>
          <EditRecordSheet
            group={OWN_PROFILE}
            role={profile.role}
            values={row ?? {}}
            title="Edit your details"
            successText="Your details were updated"
            onSave={updateMyProfileAction}
          />
        </CardHeader>
        <CardContent className="grid gap-2">
          {OWN_PROFILE.fields.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="truncate font-medium">
                {(row as Record<string, string | null> | null)?.[f.key] ?? "—"}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="truncate font-medium">{row?.email ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm email={row?.email ?? ""} />
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Write the password form**

Create `components/account/password-form.tsx`:

```tsx
"use client";

// Supabase's updateUser({ password }) does NOT ask for the current password.
// Without the re-check below, anyone reaching an unattended logged-in device
// could silently take the account over, so the current password is verified
// with signInWithPassword first. Both calls run in the browser against the
// user's own session — no server action, no service-role key.
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm({ email }: { email: string }) {
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("current") ?? "");
    const next = String(data.get("next") ?? "");

    if (next.length < 8) {
      toast("error", "Choose a password of at least 8 characters.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: reauth } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (reauth) {
        toast("error", "That current password is not right.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        toast("error", "Could not change the password. Please try again.");
        return;
      }
      form.reset();
      toast("success", "Password changed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-next">New password</Label>
        <Input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={8} className="h-11" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
```

If `lib/supabase/client.ts` does not exist, check what `components/portal/member-photo-upload.tsx` imports for its browser client and use that same module.

- [ ] **Step 3: Write the header account menu**

Create `components/account-menu.tsx`, following the outside-click/Escape pattern already in `components/care-team-switcher-menu.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { logout } from "@/app/(auth)/login/actions";
import { ROLE_CHIP, ROLE_LABEL, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function AccountMenu({ name, role }: { name: string; role: UserRole }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
      >
        <span className="hidden truncate font-medium sm:inline">{name}</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", ROLE_CHIP[role])}>
          {ROLE_LABEL[role]}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-pop">
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            Your account
          </Link>
          <form action={logout}>
            <SubmitButton variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" pendingText="Signing out…">
              Sign out
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into the shell**

In `app/(app)/layout.tsx`, replace the `<span className="hidden min-w-0 items-center gap-2 sm:flex">…</span>` block AND the `<form action={logout}>…</form>` that follows it with a single:

```tsx
<AccountMenu name={profile.full_name} role={role} />
```

Add `import { AccountMenu } from "@/components/account-menu";` and remove the now-unused `logout` and `SubmitButton` imports if nothing else in the file uses them.

- [ ] **Step 5: Verify for two different roles**

Run: `npm run dev`.
- As the seeded caregiver: the header name opens a menu; **Your account** loads `/account`; editing the name saves and the header updates after refresh.
- As a seeded clinician: `/account` loads too (it is not fenced by `APP_PREFIXES`), and *Specialisation* does **not** appear, because `OWN_PROFILE` does not include it.
- Change the password with a deliberately wrong current password: the toast reads "That current password is not right."

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add "app/(app)/account/page.tsx" components/account/password-form.tsx components/account-menu.tsx "app/(app)/layout.tsx"
git commit -m "feat(account): a place to fix your own name, number and password"
```

---

### Task 8: Edit a care-team profile from the admin desk

**Files:**
- Modify: `components/admin/care-team-table.tsx`
- Modify: `app/(app)/admin/care-team/page.tsx` (widen the profiles select to include `whatsapp`)

**Interfaces:**
- Consumes: `EditRecordSheet`, `ADMIN_PROFILE`, `adminUpdateProfileAction`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Carry WhatsApp through to the table**

In `app/(app)/admin/care-team/page.tsx`, change the profiles select to:

```tsx
.select("id, full_name, email, phone, whatsapp, specialization, role, status")
```

and add `whatsapp: p.whatsapp,` to the `rows` mapping. Add `whatsapp: string | null;` to the `CareTeamRow` type in `components/admin/care-team-table.tsx`.

- [ ] **Step 2: Add the Edit profile action to each row**

In `components/admin/care-team-table.tsx`, in the cell that currently renders the suspend/reactivate `RowAction`, render the sheet beside it:

```tsx
<EditRecordSheet
  group={ADMIN_PROFILE}
  role="admin"
  values={row}
  title={`Edit ${row.full_name}`}
  description="Specialisation is shown to coordinators when they choose who to assign."
  successText="Profile updated"
  onSave={async (patch) => adminUpdateProfileAction(row.id, patch)}
/>
```

Add the imports:

```tsx
import { EditRecordSheet } from "@/components/edit-record-sheet";
import { ADMIN_PROFILE } from "@/lib/member-fields";
import { adminUpdateProfileAction } from "@/app/(app)/record-actions";
```

- [ ] **Step 3: Verify**

Run: `npm run dev`, sign in as admin, open `/admin/care-team`.
Expected: each row carries **Edit** beside Suspend. Editing a doctor's specialisation saves and the cell updates. Suspend still works and still offers Undo.

- [ ] **Step 4: Full check and commit**

```bash
npm run typecheck && npm run lint && npm run test:unit
git add components/admin/care-team-table.tsx "app/(app)/admin/care-team/page.tsx"
git commit -m "feat(admin): correct a professional's profile without a migration"
```

---

### Task 9: Record the phase in PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Append the record**

Add a section in the file's existing style covering: what was built (the four RPCs, the manifest, the shared sheet, the four surfaces), the §16 results from Task 3, and these assumptions:

- Coordinators get no write path, because §3 gives them `👁`; widening that is a matrix change and its own decision.
- The rename duplicate guard is narrower than the enrolment guard: it applies only when the member already has a `caregiver_id`, because matching on a NULL caregiver would collide every unclaimed member.
- Demographics are mirrored into the latest submitted onboarding `answers`; earlier submitted responses are left as issued.

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: record the record-correction core phase"
```
