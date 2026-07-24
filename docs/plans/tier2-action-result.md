# Tier 2 · T2.4 — Unified `ActionResult<T>`

**Goal:** collapse the four ad-hoc return-object shapes the "dialect-B" server actions use today
into one typed result, built on the T1.6 `rpc-errors` registry, so callers handle success/error
uniformly and surface consistent copy. Dialect-A (redirect) actions already derive flash codes
from the registry (T1.6) and are out of scope here.

## Current shapes (to unify)
- `{ ok: true } | { error: string }` — `submitFeedback`, `submitOnboarding`
- `{ reportId: string } | { error: string }` — `submitClinicalForm`
- `{ ok: boolean; error?: string }` — `setMemberElderlyModeAction`, `setMemberPhotoAction`
- `{ ok: true; message } | { ok: false; reason }` — `movePipelineCard` **(left as-is: `reason` is a
  UI-routing discriminant — `needs_dialog` / `ineligible` — not an error; forcing it into
  `ActionResult` would lose meaning. Documented exception.)**

## Target
```ts
// lib/action-result.ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: RpcErrorCode | null };
export function actionOk<T>(data: T): ActionResult<T>;
export function actionFail(error: string, code?: RpcErrorCode | null): ActionResult<never>;
export function actionFromError(error, fallback, overrides?): ActionResult<never>; // rpc-errors copy + code
```

## Steps
- [ ] Create `lib/action-result.ts` + `lib/action-result.test.ts`; add the test to `test:unit`.
- [ ] `submitClinicalForm` → `ActionResult<{ reportId: string }>` (use `actionFromError`/`actionOk`).
- [ ] `submitFeedback`, `submitOnboarding` → `ActionResult` (void).
- [ ] `setMemberElderlyModeAction`, `setMemberPhotoAction` → `ActionResult` (void).
- [ ] Callers: `ClinicalForm`, `FeedbackForm`, `OnboardingWizard` switch `if ("error" in result)` →
  `if (!result.ok)` and `result.reportId` → `result.data.reportId`. Portal callers already branch on
  `res.ok` only → unchanged. `movePipelineCard` + its board → unchanged.

## Verify
`npx tsc --noEmit && npm run lint && npm run test:unit` green; behavior identical (same error copy,
same navigation). The registry stays the single source of error copy.
