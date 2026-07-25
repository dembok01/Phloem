# RESUME PROMPT — Tier 3 · T3.2: AI-drafted clinical assessments (the flagship)

> Paste this whole file as your opening message in a fresh session (or point the agent at it).
> It is self-contained: read it, then the referenced files, then build.

## Where things stand (already done, on `main`)

The PHLOEM elevation is complete through **Tier 1, Tier 2, and Tier 3 foundation (T3.1)**. All on
local `main` (not pushed). Migrations `0001`–`0021` applied to the hosted Supabase dev project. Read
`docs/ELEVATION_BLUEPRINT.md` §3–§4 and `docs/ELEVATION_EXECUTION_PLAN.md` (incl. `## Divergences`
D-1…D-8) for the full picture, and `CLAUDE.md` for the house rules (npm; migrations as numbered files
FIRST then applied via Supabase MCP `apply_migration`; RLS + security-definer RPCs are the sole
enforcement boundary; TS strict + Zod; never touch `.env.local` secrets).

**T3.1 gave you the seams T3.2 consumes (all in place, tested):**
- `lib/ai/provider.ts` → `AI_ENABLED` (env kill-switch, off unless `AI_ENABLED=true`) and
  `draftObject<T>({ schema: z.ZodType<T>, system, prompt }): Promise<T | null>` — gateway-routed
  (Vercel AI Gateway), model from `AI_MODEL` (default `anthropic/claude-sonnet-5`), `server-only`.
  Returns `null` when disabled or on failure.
- `lib/ai/context.ts` → `assembleMemberContext(supabase, memberId)` (caller's RLS client;
  `member_contacts` NEVER queried; `get_onboarding_scoped` for role-scoping) + pure `buildMemberContext`
  / `assertPhiFree` / `PHI_STRIP_KEYS`.
- `log_ai_generation(p_member uuid, p_kind text, p_meta jsonb)` RPC (migration `0021`) → writes an
  immutable `ai.draft_created` audit row, fail-closed. Already in `lib/supabase/database.types.ts`.
- `components/forms/schema.ts` → `parseFormTemplate(json): FormTemplateSchema` + `formTemplateSchema`
  (Zod). The form-template shape is `components/forms/types.ts` (`FormTemplateSchema` / `FormField`).
- `components/forms/ClinicalForm.tsx` + the clinician page's `FormPanel`
  (`app/(app)/clinician/clients/[id]/page.tsx`) render the consult form and create the draft
  `form_responses` row (`responseId`), then submit through the **unchanged** `submitClinicalForm`
  action → `submit_clinical_form` RPC (all §6 gates still enforce). `submitClinicalForm` already
  returns `ActionResult<{ reportId }>` (see `lib/action-result.ts`, `lib/rpc-errors.ts`).

## Tier-3 NON-NEGOTIABLES (apply to every line you write)

- Server-only under `lib/ai/`. Reads via the **caller's RLS client** — NEVER the admin client.
- Context assembly must have **no `member_contacts` query** (use `assembleMemberContext`).
- **Drafts only.** AI output lands in the EXISTING draft row (`form_responses.answers`), tagged
  `_ai_drafted: true`. The clinician edits it in DynamicForm and submits through the unchanged
  `submit_clinical_form` RPC. RPCs stay the sole committers — no new write path inside the trust
  boundary.
- **Every generation audited** via `log_ai_generation`. `AI_ENABLED` gates everything.
- Provider stays model-agnostic (the `lib/ai/provider.ts` seam) — do not import a provider SDK directly.

## Build T3.2 in these steps (each its own commit; verify then commit)

1. **`lib/ai/answer-schema.ts` — `templateToAnswerSchema(template: FormTemplateSchema)`** →
   `z.ZodType<Record<string, unknown>>`. Maps each `FormField` to a Zod type for the *answer*:
   text/textarea/date → `z.string()`; number/scale_* → `z.number()`; boolean → `z.boolean()`;
   select → `z.enum(options.value…)` (or `z.string()` if `allowOther`); multiselect → `z.array(z.string())`;
   repeat_group → `z.array(z.object(subfields…))`; frequency_grid → `z.record(z.string(), z.string())`;
   info → omit. Make every field `.optional()` (the AI may leave fields blank; the human fills gaps).
   **Unit test** (`lib/ai/answer-schema.test.ts`, add to `test:unit`): build a schema from a checked-in
   template (`supabase/templates/*.json` via `parseFormTemplate`) and assert a plausible answers object
   parses, and that an out-of-enum select value is rejected. **This needs no gateway — do it first.**

2. **`draftClinicalAssessment` server action** (add to `app/(app)/clinician/clients/[id]/actions.ts`
   or a new `ai-actions.ts`). Input: `{ consultation_id, response_id }` (Zod). Flow:
   `if (!AI_ENABLED) return actionFail("AI drafting is off.");` → caller's RLS client → load the
   consultation (type, cycle_id, member_id) and its active template (same lookup FormPanel does) →
   `assembleMemberContext(supabase, memberId)` → `templateToAnswerSchema(template)` →
   `draftObject({ schema, system, prompt })` where **system** = role-appropriate clinician-assistant
   guidance ("draft only the fields you can support from the context; leave the rest blank; never
   invent") and **prompt** = the assembled context serialized + the report type. If it returns `null`
   → `actionFail`. Else `update form_responses set answers = { ...drafted, _ai_drafted: true } where id =
   response_id and respondent_id = auth.uid()` (RLS `fr_own_clinical` WITH CHECK from 0016 permits own
   draft), then `supabase.rpc("log_ai_generation", { p_member: memberId, p_kind: reportType, p_meta })`,
   `revalidatePath`, return `ActionResult`. Use `actionFromError`/`actionOk`.

3. **UI — "Draft with AI" button** in `FormPanel` (server component): read `AI_ENABLED` and render a
   client button ONLY when true, above/beside `ClinicalForm`. The button (client) calls
   `draftClinicalAssessment` then re-seeds the form with the drafted answers — either `router.refresh()`
   + a `key` on `ClinicalForm` so it remounts with new `initialAnswers`, or lift the draft into client
   state. Handle pending/disabled + the `ActionResult` error.

4. **Banner — "AI-drafted — review required"** in `ClinicalForm`: when `initialAnswers._ai_drafted ===
   true`, show a persistent banner; clear it on the first `onChange` (first human edit). Ensure
   `_ai_drafted` is NOT submitted as a real answer (strip it before `submitClinicalForm`, or ignore it
   server-side — check it isn't a template field).

## Verify

- `npx tsc --noEmit && npm run lint && npm run test:unit` green (answer-schema test added).
- **With the gateway configured** (`.env.local`: `AI_ENABLED=true`, `AI_GATEWAY_API_KEY` or Vercel
  OIDC, optional `AI_MODEL`): run one real draft as a seeded clinician and check (a) an `ai.draft_created`
  audit row exists, (b) a **trainer's** draft context contains no doctor-scoped keys (proves
  `get_onboarding_scoped` role-scoping), (c) both an edited and an unedited draft submit flow through
  `submit_clinical_form` unchanged. The seeded users' password is `test12345!`; the
  `scripts/test-lifecycle.ts` pattern shows how to drive real RPCs as signed-in users.
- The §16 RLS suite can't run against the drifted shared dev DB (12 members vs the seed's 2 — see
  divergence D-3 / `[[phloem-rls-suite-baseline]]`); verify DB-side behavior with targeted, rolled-back
  `execute_sql` probes instead.

## Then
Update `docs/ELEVATION_BLUEPRINT.md` (mark T3.2), add `docs/plans/tier3-assessments.md` recording what
shipped, commit on a fresh `elevation/tier3.2` branch. Next after T3.2: **T3.3** (caregiver
plain-language summaries — the `plain_language` report section kind already exists) and **T3.4**
(coordinator daily brief from the cron summary).
