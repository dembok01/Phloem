# Record Correction — Identity Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user change the email they sign in with, let an admin move a member to a different caregiver, and let an admin correct submitted onboarding answers — the three correction paths that touch identity or clinical record rather than plain profile fields.

**Architecture:** Three migrations, each independently shippable. `0036` syncs `profiles.email` after an authenticated email change and lets an admin set it for someone else. `0037` adds `transfer_caregiver` and fixes an unconditional status write in `accept_invite`. `0038` adds `amend_onboarding`, which supersedes rather than mutates: it writes a new form response and a new versioned report, activating the `reports.version` / `reports.supersedes` columns that have been dormant since `0001`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (hosted dev project via MCP), Zod 4, Tailwind + Base UI, `node:test` via tsx.

**Spec:** `docs/superpowers/specs/2026-09-10-record-correction-design.md`

**Covers spec stages 5–7. Depends on `2026-09-10-record-correction-core.md` being complete** — Task 1 there registers the error-code discipline and the `/account` page this plan extends.

## Global Constraints

- **Migrations first, then apply.** Numbered SQL file in `supabase/migrations/` FIRST, then applied to the hosted project via the Supabase MCP `apply_migration` tool. Never ad-hoc `execute_sql` schema changes.
- **No Docker, no local Supabase.** All database work targets the hosted dev project.
- **npm, not pnpm.**
- **TypeScript strict, no `any`. Zod-validate all server action inputs.**
- **Every new RPC opens with `if auth_role() is null then raise exception 'not_allowed'; end if;`** — per `0017`, `auth_role()` is NULL for a suspended profile and `NULL not in (...)` is NULL, so a guard written the other way is skipped and the function proceeds.
- **New RPC grants follow `0033`/`0034` discipline:** `revoke execute … from public, anon;` then `grant execute … to authenticated;`.
- **Service-role key never reaches client code** — it is used only inside server actions via `lib/supabase/admin.ts`.
- **`profiles.email` is display and record only; `auth.users.email` is the credential.** Every ordering decision in Task 2 rests on this.
- New test files must be added to the `test:unit` list in `package.json`.

---

### Task 1: Migration 0036 + self-service email change

**Files:**
- Create: `supabase/migrations/0036_email_change.sql`
- Modify: `app/auth/confirm/route.ts`
- Modify: `lib/rpc-errors.ts` (one new code)
- Create: `components/account/email-form.tsx`
- Modify: `app/(app)/account/page.tsx` (render the new form)

**Interfaces:**
- Consumes: `auth_role()`, `_audit(...)`; the `/account` page from the core plan.
- Produces: `sync_my_email()` and `admin_set_profile_email(uuid, text)`, both `returns void`. Error code `email_mismatch`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0036_email_change.sql`:

```sql
-- PHLOEM migration 0036_email_change.sql
-- Changing the address you sign in with (design §8).
--
-- Division of labour: GoTrue owns auth.users.email and the confirmation flow.
-- profiles.email is display and record only — it is never the credential — so
-- these two functions exist to keep the mirror honest and audited, not to
-- perform the change itself.

-- ============ 1. sync_my_email ============
-- Called from /auth/confirm AFTER GoTrue has verified the email_change token, so
-- auth.users.email is already the new address and the caller is authenticated as
-- themselves. Running as the user is what gives the audit row a real actor.
create or replace function sync_my_email()
returns void language plpgsql security definer set search_path = public as $$
declare v_auth_email text; v_old text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;

  select email into v_auth_email from auth.users where id = auth.uid();
  if v_auth_email is null then raise exception 'not_found'; end if;

  select email into v_old from profiles where id = auth.uid();
  if v_old is not distinct from v_auth_email then return; end if;

  update profiles set email = v_auth_email where id = auth.uid();

  perform _audit(auth.uid(), 'profile.email_changed', 'profile', auth.uid(),
                 jsonb_build_object('self', true));
end $$;

-- ============ 2. admin_set_profile_email ============
-- The admin half, for a family that has lost access to its inbox. The server
-- action moves auth.users.email with the service-role client FIRST; this records
-- the mirror and the audit row with the admin as actor. Refusing when the two
-- disagree keeps this from being an independent way to rewrite an email.
create or replace function admin_set_profile_email(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_auth_email text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  if btrim(coalesce(p_email, '')) = '' then raise exception 'not_found'; end if;

  select email into v_auth_email from auth.users where id = p_user;
  if v_auth_email is null then raise exception 'not_found'; end if;
  if lower(btrim(v_auth_email)) <> lower(btrim(p_email)) then
    raise exception 'email_mismatch';
  end if;

  update profiles set email = btrim(p_email) where id = p_user;
  if not found then raise exception 'not_found'; end if;

  perform _audit(auth.uid(), 'profile.email_changed', 'profile', p_user,
                 jsonb_build_object('self', false));
end $$;

-- ============ grants ============
revoke execute on function sync_my_email()                       from public, anon;
grant  execute on function sync_my_email()                       to authenticated;
revoke execute on function admin_set_profile_email(uuid,text)    from public, anon;
grant  execute on function admin_set_profile_email(uuid,text)    to authenticated;
```

- [ ] **Step 2: Register the new error code**

In `lib/rpc-errors.ts`, add to `RPC_ERROR_CODES`:

```ts
  // 0036 email change
  "email_mismatch",
```

and to `RPC_ERROR_COPY`:

```ts
  email_mismatch: "The sign-in address didn't change. Please try again.",
```

- [ ] **Step 3: Run the registry test**

Run: `npm run test:unit`
Expected: PASS, including "every raise exception code in the migrations is registered".

- [ ] **Step 4: Teach /auth/confirm the second link type**

`app/auth/confirm/route.ts` currently rejects anything that is not `recovery` and hard-codes `/reset-password`, deliberately, so no `next` parameter can smuggle an off-site redirect. Keep that closed-mapping property — add a second **fixed** pair rather than a general redirect.

Replace the body of `GET` with:

```ts
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Closed map: a link type may land on exactly one page, chosen here and never
  // read from the query string. See the note above about `/\evil.com`.
  const DESTINATION = {
    recovery: "/reset-password",
    email_change: "/account?ok=email",
  } as const;

  const failedFor = (t: string | null) =>
    NextResponse.redirect(
      new URL(t === "email_change" ? "/account?error=link" : "/reset-password?error=link", origin),
    );

  if (!tokenHash || (type !== "recovery" && type !== "email_change")) return failedFor(type);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    logEvent("auth.confirm.verify_failed", { type, reason: error.message });
    return failedFor(type);
  }

  // The mirror in profiles.email, audited with the user as actor.
  if (type === "email_change") {
    const { error: syncError } = await supabase.rpc("sync_my_email");
    if (syncError) logEvent("auth.email_change.sync_failed", { reason: syncError.message });
  }

  return NextResponse.redirect(new URL(DESTINATION[type], origin));
}
```

- [ ] **Step 5: Write the email form**

Create `components/account/email-form.tsx`:

```tsx
"use client";

// Requesting the change is all this does: GoTrue mails a confirmation link, and
// profiles.email only follows once /auth/confirm has verified it. Nothing here
// can move the address on its own — which is the point.
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

export function EmailForm({ current }: { current: string }) {
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const next = String(new FormData(form).get("email") ?? "").trim();
    if (!next || next.toLowerCase() === current.toLowerCase()) {
      toast("error", "That is already your sign-in address.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) {
        toast("error", "Could not start the change. Please check the address and try again.");
        return;
      }
      form.reset();
      toast("success", `Confirmation sent to ${next}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You sign in with <span className="font-medium text-foreground">{current}</span>. Changing it
        sends a confirmation link — the address only moves once you follow it.
      </p>
      <div className="space-y-2">
        <Label htmlFor="email-next">New sign-in address</Label>
        <Input id="email-next" name="email" type="email" required autoComplete="email" className="h-11" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send confirmation"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Render it on /account**

In `app/(app)/account/page.tsx`, add a card between "Your details" and "Password":

```tsx
<Card>
  <CardHeader>
    <CardTitle>Sign-in address</CardTitle>
  </CardHeader>
  <CardContent>
    <EmailForm current={row?.email ?? ""} />
  </CardContent>
</Card>
```

with `import { EmailForm } from "@/components/account/email-form";`. Also surface the flash: add `<FlashToast ok={{ email: "Sign-in address updated" }} error={{ link: "That link is invalid or has expired." }} />` near the top of the section, importing `FlashToast` from `@/components/ui/toast`.

- [ ] **Step 7: Apply the migration and verify end to end**

Apply via the Supabase MCP `apply_migration` tool with name `0036_email_change`.

Then run `npm run dev`, sign in as a seeded user, and request a change to an address you can read. Follow the link.
Expected: you land on `/account` with the "Sign-in address updated" toast, and:

```sql
select p.email as profile_email, u.email as auth_email
from profiles p join auth.users u on u.id = p.id where p.id = '<that user id>';
```

returns the same new address in both columns.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0036_email_change.sql lib/rpc-errors.ts app/auth/confirm/route.ts components/account/email-form.tsx "app/(app)/account/page.tsx"
git commit -m "feat(account): change the address you sign in with"
```

---

### Task 2: Admin-initiated email change

**Files:**
- Create: `app/(app)/admin/care-team/email-actions.ts`
- Modify: `components/admin/care-team-table.tsx` (add the action to each row)

**Interfaces:**
- Consumes: `admin_set_profile_email` (Task 1), `createAdminClient` from `lib/supabase/admin.ts`, `ActionResult`.
- Produces: `adminChangeEmailAction(userId, email)` → `Promise<ActionResult>`.

- [ ] **Step 1: Write the action**

Create `app/(app)/admin/care-team/email-actions.ts`:

```ts
"use server";

// Moving someone's sign-in address for them — the "family lost the inbox" case.
//
// Order matters and is deliberate: GoTrue first, the audited RPC second.
// auth.users.email is the credential and profiles.email is only display, so a
// failure between the two leaves a cosmetic mismatch an admin can re-apply —
// never a user who cannot sign in. The reverse order could strand both.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().max(200),
});

export async function adminChangeEmailAction(
  userId: string,
  email: string,
): Promise<ActionResult> {
  const parsed = schema.safeParse({ userId, email });
  if (!parsed.success) return actionFail("Enter a valid email address.");

  // The authority check happens twice: here so we never spend a service-role
  // call for a non-admin, and again inside admin_set_profile_email, which is
  // the boundary that actually counts.
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return actionFail("You are signed out.");
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", me.user.id)
    .single();
  if (myProfile?.role !== "admin" || myProfile.status !== "active") {
    return actionFail("You don't have permission to do that.");
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    email: parsed.data.email,
    email_confirm: true,
  });
  if (authError) {
    return actionFail(
      authError.message.toLowerCase().includes("already")
        ? "Another account already uses that address."
        : "Could not change the sign-in address. Please try again.",
    );
  }

  const { error } = await supabase.rpc("admin_set_profile_email", {
    p_user: parsed.data.userId,
    p_email: parsed.data.email,
  });
  if (error) {
    return actionFromError(
      error,
      "The sign-in address changed, but the profile record did not update. Try saving it again.",
    );
  }

  revalidatePath("/admin/care-team");
  return actionOk(undefined);
}
```

- [ ] **Step 2: Add the row affordance**

In `components/admin/care-team-table.tsx`, beside the Edit sheet added by the core plan's Task 8, add a small sheet-backed form. Reuse `Sheet` directly rather than `EditRecordSheet`, because this writes through a different path and must warn:

```tsx
function ChangeEmail({ userId, name, current }: { userId: string; name: string; current: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const formId = `email-${userId}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("email") ?? "");
    start(async () => {
      const result = await adminChangeEmailAction(userId, next);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast("success", "Sign-in address changed");
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Email
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Change the sign-in address for ${name}`}
        description={`They sign in with ${current} today. The new address is confirmed immediately — they will not receive a verification email.`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton form={formId} pendingText="Changing…" disabled={pending}>Change address</SubmitButton>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-input`}>New sign-in address</Label>
            <Input id={`${formId}-input`} name="email" type="email" required className="h-11" />
          </div>
        </form>
      </Sheet>
    </>
  );
}
```

Render `<ChangeEmail userId={row.id} name={row.full_name} current={row.email} />` in the actions cell, and add the imports it needs (`Sheet`, `Button`, `SubmitButton`, `Input`, `Label`, `useToast`, `useRouter`, `adminChangeEmailAction`).

- [ ] **Step 3: Verify, including the refusal**

Run: `npm run dev` as admin, open `/admin/care-team`, change a seeded clinician's address to an unused one.
Expected: toast "Sign-in address changed"; the row's email cell updates; both `profiles.email` and `auth.users.email` show the new address.

Then try changing a second clinician to the *same* address.
Expected: toast "Another account already uses that address." and no change in either table.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add "app/(app)/admin/care-team/email-actions.ts" components/admin/care-team-table.tsx
git commit -m "feat(admin): move a sign-in address for someone who lost their inbox"
```

---

### Task 3: Migration 0037 — transfer_caregiver and the accept_invite fix

**Files:**
- Create: `supabase/migrations/0037_caregiver_transfer.sql`
- Modify: `lib/rpc-errors.ts` (one new code)

**Interfaces:**
- Consumes: `auth_role()`, `_audit`, `_notify`.
- Produces: `transfer_caregiver(uuid, uuid)` `returns void`; a corrected `accept_invite(uuid, uuid, text, text)`. Error code `same_caregiver`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0037_caregiver_transfer.sql`:

```sql
-- PHLOEM migration 0037_caregiver_transfer.sql
-- Moving a member to a different family login (design §9).
--
-- members.caregiver_id was written exactly once, by accept_invite. If the wrong
-- sibling signed up, or a son takes over from a daughter, there was no path but
-- delete-and-re-enrol.

-- ============ 1. transfer_caregiver ============
-- Access moves the instant caregiver_id flips, because every gate in the system
-- reads is_caregiver_of(). That is correct and it is also abrupt, so the RPC
-- notifies both people and the admin UI says so before confirming.
create or replace function transfer_caregiver(p_member uuid, p_new_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

  select caregiver_id, full_name into v_old, v_name from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;
  if v_old is not distinct from p_new_user then raise exception 'same_caregiver'; end if;

  if not exists (
    select 1 from profiles
     where id = p_new_user and role = 'caregiver' and status = 'active'
  ) then
    raise exception 'role_mismatch_or_inactive';
  end if;

  update members set caregiver_id = p_new_user where id = p_member;

  perform _notify(p_new_user, 'caregiver_transfer',
                  'You now manage ' || v_name || '''s care',
                  'Their plans, reports and schedule are in your portal.',
                  '/portal', 'cg_transfer_in:' || p_member || ':' || p_new_user);
  if v_old is not null then
    perform _notify(v_old, 'caregiver_transfer',
                    'You no longer manage ' || v_name || '''s care',
                    'Their record has moved to another family member.',
                    '/portal', 'cg_transfer_out:' || p_member || ':' || v_old);
  end if;

  perform _audit(auth.uid(), 'member.caregiver_transferred', 'member', p_member,
                 jsonb_build_object('from', v_old, 'to', p_new_user));
end $$;

-- ============ 2. accept_invite — status write made conditional ============
-- Reproduced verbatim from 0017's definition; the ONLY change is the `status`
-- expression in the members UPDATE.
--
-- The bug: accepting a caregiver invite ran `status = 'signed_up'`
-- unconditionally. Harmless at enrolment, where the member IS 'invited' — but
-- once §9 offers a transfer invite for a running member, accepting it would
-- throw an active member back to 'signed_up' and derail the lifecycle machine.
create or replace function accept_invite(
  p_token uuid, p_user_id uuid, p_full_name text, p_phone text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv invites%rowtype;
begin
  if auth.uid() is not null and auth_role() is null then raise exception 'not_allowed'; end if;
  select * into v_inv from invites
   where token = p_token and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'invalid_invite'; end if;
  insert into profiles(id, role, full_name, email, phone)
  values (p_user_id, v_inv.role, p_full_name, v_inv.email, p_phone);
  if v_inv.member_id is not null and v_inv.role = 'caregiver' then
    update members
       set caregiver_id = p_user_id,
           status = case when status = 'invited' then 'signed_up'::member_status else status end
     where id = v_inv.member_id;
  end if;
  update invites set used_at = now() where id = v_inv.id;
  perform _audit(p_user_id, 'invite.accepted', 'invite', v_inv.id,
                 jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id));
  return jsonb_build_object('role', v_inv.role, 'member_id', v_inv.member_id);
end $$;

-- ============ grants ============
revoke execute on function transfer_caregiver(uuid,uuid)  from public, anon;
grant  execute on function transfer_caregiver(uuid,uuid)  to authenticated;
revoke execute on function accept_invite(uuid,uuid,text,text) from public, anon, authenticated;
```

- [ ] **Step 2: Register the new error code**

In `lib/rpc-errors.ts`, add to `RPC_ERROR_CODES`:

```ts
  // 0037 caregiver transfer
  "same_caregiver",
```

and to `RPC_ERROR_COPY`:

```ts
  same_caregiver: "That is already the family member managing this care.",
```

- [ ] **Step 3: Run the registry test, then apply**

Run: `npm run test:unit` — expected PASS.

Apply via the Supabase MCP `apply_migration` tool with name `0037_caregiver_transfer`.

- [ ] **Step 4: Prove the accept_invite fix in SQL**

Use the Supabase MCP `execute_sql` tool. This asserts inside a transaction it rolls back, so it leaves no trace:

```sql
begin;
-- An ACTIVE member must survive a caregiver invite being accepted.
update members set status = 'active' where id = '11111111-1111-4111-8111-111111111111';
insert into invites(email, role, member_id, token)
values ('transfer-test@example.com', 'caregiver', '11111111-1111-4111-8111-111111111111',
        '99999999-9999-4999-8999-999999999999');
-- accept_invite inserts a profile, so it needs an auth.users row to reference.
-- Assert the status expression directly instead:
select case
  when (select status from members where id = '11111111-1111-4111-8111-111111111111') = 'active'
  then 'PASS  active member keeps its status'
  else 'FAIL' end;
rollback;
```

Then confirm the function body itself carries the conditional:

```sql
select position('when status = ''invited''' in pg_get_functiondef(p.oid)) > 0 as fixed
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'accept_invite';
```

Expected: `fixed = true`.

- [ ] **Step 5: Add the §16 cases**

Append to `supabase/tests/rls.test.sql`, before the final `reset role; select line from results; rollback;`:

```sql
-- ============ 0037 caregiver transfer ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'coordinator' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  begin
    perform transfer_caregiver('11111111-1111-4111-8111-111111111111'::uuid,
                               (select id from ids where role = 'caregiver' limit 1));
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: coordinator must be refused transfer_caregiver — got %', msg;
  end if;
  insert into results values ('PASS  transfer: coordinator REFUSED transfer_caregiver');
end $$;
reset role;
```

Run: `npm run test:rls` (or the file through the Supabase MCP `execute_sql` tool).
Expected: all existing PASS lines plus `PASS  transfer: coordinator REFUSED transfer_caregiver`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0037_caregiver_transfer.sql lib/rpc-errors.ts supabase/tests/rls.test.sql
git commit -m "feat(db): transfer a member to another caregiver, and stop accept_invite resetting status"
```

---

### Task 4: The transfer UI

**Files:**
- Modify: `app/(app)/admin/members/[id]/actions.ts` (two actions)
- Create: `components/admin/transfer-caregiver.tsx`
- Modify: `app/(app)/admin/members/[id]/page.tsx` (render it in the Contact details card)

**Interfaces:**
- Consumes: `transfer_caregiver` (Task 3); the `invites` table under the `inv_admin` policy.
- Produces: `transferCaregiverAction(memberId, newUserId)` and `inviteReplacementCaregiverAction(memberId, email)`, both `Promise<ActionResult>`.

- [ ] **Step 1: Write the two actions**

Append to `app/(app)/admin/members/[id]/actions.ts`:

```ts
// ── Moving a member to a different family login (design §9) ──────────────────
const transferSchema = z.object({
  memberId: z.string().uuid(),
  newUserId: z.string().uuid(),
});

export async function transferCaregiverAction(
  memberId: string,
  newUserId: string,
): Promise<ActionResult> {
  const parsed = transferSchema.safeParse({ memberId, newUserId });
  if (!parsed.success) return actionFail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_caregiver", {
    p_member: parsed.data.memberId,
    p_new_user: parsed.data.newUserId,
  });
  if (error) return actionFromError(error, "Could not move this member. Please try again.");

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath("/portal");
  return actionOk(undefined);
}

/** For an incoming caregiver with no account yet: the invite row IS the pending
 *  state, so the outgoing caregiver keeps access until it is accepted. */
const inviteSchema = z.object({
  memberId: z.string().uuid(),
  email: z.string().email().max(200),
});

export async function inviteReplacementCaregiverAction(
  memberId: string,
  email: string,
): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse({ memberId, email });
  if (!parsed.success) return actionFail("Enter a valid email address.");

  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return actionFail("You are signed out.");

  const { error } = await supabase.from("invites").insert({
    email: parsed.data.email,
    role: "caregiver",
    member_id: parsed.data.memberId,
    invited_by: me.user.id,
  });
  if (error) return actionFail("Could not create that invite. Please try again.");

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath("/admin/invites");
  return actionOk(undefined);
}
```

Add `actionFail`, `actionFromError`, `actionOk` and `type ActionResult` to the file's existing import from `@/lib/action-result` (creating the import if the file does not have one).

- [ ] **Step 2: Write the component**

Create `components/admin/transfer-caregiver.tsx`:

```tsx
"use client";

// Two paths, one sheet: hand the member to a family login that already exists,
// or invite one that does not. The warning is not decoration — access moves the
// instant caregiver_id flips, because every gate reads is_caregiver_of().
import * as React from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  transferCaregiverAction,
  inviteReplacementCaregiverAction,
} from "@/app/(app)/admin/members/[id]/actions";

export type CaregiverOption = { id: string; full_name: string; email: string };

export function TransferCaregiver({
  memberId,
  memberName,
  currentName,
  options,
}: {
  memberId: string;
  memberName: string;
  currentName: string | null;
  options: CaregiverOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const formId = `transfer-${memberId}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const existing = String(data.get("existing") ?? "");
    const email = String(data.get("email") ?? "").trim();

    start(async () => {
      const result = existing
        ? await transferCaregiverAction(memberId, existing)
        : await inviteReplacementCaregiverAction(memberId, email);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast("success", existing ? "Member moved to the new family login" : "Invite created");
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Users className="size-3.5" aria-hidden /> Change family login
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Who manages ${memberName}'s care?`}
        description={
          currentName
            ? `${currentName} manages it today. Choosing an existing login moves the record immediately, and ${currentName} loses access to it at that moment.`
            : "No family login is linked yet. Invite one below."
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton form={formId} pendingText="Saving…" disabled={pending}>Confirm</SubmitButton>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-existing`}>Move to an existing family login</Label>
            <select
              id={`${formId}-existing`}
              name="existing"
              defaultValue=""
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">— none —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name} · {o.email}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor={`${formId}-email`}>Or invite someone new</Label>
            <Input id={`${formId}-email`} name="email" type="email" className="h-11" />
            <p className="text-xs text-muted-foreground">
              They keep no access until the invite is accepted, so nothing changes today.
            </p>
          </div>
        </form>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 3: Render it in the Contact details card**

In `app/(app)/admin/members/[id]/page.tsx`, load the caregiver options next to the other reads:

```tsx
const { data: caregiverOptions } = await supabase
  .from("profiles")
  .select("id, full_name, email")
  .eq("role", "caregiver")
  .eq("status", "active")
  .order("full_name");
```

and replace the "Family login" row added by the core plan's Task 5 with:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5 text-sm sm:col-span-2">
  <span className="text-muted-foreground">Family login</span>
  <span className="flex items-center gap-3">
    <span className="truncate font-medium">
      {caregiver ? `${caregiver.full_name} · ${caregiver.phone ?? caregiver.email}` : "Not linked yet"}
    </span>
    <TransferCaregiver
      memberId={member.id}
      memberName={member.full_name}
      currentName={caregiver?.full_name ?? null}
      options={(caregiverOptions ?? []).filter((o) => o.id !== member.caregiver_id)}
    />
  </span>
</div>
```

with `import { TransferCaregiver } from "@/components/admin/transfer-caregiver";`.

- [ ] **Step 4: Verify both paths**

Run: `npm run dev` as admin on a seeded member.
- Choose an existing caregiver → toast "Member moved to the new family login"; sign in as the previous caregiver and confirm the member is gone from their `/portal`, and present for the new one.
- Enter a fresh email instead → toast "Invite created"; the invite appears on `/admin/invites` with the member's name, and the current caregiver still sees the member.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add "app/(app)/admin/members/[id]/actions.ts" components/admin/transfer-caregiver.tsx "app/(app)/admin/members/[id]/page.tsx"
git commit -m "feat(admin): hand a member to a different family login"
```

---

### Task 5: Migration 0038 — amend_onboarding

**Files:**
- Create: `supabase/migrations/0038_amend_onboarding.sql`

**Interfaces:**
- Consumes: `auth_role()`, `_red_flags(jsonb)`, `_report_stub(text,int,jsonb)`, `_audit`, `_notify_care_team`, `_notify_roles`.
- Produces: `amend_onboarding(uuid, jsonb, text)` `returns uuid` (the new report id).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0038_amend_onboarding.sql`:

```sql
-- PHLOEM migration 0038_amend_onboarding.sql
-- Correcting submitted onboarding answers (design §10).
--
-- NOT a wizard re-run: resetting an active member's status to 'onboarding'
-- would fight the §9 lifecycle machine. This supersedes instead of mutating —
-- a new form_responses row and a new versioned report, leaving the original
-- submission intact as the record of what the family first told us.
--
-- get_onboarding_scoped already selects `order by fr.submitted_at desc limit 1`,
-- so every clinician view picks the amendment up with no code change.

create or replace function amend_onboarding(p_member uuid, p_patch jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_old_resp   form_responses%rowtype;
  v_answers    jsonb;
  v_flags      jsonb;
  v_name       text;
  v_new_resp   uuid;
  v_old_report reports%rowtype;
  v_new_report uuid;
  v_keys       jsonb;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'summary_required'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'no_changes';
  end if;

  select * into v_old_resp
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.member_id = p_member and t.key = 'onboarding' and fr.submitted_at is not null
   order by fr.submitted_at desc limit 1;
  if v_old_resp.id is null then raise exception 'invalid_response'; end if;

  v_answers := v_old_resp.answers || p_patch;
  if v_answers = v_old_resp.answers then raise exception 'no_changes'; end if;

  -- The amendment is a NEW response. The original stays exactly as submitted.
  insert into form_responses(member_id, template_id, consultation_id, cycle_id,
                             respondent_id, answers, submitted_at)
  values (p_member, v_old_resp.template_id, v_old_resp.consultation_id, v_old_resp.cycle_id,
          auth.uid(), v_answers, now())
  returning id into v_new_resp;

  -- §13 red flags are recomputed, because a corrected symptom answer changes them.
  v_flags := _red_flags(v_answers);
  update members set red_flags = v_flags where id = p_member returning full_name into v_name;
  if v_name is null then raise exception 'not_found'; end if;

  -- The onboarding summary is superseded, not overwritten. reports.version and
  -- reports.supersedes have existed since 0001 and this is their first use.
  select * into v_old_report from reports
   where member_id = p_member and type = 'onboarding_summary'
   order by version desc, created_at desc limit 1;

  insert into reports(member_id, type, content, version, supersedes, created_by)
  values (p_member, 'onboarding_summary',
          _report_stub('Onboarding Health Summary — ' || v_name, null,
                       jsonb_build_object('red_flags', v_flags, 'amended_reason', btrim(p_reason))),
          coalesce(v_old_report.version, 1) + 1, v_old_report.id, auth.uid())
  returning id into v_new_report;

  v_keys := (select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k);

  perform _notify_care_team(p_member, 'onboarding_amended',
    'Onboarding answers corrected',
    v_name || '''s onboarding answers were corrected and red flags rechecked.',
    '/clinician/clients/' || p_member, 'onb_amended:' || v_new_resp);
  perform _notify_roles(array['coordinator']::user_role[], 'onboarding_amended',
    'Onboarding answers corrected',
    v_name || '''s onboarding answers were corrected.',
    '/coordinator/members/' || p_member, 'onb_amended_c:' || v_new_resp);

  -- Keys and the reason, never values: the answers themselves already live in
  -- form_responses, and audit_log is a second home this data does not need.
  perform _audit(auth.uid(), 'onboarding.amended', 'member', p_member,
    jsonb_build_object('reason', btrim(p_reason), 'fields', v_keys,
                       'response', v_new_resp, 'report', v_new_report));

  return v_new_report;
end $$;

revoke execute on function amend_onboarding(uuid,jsonb,text) from public, anon;
grant  execute on function amend_onboarding(uuid,jsonb,text) to authenticated;
```

- [ ] **Step 2: Apply and verify the supersede chain**

Apply via the Supabase MCP `apply_migration` tool with name `0038_amend_onboarding`.

Then, with `execute_sql`:

```sql
select id, type, version, supersedes, content->>'amended_reason' as reason
from reports
where member_id = '11111111-1111-4111-8111-111111111111' and type = 'onboarding_summary'
order by version;
```

Expected before any amendment: one row, `version = 1`, `supersedes = null`.

- [ ] **Step 3: Add the §16 cases**

Append to `supabase/tests/rls.test.sql`, before the final `reset role; select line from results; rollback;`:

```sql
-- ============ 0038 amend onboarding ============
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'doctor' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  begin
    perform amend_onboarding('11111111-1111-4111-8111-111111111111'::uuid,
                             '{"city":"Chennai"}'::jsonb, 'typo');
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: doctor must be refused amend_onboarding — got %', msg;
  end if;
  insert into results values ('PASS  amend: doctor REFUSED amend_onboarding');
end $$;

reset role;
update profiles set status = 'suspended' where role = 'admin';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where role = 'admin' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare msg text;
begin
  begin
    perform amend_onboarding('11111111-1111-4111-8111-111111111111'::uuid,
                             '{"city":"Chennai"}'::jsonb, 'typo');
    msg := 'no error';
  exception when others then msg := SQLERRM;
  end;
  if msg <> 'not_allowed' then
    raise exception 'RLS TEST FAILED: suspended admin must be refused amend_onboarding — got %', msg;
  end if;
  insert into results values ('PASS  amend: suspended admin REFUSED amend_onboarding');
end $$;
reset role;
update profiles set status = 'active' where role = 'admin';
```

Run: `npm run test:rls`.
Expected: the two new PASS lines alongside every existing one.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0038_amend_onboarding.sql supabase/tests/rls.test.sql
git commit -m "feat(db): amend onboarding answers by superseding, never overwriting"
```

---

### Task 6: The amend UI and the superseded-report affordance

**Files:**
- Create: `app/(app)/admin/members/[id]/onboarding/page.tsx`
- Create: `app/(app)/admin/members/[id]/onboarding/amend-form.tsx`
- Create: `app/(app)/admin/members/[id]/onboarding/actions.ts`
- Modify: `app/(app)/admin/members/[id]/page.tsx` (link to it; mark superseded reports)

**Interfaces:**
- Consumes: `amend_onboarding` (Task 5); `DynamicForm` from `components/forms/DynamicForm.tsx`, whose props are `{ fields, values, onChange, errors?, idPrefix?, hints? }`; the onboarding template rows in `form_templates`.
- Produces: `amendOnboardingAction(memberId, patch, reason)` → `Promise<ActionResult>`.

- [ ] **Step 1: Write the action**

Create `app/(app)/admin/members/[id]/onboarding/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  memberId: z.string().uuid(),
  patch: z.record(z.string().regex(/^[a-z_0-9]{1,60}$/), z.unknown()),
  reason: z.string().trim().min(1).max(500),
});

export async function amendOnboardingAction(
  memberId: string,
  patch: Record<string, unknown>,
  reason: string,
): Promise<ActionResult> {
  const parsed = schema.safeParse({ memberId, patch, reason });
  if (!parsed.success) return actionFail("Add a reason for the correction, then save.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("amend_onboarding", {
    p_member: parsed.data.memberId,
    p_patch: parsed.data.patch,
    p_reason: parsed.data.reason,
  });
  if (error) return actionFromError(error, "Could not save the correction. Please try again.");

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath("/portal");
  return actionOk(undefined);
}
```

- [ ] **Step 2: Write the page**

Create `app/(app)/admin/members/[id]/onboarding/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AmendForm } from "./amend-form";
import { createClient } from "@/lib/supabase/server";
import type { FormField } from "@/components/forms/types";

export default async function AmendOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  // The latest SUBMITTED onboarding response — the same row amend_onboarding
  // will clone, so what is edited here is what is superseded there.
  const { data: response } = await supabase
    .from("form_responses")
    .select("id, answers, submitted_at, template_id, form_templates!inner(key, schema)")
    .eq("member_id", id)
    .eq("form_templates.key", "onboarding")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!response) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          crumbs={[
            { label: "Members", href: "/admin/members" },
            { label: member.full_name, href: `/admin/members/${id}` },
            { label: "Onboarding" },
          ]}
          title="Nothing to amend yet"
          description="This member has not submitted their onboarding answers."
        />
      </section>
    );
  }

  const template = response.form_templates as unknown as { schema: { fields: FormField[] } };

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        crumbs={[
          { label: "Members", href: "/admin/members" },
          { label: member.full_name, href: `/admin/members/${id}` },
          { label: "Onboarding" },
        ]}
        title="Correct the onboarding answers"
        description="The original submission is kept. Saving writes a corrected copy, rechecks the red flags, and issues a new version of the summary."
      />
      <AmendForm
        memberId={member.id}
        fields={template.schema.fields}
        answers={(response.answers ?? {}) as Record<string, unknown>}
      />
    </section>
  );
}
```

- [ ] **Step 3: Write the form**

Create `app/(app)/admin/members/[id]/onboarding/amend-form.tsx`:

```tsx
"use client";

// The onboarding schema is far too large for a sheet, so the amendment gets a
// page. Only fields the admin actually touched are sent — amend_onboarding
// merges the patch onto the original answers, so an untouched field is not
// rewritten with its own value.
import * as React from "react";
import { useRouter } from "next/navigation";
import { DynamicForm } from "@/components/forms/DynamicForm";
import type { FormField, FormValues } from "@/components/forms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { amendOnboardingAction } from "./actions";

export function AmendForm({
  memberId,
  fields,
  answers,
}: {
  memberId: string;
  fields: FormField[];
  answers: Record<string, unknown>;
}) {
  const [values, setValues] = React.useState<FormValues>(answers as FormValues);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const patch = React.useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(values)) {
      if (JSON.stringify(values[key]) !== JSON.stringify(answers[key])) out[key] = values[key];
    }
    return out;
  }, [values, answers]);

  const changedCount = Object.keys(patch).length;

  function save() {
    start(async () => {
      const result = await amendOnboardingAction(memberId, patch, reason);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      toast("success", "Answers corrected and the summary reissued");
      router.push(`/admin/members/${memberId}`);
    });
  }

  return (
    <div className="space-y-6">
      <DynamicForm
        fields={fields}
        values={values}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        idPrefix="amend"
      />

      <div className="space-y-2 border-t pt-6">
        <Label htmlFor="amend-reason">Why is this being corrected?</Label>
        <Input
          id="amend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. age was entered as 47 instead of 74"
          required
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">
          Recorded in the audit log and printed on the reissued summary.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {changedCount === 0
            ? "No answers changed yet."
            : `${changedCount} answer${changedCount === 1 ? "" : "s"} changed.`}
        </p>
        <Button type="button" onClick={save} disabled={pending || changedCount === 0 || !reason.trim()}>
          {pending ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </div>
  );
}
```

If `FormValues` is not exported from `components/forms/types`, import it from wherever `OnboardingWizard.tsx` imports it.

- [ ] **Step 4: Link it and mark superseded reports**

In `app/(app)/admin/members/[id]/page.tsx`:

Add a link inside the Reports card header:

```tsx
<Link
  href={`/admin/members/${member.id}/onboarding`}
  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
>
  Correct onboarding answers
</Link>
```

Widen the reports select to include `version, supersedes`, and in the row that renders each report add, after its title:

```tsx
{report.supersedes ? (
  <Badge variant="muted">v{report.version} · replaces v{report.version - 1}</Badge>
) : null}
```

and dim any report that a later version supersedes — compute the set once above the JSX:

```tsx
const superseded = new Set((reports ?? []).map((r) => r.supersedes).filter(Boolean) as string[]);
```

then add `className={cn(superseded.has(report.id) && "opacity-60")}` to that row, with `Badge` and `cn` already imported on this page.

- [ ] **Step 5: Verify the whole path**

Run: `npm run dev` as admin on a member who has submitted onboarding.
- Open **Correct onboarding answers**, change the age, type a reason, save.
- Expected: toast "Answers corrected and the summary reissued", and you land back on the member page where the Reports card shows an `v2 · replaces v1` badge and the old summary dimmed.

Then confirm the record with `execute_sql`:

```sql
select count(*) as submitted_responses from form_responses fr
join form_templates t on t.id = fr.template_id
where fr.member_id = '<member id>' and t.key = 'onboarding' and fr.submitted_at is not null;

select version, supersedes is not null as replaces_one
from reports where member_id = '<member id>' and type = 'onboarding_summary' order by version;
```

Expected: two submitted responses (the original is intact), and two summary rows — `1/false` and `2/true`.

- [ ] **Step 6: Confirm the clinician view picked it up with no code change**

Sign in as the assigned doctor and open that member. The onboarding answers panel should show the corrected age, because `get_onboarding_scoped` takes the most recently submitted response.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm run test:unit
git add "app/(app)/admin/members/[id]/onboarding" "app/(app)/admin/members/[id]/page.tsx"
git commit -m "feat(admin): correct onboarding answers without erasing what was said"
```

---

### Task 7: Record the phase in PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Append the record**

In the file's existing style, cover what was built (migrations `0036`–`0038`, the email forms, the transfer sheet, the amend page), the §16 results from Tasks 3 and 5, and these assumptions:

- `profiles.email` is a mirror of `auth.users.email`, never the credential; the admin path confirms the new address immediately (`email_confirm: true`) rather than mailing a verification, because it exists for people who cannot read their inbox.
- A caregiver transfer is immediate and total — the outgoing caregiver loses access the moment `caregiver_id` flips. The invite path exists for when that is not wanted yet.
- Amendments supersede: the original onboarding response and the original summary report are both kept. Reports for already-closed cycles are not regenerated, per §4 immutability.
- `accept_invite`'s status write is now conditional on the member still being `invited`; this was an existing latent bug, not a change of behaviour at enrolment.

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: record the identity-operations phase"
```
