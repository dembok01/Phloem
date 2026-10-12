-- PHLOEM migration 0058_coordinator_uploads_doctor_reports.sql — the coordinator may
-- upload EVERY report type, the doctor's included.
--
-- WHY (owner decision 2026-10-13, reversing 0054's D1). Doctors send reports outside
-- the dashboard too; the coordinator must be able to file them like any other.
--
-- WHAT a doctor's report does that a scan cannot, and how an upload keeps it working:
--   * Exercise clearance gates the trainer's plan (submit_clinical_form, 0054/0055
--     upload_report, lib/clearance.ts). The uploader states the clearance the report
--     gives — cleared / cleared_with_restrictions / on_hold — or leaves it unstated
--     (an initial report then leaves training locked; a review leaves it unchanged).
--     It is stored as content.clearance, exactly where the form puts it, with an
--     "Exercise Clearance" section the trainer's panel shows.
--   * The doctor's initial report starts the program (0046). An uploaded one does the
--     same, from the same date rule (the day after the consultation; a report filed
--     more than two weeks late starts tomorrow) — as close_report already does for an
--     intake received outside the dashboard (0048).
--   * Health matters seeded from the doctor's problem list (0024) cannot be read from
--     a file; the doctor adds them by hand on the Health matters tab.
-- Uploads stay admin/coordinator for doctor reports; a doctor does not upload their
-- own (not asked for). The nutritionist keeps uploading their own nutrition reports.

-- Callers' signature changes (+ p_clearance), so the old one goes; no deployed app
-- calls it (the branch that does is unreleased).
drop function if exists upload_report(uuid, text, text, text, bigint, text);

create or replace function _may_upload_for(p_member uuid, p_role care_role) returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('admin','coordinator')
      or (auth_role() = 'nutritionist' and p_role = 'nutritionist' and is_assigned_to(p_member))
$$;

create or replace function upload_report(
  p_cons uuid, p_path text, p_file_name text, p_mime text, p_size bigint,
  p_note text default null, p_clearance text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cons consultations%rowtype;
  v_prev reports%rowtype;
  v_rtype report_type;
  v_name text; v_cycle_no int; v_clearance text; v_note text; v_file text;
  v_report uuid; v_pro uuid; v_today date; v_consulted date;
  v_sections jsonb; v_extra jsonb;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  select * into v_cons from consultations where id = p_cons for update;
  if not found then raise exception 'not_found'; end if;
  if not _may_upload_for(v_cons.member_id, v_cons.type) then raise exception 'not_allowed'; end if;
  if v_cons.meeting_status <> 'done' then raise exception 'meeting_not_done'; end if;
  if p_clearance is not null and (v_cons.type <> 'doctor'
     or p_clearance not in ('cleared','cleared_with_restrictions','on_hold')) then
    raise exception 'bad_clearance';
  end if;

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
    when 'doctor'       then case when v_cons.cycle_id is null then 'doctor_initial'::report_type else 'doctor_review'::report_type end
    when 'nutritionist' then 'nutrition_plan'::report_type
    when 'trainer'      then case when v_cons.cycle_id is null then 'training_plan'::report_type else 'training_review'::report_type end
    when 'psychologist' then 'wellbeing'::report_type end;

  select full_name into v_name from members where id = v_cons.member_id;
  select number into v_cycle_no from cycles where id = v_cons.cycle_id;
  v_note := nullif(left(trim(coalesce(p_note, '')), 200), '');
  v_file := left(coalesce(nullif(trim(p_file_name), ''), 'report'), 200);

  v_sections := jsonb_build_array(jsonb_build_object(
    'heading', 'About this report', 'kind', 'kv',
    'data', jsonb_strip_nulls(jsonb_build_object(
      'Received as', case when auth_role() = 'nutritionist'
                          then 'A file the nutritionist uploaded'
                          else 'A file the ' || v_cons.type::text || ' sent to the care coordinator' end,
      'File', v_file,
      'Note', v_note))));
  v_extra := '{}'::jsonb;
  if p_clearance is not null then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Exercise Clearance', 'kind', 'kv',
      'data', jsonb_build_object(
        'Clearance', case p_clearance when 'cleared' then 'Cleared'
                                      when 'cleared_with_restrictions' then 'Cleared with restrictions'
                                      else 'On hold' end,
        'Details', 'Read the uploaded report — any limits the doctor set are in it.',
        'Recorded by', 'The care coordinator, from the doctor''s report')));
    v_extra := jsonb_build_object('clearance', p_clearance);
  end if;

  insert into reports(member_id, cycle_id, type, content, pdf_path, version, supersedes,
                      created_by, consultation_id)
  values (v_cons.member_id, v_cons.cycle_id, v_rtype,
          _report_stub(initcap(replace(v_rtype::text, '_', ' ')) || ' — ' || v_name, v_cycle_no,
            v_extra || jsonb_build_object(
              'sections', v_sections,
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

  -- The doctor's initial report starts the program (0046), uploaded or typed. Does
  -- nothing if the program is already running (a replaced upload, a later version).
  if v_cons.type = 'doctor' and v_cons.cycle_id is null then
    v_today := (now() at time zone 'Asia/Kolkata')::date;
    v_consulted := least(coalesce((v_cons.completed_at at time zone 'Asia/Kolkata')::date, v_today), v_today);
    if v_consulted < v_today - 14 then v_consulted := v_today; end if;
    perform _start_program(v_cons.member_id, v_consulted + 1, 'doctor_initial');
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
                                    'replaces', v_prev.id, 'mime', p_mime, 'size', p_size,
                                    'clearance', p_clearance));
  return v_report;
end $$;

-- 0033 / 0050 discipline.
revoke execute on function _may_upload_for(uuid, care_role) from public, anon, authenticated;
revoke execute on function upload_report(uuid, text, text, text, bigint, text, text) from public, anon;
grant  execute on function upload_report(uuid, text, text, text, bigint, text, text) to authenticated;
