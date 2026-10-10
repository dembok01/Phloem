-- PHLOEM migration 0055_report_uploads_v2.sql — uploads by the nutritionist too, and
-- diet reviews every two weeks. Supersedes 0054's functions (no app ever called them).
--
-- WHY (coordinator request 2026-10-10). Diet reviews can only be typed into the
-- review form. The dietitian wants to upload the PDF instead, the coordinator wants
-- to upload it when the dietitian has no time, and diet review meetings are held
-- every two weeks — two reviews a month against one review consultation per cycle.
--
-- WHAT
--   * Who uploads: admin and coordinator, for any nutritionist / trainer /
--     psychologist report (as 0054); now also the ASSIGNED NUTRITIONIST, for their
--     own nutrition reports. Doctor reports still cannot be uploaded (they carry
--     the exercise clearance and start the program).
--   * upload_report(cons, …) — a first-consultation report, or a trainer /
--     psychologist cycle review: the file fulfils that consultation and uploading
--     again replaces it (0054's rule, now ordered by version — the 0054 order by
--     created_at was undefined between uploads in one transaction).
--   * upload_diet_review(member, cycle, review_date, …) — a nutrition review for a
--     cycle. Additive: each upload is one review meeting, so two a month is just
--     two uploads. If the cycle's nutritionist review consultation is still waiting,
--     the first upload fulfils it (the chase stops); the meeting record is untouched.
--   * remove_uploaded_report(report) — admin, or whoever uploaded it. A replaced
--     upload goes together with the versions it replaced. If nothing is left behind
--     for its consultation, that consultation returns to how it was before.
--   * list_diet_reviews(member) — dates and sources of every nutrition review, for
--     the coordinator, who may know a review is in without reading it (§3 "status
--     only"), and for the assigned nutritionist.
--   * rep_coord_upload now keys on content.upload (a diet review may have no
--     consultation), still only the coordinator's own uploads.

drop function if exists upload_report(uuid, text, text, text, bigint, text);
drop function if exists remove_uploaded_report(uuid);
drop policy if exists rep_coord_upload on reports;
create policy rep_coord_upload on reports for select
  using (auth_role() = 'coordinator' and created_by = auth.uid() and content ? 'upload');

-- ============ shared checks (internal) ============
-- May the caller upload a report of p_role's for this member?
create or replace function _may_upload_for(p_member uuid, p_role care_role) returns boolean
language sql stable security definer set search_path = public as $$
  select p_role <> 'doctor'
     and (auth_role() in ('admin','coordinator')
          or (auth_role() = 'nutritionist' and p_role = 'nutritionist' and is_assigned_to(p_member)))
$$;

-- The file: a type we can show, a sane size, in this member's own upload folder,
-- actually uploaded, and not already some other report.
create or replace function _check_upload_file(p_member uuid, p_path text, p_mime text, p_size bigint)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_mime is null or p_mime not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'bad_file_type';
  end if;
  if p_size is null or p_size <= 0 or p_size > 15728640 then raise exception 'file_too_large'; end if;
  if p_path is null
     or p_path !~ ('^' || p_member::text || '/uploads/[0-9a-f-]{36}\.(pdf|jpg|png)$') then
    raise exception 'bad_file_path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'reports' and name = p_path) then
    raise exception 'file_missing';
  end if;
  if exists (select 1 from reports where pdf_path = p_path) then raise exception 'file_in_use'; end if;
end $$;

-- ============ upload_report: a consultation's report ============
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
  if auth_role() is null then raise exception 'not_allowed'; end if;
  select * into v_cons from consultations where id = p_cons for update;
  if not found then raise exception 'not_found'; end if;
  if v_cons.type = 'doctor' then raise exception 'doctor_upload_refused'; end if;
  if not _may_upload_for(v_cons.member_id, v_cons.type) then raise exception 'not_allowed'; end if;
  if v_cons.meeting_status <> 'done' then raise exception 'meeting_not_done'; end if;

  -- The newest upload for this consultation. Only uploads carry consultation_id, so a
  -- report filed through the form can never be replaced here. A nutritionist's cycle
  -- review goes through upload_diet_review, which adds rather than replaces.
  select * into v_prev from reports where consultation_id = p_cons
   order by version desc limit 1;
  if (v_cons.type = 'nutritionist' and v_cons.cycle_id is not null)
     or not (   (v_cons.report_status = 'pending' and v_prev.id is null)
             or (v_cons.report_status = 'closed' and v_cons.report_closed_reason = 'received_outside')
             or (v_cons.report_status = 'submitted' and v_prev.id is not null)) then
    raise exception 'report_not_uploadable';
  end if;
  perform _check_upload_file(v_cons.member_id, p_path, p_mime, p_size);

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
    when 'nutritionist' then 'nutrition_plan'::report_type
    when 'trainer'      then case when v_cons.cycle_id is null then 'training_plan'::report_type else 'training_review'::report_type end
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
                  'Received as', case when auth_role() = 'nutritionist'
                                      then 'A file the nutritionist uploaded'
                                      else 'A file the ' || v_cons.type::text || ' sent to the care coordinator' end,
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

  -- Someone else filed it: tell the clinician why their form has gone.
  if v_prev.id is null then
    select care_user_id into v_pro from assignments
     where member_id = v_cons.member_id and care_role = v_cons.type and active;
    if v_pro is not null and v_pro <> auth.uid() then
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

-- ============ upload_diet_review: one review meeting's PDF ============
create or replace function upload_diet_review(
  p_member uuid, p_cycle uuid, p_review_date date,
  p_path text, p_file_name text, p_mime text, p_size bigint, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cyc cycles%rowtype; v_cons consultations%rowtype;
  v_name text; v_note text; v_file text; v_report uuid; v_pro uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth_role() is null or not _may_upload_for(p_member, 'nutritionist') then
    raise exception 'not_allowed';
  end if;
  select c.* into v_cyc from cycles c join packages p on p.id = c.package_id
   where c.id = p_cycle and p.member_id = p_member;
  if not found or v_cyc.status = 'upcoming' then raise exception 'not_found'; end if;
  -- A meeting that happened, during (or within a week of) that cycle.
  if p_review_date is null or p_review_date > v_today
     or p_review_date < v_cyc.start_date - 7 or p_review_date > v_cyc.end_date + 7 then
    raise exception 'bad_review_date';
  end if;
  perform _check_upload_file(p_member, p_path, p_mime, p_size);

  -- The cycle's nutritionist review consultation, if 0053 has opened one.
  select * into v_cons from consultations
   where member_id = p_member and cycle_id = p_cycle and type = 'nutritionist'
     and meeting_status <> 'cancelled'
   order by created_at limit 1 for update;

  select full_name into v_name from members where id = p_member;
  v_note := nullif(left(trim(coalesce(p_note, '')), 200), '');
  v_file := left(coalesce(nullif(trim(p_file_name), ''), 'diet review'), 200);

  insert into reports(member_id, cycle_id, type, content, pdf_path, created_by, consultation_id)
  values (p_member, p_cycle, 'nutrition_review',
          _report_stub('Nutrition Review — ' || v_name, v_cyc.number,
            jsonb_build_object(
              'sections', jsonb_build_array(jsonb_build_object(
                'heading', 'About this review', 'kind', 'kv',
                'data', jsonb_strip_nulls(jsonb_build_object(
                  'Review meeting', to_char(p_review_date, 'DD Mon YYYY'),
                  'Received as', case when auth_role() = 'nutritionist'
                                      then 'A file the nutritionist uploaded'
                                      else 'A file the nutritionist sent to the care coordinator' end,
                  'File', v_file,
                  'Note', v_note)))),
              'upload', jsonb_strip_nulls(jsonb_build_object(
                'file_name', v_file, 'mime', p_mime, 'size', p_size, 'note', v_note,
                'review_date', p_review_date)))),
          p_path, auth.uid(), v_cons.id)
  returning id into v_report;

  -- The first review in a cycle whose review report is still being chased fulfils it.
  if v_cons.id is not null and v_cons.report_status = 'pending' then
    update consultations
       set report_status      = 'submitted',
           report_uploaded_by = auth.uid(),
           report_uploaded_at = now(),
           report_file_name   = v_file
     where id = v_cons.id;
  end if;

  select care_user_id into v_pro from assignments
   where member_id = p_member and care_role = 'nutritionist' and active;
  if v_pro is not null and v_pro <> auth.uid() then
    perform _notify(v_pro, 'report_uploaded', 'Diet review uploaded by the coordinator',
      'The coordinator added the diet review of ' || to_char(p_review_date, 'DD Mon') || ' for ' || v_name || '.',
      '/clinician/clients/' || p_member, 'repupload:' || v_report);
  end if;

  perform _audit(auth.uid(), 'report.uploaded', 'report', v_report,
                 jsonb_build_object('cycle_id', p_cycle, 'type', 'nutrition_review',
                                    'review_date', p_review_date, 'consultation_id', v_cons.id,
                                    'mime', p_mime, 'size', p_size));
  return v_report;
end $$;

-- ============ remove_uploaded_report ============
create or replace function remove_uploaded_report(p_report uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_rep reports%rowtype; v_left reports%rowtype; v_cons consultations%rowtype;
  v_ids uuid[]; v_paths text[]; v_pro uuid; v_name text;
begin
  if auth_role() is null or auth_role() not in ('admin','coordinator','nutritionist') then
    raise exception 'not_allowed';
  end if;
  select * into v_rep from reports where id = p_report for update;
  if not found or not (v_rep.content ? 'upload') then raise exception 'no_upload'; end if;
  if auth_role() <> 'admin' and v_rep.created_by is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  -- Removing an older version would leave the newer one pointing at nothing.
  if exists (select 1 from reports where supersedes = p_report) then
    raise exception 'not_latest_version';
  end if;

  -- This upload and every version it replaced.
  with recursive chain as (
    select id, supersedes, pdf_path from reports where id = p_report
    union all
    select r.id, r.supersedes, r.pdf_path from reports r join chain c on r.id = c.supersedes
     where r.content ? 'upload')
  select array_agg(id), array_agg(pdf_path) into v_ids, v_paths from chain;
  delete from reports where id = any(v_ids);

  if v_rep.consultation_id is not null then
    select * into v_left from reports where consultation_id = v_rep.consultation_id
     order by created_at desc limit 1;
    if v_left.id is not null then
      -- Another upload still answers this consultation (a second diet review).
      update consultations
         set report_uploaded_by = v_left.created_by,
             report_uploaded_at = v_left.created_at,
             report_file_name   = v_left.content->'upload'->>'file_name'
       where id = v_rep.consultation_id and report_uploaded_by is not null;
    else
      update consultations
         set report_status = case
               when report_status <> 'submitted' or report_uploaded_by is null then report_status
               when report_closed_reason = 'received_outside' then 'closed'::submit_status
               else 'pending'::submit_status end,
             report_uploaded_by = null, report_uploaded_at = null, report_file_name = null
       where id = v_rep.consultation_id
      returning * into v_cons;
      -- Back to waiting: the clinician's form is open again.
      if v_cons.report_status = 'pending' then
        select care_user_id into v_pro from assignments
         where member_id = v_cons.member_id and care_role = v_cons.type and active;
        select full_name into v_name from members where id = v_cons.member_id;
        if v_pro is not null and v_pro <> auth.uid() then
          perform _notify(v_pro, 'report_upload_removed', 'Uploaded report removed',
            'The report uploaded for ' || v_name || ' was removed. Its form is open again.',
            '/clinician/clients/' || v_cons.member_id, 'repremoved:' || p_report);
        end if;
      end if;
    end if;
  end if;

  perform _audit(auth.uid(), 'report.upload_removed', 'report', p_report,
                 jsonb_build_object('type', v_rep.type, 'consultation_id', v_rep.consultation_id,
                                    'versions', coalesce(array_length(v_ids, 1), 0)));
  return v_paths;
end $$;

-- ============ list_diet_reviews: when each review happened, not what it says ============
create or replace function list_diet_reviews(p_member uuid)
returns table(report_id uuid, cycle_id uuid, review_date date, source text,
              uploaded_by uuid, uploader_name text, file_name text)
language sql stable security definer set search_path = public as $$
  select r.id, r.cycle_id,
         coalesce((r.content->'upload'->>'review_date')::date,
                  (r.created_at at time zone 'Asia/Kolkata')::date),
         case when r.content ? 'upload' then 'file' else 'form' end,
         r.created_by, p.full_name, r.content->'upload'->>'file_name'
    from reports r left join profiles p on p.id = r.created_by
   where r.member_id = p_member and r.type = 'nutrition_review'
     and not exists (select 1 from reports n where n.supersedes = r.id)
     and (auth_role() in ('admin','coordinator')
          or (auth_role() = 'nutritionist' and is_assigned_to(p_member)))
   order by 3, r.created_at
$$;

-- 0033 / 0050 discipline: nothing inherits PUBLIC; the helpers are internal.
revoke execute on function _may_upload_for(uuid, care_role) from public, anon, authenticated;
revoke execute on function _check_upload_file(uuid, text, text, bigint) from public, anon, authenticated;
revoke execute on function upload_report(uuid, text, text, text, bigint, text) from public, anon;
grant  execute on function upload_report(uuid, text, text, text, bigint, text) to authenticated;
revoke execute on function upload_diet_review(uuid, uuid, date, text, text, text, bigint, text) from public, anon;
grant  execute on function upload_diet_review(uuid, uuid, date, text, text, text, bigint, text) to authenticated;
revoke execute on function remove_uploaded_report(uuid) from public, anon;
grant  execute on function remove_uploaded_report(uuid) to authenticated;
revoke execute on function list_diet_reviews(uuid) from public, anon;
grant  execute on function list_diet_reviews(uuid) to authenticated;
