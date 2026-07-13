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

## 1 · Palette — "under the canopy"

Six named colors. Everything on screen derives from these plus white.

| Name | Hex | Role |
|---|---|---|
| **Loam** | `#1F2A24` | Ink. All primary text and icons — a green-black like wet forest soil; warmer than #000, still 13:1 on Paper. |
| **Paper** | `#F5F8F5` | App background — white with a breath of leaf; cards sit on it in pure white. Cool, not cream. |
| **Phloem** | `#1E6B4E` | The brand green. Primary actions, active states, links in portal, the growth ring's living arc. 6.4:1 with white text. |
| **Moss** | `#5A6B60` | Muted ink — secondary text, labels, borders at 25% strength. ≥5:1 on white (fixes audit G-4). |
| **Honey** | `#8A5A0B` | Warmth + caution. Amber family for red-flag banners (per §11), pending states, pause badges. Deep enough to be AA as text. |
| **Clay** | `#A63A24` | Danger only: high red flags, adverse events, destructive actions. An earth red, not an alarm red. |

Supporting semantics (derived, not new hues): tints of each at 8–12% for fills
(`#1E6B4E` → `#E7F1EC` chip fill), and **Water** `#2F6DB5` as the one non-earth
exception — informational/link color on clinical surfaces and the doctor's role hue
(it echoes the blue in the existing logo).

**Role hues** (shell context, chips, avatars — always tint + deep text, never
saturated fills): doctor Water `#2F6DB5` · nutritionist Phloem `#1E6B4E` ·
trainer Ochre `#96610F` · psychologist Plum `#6D4A78` · coordinator Teal
`#20707A` · admin Slate `#4B5563` · family portal Phloem.

Dark mode keeps the same relationships on deep loam (`#141C17` bg, `#1B2620`
cards); tokens flip, components never know.

## 2 · Typography — a voice that reassures, a hand that records

| Role | Face | Why this one |
|---|---|---|
| **Display** — page titles, member names, report headings, big numbers | **Bricolage Grotesque** (600/700, tight leading) | Warm, slightly compressed grotesque with real personality at size; reads "modern institution with a heart", not "startup landing page". Used with restraint: one display moment per screen. |
| **Body** — everything readable | **Atkinson Hyperlegible** (400/700) | Designed by the Braille Institute for low-vision readers: unmistakable I/l/1, open apertures, sturdy at 16–20px. The most audience-true body face this product could have — accessibility as the aesthetic. |
| **Data** — timestamps, doses, IDs, eyebrows, chips | **IBM Plex Mono** (400/500) | Clinical texture: tabular numbers for vitals and dates, quiet institutional voice for section eyebrows (`PLAN`, `BASELINE`). Small sizes only, never paragraphs. |

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

## 4 · The signature — growth rings

**One element the product is remembered by: the growth ring.** A tree records each
season as a ring; a PHLOEM member records each 30-day cycle. The `GrowthRings` mark
draws one concentric ring per cycle of the package: completed rings solid Phloem,
the current cycle an arc swept to today's day-count, future rings faint Moss,
a pause shown as a soft Honey gap. It is not decoration — it is the package state,
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
