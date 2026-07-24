# Tier 2 · T2.3 — Forms-engine v2

Done as bounded, verified sub-parts. Two shipped; one deferred as unexercised scaffolding.

## Shipped

### B — Zod template schema (`components/forms/schema.ts`)
`form_templates.schema` is now validated at load via `parseFormTemplate()` instead of an unchecked
`as unknown as FormTemplateSchema` cast (3 call sites: clinician FormPanel + FeedbackPanel, onboarding
page). A malformed template is a hard load error. `schema.test.ts` parses **all 10** checked-in
templates and rejects malformed ones. This surfaced real drift the cast had hidden — templates carry
`meta` / `footnote` / `maxItems` keys the renderer never reads; they are stripped from the render
schema (no behavior change).

### A — `useAutosaveDraft` hook (`components/forms/useAutosaveDraft.ts`)
The identical debounced draft-autosave effect was copy-pasted into ClinicalForm, FeedbackForm, and
OnboardingWizard. Extracted into one paused-aware hook; the three forms drop their local
`saveState` + `dirty` + `timer` + effect and call it. Faithful extraction (same 800 ms debounce,
same write to `form_responses.answers`).

## Deferred — C (composable `showIf` grammar + validation vocabulary)
The blueprint also called for a composable `showIf` grammar (`{all|any}`, `in|gt|lt`) and a
validation vocabulary (min/max/pattern) mirrored client + server. **None of the 10 checked-in
templates use either** — every `showIf` is the simple `{ field, equals }` form, and no field carries
min/max/pattern. Building the grammar + validation now would add renderer/logic/server surface that
nothing exercises (the same reason the T2.1 DAL and the T2.8 builder registry were deferred). It
should land **with** the first template that needs a richer conditional or a numeric bound — at which
point the feature is exercised and testable end-to-end. The `isFieldVisible` / `missingRequiredFields`
helpers in `logic.ts` remain the single seam to extend.

## Verify
`npx tsc --noEmit && npm run lint && npm run test:unit` green (25 unit tests incl. the 10-template
parse). Form autosave/submit behavior unchanged (faithful hook extraction).
