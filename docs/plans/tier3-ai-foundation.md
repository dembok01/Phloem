# Tier 3 · T3.1 — AI foundation

The three seams the flagship (T3.2 AI-drafted assessments) builds on — all gated, PHI-bounded,
audited. No generation UI yet; everything is off until `AI_ENABLED=true`.

## Delivered
- **`lib/ai/provider.ts`** — the vendor seam. `AI_ENABLED` kill-switch (off by default), model
  env-selected + Vercel-AI-Gateway-routed (`AI_MODEL`, default `anthropic/claude-sonnet-5`),
  `draftObject({ schema, system, prompt })` wrapping `generateObject` (structured output against a
  Zod schema). Returns `null` when disabled or on failure — a missing draft never blocks the
  human-in-the-loop path. `server-only`. New dep: `ai` (Vercel AI SDK).
- **`lib/ai/context.ts`** — PHI-bounded context assembler. `assembleMemberContext(supabase, memberId)`
  reads via the **caller's RLS client** (never the admin client): `members` demographics (NO contact
  columns) + `get_onboarding_scoped` (role-scoped answers) + recent `reports`. `member_contacts` is
  **never queried** — a structural PHI boundary. `buildMemberContext` additionally strips the §4 keys
  and `assertPhiFree` throws if any survive. Pure of server-only imports (client injected) → unit-testable.
- **`0021_ai_audit.sql`** — `log_ai_generation(member, kind, meta)` writes an immutable
  `ai.draft_created` audit row. Fail-closed (0017 pattern); audit-only (never generates or commits).

## Verified
- `lib/ai/context.test.ts`: `buildMemberContext` strips every §4 key (incl. nested); `assertPhiFree`
  throws on a survivor; non-object onboarding → null. (29 unit tests total.)
- RPC probe (rolled back): active doctor → `ai.draft_created kind=clinical_assessment` audit row;
  suspended caller → `not_allowed`.
- `npx tsc --noEmit && npm run lint` green (provider seam typechecks against `ai@7`).

## Env (operator-set; unset ⇒ AI off)
`AI_ENABLED=true` · `AI_MODEL=anthropic/claude-sonnet-5` (optional) · `AI_GATEWAY_API_KEY` (or Vercel OIDC).

## Next (T3.2, not built here)
"Draft with AI" on the clinician form panel: role-scoped context → `draftObject` with the Zod
template schema (T2.3's `formTemplateSchema` is the target) → result written into the **existing**
draft row (`form_responses.answers`, tagged `_ai_drafted`) → clinician edits in DynamicForm → submits
through the unchanged `submit_clinical_form`. Call `log_ai_generation` per draft. Persistent
"AI-drafted — review required" banner until first human edit.
