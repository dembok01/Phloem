-- PHLOEM migration 0014_member_documents.sql
-- Member lab reports & documents.
-- Spec: docs/superpowers/specs/2026-07-24-member-documents-design.md
--
-- Families upload the member's real medical documents (blood work, scans, prescriptions,
-- discharge summaries) at onboarding and on an ongoing basis. Mechanism mirrors
-- 0011_member_photos: a PRIVATE bucket, the browser uploads straight to
-- "<member_id>/<uuid>.<ext>", storage.objects RLS authorises by the first path segment,
-- and reads are short-lived signed URLs. This table holds the per-file metadata.
--
-- Visibility (user-confirmed):
--   UPLOAD = caregiver only.
--   VIEW   = admin · the member's caregiver · the member's own login · the ASSIGNED DOCTOR.
--   DELETE = caregiver (own member) · admin.
--   Nutritionist / trainer / psychologist / coordinator get NOTHING.

create type document_category as enum
  ('blood_work', 'imaging', 'prescription', 'discharge_summary', 'doctor_note', 'other');

create table member_documents (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  category     document_category not null default 'other',
  file_name    text not null,          -- original filename, for display
  storage_path text not null,          -- '<member_id>/<uuid>.<ext>' in the documents bucket
  mime_type    text not null,
  size_bytes   bigint not null,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index member_documents_member_created on member_documents(member_id, created_at desc);

grant select, insert, delete on member_documents to authenticated;

alter table member_documents enable row level security;

create policy doc_admin  on member_documents for all
  using (auth_role() = 'admin');
create policy doc_select on member_documents for select
  using (is_caregiver_of(member_id)
         or is_member_self(member_id)
         or (auth_role() = 'doctor' and is_assigned_to(member_id)));
create policy doc_insert on member_documents for insert
  with check (is_caregiver_of(member_id) and uploaded_by = auth.uid());
create policy doc_delete on member_documents for delete
  using (is_caregiver_of(member_id));
-- (admin delete is covered by doc_admin FOR ALL.)

-- Private bucket. 15 MB cap + allowed types enforced at the storage layer too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- storage.objects policies, keyed on the first folder segment = member_id.
create policy documents_cg_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and is_caregiver_of(((storage.foldername(name))[1])::uuid));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
         and (is_caregiver_of(((storage.foldername(name))[1])::uuid)
              or auth_role() = 'admin'));
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents'
         and (auth_role() = 'admin'
              or is_caregiver_of(((storage.foldername(name))[1])::uuid)
              or (auth_role() = 'doctor' and is_assigned_to(((storage.foldername(name))[1])::uuid))
              or is_member_self(((storage.foldername(name))[1])::uuid)));

-- Notify the member's assigned doctor when the family uploads, deduped per member per IST
-- day so a bulk upload raises ONE "New documents from the family" notification, not one per
-- file. Runs security-definer so it can read assignments past the caller's RLS.
create or replace function _notify_document_upload() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_doctor uuid;
begin
  select care_user_id into v_doctor
    from assignments
    where member_id = new.member_id and care_role = 'doctor' and active
    limit 1;
  if v_doctor is not null then
    perform _notify(
      v_doctor,
      'document.uploaded',
      'New documents from the family',
      'The family added documents to a member''s profile.',
      '/clinician/clients/' || new.member_id,
      'doc_upload:' || new.member_id || ':' || ((now() at time zone 'Asia/Kolkata')::date)
    );
  end if;
  return new;
end $$;

create trigger member_documents_notify
  after insert on member_documents
  for each row execute function _notify_document_upload();
