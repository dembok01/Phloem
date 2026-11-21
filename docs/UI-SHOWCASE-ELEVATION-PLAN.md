# PHLOEM — Showcase UI Elevation Plan

**Date:** 2026-11-21 · **Status:** D1 + D2 decided and built 2026-11-22 on branch
`ui/brand-motion-elevation` (see §10). D3 (dark mode) and D4 (demo environment) are out
of scope by owner decision: "we don't showcase the full cycle, we only need to improve the
dashboard UI".
**Ask (owner):** beautify the entire dashboard — every care-team desk, coordinator, admin
and the family portal — with reworked colours, proper animation and micro-interactions,
because it will be shown to startups and hospitals.
**Scope rule (unchanged):** presentation only. No migrations, RLS, §6 RPCs, permission
changes or new data on any surface. Onboarding questions stay frozen.

---

## 0 · Where things stand — read before executing anything

| When | What | State |
|---|---|---|
| 2026-07-14 | Design system: Loam/Paper/Phloem palette, Bricolage + Atkinson + Plex Mono, growth-ring signature (`DESIGN-SYSTEM.md`) | shipped |
| 2026-08-17 | Portal Elevation — motion scoped to family surfaces, staff kept quiet on purpose ("motion budget is set by frequency") | shipped |
| 2026-08-20 | Visual Elevation V1–V4 — card tiers, heroes, role hues, inset lists (`docs/VISUAL-ELEVATION-PLAN.md`) | shipped; **V5 dark mode never decided** |
| 2026-10-07/08 | Affordance phases — pressable affordances, feedback motion on staff screens | shipped |
| **2026-11-21 (today)** | **Dashboard design refresh** — another session, `docs/superpowers/plans/2026-11-21-dashboard-design-refresh.md` | **in flight, uncommitted: ~69 files modified + new `components/workspace-shell.tsx`** |

The in-flight refresh adds a staff sidebar shell, a warm paper canvas (`#F6F5F0`),
forest-green navigation (`--workspace-ink #193E32`), `dashboard-hero`, `metric-tile`,
`icon-well`, refined primitives and shadows. Its own rules: content entrance ≤ 220ms, no
count-up on clinical data, no new dependencies, no looping decorative motion, keyboard
command search instant.

**This plan is the layer on top of that refresh.** It assumes the refresh lands and is
committed first, keeps every one of its rules, and covers what it deliberately leaves out:
brand alignment, a real motion system for staff surfaces, data-viz motion, signature
moments, dark theme, and demo readiness. Where it would change a refresh decision, that is
listed as an owner decision in §2 — not assumed.

---

## 1 · Research findings

Sources: the code at `beadfc9` + the working tree, the logo file, `next/font`'s font data,
contrast computed with the WCAG formula. Fresh screenshots were **not** possible this
session (the dev server did not answer within 100s; a broken production build was moved
aside to the scratchpad), so visual claims lean on the August audit plus code.

**F1 · The product does not wear its own brand.** The logo is electric blue `#0052F7` and
leaf green `#00CC66`. The UI runs on forest green `#1E6B4E` (the refresh deepens it to
`#193E32`) with a muted "Water" blue `#2F6DB5`. An evaluator sees the logo in the header,
then a palette that belongs to a different company. Contrast: `#0052F7` on white is
**5.9:1** (fine for text and buttons); `#00CC66` on white is **2.1:1** (fails even the 3:1
control-edge rule) — the green can only be a fill under dark ink (8.1:1), a mark, or an
accent on a dark ground (8.6:1 on navy).

**F2 · The sign-in door does not carry the brand.** *Corrected 2026-11-22:* the "CARE THAT
GROWS WITH YOU" panel first described here was the Codex session's mid-edit file, not
`main`. On `main` the door was a centred card on a faint ring watermark — clean, but with
no trace of the logo's colours or mark.

**F3 · Staff surfaces barely move — by an August decision that the showcase brief now
reverses.** `motion/react` is imported in 3 files (toast, onboarding wizard, the
calm-motion hook). `.stagger-in` appears in 3 files. Elsewhere: 21 `animate-spin`,
2 `animate-pulse`. A walkthrough admin → coordinator → doctor shows the tab pill, spinners
and toasts, and little else.

**F4 · Reduced motion currently means "no feedback at all".** `app/globals.css:650` forces
every transition and animation to 0.01ms under `prefers-reduced-motion`, including colour
and opacity changes. Good practice is *fewer and gentler*: keep opacity/colour feedback,
drop movement. Elderly mode should keep its hard zero (that is a product rule, §10).

**F5 · Charts are static and their colours are coupled to the palette.** Recharts lines
run with `isAnimationActive={false}` (`components/charts/trend-line.tsx:76`). The four
categorical chart hues and the role hues were validated against the current palette —
any primary change forces a re-validation, and the doctor's role hue (Water blue) would
collide with a blue primary.

**F6 · Loading states are uneven on the heaviest pages.** 11 `loading.tsx` files exist;
the member pages (`admin/members/[id]`, `coordinator/members/[id]`,
`clinician/clients/[id]` — 1,305 lines) and `coordinator/pipeline` have none of their own
and inherit a parent skeleton of the wrong shape. Skeletons pulse; none shimmer.

**F7 · Better type is already installed.** `next/font` in this repo ships
**Atkinson Hyperlegible Next** (variable 200–800) and **Atkinson Hyperlegible Mono**
(variable). The app loads the original Atkinson (400/700 only) + IBM Plex Mono. Moving to
Next/Mono gives a real weight scale (500/600 for UI labels) and one coherent family for
body and data, with the same low-vision rationale. Bricolage Grotesque stays — and its
`opsz` axis is available for display sizes.

**F8 · Demo readiness is the biggest risk, and it is not visual.** The hosted database
serves real members. Showing it to other organisations puts real names and health data on
a projector (India's DPDP Act 2023 treats this as personal data; it is also a trust
question for any hospital in the room). Demo fixtures are opt-in (`SEED_DEMO=1`); past
sessions found no caregiver login, an empty doctor desk, and members without cycles — so
the growth rings, adherence and trends had nothing to draw. A beautiful UI showing empty
states or real patients fails the demo either way.

**F9 · Template chrome.** Tracked uppercase mono eyebrows above most sections and
middle-dot meta strings are the commonest tells of generated UI. Keep an eyebrow only
where it carries information (a section *type*), in sentence case.

### What each audience judges (design practice, not a survey)

| Audience | Looks for | So the plan must show |
|---|---|---|
| Hospital leadership / clinicians | Trust, clinical safety, density, "will my staff cope" | Calm motion that never touches clinical values, AA+/elderly mode, severity encoding, speed |
| Startup / partner orgs | Craft, modernity, "this team ships" | Brand coherence, signature moments, dark mode, buttery micro-interactions |
| Both | Real-looking data, no empty screens, no real patients | A dedicated demo environment |

---

## 2 · Owner decisions (each changes what gets built)

**D1 · Colour direction.**
- **A — Brand-true (recommended).** Re-anchor the UI to the logo. *Blue is action and
  trust* (buttons, links, focus, selection, active nav). *Green is life and progress*
  (growth rings, adherence, success, positive deltas). The blue→green blend appears only in
  the signature: the growth-ring arc, the login brand panel, the activation moment.
  Neutrals go cool (ink `#0F1B2D`, canvas `#F4F7FB`). The UI and the logo become one company.
- **B — Botanical, refined.** What the refresh is shipping: warm paper + forest green; the
  logo colours stay in the logo. Calmer and zero rework, but keeps F1.
- *Cost note:* A changes the tokens the refresh just introduced (`--workspace-ink`,
  `--background`, `--surface-tint`). Because they are tokens, that is cheap — but the
  earlier D1 is decided, the less of the refresh's surface tuning is redone.

**D2 · Motion appetite on staff screens.** Keep both refresh rules (≤ 220ms routine
entrance; never animate clinical values) and **add a "first look" tier**: a page's arrival
choreography (stagger, operational count-ups, chart and ring draw) plays on the first visit
to that page in a session, then the page renders instantly. A demo viewer always sees the
moment; a coordinator opening Today 200 times a day sees it once. (§4.2)

**D3 · Dark theme (V5, open since August).** Recommend **yes, as a staff toggle**, light by
default, family portal + elderly mode locked to light. It is the single most dramatic
change available and the dark tokens already exist.

**D4 · Demo environment.** Recommend **yes, before any external showcase**: a second
Supabase project with synthetic data and a Vercel preview pointed at it. (§6)

---

## 3 · Token system v2 (Direction A values; all contrast-checked)

| Token | Light | Dark | Checked |
|---|---|---|---|
| Ink (text) | `#0F1B2D` | `#E6ECF5` | 17.3:1 on white · 15.9:1 on `#0A1120` |
| Muted text | `#526175` | `#9AA8BD` | 6.3:1 · 7.8:1 |
| Canvas | `#F4F7FB` | `#0A1120` | — |
| Card | `#FFFFFF` | `#111A2C` | — |
| Primary (Phloem Blue) | `#0052F7` | `#5B93FF` | 5.9:1 white-on-blue · 6.3:1 ink-on-blue (dark) |
| Primary hover | `#0043CC` | `#7AA8FF` | 7.9:1 |
| Leaf (fills, rings, marks) | `#00CC66` | `#2EDB85` | never text on white (2.1:1); 8.1:1 ink-on-leaf |
| Leaf deep (success text) | `#007A3D` | `#2EDB85` | 5.5:1 · 10.4:1 |
| Warning text | `#9A5800` | `#F0B44C` | 5.6:1 · 10.2:1 |
| Danger text | `#C0352B` | `#FF8A7A` | 5.6:1 · 8.2:1 |
| Control edge | `#7D8AA0` | `#5D6B82` | 3.5:1 · 3.5:1 (WCAG 1.4.11) |

Phase 1 expands these anchors into OKLCH ramps (50–950), retunes tints, and **re-runs
the dataviz palette validator** for the 4 chart series + 6 role hues (doctor moves off
blue). Under Direction B, the same phase only adds the missing ramps and dark parity.

**Type:** Bricolage Grotesque (display, `opsz` on), Atkinson Hyperlegible **Next** (body/UI,
400/500/600/700), Atkinson Hyperlegible **Mono** (numbers, IDs, timestamps). Tabular
numerals wherever digits sit in columns. Eyebrows only where informative, sentence case.

**Brand device:** the logo's two leaves become the motif for *moments* (login, activation,
empty states, the demo badge). Growth rings stay the motif for *information*. Never a stock
leaf icon again.

---

## 4 · Motion system

### 4.1 Tokens (extend, never fork)

Keep the existing curves — `--motion-ease-out cubic-bezier(.23,1,.32,1)`,
`--motion-ease-in-out cubic-bezier(.77,0,.175,1)`, `--motion-ease-drawer
cubic-bezier(.32,.72,0,1)` — and durations press 160 · pop 200 · card 220 · sheet 280
(refresh value) · signature 700. Add:

| New token | Value | Use |
|---|---|---|
| `--motion-hover` | 120ms, `ease` | colour/background on hover |
| `--motion-exit` | 120ms | exits are faster than entrances |
| `--motion-first-look` | 420ms + 40ms stagger, cap 8 | arrival choreography (first look only) |
| `--motion-count` | 600ms ease-out | operational count-ups (first look only) |
| `--motion-draw` | 600ms ease-out | chart/sparkline stroke draw (first look only) |
| spring `layout` | `{ type: "spring", duration: 0.45, bounce: 0.15 }` | row collapse, list reorder, pipeline card move |
| spring `gesture` | `{ type: "spring", duration: 0.5, bounce: 0.2 }` | sheet drag, toast swipe (velocity-carrying) |

### 4.2 The frequency ladder — the rule every animation is checked against

| Tier | Examples | Motion |
|---|---|---|
| Every action (100+/day) | ⌘K palette, keyboard navigation, typing | **None.** Instant. |
| Frequent (tens/day) | row hover, tab switch, route change, nav item | 120–180ms, colour/opacity + ≤ 4px; no stagger |
| Occasional | sheets, dialogs, popovers, toasts, saving, marking done | full standard motion 150–280ms, origin-aware, springs for gestures |
| **First look per session** | dashboard arrival, KPI count-up, chart/ring draw | orchestrated 420–700ms, **once per route per session** |
| Rare & emotional | program activated, cycle closed, report published, onboarding done, invite accepted | signature moments up to ~1.2s |

**First-look mechanism.** `useFirstLook(routeKey)` reads/writes `sessionStorage` (wrapped in
try/catch; failure ⇒ treat as not-first, i.e. no animation). The decision must be made
**before first paint** or content flashes: an inline head script sets
`html[data-first-look]` for hard loads; a layout effect in `template.tsx` handles client
navigations. Choreography CSS is scoped under `[data-first-look]` only.

**Never animated:** clinical measurements (BP, weight, WHO-5, adherence %) — values render
final; charts may draw the line, labels appear at their value. No looping decoration on
work surfaces. Elderly mode: everything zeroed (unchanged).

### 4.3 Micro-interaction catalogue

| # | Interaction | Spec | Where |
|---|---|---|---|
| M1 | Press | `scale(.97)` 160ms ease-out (exists) | all buttons, tiles |
| M2 | Submit → done | spinner → check morph, 200ms blur-crossfade (`fade-swap`), label returns after 1.2s | every `SubmitButton` |
| M3 | Row resolve | row confirms in place (✓ + leaf tint, 200ms) → collapses with `layout` spring → siblings close the gap; the day counter ticks down | coordinator Today, doctor queues, invites |
| M4 | Popover / menu / tooltip | `scale(.96)`+fade → 1, 150ms, `transform-origin: var(--transform-origin)`; exit 120ms; tooltips after the first in a group are instant | account menu, bell, desk switcher, Explain |
| M5 | Switch | knob translates 200ms ease-out, track colour crossfades | report sharing, elderly toggle, settings |
| M6 | Checkbox / radio | tick draws via `stroke-dashoffset` 180ms (extends `mark-in`) | forms, filters |
| M7 | Focus | ring grows 0 → 3px, 150ms | all inputs |
| M8 | Field error | edge to danger + message slides down 160ms (no shake) | DynamicForm, ClinicalForm |
| M9 | Copy | icon copy → check, 200ms, reverts after 1.5s | `copy-field`, invite links, check-in link |
| M10 | Route change | `<main>` content fade + 4px rise, 180ms; shell persists; the wait bar stays | `app/(app)/template.tsx` |
| M11 | Sidebar | active indicator glides between items (same measured-pill technique as `NavTabs`) | `workspace-shell` |
| M12 | Tab content | opacity crossfade 150ms; tabs with an open issue show a dot that pops once | clinician member page (8 tabs) |
| M13 | Notification arrives | badge pops (`scale .6 → 1`, gesture spring); new rows slide in at the top | bell (Realtime already live) |
| M14 | Skeleton → content | shimmer sweep 1.4s linear on skeletons; 200ms crossfade to content; zero layout shift | every `loading.tsx` |
| M15 | Sheet (mobile) | drawer curve 280ms, drag-to-dismiss on velocity (> ~0.11 px/ms) | schedule, upload, edit-record sheets |
| M16 | Theme switch | View Transition circular reveal from the toggle; instant fallback | account menu |
| M17 | Pipeline move | card glides to its new column after a stage-changing action (`layoutId`) | coordinator pipeline |
| M18 | Filter chips | chips add/remove with `layout` spring; result count crossfades | admin members, audit |

### 4.4 Signature moments (rare tier)

| Moment | Choreography |
|---|---|
| Login / invite accepted | the two leaves slide together into the mark (500ms), then the form rises; once per visit, no loop |
| Program activated (`activation-moment.tsx`) | first growth ring draws with the blue→green arc (700ms), "Day 1 starts tomorrow" settles in |
| Cycle closed / monthly report published | ring closes with a single soft pulse; the report card slides into the list |
| Onboarding submitted (family) | leaves join, thank-you line — calm, no confetti |

---

## 5 · Surface plan (what changes on top of the refresh)

| Surface | Hero / focal change | Motion |
|---|---|---|
| **Auth** (login, invite, forgot, reset) | Brand panel rebuilt on the real mark and palette; plain, specific copy | leaf assembly (first look) |
| **Admin overview** | KPI strip with sparklines + deltas; funnel; renewal radar; recent activity | count-up (operational only), sparkline + funnel draw, stagger — first look |
| Admin members / audit / invites / care team | sticky table headers, sort indicator, role-hued avatars, load meters | M18 filters, M3 on revoke, meter fill on first look |
| Admin member detail | identity band; sticky in-page section nav with gliding indicator | M11-style indicator |
| **Coordinator Today** | "Your day" progress arc that empties as actions resolve; tasks grouped by member | **M3 row resolve** — the best demo moment in the product |
| Coordinator pipeline | column counts, stuck-for-N-days note | M17 card moves |
| **Clinician desk** (doctor, nutritionist, trainer, psychologist) | next-consultation hero with countdown (updates per minute, no jitter); severity-railed queues | M3, M12 tabs, first-look stagger |
| Clinical forms | section progress ring in the sticky rail; submit bar solidifies when valid | M7, M8, M2 |
| **Family portal** | growth-ring hero (blue→green arc), care-team cards, renewal card, message bubbles | ring draw (first look), send animation for own message |
| Reports + PDF | cover band in brand colours | — (PDF is print; new palette affects **new** PDFs only — existing reports are immutable) |
| Notifications, account, errors, 404 | grouped by day; designed error states with the leaf motif | M13 |
| Elderly mode | **unchanged** — AAA, 20px+, motion zeroed | none |

---

## 6 · Demo readiness (Phase 0 — runs in parallel with Phase 1)

1. A second Supabase project with migrations 0001–0061 applied (mirror production's
   applied set — 0041 is held on production).
2. `SEED_DEMO=1` seed extended so every lifecycle stage exists with synthetic people:
   invited, mid-onboarding, awaiting assignment, active month 1, month-2 review, paused,
   renewal due, an open safety incident, a progress report. Every ring, chart and queue has
   data. Names and phone numbers are visibly fictional.
3. Demo logins for every role (admin, coordinator, 4 clinicians, caregiver, elderly member).
4. A Vercel preview environment with its **own** env vars pointing at the demo project —
   never production keys.
5. A small "Demo" badge in the shell when `NEXT_PUBLIC_DEMO=1`, so no one confuses
   environments on a projector.
6. `DEMO-GUIDE.md` rewritten as a 10-minute click path that hits each signature moment.
7. `scripts/design-audit.ts` re-pointed at the demo env: before/after screenshots of every
   role at 1440 and 390, both themes — this also unblocks the portal verification that has
   been impossible since the 2026-07-28 cutover.

---

## 7 · Phases

| Phase | Contents | Size | Depends on |
|---|---|---|---|
| **P0** Demo environment | §6 | M | owner approves a second project (D4) |
| **P1** Brand & tokens v2 | D1 palette as tokens + ramps, dark tokens, fonts (F7), chart + role hue re-validation, eyebrow cleanup | M | refresh committed; D1 |
| **P2** Motion foundation | §4.1 tokens, first-look mechanism, reduced-motion softening (F4), route transition, M1–M9, M14 skeletons + missing `loading.tsx` (F6) | M | P1 |
| **P3** Data-viz & signature | chart/sparkline draw, operational count-up, growth-ring v2 (gradient arc), leaf motif, §4.4 moments, M16 theme switch | L | P2 |
| **P4** Surface passes | §5 in order: auth → admin → coordinator → clinician → portal → reports/PDF → notifications/errors | L | P3 |
| **P5** Verify & rehearse | screenshots (both widths, both themes), reduced-motion + elderly walk, contrast validation, performance budget, Safari + mid-range Android check, keyboard walk, demo rehearsal | M | P0 + P4 |

S ≈ under half a day · M ≈ 1–2 days · L ≈ 3+ days of focused work.

Execution follows the repo rules: one branch (`ui/showcase-elevation`) cut **after the
refresh is committed**, a commit per phase, `tsc` / `eslint` / `test:unit` / `next build`
green at each, results in `PROGRESS.md`. Phases P2+ get their own task files in
`docs/plans/` before implementation, with exact values inlined.

---

## 8 · Guardrails

1. Presentation only — permission matrix, RLS, RPCs, report JSON contract untouched;
   borrowed admin desks stay read-only.
2. Onboarding questions frozen (presentation tweaks only).
3. Elderly mode untouched: AAA, larger type, zero motion.
4. Never animate clinical values; no looping decoration on work surfaces; ⌘K and keyboard
   actions instant.
5. `transform` / `opacity` only; no `transition: all`; CSS for predetermined motion,
   `motion/react` for layout and gestures, with full transform strings (Motion's `x`/`y`
   shorthands run on the main thread).
6. Reduced motion keeps opacity/colour feedback and drops movement.
7. No new runtime dependencies required (`motion` is installed; View Transitions are native).
8. Performance budget: INP < 200ms, CLS < 0.05, no long tasks from motion on a mid-range
   Android phone — the device most Indian clinicians and families carry.

---

## 9 · Open questions this plan cannot answer from code

- Does the client (or hospital partners) expect white-labelling? If so, P1 should make the
  brand tokens swappable per organisation.
- Will demos run on a laptop + projector or on phones? It changes which width P5 polishes first.
- Is a public landing page part of "the showcase"? Out of scope here unless asked.

---

## 10 · Implementation record (2026-11-22)

The Codex session's uncommitted refresh was parked, unchanged, on
`codex/dashboard-design-refresh` (`2e12808`) at the owner's request; this work starts
from a clean `main` (`beadfc9`) on `ui/brand-motion-elevation`, so §0's "layer on top"
framing no longer applies.

| Commit | What |
|---|---|
| `6af2628` | Brand-true tokens; Atkinson Hyperlegible Next + Mono; the first-look mechanism (`lib/first-look.ts`, `components/first-look.tsx`); `BrandMark` traced from the logo; split sign-in / invite door |
| `c6d0bdf` | Button light, spinner and label cross-fade, field focus ease, skeleton shimmer, first-look list stagger, bell (pop / shrink / arrive), ring blend, chart draw-ins, funnel contrast fix |
| `3a0a29d` | The four home screens: ordered arrival, brand-blend hero figure + count-up, tile arrows, Join button fix, portal tile lift; `.pressable` + `.liftable` transition race fixed |
| `8298e05` | Gliding member-page tabs (NavTabs `current`), instant ⌘K, global hover ease, table rows + turning sort arrow, filter search details, three fading buttons fixed |
| `851557c` | Disclosures ease open + turning chevrons, pipeline drag ghost + lit drop column, brand accent-color, field focus ease, form answer segments |
| `8743b36` | Solid-blue own messages, growing composer, high-flag attention ping, report/PDF + global-error palette |

Verification per commit: `tsc --noEmit` and `eslint` clean on every changed file; unit
suite 176/176. Browser results are recorded in `PROGRESS.md`.
