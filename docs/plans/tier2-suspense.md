# Tier 2 · T2.2 — Suspense streaming

**Goal:** stream page shells before their slow panels so the header + navigation paint immediately
and per-panel data fills in behind a skeleton, cutting perceived latency.

## Done — clinician client page
`app/(app)/clinician/clients/[id]/page.tsx`: the PageHeader + tab rail render from two fast queries
(`getSessionProfile` cached + the member row), then the active panel block is wrapped in a single
`<Suspense fallback={<CardSkeleton />}>` (keyed on `activeTab`). Exactly one panel is non-null per
request, so one boundary is active; each panel is an async self-fetching server component, so its
heavier queries (consultations, reports + receipts, templates, documents, WHO-5) stream in after the
shell. Output once loaded is unchanged — Suspense only changes *when* bytes arrive.

## Coordinator member page — deliberately left as-is
`app/(app)/coordinator/members/[id]/page.tsx` is already optimized into a single batched
`Promise.all` of six parallel queries (contacts, consults, assignments, professionals, package,
caregiver) plus one dependent cycles query, and reuses the one `consults` fetch for both the initial
and the active-cycle review rounds. Its render interweaves nearly all of that data, so Suspense-
splitting would mean breaking the batch into per-section refetches for little streaming gain and real
regression risk. Left batched (the better pattern for this page).

## Verify
`npx tsc --noEmit && npm run lint` green. TTFB/streaming improvement is best confirmed with
`next start` + curl on a real deployment (not run in the sandbox); the change is standard App-Router
Suspense and RSC-safe by construction.
