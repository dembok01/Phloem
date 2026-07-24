-- PHLOEM migration 0011_member_photos.sql
-- DESIGN-PROPOSALS P-3 — optional member photo/avatar.
--
-- A caregiver may upload a photo of their parent; it heads the care-story home and
-- member cards. The Monogram stays the fallback whenever no photo is set.
-- Path convention in the bucket: "<member_id>/<filename>" — the first folder
-- segment identifies the member and every storage policy authorises against it.
-- The photo is NOT a contact identifier (member_contacts stays clinician-invisible);
-- the assigned care team may view it, mirroring their demographics access (§3).

alter table members add column if not exists photo_path text;

-- Private bucket (public=false ⇒ served only via short-lived signed URLs).
insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;

-- Writes: caregiver of the member in the path's first folder segment.
create policy member_photos_cg_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos'
              and is_caregiver_of(((storage.foldername(name))[1])::uuid));
create policy member_photos_cg_update on storage.objects for update to authenticated
  using (bucket_id = 'member-photos'
         and is_caregiver_of(((storage.foldername(name))[1])::uuid));
create policy member_photos_cg_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos'
         and is_caregiver_of(((storage.foldername(name))[1])::uuid));

-- Reads: admin, the member's caregiver, the assigned care team, and the elderly
-- member's own login.
create policy member_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'member-photos'
         and (auth_role() = 'admin'
              or is_caregiver_of(((storage.foldername(name))[1])::uuid)
              or is_assigned_to(((storage.foldername(name))[1])::uuid)
              or is_member_self(((storage.foldername(name))[1])::uuid)));

-- Caregivers have no UPDATE policy on `members` (writes go through RPCs), so the
-- pointer is set through an audited security-definer RPC. p_path NULL clears it.
create or replace function set_member_photo(p_member uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (auth_role() = 'admin' or is_caregiver_of(p_member)) then
    raise exception 'not_allowed';
  end if;
  update members set photo_path = p_path where id = p_member;
  if not found then raise exception 'not_found'; end if;
  perform _audit(auth.uid(), 'member.photo_set', 'member', p_member,
                 jsonb_build_object('path', p_path));
end $$;

revoke execute on function set_member_photo(uuid, text) from public, anon;
