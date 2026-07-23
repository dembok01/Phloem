# PHLOEM — Client Demo Playbook

> Your private presenter's guide. Everything below is accurate to the current build and the
> live seed data. Read it once end-to-end tonight, do one dry run, and keep it open on a
> second screen tomorrow. Timings are a guide for a **~35–40 min demo + Q&A**.

---

## 0. The 60-second story you're telling

PHLOEM is a **role-based dashboard for the chronic care of elderly members**. An adult child
enrolls their parent; a coordinator assembles a care team (doctor, nutritionist, trainer,
psychologist); the system runs the parent through **30-day care cycles** that generate clinical
forms and immutable PDF reports — and it enforces **who is allowed to see what at the database
level**, not just in the UI.

Four audiences, in priority order. Every design choice serves them in this order:

1. **Elderly members & their adult children** — warmth, clarity, big type, "how is Amma doing?"
2. **Clinicians** — fast, focused, safe: see only your patients, your forms, your reports.
3. **The coordinator** — an operations command center that runs the whole pipeline.
4. **The admin** — oversight, analytics, and an audit trail.

**One-line pitch to open with:**
> "What you're about to see is a complete care-operations platform — from the moment a family
> signs up, through the clinical work, to the reports that land back with the family — and it's
> built so that privacy isn't a promise, it's enforced by the database itself."

---

## 1. What changed since you last saw it (the overhaul)

If the clients saw an earlier version, this is your "look how far it's come" moment. The last
work cycle was a **complete presentation-layer overhaul** — every screen, every role, desktop
and mobile — with **zero changes to the security model, data logic, or clinical rules.**

**The headline fixes (before → after):**

| Before (the audit found) | After |
|---|---|
| A CSS bug rendered the **entire app in Times New Roman** (a broken font variable) | A deliberate type system: **Bricolage Grotesque** (display), **Atkinson Hyperlegible** (body — literally designed for low-vision readers), **IBM Plex Mono** (data) |
| The trainer's "cleared **with restrictions**" was styled as a **green success banner** — dangerously misleading | Clinical states are colour- **and** icon-coded; caution never reads as "all clear" |
| Keyboard users (the coordinator lives here) had **no visible focus** and no shortcuts | Global visible focus ring, **⌘K command palette**, full keyboard operability |
| Flat, generic, "template" look; no identity | A signature visual language grounded in **"phloem"** = the living tissue that carries nourishment through a plant → the **Growth Rings** progress mark (one ring per 30-day cycle) |
| No warmth for families; clinical density everywhere | A **care-story home** for families, an **elderly mode** (≥20px type, ≤3 destinations, view-only), medical-document typography for reports |

**What was rebuilt, surface by surface:**

- **App shell** — consistent navigation, headers, toasts, loading skeletons, empty-state hints.
- **Caregiver portal** — the emotional core: care-story home, the Growth Rings signature, plans front-and-centre and printable, plus a strict **elderly mode**.
- **Coordinator command center** — pipeline board, "today" queue, ⌘K palette, dual-status chips.
- **Clinician experience** — pending-first client list, unmissable red-flag callouts, a focused form with a section rail + live autosave, and submit → straight to the report.
- **Reports** — medical-document typography with the clinician's assessment as the lead voice; the web view and the branded PDF are the same document.
- **Data-as-delight** — care timeline, WHO-5 & adherence trend charts, the Growth Rings, admin 30-day deltas.
- **Onboarding** — a warm welcome step, one-question-per-screen rhythm, always-visible "Saved ✓", a completion moment.

**The proof points (say these if asked "is it actually done?"):**
Build passes · TypeScript strict (no shortcuts) · linting clean · the **security test suite passes
57/57** · contrast verified to **WCAG AA everywhere, AAA in elderly mode** · keyboard-only
navigation verified on the coordinator and clinician screens.

> **Framing line:** "The rule for this overhaul was simple — make it beautiful and humane, and
> don't touch a single line of the security or clinical logic. Every one of those tests still
> passes, which is how we know we kept that promise."

---

## 2. Before the meeting — setup checklist (do this 15 min early)

**Start the app locally** (the PDF export needs your machine's Chrome, which works locally):

```bash
cd /Users/manojthomas/PHLOEM/phloem-dashboard
npm run dev          # → http://localhost:3000
```

Wait for "Ready" and load `http://localhost:3000/login` once so the first compile is warm
(the first page of each section can be slow to compile — pre-warming avoids an awkward pause).

**Pre-open tabs** (log each in, leave them parked — you'll switch, not re-login, on stage). Use
separate browser **profiles or windows** so the sessions don't collide:

1. Coordinator — `coordinator@phloem.local`
2. Caregiver — `caregiver@phloem.local`
3. Doctor — `doctor@phloem.local`
4. Admin — `admin@phloem.local`
5. (Optional) Elderly — `elder@phloem.local`

**Passwords:** every demo account is `test12345!` — **except admin**, which uses the
`SEED_ADMIN_PASSWORD` value in your `.env.local` (don't read it aloud; have it typed already).

**Warm each section once** by visiting one page per role before the clients arrive, so
Turbopack has compiled it.

**Have the fallback ready:** the `design-audit/after/` folder holds ~100 full-page screenshots
of every screen (desktop **and** mobile). If Wi-Fi or the laptop misbehaves live, you present
from those and never break stride. Know where that folder is.

**Optional but classy:** re-seed to a pristine state right before, so nothing looks half-used:
```bash
npm run seed         # idempotent — safe to run; restores the demo members
```

---

## 3. The demo flow — top to bottom, basic to advanced

The spine: **follow the members through the system.** Your seed data is perfect for this — you
have a real member at **every** lifecycle stage, so the story tells itself:

| Member | Stage | Use them to show |
|---|---|---|
| **Padma Nair** | Invited (not yet accepted) | The very start — an invite waiting |
| **K. V. Gopalan** | Onboarding (mid-questionnaire) | The onboarding wizard, live |
| **Rajan Pillai** | Assigned (team on, not started) | Coordinator's "next action" work |
| **Meera Krishnan** | Active (full team, 7 reports, running program, a red flag) | The full experience — the star of the show |

> **Recommended order below.** It opens wide (the command center — "this is a real platform"),
> then descends into the human stories, then closes on trust (security) and vision (roadmap).
> If your clients are more mission/emotion-driven than ops-driven, swap Act 1 and Act 2 — open
> on the family.

---

### ACT 1 — The command center (Coordinator) · ~6 min

**Login:** `coordinator@phloem.local` → lands on **Today**.

1. **Start on the Pipeline board.** Go to **Coordinator → Pipeline**
   (`/coordinator/pipeline`). Point at the columns: Padma sitting in **Invited**, Gopalan in
   **Onboarding**, Rajan in **Initial Consults**, Meera in **Active**.
   > "This one board is the entire business at a glance. Every family we serve is a card, and
   > the card is always in the column that tells us what has to happen next."

2. **Show the Today queue** (`/coordinator`). It's bucketed **Overdue / Today / This week** —
   real tasks, each deep-linking to the member. This is how the coordinator never drops a ball.

3. **The wow: press ⌘K** (Cmd+K). The **command palette** opens. Type `meera`, press **Enter**
   — you jump straight to her. 
   > "The coordinator lives on the keyboard. They never hunt through menus."

4. **Open Rajan** (`assigned`, team on but not started). Show the **dual-status chips** on his
   consultations — each consult has **two** independent states: *Meeting* (to schedule →
   scheduled → done) and *Report* (pending → submitted). Show the **WhatsApp / call** links on
   the contact card.
   > "One chip would lie. A meeting can be done but the report still pending — so we show both,
   > and we never rely on colour alone."

5. **Open Meera** (`active`). Scroll the **program card with the Growth Rings** and the cycle
   timeline. This plants the signature visual you'll pay off in the family view.

**What just impressed them:** breadth, control, speed (⌘K), and that this is a *working operations
tool*, not a mockup.

---

### ACT 2 — The family experience (Caregiver + Elderly) · ~6 min

**Login:** `caregiver@phloem.local` (this is Anita, Meera's daughter).

1. **The care-story home** (`/portal`). Warm, human, "how is my mother doing." The **Growth
   Rings** appear again — now as reassurance, not ops. Point out: **plans front-and-centre**,
   care-team **names** (not clinical detail), next appointments.
   > "For the family, this isn't a dashboard — it's peace of mind. Notice they see their care
   > team's names and their parent's plans, but never the raw clinical internals."

2. **Open the plans** (`/portal/members/<Meera>/plans`). The nutrition and training plans render
   as clean, **printable** documents. Hit **Print** to show it's built for the fridge door.

3. **The schedule and reports pages** — upcoming vs past consultations; only the report types a
   family is permitted to see (you'll contrast this hard in Act 4).

4. **Now the moment: elderly mode.** Switch to the **`elder@phloem.local`** login (Meera's own
   view). It's deliberately **three big view-only tiles** — *My Plans · My Schedule · My Care
   Team* — ≥20px type, no clutter, nothing to break.
   > "This is the same system, seen by an 80-year-old. Three things, large type, nothing to get
   > wrong. Accessibility here isn't a setting we bolt on — it's a different, simpler front door."

**What just impressed them:** warmth + the accessibility story. This is the emotional core and
where mission-driven clients lean in.

---

### ACT 3 — Onboarding, and catching a health risk (Caregiver) · ~4 min

**Login:** `caregiver@phloem.local` won't have a *live* mid-onboarding member — use the Gopalan
family's onboarding to show the wizard. (Easiest path: show the onboarding wizard on screen via
`gopalan.family@phloem.local` → `/portal/onboarding/<Gopalan>`, or narrate from the
`design-audit/after/flow--*` screenshots if you'd rather not juggle a third login.)

1. **The welcome step.** Sets expectations, promises autosave, reassures on privacy. Warm, not
   a wall of fields.

2. **One question per screen.** Show the segmented **journey bar** and the calm rhythm. Point at
   the always-visible **"Saves automatically → Saved ✓"**.
   > "An adult child fills this out for their parent, often on a phone, often interrupted. It
   > saves every step, so they can put it down and pick it up. Nothing is ever lost."

3. **The payoff — red-flag detection.** Explain that when an answer signals risk (e.g. chest
   pain), the system **automatically raises a red flag** in plain language, and it surfaces to
   the coordinator and the doctor. Meera's active record carries a real high red flag you can
   point to on her clinician view in Act 4.
   > "The moment a family tells us something that matters clinically, the system catches it and
   > routes it to the right professional — before anyone has to remember to look."

**What just impressed them:** the product is *humane under pressure* (autosave) and *clinically
alert* (red flags) at the same time.

---

### ACT 4 — The clinician experience + the trust wall (Doctor) · ~7 min · **the differentiator**

**Login:** `doctor@phloem.local`. This act is where healthcare clients decide you're serious.

1. **Pending-first client list** (`/clinician/clients`). Assigned members only, the ones needing
   a form surfaced first, red-flag dots visible.

2. **Open Meera → Overview.** The **red-flag callout** is unmissable (Honey/Clay bars, plain
   language). Then **Onboarding** tab — the doctor sees the **full** health answers.

3. **The clinical form** (`?tab=form`). Show the **section rail** down the side with completion
   ticks, the **live autosave**, and the note that *your written assessment leads the report*.
   Fill a field or two; point at the sticky action bar tracking required progress. Submit takes
   you **straight to the generated report**.

4. **Now the two beats that win the room:**

   **(a) The confidentiality wall.** State plainly:
   > "I'm logged in as the doctor. The psychologist's wellbeing notes on this same member — I
   > cannot see them. Not hidden in the UI — the database refuses to return them to me. Everyone
   > else just sees 'wellbeing check-in completed' with a date."

   **(b) The clearance gate.** Explain the trainer flow:
   > "A trainer literally cannot submit a fitness plan until the doctor has medically cleared
   > the member. The form is locked, and even if someone tried to bypass the screen, the
   > database rejects it. Care can't get ahead of safety."

**What just impressed them:** this is the moment they realise the permission model is **real** and
**enforced**, which in healthcare is the whole ballgame.

---

### ACT 5 — Reports as medical documents · ~3 min

Still as the doctor (or admin), open a report — e.g. Meera's doctor report or nutrition plan
(`/reports/<id>`, or via her Reports tab).

1. **Medical-document typography.** The clinician's **assessment is the lead voice** (larger,
   set off with the Phloem rule), mono labels, first-class **callouts**, human-readable dates.
2. **Download the PDF.** It's **branded**, and — key point — **the same document** as the web
   view, not a separate export. Reports are **immutable**: once written, they're a permanent
   record.
   > "Every report is a proper medical document, and the PDF the family receives is byte-for-byte
   > the same thing the clinician signed off. Nothing drifts between screen and paper."

---

### ACT 6 — Oversight & analytics (Admin) · ~4 min

**Login:** `admin@phloem.local`.

1. **Overview analytics** (`/admin`) — the four tiles (active members · consults this week ·
   overdue reports · renewals in 30 days) with **30-day movement deltas**, plus the **renewal
   radar**.
2. **A member's data story** (`/admin/members/<Meera>`) — the **WHO-5 wellbeing trend** and
   **adherence-by-cycle** charts (colour-blind-safe), the **Growth Rings** on the program card,
   and the full **care timeline** of everything that's happened.
3. **The audit log** (`/admin/audit`) — every sensitive action, recorded.
   > "Nothing happens in here without a trace. For a healthcare operation, that audit trail is
   > not a nice-to-have — it's the difference between trust and liability."

---

### ACT 7 — Land the plane (2 min)

Return to the **coordinator pipeline** (the wide shot you opened on) and close:
> "So — from an invite, through a family's onboarding, through clinicians who see exactly what
> they should and nothing more, to reports that land back with the family, all on one platform
> that enforces its own privacy rules. That's PHLOEM today. Here's where we take it next."

Then move into the roadmap (Section 5).

---

## 4. The security & trust story (keep this in your back pocket)

For a healthcare buyer this is often *the* deciding factor. If they push on "how safe is this?",
this is your answer — and it's genuinely true of the build:

- **Permissions are enforced in the database, not the interface.** The UI just mirrors the
  rules; even a bug or a malicious request can't leak data the caller isn't entitled to.
- **Clinicians never see contact details.** Phone, WhatsApp, address, emergency contact live in
  a separate table their access can't touch. A doctor treats the person without holding their
  personal contact identifiers.
- **Confidentiality is role-scoped.** The psychologist's wellbeing notes are invisible to
  everyone else; the doctor's clearance governs the trainer; the coordinator can run operations
  without ever reading clinical content.
- **Every state change is an audited, controlled action** — you can't quietly edit a record; you
  move it through a defined transition that gets logged.
- **Reports are immutable** once written.
- **We prove it, continuously.** A 57-check security test suite runs against these rules; all 57
  pass. (Offer to *show* the suite passing if a technical stakeholder is in the room — it's a
  strong flex.)

> **Power line:** "Most systems tell you they're secure. We can show you the tests that prove no
> role can see what it shouldn't — and they run every time we ship."

---

## 5. Where (and how) to plant the future — the roadmap

**When to raise it:** right after Act 7, while they're impressed and imagining. Frame it as
*"here's what this foundation makes easy next"* — the point is to show the platform is a runway,
not a finished box. Two tiers: near-term (credible, small lift) and the vision (the ones that
make them lean forward).

### Tier 1 — Next quarter (grounded; these are already designed, just not built)

These come straight from the design work — say "we've already scoped these":

- **Share-with-family toggle** — let the care team choose to share a doctor or performance report
  with the family, with a clear "shared by your care team" note.
- **Member photos** — the family adds a photo of their parent; it warms the home, the cards, the
  reports. Small touch, big emotional payoff.
- **"Family opened your plan" read-receipts** — clinicians see that the family actually saw the
  plan, closing the communication loop.
- **Remembered accessibility preference** — the larger-text/simpler view follows the person
  across devices, not just their login.
- **Per-cycle adherence sparklines for families** — the trend of how the month went, in the
  family's own view.

> "None of these need us to rethink anything — the foundation already supports them. They're a
> quarter of polish away."

### Tier 2 — The vision (the mind-blowing tier)

Deliver these as *"and because the data and the rails already exist, here's what becomes
possible"*. Pick 2–3 that match your clients' hot buttons; don't fire all of them.

- **AI-drafted clinical assessments (human-in-the-loop).** The clinician opens a form and the
  system has already **drafted** the assessment from the onboarding answers and the member's
  trends — the professional edits and signs. Cuts the busywork, keeps the human in charge.
  *(Frame carefully: decision-support, never auto-diagnosis. Clinicians always sign.)*
- **Wearables & home devices.** BP cuffs, glucometers, smart scales, step counters feed vitals
  and adherence **automatically** — the trends fill themselves in, and red flags can fire from
  real measurements, not just the questionnaire. For chronic care of the elderly this is the
  single biggest "wow."
- **WhatsApp-native family updates.** You already reach families on WhatsApp — imagine the
  system proactively messaging "Amma's new nutrition plan is ready" or a gentle medication
  nudge, in their language.
- **Voice & regional-language onboarding.** An elderly member answers in Malayalam or Hindi, by
  voice. Reach and dignity for people a typing form leaves behind.
- **Predictive care & renewals.** The coordinator sees which members are trending toward a health
  risk or a lapsed renewal *before* it happens, and acts early.
- **Medication adherence with photo confirmation** and automatic caregiver alerts on a missed
  dose.
- **Built-in telehealth** — the consultation happens *inside* PHLOEM, and its notes and report
  flow straight into the record.

> **Closing hook for the roadmap:** "Everything you saw today is the hard part — the secure,
> role-aware foundation. On top of that, adding intelligence and devices isn't a rebuild, it's
> an extension. That's what makes this worth investing in now."

---

## 6. Presenter tips — things to keep in mind

**Rehearse the switches.** The only real risk in this demo is fumbling between logins. Do one
full dry run tonight with all tabs pre-opened. Know which tab is which role before you touch it.

**Drive with intent, narrate the "why."** Don't just click — say what each screen *means for the
person using it*. The features are good; the *empathy behind them* is what sells.

**Slow down on the three signature moments.** (1) ⌘K jumping to a member, (2) elderly mode's
three big tiles, (3) the confidentiality/clearance wall in Act 4. Let each land. Pause. These are
your applause lines.

**Use the members by name.** "Meera," "her daughter Anita," "Rajan who's mid-setup." Named people
make a workflow feel like care, not software.

**Keep the vocabulary consistent** — it's **"member"** (the elderly person) and **"family"/
"caregiver,"** never "patient/client/user." The product is deliberately built this way; match it.

**Have the mobile view ready.** Every screen is responsive; if they ask "does it work on a
phone?", show a mobile screenshot from `design-audit/after/*--mobile.png` or resize the window.
Families live on phones — this matters.

**If something is slow,** it's the first-compile of a section (local dev only, not production).
Cover it with a sentence — "this is my laptop compiling on the fly; in production it's instant" —
and keep talking. This is why you pre-warm every section in setup.

**If something breaks live,** switch to the `design-audit/after/` screenshots without apology and
keep the narrative going. Never debug in front of clients.

**Don't overclaim the AI/future tier.** Present Tier 2 as *"what the foundation makes possible,"*
not *"what's built."* Healthcare clients respect honesty about what's real vs. roadmap — and the
built part is already impressive enough to earn that trust.

**Anticipate these questions:**
- *"Is it HIPAA/data-privacy compliant?"* → "The architecture is built privacy-first — data
  access is enforced at the database, contact details are isolated from clinicians, and every
  action is audited. Formal certification is a deployment step we scope with you."
- *"Can it scale / go live?"* → "Yes — it's a standard modern cloud stack (Next.js + a managed
  Postgres/Supabase backend). What you're seeing runs the real logic, not a prototype."
- *"What about languages / non-English families?"* → that's Tier 2 (voice & regional language);
  the accessibility foundation is already there.
- *"How long to add feature X?"* → tie it back to the roadmap tiers; Tier 1 items are "already
  scoped."

**End with a clear next step.** Don't let it trail off. Something like: "I'd love to set up a
follow-up where we walk through your specific care workflows and pick the first roadmap items to
build together." Give them a door to walk through.

---

## 7. Quick reference

### Logins (all `test12345!` except admin)

| Role | Email | Lands on |
|---|---|---|
| Coordinator | `coordinator@phloem.local` | `/coordinator` |
| Caregiver (family) | `caregiver@phloem.local` | `/portal` |
| Elderly member | `elder@phloem.local` | `/portal` (3-tile view) |
| Doctor | `doctor@phloem.local` | `/clinician/clients` |
| Nutritionist | `nutritionist@phloem.local` | `/clinician/clients` |
| Trainer | `trainer@phloem.local` | `/clinician/clients` |
| Psychologist | `psychologist@phloem.local` | `/clinician/clients` |
| Admin | `admin@phloem.local` | `/admin` (password = `SEED_ADMIN_PASSWORD` from `.env.local`) |
| Onboarding family | `gopalan.family@phloem.local` | `/portal` (mid-onboarding) |

### The demo members

| Member | Stage | Star use |
|---|---|---|
| Meera Krishnan | Active — full team, 7 reports, red flag | The whole journey |
| Rajan Pillai | Assigned — team on, not started | Coordinator next-action |
| K. V. Gopalan | Onboarding | The wizard, live |
| Padma Nair | Invited | The pipeline's first column |

### Screen map (append `http://localhost:3000`)

- Coordinator: `/coordinator` (Today) · `/coordinator/pipeline`
- Caregiver: `/portal` · `/portal/members/<id>/{plans,reports,schedule}`
- Doctor: `/clinician/clients` · `/clinician/clients/<id>?tab={overview,onboarding,form,reports}`
- Reports: `/reports/<id>` · PDF via the Download button on any report
- Admin: `/admin` · `/admin/members/<id>` · `/admin/audit`

### The one-run pre-flight

```bash
cd /Users/manojthomas/PHLOEM/phloem-dashboard
npm run seed     # optional: pristine demo data
npm run dev      # → http://localhost:3000, then pre-warm each section
```

---

*Backup screenshots of every screen (desktop + mobile) live in `design-audit/after/`.
UIUX-REVIEW.md has the full before/after audit if a stakeholder wants the deep version.*
