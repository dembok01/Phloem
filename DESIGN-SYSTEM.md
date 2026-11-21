# DESIGN-SYSTEM.md — PHLOEM

**Phase B of the UI/UX overhaul.** The subject: phloem is the living tissue that
carries nourishment from a plant's leaves to everything still growing. The product
is the same thing for a family — a channel that quietly, continuously moves care
toward an aging parent. The system below is built on that: **sustained nourishment,
visible growth, quiet vitality.** Never literal (no leaf clip-art, no vines), never
loud (nothing here should spike a 72-year-old's pulse or slow down a nurse).

Audience order, which settles every tie: elderly members & their adult children →
clinicians on repeat work → the coordinator all day.

---

## 1 · Palette — brand-true (owner decision 2026-11-22)

The UI now wears the logo. Until this date the interface ran on a forest green
(`#1E6B4E`, "Loam/Paper/Phloem") that appeared nowhere in the mark, so the logo in
the header and the screens below it read as two companies. The logo's two colours
now carry meaning: **blue is action and trust, leaf green is life and progress.**

| Name | Hex | Role |
|---|---|---|
| **Ink** | `#0F1B2D` | All primary text and icons. 17.3:1 on white, 16.1:1 on Canvas. |
| **Canvas** | `#F4F7FB` | App background — a cool white with a breath of the brand blue; cards sit on it in pure white. |
| **Phloem Blue** | `#0052F7` | Straight from the logo. Primary actions, links, focus, selection, the current tab. 5.9:1 with white text; hover darkens to `#0043CC` (7.9:1). |
| **Leaf** | `#00CC66` | The logo's green. **Never text on a light ground** (2.1:1) — a fill only: growth rings, progress, the mark; or under ink (8.1:1). |
| **Success** | `#007A3D` | Leaf deepened for text: "done", "improved", "report in". 5.5:1. |
| **Muted ink** | `#526175` | Secondary text and labels. 6.3:1 on white, 5.6:1 on the muted ground. |
| **Warning** | `#9A5800` | Caution, pending, paused, ending soon. 5.6:1. |
| **Danger** | `#C0352B` | High red flags, incidents, destructive actions. 5.6:1. |

Control edges (inputs, selects, toggle chips) use `#75839A` (3.8:1, WCAG 1.4.11);
`--border` `#DDE3EC` is structure only. Every text pair above was measured on white
**and** on the Canvas. The blue→leaf blend (`--brand-gradient`) is spent only on the
signature: the growth ring's live arc, the sign-in panel, the one hero figure per
staff screen (`.brand-text`), the wait bar.

**Role hues** (avatars, chips — always tint + deep text, always beside the role's
name): doctor Indigo `#5B3FD0` (moved off blue now that blue means "act") ·
nutritionist `#00703A` · trainer `#9A5800` · psychologist `#A23E8C` · coordinator
`#0B6A85` · admin `#475569` · family portal Phloem Blue. Each is ≥5:1 on white and on
its own 12% avatar tint.

**Charts:** `#0F8A55` · `#0052F7` · `#A35F00` · `#A23E8C`, with `#64748B` as the
"Other" slot. Checked all-pairs in OKLab under normal vision and simulated protan,
deutan and tritan: worst pair ΔE 4.6 (the set it replaced: 3.5).

Dark tokens exist for parity (deep navy `#0A1120`, cards `#111A2C`) but dark mode is
not switched on anywhere.

## 2 · Typography — a voice that reassures, a hand that records

| Role | Face | Why this one |
|---|---|---|
| **Display** — page titles, member names, report headings, big numbers | **Bricolage Grotesque** (600/700, tight leading) | Warm, slightly compressed grotesque with real personality at size; reads "modern institution with a heart", not "startup landing page". Used with restraint: one display moment per screen. |
| **Body** — everything readable | **Atkinson Hyperlegible Next** (variable 200–800, since 2026-11-22) | Designed by the Braille Institute for low-vision readers: unmistakable I/l/1, open apertures, sturdy at 16–20px. The most audience-true body face this product could have — accessibility as the aesthetic. The 2025 "Next" release adds the 500/600 weights UI labels need. |
| **Data** — timestamps, doses, IDs, eyebrows, chips | **Atkinson Hyperlegible Mono** (variable, since 2026-11-22; was IBM Plex Mono) | Clinical texture: tabular numbers for vitals and dates, quiet institutional voice for section eyebrows (`PLAN`, `BASELINE`). Shares the body face's low-vision letterforms (0/O, 1/l/I). Small sizes only, never paragraphs. |

Scale (rem): 12 data-small · 14 data/captions · 16 body (app) · 18 body (portal) ·
20 elderly body · 22/28/34/44 display steps. Line-height 1.5 body, 1.15 display.
Eyebrows: 12px Plex Mono, uppercase, +0.08em tracking, Moss.

## 3 · Space, radius, elevation

- **Spacing scale:** 4-base — 4/8/12/16/24/32/48/64. Sections breathe at 24–32;
  related items pack at 8–12. Page gutters 24 (mobile 16).
- **Measure:** dashboards `max-w-6xl`; reading surfaces (reports, wizard, portal)
  `max-w-2xl`–`3xl` centered — kills the audit's "column adrift in white" (G-8).
- **Radius:** 6 (inputs/chips) · 10 (buttons) · 14 (cards) · 999 (pills, rings).
  Soft enough to be kind, square enough to be clinical.
- **Elevation:** two levels only, loam-tinted, whisper-quiet:
  `--shadow-1: 0 1px 2px rgb(31 42 36 / .05), 0 1px 6px rgb(31 42 36 / .05)` (cards)
  `--shadow-2: 0 4px 12px rgb(31 42 36 / .08), 0 12px 32px rgb(31 42 36 / .10)`
  (dialogs, palette). Structure comes from 1px `Moss/25` borders, not shadow —
  visible edges matter to old eyes.
- **Focus:** 2px Phloem ring offset 2px, always visible (fixes G-5). In elderly
  mode, 3px.
- **Motion scale:** three curves and five durations, all in `:root` as
  `--motion-*`. Curves are stronger than the browser/Tailwind built-ins, which
  are too weak to read as intentional: `--motion-ease-out`
  `cubic-bezier(.23,1,.32,1)` (entrances and exits — the default),
  `--motion-ease-in-out` `cubic-bezier(.77,0,.175,1)` (movement on screen),
  `--motion-ease-drawer` `cubic-bezier(.32,.72,0,1)` (sheets, drags). Durations:
  press 160ms · pop 200ms · card 220ms · sheet 320ms · **signature 700ms**.
  Everything stays under 300ms except the growth-ring arc, which is the one
  orchestrated moment §4 grants. `--motion-ease-out` / `--motion-ease-in-out`
  are mapped onto Tailwind's `ease-out` / `ease-in-out` utilities through
  `@theme inline`, so the whole app inherits the stronger curves; **never map a
  Tailwind name to itself** (`--ease-out: var(--ease-out)`) — that circularity
  is what once rendered the entire app in Times via `--font-sans`. Durations have
  no Tailwind namespace in v4 and are used as `duration-(--motion-pop)` or read
  directly by inline styles. The global reduced-motion and `.elderly` rules zero
  all of it with `!important` longhands, which beat inline shorthands too
  (verified in-browser), so no component needs its own reduced-motion handling.

## 4 · The signature — growth rings

**One element the product is remembered by: the growth ring.** A tree records each
season as a ring; a PHLOEM member records each 30-day cycle. The `GrowthRings` mark
draws one concentric ring per cycle of the package: completed rings solid in the
success green (done), the current cycle an arc swept to today's day-count in the
logo's blue→leaf blend (growing), future rings faint, a pause or a programme ending
soon shown in the warning amber. It is not decoration — it is the package state,
readable at every size:

- **Portal hero (96px):** the family's journey at a glance, day count centered,
  "Cycle 2 of 3 · Day 14 · On track" beside it in plain words.
- **Member/board cards (20px):** instant cycle context where a text chip used to be.
- **Admin tiles (28px):** live members' aggregate at a glance.

Motion: the ring arc draws once on first paint (600ms ease-out) — each flow's one
orchestrated moment. `prefers-reduced-motion` and elderly mode render the final
state with no animation. Everything else moves 150–250ms ease-out or not at all.

## 5 · Component voice (rules the surfaces will follow)

- **Status chips** are two-part where two facts exist: `Meeting ✓ done · Report ⧗
  pending` — shape + icon + tint; never color alone. One vocabulary app-wide:
  *to schedule → scheduled → done* / *pending → submitted*.
- **Red-flag banners:** Honey ground, Loam text, plain language ("Reported chest
  pain during activity — doctor review required before training."), one clear icon.
  Clay is reserved for high-severity lines inside it. Never pink-on-red (G-6).
- **Clearance semantics:** cleared = Phloem; cleared-with-restrictions = **Honey,
  restrictions enumerated, impossible to miss**; on-hold = Clay lock. (Fixes the
  green "cleared with restrictions" hazard.)
- **Empty states** = one sentence of what this space will hold + the next action as
  a real button. **Errors** = what happened + how to fix. Buttons say what they do
  ("Save changes", "Schedule consultation"), and their toast repeats the verb
  ("Scheduled ✓").
- **Vocabulary:** *member* everywhere (not client/patient); *care team*; *cycle*;
  *program*. Dates human ("Wed, 15 Jul"), IST.

### 5a · Affordance — what you can press must look pressable (2026-10-07)

- **Hand cursor** on every pressable element (base rule in `globals.css`); `not-allowed`
  when disabled. `cursor-grab` only for draggable cards.
- **Control edges** use `--input` `#78897e` (3.7:1 on white, ≥3:1 on the inset ground) —
  inputs, selects, toggle chips, switch tracks. `--border` is for structure only
  (dividers, card edges) and is deliberately quieter.
- **Buttons:** hover darkens (`--primary-hover`), never fades; press is `scale(.97)` at
  160ms; `outline` is raised (white face + soft edge + `shadow-xs`); `secondary` is the
  tonal row action. Never add `.pressable` to a Button. Touch targets reach 44px via an
  invisible hit area.
- **A tag states, a chip acts.** `Badge` = flat 6px tint, no edge, no hover. `Chip` =
  bordered pill, hover, press, `aria-pressed`, a tick when several can be on.
- **Links look like links:** `.link` (Phloem, underline at 35% → solid on hover). Inside
  prose a link is always underlined.
- **A row that opens shows a chevron** (it nudges on hover). Table rows with `href` open
  from anywhere in the row; the name stays the real link.
- **Tabs** are a segmented control: recessed track, the current tab raised in white.
- **Callouts:** one that leads somewhere shows a button; one that only informs is a flat
  muted note.
- **Feedback motion on staff screens (2026-10-08):** only in answer to the user's own
  action, 120–200ms — a row action confirms on itself ("✓ Revoked") before the row
  refreshes; a read lands at once (dot shrinks, tint fades); the tab pill glides; ticks
  and dots grow in (`.mark-in`); popovers grow from their trigger.
- **The first-look tier (owner decision 2026-11-22)** replaces "no entrance
  choreography on staff pages". A page's arrival plays the **first time that route is
  opened in a browser session**, then the page simply appears. `html[data-look]` is
  `first | again | done`, decided before paint (boot script in `app/layout.tsx` for a
  hard load; `components/first-look.tsx` for client navigations); one key per route,
  so the twentieth member page of the morning is as quiet as the second. Utilities:
  `.fl-rise`, `.fl-stagger` (40ms steps, capped at 8), `.fl-draw` (lines),
  `.fl-reveal-x` (charts), `.fl-grow-x` (bars and tracks), `.fl-d1–3` (delays).
  `<CountUp>` is for **operational counts only** — never a blood pressure, weight,
  WHO-5 or adherence figure; charts may draw in, their numbers never move. On every
  other visit, page content settles with a 180ms fade and 4px rise under the tab
  rail, which never moves.
- **The frequency ladder** decides every animation: ⌘K and keyboard movement —
  none (the palette opens instantly); hover, tabs, route changes — 120–180ms colour,
  fade, at most 4px; sheets, menus, toasts, saving — 150–280ms from their trigger;
  first look — 420–700ms once per route per session; rare moments (sign-in, program
  start) — the mark assembling, the ring drawing.
- **A disabled control says why**, beside itself (`aria-describedby` to the reason).

## 6 · Self-critique (against the generic-default test)

*What would the lazy version of this brief produce?* White background, emerald-500,
Inter everywhere, rounded-2xl cards, a progress bar, confetti on activation. Checked
against that and the three banned looks:

1. ~~Cream + serif display + terracotta~~ — Paper is a **cool green-tinted** white,
   display is a **grotesque**, warm accent is deep Honey used for *semantics*, not
   styling. Not this look.
2. ~~Near-black + single acid accent~~ — Loam is a warm green-black used for *text
   on light ground*, and there are six working colors. Not this look.
3. ~~Hairline broadsheet~~ — 10–14px radii, tinted visible borders, generous card
   air. Not this look.

Revisions made during this critique:
- **First draft had "healthcare teal" as primary.** Teal is the sector default
  (every telehealth product). Replaced with the deeper Phloem green anchored to the
  actual logo, and moved teal to a role hue only.
- **First draft used Fraunces for display.** A soft serif display is drifting toward
  AI-default #1 and toward "artisanal bakery". Bricolage Grotesque keeps character
  while staying institutional.
- **Body face was going to be Source Sans.** Competent and forgettable; Atkinson
  Hyperlegible is the choice only *this* product (elderly low-vision members) would
  make — the most defensible aesthetic risk in the system, and it doubles as the
  accessibility strategy.
- **Signature was going to be a "vine" progress bar.** Twee, decorative, encodes
  nothing a bar doesn't. Growth rings encode cycle count, day progress, and pauses
  in one mark — structure as information.

The one deliberate risk: a mono face (Plex Mono) for clinical micro-text on an
elderly-adjacent product. Mitigation: it never sets sentences, only labels/numbers
at high contrast, and the portal uses it sparingly (timestamps only).

## 7 · Implementation map

Tokens live in `app/globals.css` as CSS variables mapped through Tailwind v4
`@theme` (colors, fonts, radii, shadows, focus). Fonts load via `next/font` in
`app/layout.tsx` (`--font-display`, `--font-body`, `--font-data`) — this also fixes
audit G-1 (the circular `--font-sans` reference that had the whole app in Times).
Elderly mode = a `.elderly` root class that raises type/target/contrast tokens to
AAA and zeroes motion. Dark tokens retuned to deep loam for parity.
