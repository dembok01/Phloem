# Admin Enrollment Invite Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return and display the exact caregiver invite link immediately after an admin enrolls a member, without automatically sending email.

**Architecture:** Move enrollment validation and RPC result shaping into a small testable service, while retaining Supabase authentication and page revalidation in the server action. Drive a client enrollment form with `useActionState`, rendering an accessible success handoff with copy/share controls from the typed action result.

**Tech Stack:** Next.js 15 App Router, React 19 server actions, TypeScript, Zod, Supabase RPC, Node test runner, Tailwind/shadcn UI.

**Spec:** `docs/superpowers/specs/2026-09-07-admin-enrollment-invite-link-design.md`

## Global Constraints

- Do not send an enrollment email automatically.
- Do not put the invite token in a URL query string, logs, or unrelated client state.
- Reuse `create_member_with_invite`; make no database, RPC, or RLS changes.
- Preserve the existing Invites list, copy, expiry, and revoke behavior.
- Preserve unrelated `package.json` and `package-lock.json` changes already in the worktree.
- Do not commit unless the user asks.

---

### Task 1: Enrollment result contract

**Files:**
- Create: `lib/member-enrollment.ts`
- Create: `lib/member-enrollment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `inviteUrl(token: string)` and `ActionResult<T>`.
- Produces: `CreatedMemberInvite`, `MemberEnrollmentState`, and `enrollMember(formData, runRpc)`.

- [x] **Step 1: Write the failing success-path regression test**

Create a valid `FormData`, return a literal token from a narrow fake RPC, and assert the complete literal result:

```ts
assert.deepEqual(result, {
  ok: true,
  data: {
    memberName: "Mary Thomas",
    caregiverEmail: "alex@example.com",
    inviteUrl: "https://dashboard.example.com/invite/11111111-2222-3333-4444-555555555555",
  },
});
```

- [x] **Step 2: Run the focused test and confirm it fails because the service does not exist**

Run: `npx tsx --tsconfig tsconfig.test.json --test lib/member-enrollment.test.ts`

- [x] **Step 3: Implement validation, RPC argument mapping, and typed result shaping**

The implementation must return `actionFail(...)` for invalid input, RPC errors, or a missing token and `actionOk(...)` only when a non-empty token is returned.

- [x] **Step 4: Add invalid-input and missing-token cases, then run the focused test**

Run: `npx tsx --tsconfig tsconfig.test.json --test lib/member-enrollment.test.ts`

- [x] **Step 5: Register the regression test in `test:unit` without altering unrelated dependencies**

Add `lib/member-enrollment.test.ts` to the existing explicit test file list.

### Task 2: Server action and enrollment UI

**Files:**
- Modify: `app/(app)/admin/members/actions.ts`
- Modify: `app/(app)/admin/members/new/page.tsx`
- Create: `components/admin/member-enrollment-form.tsx`
- Create: `components/admin/member-invite-success.tsx`
- Modify: `components/copy-field.tsx`
- Create: `components/admin/member-invite-success.test.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `enrollMember(formData, runRpc)` and `MemberEnrollmentState` from Task 1.
- Produces: `createMember(previousState, formData)` for `useActionState` and a success panel that receives `CreatedMemberInvite`.

- [x] **Step 1: Write a failing rendering test for the post-enrollment handoff**

Render the real success panel with a literal result and assert that the member, caregiver email, exact URL, manual-send message, and copy affordance appear.

- [x] **Step 2: Run the focused rendering test and confirm the component is missing**

Run: `npx tsx --tsconfig tsconfig.test.json --test components/admin/member-invite-success.test.tsx`

- [x] **Step 3: Change the server action to return the typed result**

Delegate validation and RPC result handling to `enrollMember`, revalidate `/admin/members` and `/admin/invites` only on success, and remove redirect-based success/error handling.

- [x] **Step 4: Build the client enrollment form and success handoff**

Use `useActionState`; keep all current fields; render inline errors; update the action copy; show the exact link through `CopyField`; conditionally expose Web Share; and provide links to enroll another member and view invites.

- [x] **Step 5: Simplify the page to server-render the header and client form**

Update the page description to state that no email is sent automatically and remove query-string error handling.

- [x] **Step 6: Improve the shared copy field’s narrow-layout behavior and accessible status**

Keep the visible/selectable fallback and ensure the input can shrink without pushing actions outside the card.

- [x] **Step 7: Run both focused regression tests**

Run: `npx tsx --tsconfig tsconfig.test.json --test lib/member-enrollment.test.ts components/admin/member-invite-success.test.tsx`

- [x] **Step 8: Register the component test in `test:unit`**

Add `components/admin/member-invite-success.test.tsx` to the existing explicit test file list.

### Task 3: Verification

**Files:**
- Verify all files changed in Tasks 1–2.

**Interfaces:**
- Consumes: completed enrollment flow.
- Produces: fresh verification evidence.

- [x] **Step 1: Run the full unit suite**

Run: `npm run test:unit`

- [x] **Step 2: Run TypeScript validation**

Run: `npm run typecheck`

- [x] **Step 3: Run ESLint on the changed TypeScript files**

Run: `npx eslint 'app/(app)/admin/members/actions.ts' 'app/(app)/admin/members/new/page.tsx' components/admin/member-enrollment-form.tsx components/admin/member-invite-success.tsx components/admin/member-invite-success.test.tsx components/copy-field.tsx lib/member-enrollment.ts lib/member-enrollment.test.ts`

- [x] **Step 4: Run the production build**

Run: `npm run build`

- [x] **Step 5: Review the final diff for scope, token handling, and preservation of unrelated changes**

Run: `git diff --check` and inspect only the files listed in this plan plus the two documentation files.
