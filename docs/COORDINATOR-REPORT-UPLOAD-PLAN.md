# Coordinator report upload — plan

**Date:** 2026-10-09 · **Status:** ✅ built 2026-10-11 (migrations 0054–0056) with the owner's changes: the coordinator CAN open and remove their own uploads (D3); the nutritionist uploads too; diet reviews are one upload per review meeting, two a month — see `PROGRESS.md`

## 1 · What the coordinator gets

A clinician sends their report to the coordinator (usually on WhatsApp) instead of filing it in the
dashboard. Today the coordinator can only press **Close report manually → "Received outside the
dashboard"**, which stops the chasing but leaves no report: the doctor, the trainer and the family
never see it in PHLOEM.

With this feature, on the member's page the coordinator presses **Upload a report** and:

1. **Chooses which report it is** from a list built from that member's own consultations, for example:
   - *Nutritionist — first consultation (nutrition plan) · met 12 Sep · waiting*
   - *Nutritionist — month 2 review · met 10 Oct · waiting*
   - *Trainer — first consultation (training plan) · met 14 Sep · closed as received outside*
2. **Picks the file** (PDF, JPG or PNG, up to 15 MB) and sees its name, size and a preview of
   the image before sending.
3. **Adds an optional note** ("Sent by Sona on WhatsApp, 20 Sep").
4. Reads one sentence saying **who will see it**, e.g. *"Leela's family, doctor and trainer will be
   able to open this nutrition plan."* Then they press **Upload report**.

From then on it is that clinician's report, in every place a report appears:
- the clinician's Reports tab
- the family portal (for plans and reviews the family is allowed to see)
- the admin member page

It is tagged *"Uploaded file"*, and opening it shows the original document. The report stops being
chased, the clinician's empty form goes away, and the clinician gets a note: *"The coordinator
uploaded your nutrition plan."*

## 2 · What the analysis found

- **The need is real and current.** On the live database, 11 consultations have the meeting marked
  done but no report:
  - nutritionist first consultation ×4
  - nutritionist monthly review ×3
  - trainer first consultation ×2
  - doctor review ×2

  No training plan has ever been filed in the dashboard. The "close manually" button (0048) has
  never been used.
- **Every report already belongs to a consultation.** A report's type is fixed by which consultation
  it comes from: first consultation or a month-N review, crossed with the role. `submit_clinical_form`
  maps them like this:

  | Role | First consultation | Monthly review |
  |---|---|---|
  | Nutritionist | `nutrition_plan` | `nutrition_review` |
  | Trainer | `training_plan` | `training_review` |
  | Psychologist | `wellbeing` | `wellbeing` |
  | Doctor | `doctor_initial` | `doctor_review` |

  So "which report is this" is best answered by choosing the consultation, not a free-standing type.
  That rules out mismatches, such as a "month 2 review" for someone with no month 2.
- **There are no weekly reports.** Reviews are monthly, one per 30-day cycle. The "second
  consultation report" the coordinator means is the month-2 review.
- **Who may read each report type is already enforced by the database** (`rep_*` policies, §3
  matrix). A file stored as a real `reports` row of the right type is shown to exactly the right
  people with no new read rules.
- **The PDF route already serves a stored file.** `/api/reports/[id]/pdf` signs `pdf_path` after the
  same database read check. It has one trap: if the stored file is missing, it *regenerates* a PDF
  from `content` and writes it over the path. For an uploaded report that would replace the
  document with an empty page, so uploaded reports must never regenerate.
- **Marking the report "submitted" is safe everywhere.** Every reader treats `submitted` as "the
  report is in": coordinator queue, overdue alerts, clinician form, `_role_started`, monthly
  `_role_in_cycle`, admin counts. Nothing assumes a submitted report has form answers behind it.
  The monthly performance report reads the day-27 feedback forms, not these reports.
- **Doctor reports are different.**
  - The doctor's report carries the **exercise clearance** that unlocks the trainer's plan
    (`awaiting_doctor_clearance` gate, `lib/clearance.ts`).
  - The doctor's first report **starts the program** (0046).
  - It **seeds the member's case list** from the doctor's structured answers.

  A scanned file has none of that structure.
- **The coordinator cannot read clinical reports** (matrix: "status only", and nothing at all for
  wellbeing). Upload must not change that.

## 3 · Approaches considered

| Approach | Verdict |
|---|---|
| **A. Store it as a family-style document** (`member_documents`) | Rejected. Documents are visible to the doctor only, not the trainer, nutritionist or family. The report would still be chased and wouldn't count as the plan. |
| **B. Coordinator types the report into the clinician's form** | Rejected. It puts words in the clinician's mouth, invites copying mistakes, is slow, and the coordinator could then read clinical forms they aren't allowed to. |
| **C. Attach the received file as that consultation's report** | **Chosen.** It's a real `reports` row of the right type with the file as its document. Visibility, lists, read receipts and audit all work as they do today. It clears the chase and counts as the plan exactly as "received outside" already does. |

## 4 · How it works

### 4.1 Which reports can be uploaded

A consultation slot is offered when its role is nutritionist, trainer or psychologist (doctor
excluded, see §8 D1), its meeting is not cancelled, and one of these holds:

- **Waiting:** meeting done, report `pending`. This is the main case.
- **Closed as received outside:** the coordinator closed it earlier and can now attach the file.
- **Already uploaded:** pressing it again **replaces** the file. The new report supersedes the old
  one, and lists already hide superseded reports.

Not offered:
- meetings not yet marked done (the "Mark meeting done" button sits on the same card)
- reports closed as "not needed"
- reports the clinician filed in the dashboard

Slots from every month are listed, not only the current one.

### 4.2 Safety rules (enforced in the database, not just the screen)

- Only admin and coordinator may upload.
- **The training plan keeps the doctor-clearance rule.** A trainer's first plan can't be uploaded
  until the doctor has cleared exercise, the same rule `submit_clinical_form` applies to trainers.
- The file must sit in that member's own upload folder, and no other report may already use it.
- File types: PDF, JPEG, PNG. Limit 15 MB, the same as family documents. HEIC is not accepted
  because Chrome can't display it. WhatsApp already sends photos as JPEG.

### 4.3 Who sees an uploaded report

These are the existing per-type rules, unchanged:

| Uploaded report | Doctor | Nutritionist | Trainer | Psychologist | Family | Coordinator | Admin |
|---|---|---|---|---|---|---|---|
| Nutrition plan / review | ✓ | ✓ | ✓ | – | ✓ | status only | ✓ |
| Training plan / review | ✓ | – | ✓ | – | ✓ | status only | ✓ |
| Wellbeing | – | – | – | ✓ | – | status only | ✓ |

The coordinator sees the status on the consultation card, for example *"Uploaded by Anu · 9 Oct ·
nutrition-plan.pdf"*. They cannot open the file afterwards; see §8 D3.

### 4.4 Mistakes

- **Wrong file, right member and report:** the coordinator uploads again and it replaces the file.
- **Wrong member:** this is a privacy incident, because that family may see someone else's plan.
  - **Before upload:** the confirmation step names the member, the report and who will see it.
  - **After upload:** admin gets **Remove upload**. It deletes the report and its file and puts the
    consultation back to "waiting". Coordinators can't remove an upload, to keep a deliberate
    second pair of eyes on deletion.

### 4.5 Notifications

- The clinician whose report it is gets *"The coordinator uploaded your {report}."* Their form
  disappears, and this tells them why, as `close_report` already does.
- Nobody else is notified. A clinician filing in the dashboard notifies no one either, so this
  stays consistent.

## 5 · Database — migration `0054_upload_report.sql`

The next free number is 0054: hosted runs to 0053, and main's numbering skips the
record-correction branch's numbers.

- `reports.consultation_id uuid references consultations(id)`: nullable, set for uploads. It links
  a report to its slot for replacement and removal.
- `consultations.report_uploaded_by uuid references profiles(id)`,
  `report_uploaded_at timestamptz`, `report_file_name text`: the coordinator-visible status. These
  mirror the `report_closed_*` columns, because the coordinator can read consultations but not
  reports.
- `upload_report(p_cons uuid, p_path text, p_file_name text, p_mime text, p_size int, p_note text)`
  returns uuid. It is security definer and checks, in order:
  - the caller is admin or coordinator (fail closed, as in 0017)
  - the slot is eligible per §4.1
  - the role isn't doctor
  - for a trainer's first plan, the doctor has cleared exercise
  - the path is `{member_id}/uploads/…`, exists in `storage.objects` (bucket `reports`), and no
    report uses it yet
  - the type and size are allowed

  It then does the following:
  - inserts the `reports` row, with `content` set to a stub: `title`, `cycle`, one "About this
    report" section, and `upload: {file_name, mime, size, note}`. It also sets `pdf_path` and
    `consultation_id`, and `supersedes` when replacing.
  - sets `report_status = 'submitted'` and the `report_uploaded_*` columns
  - moves the member from `assigned` to `initial_consults`, as a filed first report does
  - notifies the clinician and writes an audit entry (`report.uploaded`)
- `remove_uploaded_report(p_cons uuid)`, admin only. It deletes the uploaded report row and puts
  the slot back to `pending`. The app removes the file afterwards.
- No new storage policies. The browser uploads through a **signed upload URL** that a server
  action issues only after checking the role and the slot. This avoids Vercel's 4.5 MB request
  limit and keeps the `reports` bucket closed to everyone except the server.
- Per the 0033 convention, execute is revoked from public and anon and granted to authenticated.

## 6 · App changes

| Where | Change |
|---|---|
| `app/(app)/coordinator/members/[id]/` | **Upload a report** button on the Consultations card, plus one on each waiting slot that preselects it. A new `UploadReportSheet` client component (shared `Sheet`) holds the slot picker, file input with preview, note, the "who will see it" line and the upload. The card shows the uploaded status line. |
| `…/actions.ts` | `startReportUpload` checks the role and slot, then returns a signed upload URL and path. `finishReportUpload` calls `upload_report`, and if it fails, deletes the orphan file. |
| `app/api/reports/[id]/pdf/route.ts` | For uploaded reports, sign the stored file with its own extension and type. Never regenerate it; a missing file returns 404. |
| `components/reports/ReportView` and the report page | An uploaded report shows its header, the note and **Open the report**, which opens the in-app viewer (reusing `document-viewer`'s PDF and image handling). |
| Family Plans page (`portal/members/[id]/plans`) | It renders plans inline; an uploaded plan shows **Open the plan** instead of empty sections. |
| Report lists (clinician, portal, admin) | An *"Uploaded file"* tag beside the title. |
| Admin member page | **Remove upload** on uploaded reports. |
| `lib/supabase/database.types.ts` | Hand-add the new columns and RPCs, as main's convention is. |

## 7 · Verification

The hosted database serves real families, so every check either runs inside a rolled-back
transaction or uses a throwaway test member that is deleted afterwards.

- **§16 access cases** (added to `supabase/tests/rls.test.sql`):
  - Coordinator still reads 0 reports.
  - Family sees an uploaded nutrition plan but never a wellbeing report.
  - Nutritionist sees the nutrition plan but not the training plan.
  - Psychologist sees only wellbeing.
- **`upload_report` refusals:**
  - wrong roles
  - doctor slots
  - cancelled meetings and "not needed" slots
  - another member's path
  - a reused path
  - a training plan before clearance
  - a bad type or an oversized file

  Replacing an upload supersedes the old report.
- **End to end in the browser** with the throwaway member:
  - upload a PDF and a JPEG
  - check what the trainer, nutritionist, family and admin each see
  - check the chase clears and the clinician is notified
  - replace the file, then remove it as admin
- `tsc`, `eslint`, `npm run build` and `npm run test:unit` must pass.
- Record the results in `PROGRESS.md`.

## 8 · Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| D1 | Include **doctor** reports? | **No, not in this version.** The doctor's report carries the exercise clearance, starts the program and builds the case list from the doctor's answers, and a scan can't do any of that. Doctors already file in the dashboard (22 of 24). |
| D2 | **"Weekly review report"**: what is it? | The dashboard has only monthly reviews. If trainers send weekly updates, tell me what they contain; they would be a separate feature. The default is that they aren't in this version. |
| D3 | May the coordinator **open the file after uploading**? | **No.** The permission table gives coordinators status only, and wellbeing reports are psychologist and admin only. They see the file name, date and who uploaded it. |
| D4 | **One file per report**, or several photos? | **One file** (PDF or one image) to start. If plans often arrive as several photos, support for multiple files can be added later. |
| D5 | Should the **family** see uploaded nutrition and training plans in the portal? | **Yes.** The permission table already gives families these report types, and they're the people who follow the plan. |

**Effort:** about 1½ days, covering the migration and access tests, the upload flow, the viewers and
end-to-end checks.
