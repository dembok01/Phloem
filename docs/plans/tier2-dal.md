# Tier 2 · T2.1 — Data-access layer / duplication drain

**Finding (grounded in the post-Tier-1 code):** most of what T2.1 targeted has **already been
delivered** by prior work, so this is a much smaller task than the blueprint's "L / impact 8" line
implied:

- **Session profile** — `lib/auth.ts` already exports `getSessionProfile`, wrapped in
  `React.cache()`, and the layout + clinician + portal pages already consume it (performance pass /
  T1.8). The plan's `lib/queries/session.ts` "produces `getSessionProfile()`" is satisfied; a
  re-export module would be pure scaffolding, so it is **not** created (don't invent scope). Tier-2/3
  can grow `lib/queries/*` from `lib/auth` when Suspense (T2.2) or AI context assembly actually needs it.
- **Status labels / badge variants** — `lib/member-status.ts` already provides
  `MEMBER_STATUS_LABEL` / `memberStatusVariant` / `PIPELINE_COLUMNS`, used by the coordinator and admin
  member pages. The remaining page-local dicts are **intentionally different copy**, not duplication:
  the portal's `STATUS_LABEL` is warm, family-facing ("Program active", "Renewal coming up"), and
  `admin/members` uses "Assigned" vs the shared "Care team assigned". Consolidating either would change
  visible copy, so both are left as-is (behavior-identical requirement).

**What this increment does drain:** the one genuine, behavior-identical duplication — the IST
day-of-cycle math (`Date.now() + 5.5h` → `Date.UTC` → day diff) was copy-pasted **3×**
(`app/(app)/portal/page.tsx`, `components/portal/progress-bar.tsx`, `components/program-card.tsx`).
Folded into `lib/datetime.ts` as `istDaysSince(startIso)` (exact same math) and all three now call it —
matching the plan's "IST day math → fold into `lib/datetime.ts`" target.

## Verify
`npx tsc --noEmit && npm run lint` green. Same formula everywhere → day-of-cycle values unchanged.

## Not done (deliberately, out of this increment)
The broader `lib/queries/{members,cycles,reports,consultations}.ts` DAL is deferred until a consumer
needs it (Suspense T2.2 / AI T3.1). Building it now would be unused scaffolding; the concrete
duplication it was meant to remove is already gone (see Finding).
