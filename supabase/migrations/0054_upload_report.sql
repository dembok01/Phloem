-- PHLOEM migration 0054_upload_report.sql — the coordinator uploads a report that
-- a nutritionist, trainer or psychologist sent outside the dashboard.
--
-- WHY (owner request 2026-10-09). Clinicians often send their report to the
-- coordinator on WhatsApp. 0048 let the coordinator close such a report as
-- "received outside the dashboard", but the document itself never reached
-- PHLOEM: the doctor, the trainer and the family could not open it.
--
-- WHAT
--   * upload_report(cons, path, …): the file (already in the private `reports`
--     bucket under <member>/uploads/) becomes that consultation's report — a real
--     `reports` row of the type submit_clinical_form would have written, so the
--     existing rep_* policies decide who reads it. The consultation then counts as
--     submitted, exactly as a filed report does. Uploading again replaces the file
--     (the new row supersedes the old).
--   * Doctor reports are excluded: the doctor's report carries the exercise
--     clearance, starts the program and seeds the case list from structured
--     answers, none of which a scanned file has.
--   * A trainer's report keeps the doctor-clearance gate submit_clinical_form has.
--   * rep_coord_upload: a coordinator may read the reports THEY uploaded, to check
--     them — the one exception to "status only" (owner decision D3). Nothing else.
--   * remove_uploaded_report(cons): admin, or the coordinator who uploaded the
--     current version, takes the upload back; the consultation returns to the state
--     it had before (waiting, or closed as received outside). Returns the file paths
--     so the app can delete them (Storage objects cannot be deleted from SQL).

alter table reports
  add column if not exists consultation_id uuid references consultations(id) on delete cascade;
create index if not exists reports_consultation_idx on reports(consultation_id)
  where consultation_id is not null;

-- What the coordinator sees on the consultation card. They can read consultations
-- but (bar their own uploads) not reports.
alter table consultations
  add column if not exists report_uploaded_by uuid references profiles(id),
  add column if not exists report_uploaded_at timestamptz,
  add column if not exists report_file_name text;

create policy rep_coord_upload on reports for select
  using (auth_role() = 'coordinator' and created_by = auth.uid() and consultation_id is not null);

-- ============ upload_report ============
create or replace function upload_report(
  p_cons uuid, p_path text, p_file_name text, p_mime text, p_size bigint, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cons consultations%rowtype;
  v_prev reports%rowtype;
  v_rtype report_type;
  v_name text; v_cycle_no int; v_clearance text; v_note text; v_file text;
  v_report uuid; v_pro uuid;
begin
  if auth_role() is null or auth_role() not in ('admin','coordinator') then
    raise exception 'not_allowed';
  end if;

  select * into v_cons from consultations where id = p_cons for update;
  if not found then raise exception 'not_found'; end if;
  if v_cons.type = 'doctor' then raise exception 'doctor_upload_refused'; end if;
  if v_cons.meeting_status <> 'done' then raise exception 'meeting_not_done'; end if;

  -- The newest upload for this consultation, if any. Only uploads carry
  -- consultation_id, so a report the clinician filed can never be replaced here.
  select * into v_prev from reports where consultation_id = p_cons
   order by created_at desc limit 1;
  if not (   (v_cons.report_status = 'pending' and v_prev.id is null)
          or (v_cons.report_status = 'closed' and v_cons.report_closed_reason = 'received_outside')
          or (v_cons.report_status = 'submitted' and v_prev.id is not null)) then
    raise exception 'report_not_uploadable';
  end if;

  if p_mime is null or p_mime not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'bad_file_type';
  end if;
  if p_size is null or p_size <= 0 or p_size > 15728640 then raise exception 'file_too_large'; end if;
  if p_path is null
     or p_path !~ ('^' || v_cons.member_id::text || '/uploads/[0-9a-f-]{36}\.(pdf|jpg|png)$') then
    raise exception 'bad_file_path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'reports' and name = p_path) then
    raise exception 'file_missing';
  end if;
  if exists (select 1 from reports where pdf_path = p_path) then raise exception 'file_in_use'; end if;

  -- Same gate as submit_clinical_form: no training report before the doctor clears exercise.
  if v_cons.type = 'trainer' then
    select content->>'clearance' into v_clearance from reports
     where member_id = v_cons.member_id and type in ('doctor_initial','doctor_review')
       and coalesce(content->>'clearance', '') <> ''
     order by created_at desc limit 1;
    if v_clearance is null or v_clearance not in ('cleared','cleared_with_restrictions') then
      raise exception 'awaiting_doctor_clearance';
    end if;
  end if;

  v_rtype := case v_cons.type
    when 'nutritionist' then case when v_cons.cycle_id is null then 'nutrition_plan'::report_type else 'nutrition_review'::report_type end
    when 'trainer'      then case when v_cons.cycle_id is null then 'training_plan'::report_type  else 'training_review'::report_type end
    when 'psychologist' then 'wellbeing'::report_type end;

  select full_name into v_name from members where id = v_cons.member_id;
  select number into v_cycle_no from cycles where id = v_cons.cycle_id;
  v_note := nullif(left(trim(coalesce(p_note, '')), 200), '');
  v_file := left(coalesce(nullif(trim(p_file_name), ''), 'report'), 200);

  insert into reports(member_id, cycle_id, type, content, pdf_path, version, supersedes,
                      created_by, consultation_id)
  values (v_cons.member_id, v_cons.cycle_id, v_rtype,
          _report_stub(initcap(replace(v_rtype::text, '_', ' ')) || ' — ' || v_name, v_cycle_no,
            jsonb_build_object(
              'sections', jsonb_build_array(jsonb_build_object(
                'heading', 'About this report', 'kind', 'kv',
                'data', jsonb_strip_nulls(jsonb_build_object(
                  'Received as', 'A file the ' || v_cons.type::text || ' sent to the care coordinator',
                  'File', v_file,
                  'Note', v_note)))),
              'upload', jsonb_strip_nulls(jsonb_build_object(
                'file_name', v_file, 'mime', p_mime, 'size', p_size, 'note', v_note)))),
          p_path, coalesce(v_prev.version, 0) + 1, v_prev.id,
          auth.uid(), p_cons)
  returning id into v_report;

  update consultations
     set report_status      = 'submitted',
         report_uploaded_by = auth.uid(),
         report_uploaded_at = now(),
         report_file_name   = v_file
   where id = p_cons;
  if v_cons.cycle_id is null then
    update members set status = 'initial_consults'
     where id = v_cons.member_id and status = 'assigned';
  end if;

  -- The clinician's form for this consultation disappears; tell them why.
  if v_prev.id is null then
    select care_user_id into v_pro from assignments
     where member_id = v_cons.member_id and care_role = v_cons.type and active;
    if v_pro is not null then
      perform _notify(v_pro, 'report_uploaded', 'Report uploaded by the coordinator',
        'The coordinator uploaded the report you sent for ' || v_name || ', so its form is closed.',
        '/clinician/clients/' || v_cons.member_id, 'repupload:' || v_report);
    end if;
  end if;

  perform _audit(auth.uid(), 'report.uploaded', 'report', v_report,
                 jsonb_build_object('consultation_id', p_cons, 'type', v_rtype,
                                    'replaces', v_prev.id, 'mime', p_mime, 'size', p_size));
  return v_report;
end $$;

-- ============ remove_uploaded_report ============
create or replace function remove_uploaded_report(p_cons uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_cons consultations%rowtype; v_latest reports%rowtype; v_paths text[]; v_pro uuid; v_name text;
begin
  if auth_role() is null or auth_role() not in ('admin','coordinator') then
    raise exception 'not_allowed';
  end if;
  select * into v_cons from consultations where id = p_cons for update;
  if not found then raise exception 'not_found'; end if;

  select * into v_latest from reports where consultation_id = p_cons
   order by created_at desc limit 1;
  if v_latest.id is null then raise exception 'no_upload'; end if;
  -- A coordinator takes back only what they uploaded (checked on the report, which
  -- they cannot write, not on the consultation, which they can).
  if auth_role() = 'coordinator' and v_latest.created_by is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;

  select array_agg(pdf_path) into v_paths from reports where consultation_id = p_cons;
  delete from reports where consultation_id = p_cons;  -- every version; one statement, so supersedes is satisfied

  update consultations
     set report_status      = case when report_closed_reason = 'received_outside'
                                   then 'closed'::submit_status else 'pending'::submit_status end,
         report_uploaded_by = null,
         report_uploaded_at = null,
         report_file_name   = null
   where id = p_cons
  returning * into v_cons;

  -- Back to waiting: the clinician's form is open again.
  if v_cons.report_status = 'pending' then
    select care_user_id into v_pro from assignments
     where member_id = v_cons.member_id and care_role = v_cons.type and active;
    select full_name into v_name from members where id = v_cons.member_id;
    if v_pro is not null then
      perform _notify(v_pro, 'report_upload_removed', 'Uploaded report removed',
        'The coordinator removed the report uploaded for ' || v_name || '. Its form is open again.',
        '/clinician/clients/' || v_cons.member_id, 'repremoved:' || v_latest.id);
    end if;
  end if;

  perform _audit(auth.uid(), 'report.upload_removed', 'consultation', p_cons,
                 jsonb_build_object('report_id', v_latest.id, 'type', v_latest.type,
                                    'versions', coalesce(array_length(v_paths, 1), 0)));
  return v_paths;
end $$;

-- 0033 discipline: nothing inherits PUBLIC.
revoke execute on function upload_report(uuid, text, text, text, bigint, text) from public, anon;
grant  execute on function upload_report(uuid, text, text, text, bigint, text) to authenticated;
revoke execute on function remove_uploaded_report(uuid) from public, anon;
grant  execute on function remove_uploaded_report(uuid) to authenticated;
