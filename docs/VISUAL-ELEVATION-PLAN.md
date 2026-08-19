# PHLOEM — Visual Elevation Plan

**Date:** 2026-08-20 · **Status:** V1–V4 implemented (2026-08-20); V5 not started
**Mode:** Operate (staff) + Persuade-adjacent (family portal)
**Decision taken:** *elevate craft, keep the world.* Loam/Paper/Phloem, Bricolage /
Atkinson / Plex, and the growth-ring signature all stay. Nothing here replaces
`DESIGN-SYSTEM.md`; this plan is about finally **applying** it.

---

## 1 · What I found

I screenshotted the real app (admin overview, coordinator Today, coordinator member,
report view) and audited the tokens. Two things explain almost everything.

### 1.1 The system on paper is stronger than the system on screen

| Defined in `globals.css` | Used in the UI |
|---|---|
| 8 role hues (`--role-doctor` … `--role-member`) | **0 usages** |
| A complete dark palette (~40 tokens, retuned chart series) | **6** `dark:` usages |
| `stagger-in` entrance | **2** usages |
| 3 motion curves + 5 durations | a handful |
| `--shadow-2` (the "raised" elevation) | dialogs only |

A whole colour dimension and an entire theme are sitting unused. This is the
cheapest, largest visible win available, and it *is* the documented system — using it
is honouring `DESIGN-SYSTEM.md`, not overriding it.

### 1.2 One recipe, applied everywhere

Nearly every container in the product is the same object:

```
rounded-xl border bg-card p-4 shadow-card
```

Stat tiles, task rows, member rows, panels, empty states, my new engagement and
renewal cards — all of it. When every element has identical visual weight, the eye
gets no hierarchy, and a competent screen reads as a flat one. This is the single
biggest reason the recent work "doesn't feel noticeable": it was *added correctly to
a flat system*, so it inherited the flatness.

### 1.3 Specific defects visible in the screenshots

| # | Defect | Evidence |
|---|---|---|
| D1 | **Zeros get hero treatment.** The largest type on the admin overview is four `0`s. | admin overview |
| D2 | **Inverted list hierarchy.** The repeated verb ("Schedule the … consultation") is dominant; the member name — the thing that actually varies and that a coordinator scans for — is the small grey second line. | coordinator Today |
| D3 | **Wall of sameness.** 7 identical rows, 7 identical buttons, all competing equally. | coordinator Today |
| D4 | **Low density.** ~78px rows carrying two short lines; 11 items need a full scroll. | coordinator Today |
| D5 | **Dead space.** Admin overview ends ~830px into a 1080px viewport with no layout response to sparse content. | admin overview |
| D6 | **No focal point.** No element on any screen is more than ~1.2× the visual weight of its neighbours. | all |
| D7 | **Colour is decorative, not structural.** Pages are ~95% white/grey; brand green appears in chips and one funnel bar. | all |
| D8 | **Single plane.** One background, one shadow, no light source, no depth. | all |
| D9 | **Motion is invisible.** Tokens exist; nothing on these screens moves on load or on change. | all |
| D10 | **Empty states are sentences.** "Nothing coming up — members whose package ends within 30 days surface here." in an otherwise blank card. | admin overview |

---

## 2 · Ten systemic moves

These are ordered by *visible change per unit of risk*. M1–M4 alone fix most of
D1–D10 across every screen, because they change shared primitives rather than pages.

### M1 · A real surface hierarchy (4 tiers, not 1)

Introduce `Card` variants and use them deliberately:

| Tier | Treatment | Used for |
|---|---|---|
| `canvas` | Paper ground, subtle top-down gradient | the page itself |
| `panel` | white, 14px radius, hairline border, `shadow-1` | primary content blocks (today's default) |
| `inset` | **recessed**: tinted ground, *no* border, hairline dividers between rows | lists and queues |
| `hero` | white, `shadow-2`, brand-tinted glow, larger radius | exactly one element per screen |

**The `inset` tier is the highest-value single change in this plan.** Turning list
rows from 7 bordered cards into one recessed panel with hairline dividers kills the
"wall of sameness", raises density ~40%, and instantly reads as designed.

### M2 · Invert list hierarchy

Everywhere a list repeats a verb and varies a name, swap the emphasis:

```
BEFORE                                AFTER
Schedule the nutritionist …           ▸ SCHEDULE · NUTRITIONIST      (11px mono eyebrow)
Dibesh Bulhar                           Dibesh Bulhar                (16px medium, Loam)
                                        booked 3 days ago            (12px mono, right-aligned)
```

Applies to: coordinator Today, doctor queues, member lists, notifications, thread
lists, pipeline cards.

### M3 · One hero per screen

Every screen gets exactly one element at 2–3× the weight of anything else:

| Screen | Hero |
|---|---|
| Admin overview | **State of the programme** band — aggregate growth rings + the one number that matters + a plain sentence |
| Coordinator Today | **Your day** bar — N actions, M overdue, who is next, with a progress arc that empties as the queue clears |
| Doctor | **Next consultation** card — member, countdown, join button, their open issues |
| Clinician member page | **Member identity band** — photo, monogram in role hue, cycle rings, red-flag state |
| Portal home | the existing growth-ring hero, enlarged with atmosphere |
| Report view | a **cover block** — member, report type, cycle, date |

### M4 · Colour becomes structural

Three specific uses, all from existing tokens:

1. **Role hues finally ship.** Monograms, avatars, consultation-type icons, care-team
   rows, and timeline dots take `--role-doctor` (Water), `--role-nutritionist`
   (Phloem), `--role-trainer` (Ochre), `--role-psychologist` (Plum). Suddenly a
   coordinator can tell a doctor row from a trainer row without reading.
2. **Section grounds by severity.** A danger section sits on a whisper of Clay tint
   with a 2px Clay rail on the *section* (not per card); warning on Honey tint. The
   page stops being 95% white.
3. **Data-viz stays as validated** — the four categorical chart hues are untouched.

### M5 · Density and tabular discipline

Rows 78px → 56–60px. All times, counts, ages, day-numbers in `font-data` with
`tabular-nums`, right-aligned. Numbers stop jittering between rows and the eye gets a
clean right edge to scan.

### M6 · Depth and atmosphere

- Canvas gains a very slight vertical gradient (Paper → 2% deeper at top).
- A single soft brand-tinted radial glow sits behind the hero element only.
- `shadow-2` reserved exclusively for hero + overlays, so elevation *means* something.
- Hover on interactive rows: 1px lift + border warms to Phloem/40.

### M7 · Motion that is actually seen

- `stagger-in` on every list (it exists; it is used twice).
- Count-up on hero numbers (respecting reduced-motion).
- The growth-ring arc draw — already built — promoted to admin and member surfaces.
- Sliding active-indicator on `NavTabs`, so every navigation has continuity.
- A one-shot "changed since you last looked" pulse on rows.

All of it inside the existing 160–320ms scale, with the 700ms ring as the single
signature moment. The global reduced-motion and `.elderly` rules already zero all of
this — no component needs its own handling.

### M8 · Sparse and empty states become designed

- A zero stat renders the label, an em-dash, and a hint — never a giant `0`.
- Empty panels get the growth-ring mark as a 6%-opacity watermark, one sentence, and
  a real primary button.
- Layouts respond to sparse content (a 2-column grid collapses to one wide hero
  rather than leaving a dead right half).

### M9 · Typography earns its keep

Bricolage is currently capped around 28px. The scale in `DESIGN-SYSTEM.md` goes to
44. Use it: hero numbers 44, screen titles 34, hero member names 28. Plex Mono
eyebrows become the consistent section marker everywhere (partially true today).
Target a real contrast ratio between the largest and smallest type on a screen —
today it is roughly 2:1, it should be 3.5:1.

### M10 · Dark mode for staff surfaces *(optional, flagged)*

The dark palette is fully specified and unused. Enabling it for
doctor/coordinator/admin is the single most dramatic available change and costs
little, because the tokens exist and components read tokens rather than literals. The
family portal and elderly mode stay light.

**Flagged, not assumed** — this is the one item in the plan that changes the product's
character rather than its craft. Say the word and it goes in; otherwise it stays out.

---

## 3 · Per-surface plan

### 3.1 Admin — Overview
*Current:* four zero-tiles, a funnel, a chart with 3 points, an empty radar, dead space.

- **Hero band** replacing the four equal tiles: aggregate growth rings + "6 families
  in care · 3 need attention" + the week's throughput as a ghosted area behind it.
- Stat tiles become a **secondary strip**: smaller, sparkline as a ghosted area *behind*
  the number, delta-vs-last-week chip, whole tile clickable with hover lift.
- Funnel gets role-free Phloem ramp + labels inside segments at ≥2 count, and becomes
  the page's filter (already clickable — make that legible with a cursor + hover state).
- Renewal radar empty state → watermark + "Nothing in the next 30 days" + a link to
  the pipeline.
- Sparse-layout rule so the page never ends in 250px of nothing.

### 3.2 Admin — Members list / Member detail / Care team / Invites / Audit
- Member rows → `inset` list, monogram in caregiver hue, cycle rings at 20px, status
  as a two-part chip, engagement badge inline.
- Member detail → identity band hero; the many panels below get section eyebrows and
  a sticky in-page nav (the page is now very long after W1–W5).
- Care team → cards per professional with role-hued avatar and a load count.
- Audit → monospace ledger treatment, sticky date headers, action-verb colour coding.

### 3.3 Coordinator — Today
*Current:* the worst offender for D2/D3/D4.

- **"Your day" hero bar** with counts and a clearing arc.
- Tasks grouped **by member**, not flat: member header row, then their actions
  indented — Dibesh appears once with 3 actions, not 3 times.
- `inset` rows at 56px, verb as mono eyebrow, member name dominant, age of task
  right-aligned in mono.
- Role-hued icon per consultation type.
- Overdue section keeps its Clay treatment but gains the section rail + tint ground.
- Primary action reveals on hover/focus (always visible on touch) so seven buttons
  stop competing.

### 3.4 Coordinator — Pipeline
- Real board columns with a coloured rail + count per column, `inset` column grounds,
  cards carrying monogram + rings + next action, and a "stuck here N days" mono note.

### 3.5 Coordinator / Admin — Member page
- Identity band hero; engagement, check-in link, renewal, threads, timeline all get
  section eyebrows and consistent spacing rhythm (currently each is an independent card
  with the same weight).

### 3.6 Doctor — `/clinician/clients`
*This is the screen I rebuilt in W5 and it still reads flat, because it inherited the recipe.*

- **Next consultation hero** with countdown and join.
- Queues become `inset` lists with a severity rail per section.
- Each row: monogram in role hue, name dominant, issue chips inline, cycle rings,
  and a left edge rail coloured by worst severity.
- "Needs you" section on a Clay-tint ground so it is unmistakably the important one.

### 3.7 Doctor — member page (8 tabs)
- Identity band hero with red-flag state and clearance status always visible.
- Tab rail gets the sliding indicator and per-tab attention dots (a tab with an open
  issue shows a dot).
- **Trends tab**: measure cards become the visual centrepiece — larger sparklines,
  direction-tinted grounds, baseline→latest as a visible track rather than a table row.
- **Cases tab**: case cards get a severity rail, a real timeline spine, and resolved
  cases collapse to a quiet ledger.
- **Messages tab**: chat-like density, author avatars in role hue, own messages aligned.
- **Consult form**: section completion ring in the rail, focus glow, "last time"
  reference as a right-aligned mono chip, submit bar that goes solid when valid.

### 3.8 Family portal *(planned from code — not visually verified)*
> I could not log in as a caregiver (no known password; `seed.ts` guards demo
> fixtures behind `SEED_DEMO=1`). This section is reasoned from the components, so
> treat it as less grounded than the rest and expect one correction pass after we see it.

- Hero: growth rings larger, with the soft glow, day-count in Bricolage 44, and the
  story line at 20px.
- Nav tiles: role-hued icons, hover lift, and a badge when something is new.
- Renewal card: warm Honey gradient ground — it is the one commercial moment and
  should feel like an invitation, not an alert.
- Plans and reports: reading surfaces at `max-w-2xl` with proper document typography.
- Messages: family-friendly bubbles, not clinical rows.
- Elderly mode: everything above, but motion zeroed and type at 20px+ — already
  handled globally by the `.elderly` rules.

### 3.9 Reports + PDF
- **Cover block** at the top of every report (member, type, cycle, generated date).
- Numbered sections with mono numerals in the margin.
- Measure cards tinted by direction; the accessible table stays.
- PDF: running header with member name + page numbers, and a proper cover for
  multi-page documents.

### 3.10 Auth, invite, check-in, notifications
- Login: give it the growth-ring watermark and a warmer ground — it is the first
  impression and is currently a bare white box.
- `/c/[token]`: already the most "designed" screen; add the ring watermark for brand.
- Notifications: group by day, role-hued icons, unread rail.

---

## 4 · Per-component plan

Effort: **S** ≤ 30 min · **M** ≤ 2 h · **L** ≥ half a day. Impact is how visible the
change is to someone opening the app.

### 4.1 Primitives (change these first — everything inherits)

| Component | Upgrade | Effort | Impact |
|---|---|---|---|
| `ui/card` | Add `variant`: panel / inset / hero / quiet. This is the keystone change. | M | ★★★★★ |
| `ui/badge` | Role-hue support, optional leading dot, `size` prop, stronger danger | S | ★★★ |
| `ui/button` | Add `tone` for role hues; refine hover/press; icon-only variant | S | ★★ |
| `ui/empty-state` | Ring watermark, primary action slot, "what appears here" hint | S | ★★★★ |
| `ui/error-state` | Match empty-state treatment | S | ★★ |
| `ui/skeleton` | Shimmer that matches the real layout per surface | M | ★★★ |
| `ui/input`, `label` | Focus glow, invalid state, mono for numeric fields | S | ★★ |
| `ui/sheet` | Backdrop blur, spring entry via `--motion-ease-drawer` | S | ★★★ |
| `ui/toast` | Severity rail + icon, stacked offset | S | ★★★ |
| `page-header` | Eyebrow + display title (34–44) + action slot + optional stat strip | M | ★★★★★ |
| `nav-tabs` | Sliding active indicator, attention dots | M | ★★★★ |
| `monogram` | Role-hue grounds, size scale, optional ring | S | ★★★★ |

### 4.2 Signature and data

| Component | Upgrade | Effort | Impact |
|---|---|---|---|
| `growth-rings` | Radial glow at hero sizes; aggregate mode for admin; `ending` state shipped in W4 | M | ★★★★★ |
| `charts/sparkline` | Area-fill mode for ghosting behind numbers; direction tint | S | ★★★★ |
| `charts/measure-trends` | Larger marks, direction-tinted grounds, baseline→latest track | M | ★★★★★ |
| `charts/trend-line` | Gradient area under line, better empty state | S | ★★★ |
| `charts/stage-funnel` | Labels in segments, hover state, cursor affordance | S | ★★★ |
| `charts/adherence-card`, `who5-card` | Adopt the measure-card treatment | S | ★★★ |
| `issue-chips` *(new in W5)* | Severity rail, counts, overflow "+2 more" | S | ★★★★ |
| `status-chips` | Keep vocabulary; tighten to the new density | S | ★★ |
| `engagement` *(new in W3)* | Icon + dot; used in more places | S | ★★ |

### 4.3 Domain surfaces

| Component | Upgrade | Effort | Impact |
|---|---|---|---|
| `member-timeline` | Sticky month headers, gradient spine, role-hued dots, "today" marker | M | ★★★★ |
| `cases/case-panel` | Severity rail, real spine, resolved collapse to ledger | M | ★★★★ |
| `threads/thread-panel` | Conversation density, role-hued avatars, own-message alignment | M | ★★★★ |
| `threads/message-composer` | Grow-with-content, send affordance, focus ring | S | ★★ |
| `renewal-panel`, `portal/renewal-card` | Warm gradient ground; make it the moment it is | S | ★★★★ |
| `checkin-link-card` | Compact into the engagement hero; QR code option | M | ★★★ |
| `program-card` | Cycle strip with rings, pause state, ending state | M | ★★★★ |
| `red-flag-banner` | Section rail instead of side-tab; icon scale | S | ★★★ |
| `coordinator/pipeline-board` | Column rails, counts, richer cards | L | ★★★★ |
| `coordinator/schedule-sheet` | Time picker polish, mode icons | M | ★★ |
| `notification-bell` | Preview dropdown, grouped, unread rail | M | ★★★ |
| `command-palette` | Recent + role-scoped actions, result icons | M | ★★★ |
| `documents/document-list` | File-type icons, size/date in mono, drag-drop zone | M | ★★★ |
| `member-photo`, `portal/member-photo-upload` | Ring frame, hover affordance | S | ★★ |
| `portal/care-team-card` | Role-hued avatars, specialisation line | S | ★★★★ |
| `activation-moment` | Promote to the full signature moment it wants to be | M | ★★★ |

### 4.4 Forms and reports

| Component | Upgrade | Effort | Impact |
|---|---|---|---|
| `forms/DynamicForm` | Focus glow, invalid treatment, mono numerics, "last time" chip styling | M | ★★★★ |
| `forms/ClinicalForm` | Section completion ring, sticky submit that solidifies when valid | M | ★★★★ |
| `forms/OnboardingWizard` + `onboarding/*` | Already the most polished flow; align to new tokens | S | ★★ |
| `forms/FeedbackForm` | Adopt ClinicalForm treatment | S | ★★ |
| `reports/ReportView` | Cover block, numbered sections, direction-tinted measure cards | M | ★★★★★ |
| `lib/reports/styles.ts` | Cover + running header + page numbers for PDF | M | ★★★★ |

---

## 5 · Sequencing

| Phase | Contents | Why this order |
|---|---|---|
| **V1 — Foundations** | `Card` variants, `PageHeader`, `Monogram`, role hues, badge/button/empty-state, canvas gradient, `stagger-in` everywhere | Shared primitives. Every screen improves before any screen is touched individually. This alone is most of the perceived change. |
| **V2 — The three workhorses** | Coordinator Today, Doctor dashboard, Admin overview — heroes, inset lists, grouping, density | The screens you and your team look at daily, and the ones in any demo. |
| **V3 — Member depth** | Member pages (all 3 roles), timeline, cases, threads, trends | Where the W1–W5 work lives; makes that work finally read. |
| **V4 — Family + documents** | Portal surfaces, reports + PDF, login, check-in | Highest emotional stakes; portal needs the access question resolved first. |
| **V5 — Optional** | Dark mode for staff shells | Flagged decision, not assumed. |

---

## 6 · Guardrails — what does not change

1. **Accessibility floor.** AA contrast minimum, AAA in elderly mode; the Atkinson
   body face stays; focus rings stay visible; every status keeps icon + text, never
   colour alone.
2. **Elderly mode.** Motion zeroed, 20px+ type, max 3 items — untouched.
3. **The validated chart palette.** Categorical hues are not re-picked.
4. **RLS-driven content.** No surface gains data it could not previously read; this is
   presentation only.
5. **Report content model.** `reports.content` stays a stable JSON contract; only its
   rendering changes, and existing report types must keep rendering.
6. **The vocabulary.** *member*, *care team*, *cycle*, *programme*; buttons keep saying
   what they do.

---

## 7 · Honest notes

- **The portal section is code-reasoned, not screenshot-verified** (§3.8). Expect one
  correction pass once there is a caregiver login or seeded demo data.
- **Dark mode is flagged, not assumed** (M10) — it is the one item that changes
  character rather than craft.
- **Effort estimates are for design implementation only**, not new data work. Nothing
  in this plan requires a migration.
- **The biggest single lever is `Card` variants + the `inset` list tier.** If only one
  thing gets built, build that: it changes every list in the product at once.


---

## 8 · Implementation record — V1 to V4 (2026-08-20)

**Shipped.** `npm run build` ✓ · `tsc --noEmit` ✓ · `eslint` 0 problems ·
`test:unit` 62/62.

### V1 · Foundations
`components/ui/list.tsx` (new — `List` / `ListRow` / `ListSection`), `Card`
variants, role-hued `Monogram` + `toneForRole`, `PageHeader` (display scale +
eyebrow/stats slots), `EmptyState` ring watermark, `Sparkline` area mode, and in
`globals.css`: canvas gradient, `.hero-glow`, `.stat-figure`, stagger extended to
eight children.

### V2 · Workhorses
Coordinator Today (hero, grouping by member, inset rows), Admin overview (hero band,
ghosted-area stat strip, designed renewal empty state), Doctor dashboard
(next-consultation hero, inset queues with severity rails and inline issue chips).

### V3 · Member depth
Measure cards rebuilt with a baseline→latest track and direction-tinted grounds;
timeline gained sticky month headers, a gradient spine and role-hued dots; case rows
gained a severity rail and a real event spine; thread messages became conversation
bubbles with role-hued avatars and own-message alignment; clinician member page
gained an identity band hero.

### V4 · Family and documents
Report cover block + print page numbers, portal hero on the `hero` tier with glow,
role-hued portal tiles, renewal card on a warm gradient, and the login screen set
inside the growth-ring mark.

### Defects found by looking at the renders, and fixed
1. Grouped queue rows printed eyebrow and title identically.
2. The Schedule buttons were invisible — a row's PRIMARY action had been hidden
   behind hover. Reverted: the hierarchy fix, not concealment, solves D3.
3. Aggregate rings rendered as a meaningless bullseye with nothing active; they now
   appear only when they encode something true.
4. A stat tile read "none yet" beside a visibly rising trend line; zeros are now
   muted rather than em-dashed, and the caption only appears when the series is
   genuinely empty.

### Still open
- **V5 (dark staff shells)** — flagged, awaiting a decision.
- **Portal verification** — the portal changes are code-complete but still
  unverified in a browser for the reason in §3.8.
- **Doctor dashboard populated state** — `doctor@phloem.local` has no assignments,
  so only its empty state has been seen.
