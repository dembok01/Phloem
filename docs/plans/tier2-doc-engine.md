# Tier 2 · T2.8 — Document-engine generalization (additive `plain_language` kind)

**Goal:** make `ReportContent` a semi-public, additive-only schema by adding a `plain_language`
section kind — the render target for Tier-3 T3.3 AI plain-language summaries — with **zero** change
to how existing report types render.

## Done
- `lib/reports/types.ts` — new union member `{ heading; kind: "plain_language"; data: string }`.
- `components/reports/ReportView.tsx` — new `case "plain_language"` in `SectionBody` (a distinct
  family-facing box). All other cases untouched; the `default` still returns null.
- `lib/reports/styles.ts` — `.report-plain` class (soft green box, works in web + PDF via REPORT_CSS).

**Additive by construction:** existing builders never emit `plain_language`, and only a new switch
case was added — existing report types render byte-identical (verified by inspection; the change
touches no existing `case`).

## Deliberately NOT done
The blueprint's "builder registry `lib/reports/build/index.ts`" is skipped: the TS builders
(`buildClinicalReport`, `buildOnboardingSummary`) are already called directly and cleanly, and the
performance builder is SQL (`_build_performance`) — a TS registry couldn't unify it, so it would be
premature indirection. Add it if/when Tier 3 needs central dispatch.

## Verify
`npx tsc --noEmit && npm run lint` green.
