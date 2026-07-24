# Member lab reports & documents — design

## Context & goal
Families need to give their care team the elderly member's real medical documents —
latest blood work, scans, prescriptions, discharge summaries — at onboarding and then
on an ongoing basis (monthly blood work, or whenever the doctor asks). Today there is
nowhere to put these. This feature adds **caregiver document upload** with a persistent
home in the portal, and an **organised, categorised view for the doctor and admin**.

Design driver from the user: **keep it dead simple for the caregiver.** So we reuse the
exact, already-shipped mechanism from the member-photo feature (`0011_member_photos.sql`)
— the browser uploads straight to a private Storage bucket, gated by path-scoped
`storage.objects` RLS; reads are short-lived signed URLs. No bespoke upload route, no
server body-size limits, and bulk (multi-file) upload is trivial.

## Scope decisions (confirmed with user)
- **Who uploads:** caregiver only. (Doctor/admin view read-only.)
- **Who views:** admin · the member's caregiver · the member's own login · the **assigned doctor**.
  **Not** nutritionist / trainer / psychologist / coordinator (RLS grants them nothing).
- **Who deletes:** caregiver (their own member's docs) · admin.
- **Bulk:** multiple files per upload; one category chosen per batch.
- **No** doctor "request a document" workflow, virus scanning, or per-document sharing (future).

## Data model — `member_documents` (migration `0014_member_documents.sql`)
Enum `document_category`: `blood_work | imaging | prescription | discharge_summary | doctor_note | other`.
```
member_documents(
  id           uuid pk default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  category     document_category not null default 'other',
  file_name    text not null,          -- original name, for display
  storage_path text not null,          -- 'documents/<member_id>/<uuid>.<ext>'
  mime_type    text not null,
  size_bytes   bigint not null,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
)
create index member_documents_member_created on member_documents(member_id, created_at desc);
grant select, insert, delete on member_documents to authenticated;  -- RLS restricts; match 0001 grant style
```

## Storage + RLS — the security core (mirrors `0011_member_photos.sql`)
Private bucket, path convention `documents/<member_id>/<uuid>.<ext>` — first folder
segment = member_id, every policy authorises against it.
```
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents','documents', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/heic','image/heif'])
on conflict (id) do nothing;
```
**storage.objects policies** (bucket = 'documents', `mid := (storage.foldername(name))[1]::uuid`):
- insert → `is_caregiver_of(mid)`
- delete → `is_caregiver_of(mid) or auth_role()='admin'`
- select → `auth_role()='admin' or is_caregiver_of(mid) or (auth_role()='doctor' and is_assigned_to(mid)) or is_member_self(mid)`

**`member_documents` table policies** (same visibility, keyed on `member_id`):
- `doc_admin`  → `for all using (auth_role()='admin')`
- `doc_select` → `for select using (is_caregiver_of(member_id) or is_member_self(member_id) or (auth_role()='doctor' and is_assigned_to(member_id)))`
- `doc_insert` → `for insert with check (is_caregiver_of(member_id) and uploaded_by = auth.uid())`
- `doc_delete` → `for delete using (is_caregiver_of(member_id))`
- No UPDATE policy (metadata is set-once; category is chosen at upload).

**Doctor notification** — an `after insert` trigger notifies the member's active doctor
(`assignments` where `care_role='doctor' and active`) via `_notify`, deduped per member
per day (`dedupe_key = 'doc_upload:'||member_id||'::'||current_date`) so a bulk upload
raises **one** "New documents from the family" notification, not one per file.

## Upload / download / delete mechanics (client-direct, like member-photos)
Reusable client components in `components/documents/`:
- **`DocumentUploader`** (`memberId`, `onUploaded`): `<input type=file multiple>` + a category
  `<select>` (default Other). For each file: client-side validate (type + ≤15 MB) → upload
  to `documents/<memberId>/<crypto.randomUUID()>.<ext>` via `supabase.storage.from('documents').upload(...)`
  → insert the `member_documents` row (`uploaded_by = auth.uid()`). Shows per-file progress /
  errors; on failure, deletes any orphaned object.
- **`DocumentList`** (`documents`, `canDelete`): groups rows by category, sorts by date, each row
  = file name · "Wed, 24 Jul" · **Download** (client `createSignedUrl(path, 600, {download: file_name})`,
  gated by the storage read policy) · **Delete** (caregiver/admin: storage remove + row delete).

Server components fetch the RLS-scoped rows and pass them in; all storage I/O is client-side
via the user session (no service-role, no API route). Same trust model as the photo feature.

## UI surfaces
1. **End of onboarding** — on the wizard's completion screen: "Any recent reports? Add blood
   work, prescriptions or discharge summaries now — or anytime from your dashboard," with the
   uploader and a **Skip → portal**. (Onboarding form submit is untouched; docs are separate.)
2. **Caregiver portal** — a persistent **Documents** tab (`/portal/members/[id]/documents`):
   uploader + grouped list (name · date · download · delete). Add the tab to the portal member nav.
3. **Doctor client view** (`clinician/clients/[id]`) **& admin member page** (`admin/members/[id]`)
   — a **Documents** section: grouped by category, dated, file name + download (read-only;
   admin may delete).

## Categories / types / limits
Blood work · Imaging or scan · Prescription · Discharge summary · Doctor's note · Other ·
PDF / JPG / PNG / HEIC · **15 MB per file** (enforced at the bucket AND client).

## Verification
- Migration `0014` file in repo → applied via MCP `apply_migration`; regenerate TS types.
- RLS proof (MCP `execute_sql`, signed in as seeded users): caregiver can insert/select/delete
  own; assigned doctor can select but **not** insert/delete; nutritionist/trainer/psych/coordinator
  select → 0 rows; a non-caregiver cannot upload into another member's folder (storage insert denied);
  admin sees all. Add these cases to the §16 suite.
- E2E: caregiver bulk-uploads 2–3 files at onboarding end + from the Documents tab; doctor and
  admin see them grouped/dated; download works; delete works; doctor gets one notification.
- `tsc`, `eslint`, `npm run test:unit` green.

## Out of scope (future)
Doctor "request a document" + family prompt · virus scanning · nutritionist/trainer/psych
visibility · per-document re-categorisation/sharing · embedding docs into report PDFs.
