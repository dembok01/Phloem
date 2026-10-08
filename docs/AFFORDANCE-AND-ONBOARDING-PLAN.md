# PHLOEM — Clickability, Micro-interactions & Onboarding Questionnaire Plan

**Date:** 2026-10-07 · **Status:** Phase 1 ✅ built (2026-10-07) · Phase 2 ✅ · Phase 3 ✅ built (2026-10-08) · **Phase 4 cancelled** (client: the configured questions are never changed or added to) · Phase 5 not started · see `PROGRESS.md`
**Builds on:** `DESIGN-SYSTEM.md` (the world stays the same: Loam/Paper/Phloem, Bricolage/Atkinson/Plex,
growth rings), `docs/VISUAL-ELEVATION-PLAN.md` (V1–V4 shipped), `DESIGN-PROPOSALS.md` P-7 (now
taken up in Phase 4).

This plan is about **craft, not a new look**. The visual system is sound. What's missing is that the
interface doesn't clearly show **what you can click**, it barely **responds when you act**, and the
**questionnaire** asks caregivers to type answers they don't have.

---

## 1 · How this was analysed

- **Live probe** of 10 staff screens (admin overview / members / member page, coordinator today /
  pipeline / member page, notifications, doctor desk / member / onboarding tab) at 1440px and 390px,
  logged in as admin against the hosted project via a read-only puppeteer script (GET navigations only;
  screenshots kept in the session scratchpad, not the repo — they contain PHI).
- An **in-page census** of every visible interactive element (351 of them): cursor, size, and whether
  anything (fill, border, ring, underline) marks it as clickable at rest.
- **Code read** of the primitives (`button`, `card`, `list`, `badge`, `input`, `nav-tabs`, `row-action`,
  `globals.css`) and the whole questionnaire stack (`onboarding.v1.json`, `onboarding-flow.ts`,
  `DynamicForm.tsx`, `OnboardingWizard.tsx`, `lib/red-flags.ts`, `_red_flags()`, `get_onboarding_scoped`).
- **Aggregate-only SQL** over the 20 submitted onboarding responses (counts and medians only, no
  answer text read).
- **Not seen live:** the caregiver portal and the onboarding wizard. No member is in onboarding today
  (0 drafts), and there are no client demo logins on the hosted project (see
  `phloem-portal-elevation` memory). Phase 3 adds a dev-only preview to fix this.

---

## 2 · Findings — clickability

### The numbers (10 screens, 351 interactive elements)

| Signal | Count | Share |
|---|---|---|
| Clickable but shows the **arrow cursor** (not the hand) | 160 | **46%** |
| **No visible fill, border, ring or underline** at rest | 254 | 72% |
| Smaller than **32px** in one dimension | 133 | 38% |
| Has a border, but the border is **< 1.5:1** against its background | 7 | — |

Not all of the 72% is wrong: tabs and chevron rows can be bare. But almost every case below is a
real "is this clickable?" moment.

### Root causes, ranked by how much they explain

**A1 · No pointer cursor on any `<Button>`.** Tailwind v4's preflight resets buttons to
`cursor: default`. The `Button` primitive doesn't put it back, and only 6 elements in the codebase add
`cursor-pointer` by hand. Result: 129 buttons (Schedule, Reassign, Mark read, Search, desk switcher,
Sign out, sort headers, filter chips…) show an arrow. *One rule in `globals.css` fixes all of it.*

**A2 · Control edges are almost invisible.** `--border` `#dce5dd` is **1.29:1** on white and 1.17:1 on
the inset list ground. `--input` `#c9d6cc` is 1.5:1. The `outline` button (the most-used variant, and
the default for `RowAction`), filter chips, phone and WhatsApp chips and inputs all draw their edge
with these. On the coordinator's Today queue, the row's main action (**Schedule**) is the
*lowest-contrast object in the row*. WCAG 1.4.11 wants **3:1** where the edge is the only thing that
marks a control.

**A3 · Text links look like body text.** Examples: notification titles (links, rendered as plain dark
text), timeline entries, the breadcrumb "Pipeline", the admin hero's "10 reports overdue" (honey text,
no underline), the members-table **name** (the only link in the row, with no underline, colour or
chevron), the lens bar's "Back to admin", and the header's "Sign out".

**A4 · Badges and buttons have the same shape.** Status badges ("Active", "Linked", "Flagged") are
rounded pills, and so are the filter chips ("Care team assigned 1", "Active 19"), which are buttons.
The large red "Flagged" badge on the doctor's member hero looks more clickable than the tabs below it.

**A5 · Hover makes the primary button lighter.** `default` goes to `bg-primary/80` on hover, which looks
like it's fading or turning disabled. Press feedback is a 1px nudge. Nothing confirms "you can press
this" before the click.

**A6 · Small targets in dense spots.** On notifications, "Mark read" is tiny text, 41 times on one
page. The desk switcher pill is about 24px tall. Filter chips are about 26px. `Input` defaults to
**32px** (`h-8`), but `DESIGN-SYSTEM.md` §11 says 40px.

**A7 · Rows don't behave the same way.** On Today, some rows are whole-row links with a chevron, and
others have a button and *aren't* links. The grouped member header ("Name · 2 actions") isn't a link
at all. Members-table rows aren't clickable; only the name is.

**A8 · Inactive nav tabs are bare grey text.** The active one is a pale-green pill. That reads fine
once you know it, but the inactive tabs don't look like they lead anywhere.

**A9 · Callouts that look like actions aren't.** For example, the read-only lens shows "Their
consultation form is due." in the same honey card the doctor sees as a call to action ("…— open it").
Rule needed: **an actionable callout always has a button, and an informational one never looks
tappable.**

### What already works (keep it)
Always-visible focus rings · whole-row `ListRow` links with chevron · the inset list tier ·
`RowAction` with honest Undo · the wait bar · tab pending spinners · the elderly-mode and
reduced-motion global kill-switch · the toast's symmetric exit.

---

## 3 · Findings — micro-interactions

Motion tokens are complete (`--motion-*`: press 160 / pop 200 / card 220 / sheet 320). Staff surfaces
were deliberately left still: the Portal Elevation rule was that a coordinator who lives in the app all
day shouldn't watch choreography. **That rule stays.** But it has been read as "no feedback at all",
and that's the gap. A staff screen today gives no answer to:

- **Can I press this?** No hover state on most chips, links or table rows.
- **Did my press land?** A 1px nudge, or nothing (raw `<button>`s, of which there are 51).
- **Did it work?** `RowAction` toasts, but the row itself doesn't change. "Mark read" just disappears
  on refresh.
- **Where am I?** The tab pill jumps; there's no continuity between tabs.
- **What changed?** Selection chips flip colour, but with no check mark and no transition.

---

## 4 · Findings — onboarding questionnaire

**Shape:** 55 fields in 5 chapters (Personal 17 · Medical 15 · Lifestyle 11 · Diet 5 · Goals 7),
already shown as a guided one-card-at-a-time flow. **16 answers are required and typed** (8 text,
6 textarea, 2 repeat-lists). Four of them are prefilled from signup.

### What the 20 real submissions show (aggregates only)

| Evidence | What it means |
|---|---|
| Median **4.4 h** from first save to submit | People leave and come back, so the burden is real (autosave and resume already help). |
| `surgeries_injuries`: **7/20** typed a "none" variant · `family_history`: **5/20** | Required free-text boxes where "None" is the most common answer. |
| `protein_grams` (required): answers range **0–180 g**, 2 zero or blank | A caregiver can't know grams of protein, so the nutritionist is reading guesses (180 g a day is implausible for an elder). |
| `country` is free text: only 12/20 normalise to "India" | Members also live in Oman and the UK. Free text gives inconsistent data, and "PIN code" is an India-only label. |
| `cardiac_eval_12mo`: **11/20** "No", which raises the medium red flag | There's no "Not sure", so caregivers guess and the flag is noisy. |
| `breathing_stamina` is free text: **12/20** raised the flag | The rule flags *anything* that isn't exactly "no" or "none". "Nil", "No issues" or "nope" would all flag. It's fragile even where it's right. |
| **Fall risk** fires only when `joint_pain` is Yes **and** the free text contains "fall" or "balance" (3/20 texts do) | There is **no direct falls question**, which is the single biggest clinical gap for an elderly chronic-care programme. |
| `activity_symptoms`: "None" can be chosen alongside "Chest pain" | Nothing stops a contradictory answer (0 cases so far, but the control allows it). |

### Interaction findings (code)
- Single-choice and multi-choice chips **look identical**: no check mark, no "choose all that apply",
  and `aria-pressed` only on multiselect. Booleans and selects expose no state to screen readers.
- A chip group's `<Label htmlFor>` points at nothing, because there's no element with that id, so the
  group is unlabelled.
- On a missing answer the wizard scrolls to the top and every field says the same thing ("This field is
  required."). Focus doesn't move to the problem.
- A red asterisk sits on almost every question. Most are required, so it's quieter to mark the
  *optional* ones.
- Mixed voice: "Why are **you** joining…" next to "Do **they** need painkillers…", even though
  `relationship_to_caregiver` already knows whether it's "Self".
- In repeat lists, "Remove" is an unlabelled icon and "Add another" is a faint outline button.

---

## 5 · The plan

Five phases. **Phases 1, 2, 3 and 5 are presentation-only** (no migration, RLS or RPC change, so the §16
suite doesn't need to re-run). **Phase 4 is the only one that touches the database** and needs clinical
sign-off first (§6).

Branch: `ui/affordance-onboarding` · one commit per phase · nothing pushed to `main` without the owner
(pushing `main` deploys production). The owner checks each phase on the Vercel preview.

### Phase 1 · Affordance foundations (primitives only) · ~1.5 days

Every screen inherits these changes, so most of §2 is fixed before any page is touched.

| # | Change | Files |
|---|---|---|
| 1.1 | **Cursor rule:** `button:not(:disabled), [role=button], [role=tab], summary, select, label[for], input[type=checkbox\|radio]` get `cursor: pointer`, and disabled controls get `not-allowed`. Fixes A1 (160 → 0). | `app/globals.css` |
| 1.2 | **Tokens:** `--edge-control` `#78897e` (3.7:1 on white, 3.36:1 on inset; dark equivalent tuned the same way), `--primary-hover` `#185a41` (8.15:1 with white text), `--link` with underline colour. | `app/globals.css`, `DESIGN-SYSTEM.md` §1/§3 |
| 1.3 | **Button:** hover *darkens* (A5); primary gets `shadow-card` and lifts on hover; `outline` gets a **white fill**, a stronger edge and the card shadow, so it reads as raised on inset grounds; new **`tonal`** variant (Phloem tint, deep text) for a row's main action; press is `scale(.97)` over 160ms; disabled = 50% + not-allowed. `sm` grows to 36px, and to 44px hit area on `pointer: coarse` (via `::after`, no layout shift). | `components/ui/button.tsx` |
| 1.4 | **Inputs:** `h-10` default, `--edge-control` edge, hover darkens the edge. Applied to `input`, `textarea`, native `select`. | `components/ui/input.tsx`, `DynamicForm` `CONTROL` |
| 1.5 | **Status vs action vocabulary (A4):** `Badge` becomes clearly *static* (no border, `radius-sm`, never a pointer). New **`Chip`** primitive for filters and toggles: bordered, hover, a check mark when selected, `aria-pressed`, 36/44px. | `components/ui/badge.tsx`, new `components/ui/chip.tsx` |
| 1.6 | **Text links (A3):** one `.link` class / `TextLink`: Phloem colour, underline at 35% at rest that goes solid on hover, 3px offset. Rule: **a link inside prose is always underlined.** | `globals.css`, new `components/ui/text-link.tsx` |
| 1.7 | **Rows (A7):** `ListRow` always shows the chevron when it has an `href` (also when it has an action); hover = card fill, a 2px Phloem left edge and a 2px chevron nudge. Tables get a **whole-row link** (stretched-link pattern, name stays the real `<a>`) and a chevron column. | `components/ui/list.tsx`, `components/admin/table.tsx`, `members-table.tsx` |
| 1.8 | **NavTabs (A8):** inactive tabs get a hover fill and the hand cursor; the active tab becomes a white pill with ring and Phloem text (clearly "selected"). | `components/nav-tabs.tsx` |
| 1.9 | **Callout rule (A9):** `Callout` takes an optional `action`. With one, it renders a real button; without one, the card is flat and there's no link-coloured text. | new `components/ui/callout.tsx` |

**Result (2026-10-07):** arrow-cursor clickables 160 → 20 (all 20 are pipeline cards with the
intentional grab cursor); edges under 1.5:1 7 → 4 (phone/WhatsApp chips, Phase 5); sub-32px
targets 133 → 130 (all per-surface, Phase 5). Deviations: `secondary` upgraded instead of adding
a `tonal` variant; no coloured left edge on row hover; chips 32px (44 on touch). Details and
assumptions in `PROGRESS.md`.

**Acceptance:** re-run the probe → arrow-cursor clickables **0**, edges under 1.5:1 **0**, under-32px
targets limited to inline prose links. `tsc --noEmit` · `eslint` · `npm run test:unit` · `npm run build`
all green. Desktop and phone screenshots reviewed once, fixes applied in one batch.

### Phase 2 · Micro-interactions (feedback motion only on staff surfaces) · ~1 day

**Budget rule (kept from Portal Elevation):** staff surfaces get *feedback* motion, meaning a response
to the user's own action, between 120 and 200ms. No entrance choreography and no staggered lists on
pages seen 50 times a day. The portal and onboarding keep their richer set. Reduced-motion and elderly
mode are already handled by the global rule.

| # | Interaction | Where |
|---|---|---|
| 2.1 | **Press:** `scale(.97–.98)` at `--motion-press` on every Button, Chip and pressable row | primitives |
| 2.2 | **Hover:** fill and edge warm up, chevron nudges 2px, monogram ring tints by role | `ListRow`, tables, tiles |
| 2.3 | **Done-state morph:** after a successful `RowAction`, the button becomes "✓ Scheduled" for about 1.2s before the row refreshes away, so the row itself confirms, not just the toast | `components/admin/row-action.tsx` |
| 2.4 | **Optimistic Mark read:** the unread dot shrinks and the row tint fades immediately; the whole notification card becomes the link and marks it read when opened | `app/(app)/notifications/page.tsx` |
| 2.5 | **Sliding tab indicator:** the active pill glides between tabs (`--motion-ease-in-out`, 200ms); on phones the rail auto-scrolls (already does) | `components/nav-tabs.tsx` |
| 2.6 | **Selection:** the chip check mark scales in (150ms) and the segmented control's fill slides | `Chip`, `DynamicForm` |
| 2.7 | **Copy feedback:** copy icon morphs to a check for 1.2s, `aria-live` "Copied" | `components/copy-field.tsx`, check-in link |
| 2.8 | **Disabled with a reason:** disabled actions get a tooltip / `aria-describedby` that says *why* (e.g. "Admin view is read-only") | lens surfaces, clinical forms |
| 2.9 | **Sheets and popovers:** confirm all use the drawer curve and backdrop fade, with no instant pops | `components/ui/sheet.tsx`, notification bell, desk switcher |

**Acceptance:** keyboard walk (every new state reachable without a mouse), reduced-motion check, no
layout shift (CLS stays 0 on the probed pages), probe re-run, and the impeccable detector run once on
the changed files.

**Result (2026-10-08):** built as specified except: the segmented "fill slides" (2.6) is limited to the
NavTabs pill (form choices are separate wrapping chips); the clinician member page's server-rendered
`?tab=` rail does not glide; the done-state lives on `RowAction` (Revoke / Suspend / Reactivate) —
Today's Schedule opens a sheet, not a row action. Details in `PROGRESS.md`.

### Phase 3 · Questionnaire experience (presentation-only) · ~1 day

Can ship before Phase 4. It doesn't touch the template, red flags, report builder or scoped reads.

| # | Change |
|---|---|
| 3.1 | **Choice semantics:** single choice = `radiogroup` (`aria-checked`, arrow keys, a radio dot); multiple choice = checkbox chips with a visible ✓ and "Choose all that apply". Groups labelled with `aria-labelledby`. |
| 3.2 | **"None" is exclusive:** choosing None clears the others, and choosing a symptom clears None (UI logic; stored shape unchanged). |
| 3.3 | **One-tap "None":** `surgeries_injuries`, `family_history`, `allergies`, `food_allergies`, `hospitalizations` get a "None" chip that fills the box with "None". About a third of real answers were exactly that. Still a textarea, same stored value type. |
| 3.4 | **Mark optional, not required:** drop the red asterisks and show a quiet "Optional" tag on the minority instead. |
| 3.5 | **Better errors:** on Continue, focus and scroll to the *first* missing field, with a specific message ("Choose Yes or No", "Add at least one medicine") announced via `aria-live`. |
| 3.6 | **Voice follows the relationship:** if `relationship_to_caregiver = Self`, labels read "you/your", otherwise "they/their". Done with a label-override map in `onboarding-flow.ts`; the template is untouched. |
| 3.7 | **Repeat lists:** a tonal "Add a condition / Add a medicine" button, a labelled "Remove" with text, and focus on the new row's first field. |
| 3.8 | **Review before submit:** a final card listing every answer by chapter, each with "Edit" jumping back to its card. Catches mistakes and builds confidence before the irreversible submit. |
| 3.9 | **Dev-only preview route** (`/dev/onboarding-preview`, returns 404 when `NODE_ENV=production`): renders the wizard over the active template with in-memory answers and **no submit**. This finally lets anyone see and screenshot the questionnaire without a real member in onboarding. |

**Acceptance:** unit tests for the exclusive-None logic and the voice map; keyboard and screen-reader
walk through every card in the preview; phone at 390px; `test:unit` + build.

**Result (2026-10-08):** built, except **3.6 (voice) — reverted the same day**: the client requires
every configured question to be shown exactly as written, so labels are never re-worded (only the
wizard's own headings and the list buttons' words follow the respondent). The preview route is also live on
Vercel *preview* deployments (production still 404s) so the owner can check it there. A real
screen-reader pass was not done (ARIA roles, names and focus were checked in a headless browser).

### Phase 4 · Questionnaire content v2 (template version 2 + DB) · ~2 days · *needs §6 sign-off*

> **Cancelled 2026-10-08.** The client has asked that the configured onboarding questions are not
> changed and nothing is added to them; only small, unobtrusive presentation changes are allowed.
> This section is kept for the record. Do not build it without a new instruction from the client.

Uses the established **versioning, not mutation** pattern (0023/0052): insert `onboarding` v2 as
active, keep v1 for the 20 existing responses, **keep every v1 field id stable**, and only add new
ids. Lands as `supabase/migrations/0054_onboarding_v2.sql`, then exported to
`supabase/templates/onboarding.v2.json` so `scripts/seed.ts` keeps v2 active.

**4a · Less typing (low clinical risk)**

| Field | Now | v2 |
|---|---|---|
| `conditions`, `medications` | required list | **Yes/No gate** (`has_conditions`, `has_medications`); list required only on Yes |
| `protein_grams` | required number (g) | **optional**, with a new `protein_sources` multiselect (dal/legumes, eggs, fish/meat, milk/curd, paneer, sprouts, nuts…) that the nutritionist can actually use |
| `water_liters` | litres | same stored value, but the stepper counts **glasses** (250 ml) and shows "≈ 1.5 L" |
| `country` | free text | select (India, Oman, UAE, Saudi Arabia, Qatar, UK, Other…) |
| `language` | free text | select (Malayalam, English, Hindi, Tamil, Arabic, Other…) |
| `pin_code` | "PIN code" | label "PIN / postal code" |
| `preferred_slots` | free text | multiselect (Early morning, Morning, Afternoon, Evening · Weekdays, Weekends). Readers must accept string (v1) **and** array (v2). |
| `smoking_freq`, `alcohol_freq` | free text | select (Daily, Few times a week, Occasionally, Quit) |

**4b · Better red-flag inputs (clinical sign-off required)**

| Field | v2 | Red-flag change (SQL `_red_flags()` and `lib/red-flags.ts` in lockstep) |
|---|---|---|
| `breathing_stamina` | select **None / On exertion / At rest** + optional `breathing_detail` | flag when ≠ None. *Proposal:* "At rest" → high. v1 free-text rule kept for v1 answers. |
| `cardiac_eval_12mo` | adds **"Not sure"** | *Proposal:* "Not sure" raises the same medium flag, labelled "Cardiac evaluation status unknown". |
| **new** `falls_12mo` | No / Once / More than once | `fall_risk` = falls ≥ 1 **or** walking aid ≠ None **or** the old joint-pain + text rule (kept so v1 still works). |
| **new** `walking_aid` | None / Stick / Walker / Wheelchair | (as above) |

**4c · Clinical additions (optional, owner and doctor choose)**: `hearing_difficulty`,
`memory_concerns`, `lives_with` (Alone / Spouse / Family / Paid caregiver), `who_cooks`, optional last
known BP and blood-sugar readings.

**Lockstep backend work in the same migration and commit:**
1. `_red_flags()` (SQL) and `computeRedFlags` (TS) updated together; extend `lib/red-flags.test.ts`
   parity cases for v1 *and* v2 answer shapes.
2. `get_onboarding_scoped` gets the new ids under the right roles (§3): falls / walking aid → doctor
   (full) + trainer; `protein_sources`, `lives_with`, `who_cooks` → nutritionist; hearing / memory →
   doctor + psychologist minimal. **No contact identifiers move.** Admin and caregiver unchanged (full).
3. `lib/reports/build/onboarding-summary.ts` renders both versions; new rows go under their existing
   section headings.
4. `onboarding-flow.ts` card map updated (new fields grouped; the gates sit with their lists).

**Not changed:** the 20 existing responses, their stored red flags, and their issued summaries. No
backfill (v1 answers stay as they are).

**Acceptance:** `test:unit` (red-flag parity, v1 + v2), §16 RLS suite via MCP `execute_sql` inside
the restore + rollback transaction (`phloem-rls-suite-baseline`), an existing v1 onboarding summary
still renders, the v2 wizard walked end-to-end in the Phase 3 preview, build green, and results pasted
into `PROGRESS.md`.

### Phase 5 · Surface sweep · ~1 day

Apply the Phase 1–2 vocabulary where screens bypass it (51 raw `<button>`s → `Button` / `Chip`).

| Surface | Specific fixes |
|---|---|
| Header + lens bar | Desk switcher 36px with a visible edge; "Sign out" as a labelled ghost button; "Back to admin" as a real button |
| Admin overview | "10 reports overdue" becomes a `TextLink` to the filtered list; the info icon gets a larger hit area |
| Admin members | Filter chips → `Chip`; whole-row link + chevron; status badges flat |
| Coordinator Today | **Schedule** → `tonal`; every row opens the member; group header is a link |
| Coordinator member | Phone/WhatsApp → `Chip` with edge; "Create a check-in link" → `tonal`; `Select…` + "Reassign" sized and edged consistently |
| Notifications | Whole card is the link (opening marks it read); "Mark read" → 40px ghost button; unread rail |
| Doctor desk / member | Tabs per 1.8; due-form callout per 1.9; "Flagged" badge flat, so it no longer outranks real actions |
| Clinical / feedback forms | Inherit the Phase 3 chip semantics (shared `DynamicForm`) |
| Portal | Same primitives; verified in the Phase 3 preview plus the owner's Vercel preview |

**Acceptance:** final probe run (targets in §7), one batched desktop + phone screenshot pass, detector
run, `PROGRESS.md` entry, commit.

---

## 6 · Decisions the owner needs to make

| # | Decision | Recommendation |
|---|---|---|
| D1 | Approve the **4b red-flag changes** (structured breathing, "Not sure" on cardiac eval, falls + walking aid feeding fall risk). | **Yes, after a doctor reads the wording.** Fall risk is the largest clinical gap, and the current rule depends on someone typing the word "fall". |
| D2 | Which **4c additions** to include. | Start with **falls + walking aid** (already in 4b) and **lives_with**. Add hearing, memory and readings only if the doctors will use them. |
| D3 | Staff motion level. | **Feedback-only** (as above). Richer motion stays on the portal and onboarding. |
| D4 | Add the **dev-only onboarding preview** route. | **Yes**: it's the only way to verify questionnaire work without a live member in onboarding. |

**Outcome (2026-10-08):** D3 and D4 were built as recommended (Phases 2 and 3). D1 and D2 are moot —
Phase 4 is cancelled at the client's request.

---

## 7 · Success measures (re-run the probe after each phase)

| Measure | Now | Target |
|---|---|---|
| Clickables with arrow cursor | 160 / 351 | **0** |
| Control edges < 1.5:1 | 7 | **0** (inputs and chips ≥ 3:1) |
| Targets < 32px | 133 (incl. inline prose links) | **0** apart from inline prose links; `pointer: coarse` ≥ 44px |
| Required answers that need typing | 16 | n/a — Phase 4 cancelled (questions unchanged) |
| Required "guess a number" questions | 1 (`protein_grams`) | n/a — Phase 4 cancelled |
| Direct falls question | none | n/a — Phase 4 cancelled |

---

## 8 · Guardrails (unchanged)

- Presentation-only phases never touch migrations, RLS, §6 RPCs or business logic.
- Phase 4 follows migration discipline: file in `supabase/migrations/` first, applied via MCP
  `apply_migration`, template exported to `supabase/templates/`.
- AA minimum and AAA in elderly mode; status is never colour-only; focus rings stay.
- Vocabulary stays: *member*, *care team*, *cycle*; buttons say what they do and toasts repeat the verb.
- Probe screenshots contain PHI. They stay out of the repo and out of PRs.
