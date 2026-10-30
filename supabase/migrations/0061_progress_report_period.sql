-- PHLOEM migration 0061_progress_report_period.sql — the admin creates a progress
-- report for any period when a family asks for one.
--
-- WHY (owner request 2026-10-30). A family asks "how has my mother done so far?" or
-- "send me September's report". The progress summary (0026) is filed only when a
-- cycle closes, and only the assigned doctor could compile one on demand.
--
-- WHAT
--   record_progress_report(member, from, to, content) — admin only. Files a
--     progress_summary report: the same family-safe document (composed in
--     lib/reports/build/progress-summary.ts) narrowed to the period, read by the same
--     people (rep_* for the care team; the family because it is created shared, as
--     every progress summary is). The period is stamped into the content from the
--     arguments. Always a new report — two requests for the same dates are two
--     documents, each as the record stood that day. Notifies the family; audited.
--   record_progress_summary (restated from 0026): its "is there one already?" lookup
--     skips the admin's period reports, so the doctor's all-time compile (cycle null)
--     never hands back, or supersedes, a report covering someone's chosen dates.

create or replace function record_progress_report(
  p_member uuid, p_from date, p_to date, p_content jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_report uuid; v_cg uuid; v_name text;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  if p_from is null or p_to is null or p_from > p_to
     or p_to > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'bad_period';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'bad_content';
  end if;
  select full_name, caregiver_id into v_name, v_cg from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;

  insert into reports(member_id, cycle_id, type, content, share_with_caregiver, created_by)
  values (p_member, null, 'progress_summary',
          p_content || jsonb_build_object('period', jsonb_build_object('from', p_from, 'to', p_to)),
          true, auth.uid())
  returning id into v_report;

  if v_cg is not null then
    perform _notify(v_cg, 'progress_summary_ready',
                    'Your progress report is ready',
                    'How ' || v_name || '''s care has gone, '
                      || to_char(p_from, 'FMDD Mon YYYY') || ' – ' || to_char(p_to, 'FMDD Mon YYYY') || '.',
                    '/reports/' || v_report,
                    'progress:' || v_report);
  end if;

  perform _audit(auth.uid(), 'progress_report.created', 'report', v_report,
                 jsonb_build_object('member_id', p_member, 'from', p_from, 'to', p_to));
  return v_report;
end $$;
revoke execute on function record_progress_report(uuid, date, date, jsonb) from public, anon;
grant  execute on function record_progress_report(uuid, date, date, jsonb) to authenticated;

create or replace function record_progress_summary(
  p_member uuid, p_cycle uuid, p_content jsonb, p_force boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid; v_version int; v_report uuid; v_cg uuid; v_doctor uuid;
  v_name text; v_cycle_no int;
begin
  -- A real caller must be an active admin or the member's assigned doctor. A NULL
  -- auth.uid() is the service/cron path (same shape as close_cycle_open_next).
  if auth.uid() is not null then
    if auth_role() is null then raise exception 'not_allowed'; end if;
    if not (auth_role() = 'admin' or (auth_role() = 'doctor' and is_assigned_to(p_member))) then
      raise exception 'not_allowed';
    end if;
  end if;

  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'bad_content';
  end if;
  if not exists (select 1 from members where id = p_member) then raise exception 'not_found'; end if;

  -- 0061: an admin's report for chosen dates is not this cycle's summary.
  select id, version into v_existing, v_version from reports
   where member_id = p_member and type = 'progress_summary'
     and cycle_id is not distinct from p_cycle
     and not (content ? 'period')
   order by version desc limit 1;

  if v_existing is not null and not coalesce(p_force, false) then
    return v_existing;
  end if;

  insert into reports(member_id, cycle_id, type, content, version, supersedes,
                      share_with_caregiver, created_by)
  values (p_member, p_cycle, 'progress_summary', p_content,
          coalesce(v_version, 0) + 1, v_existing, true, auth.uid())
  returning id into v_report;

  select full_name into v_name from members where id = p_member;
  select number into v_cycle_no from cycles where id = p_cycle;

  -- The family is the audience: tell them in plain words, and link them straight
  -- to the document.
  select caregiver_id into v_cg from members where id = p_member;
  if v_cg is not null then
    perform _notify(v_cg, 'progress_summary_ready',
                    'This month''s progress summary is ready',
                    'A plain-language summary of how ' || v_name || '''s care is going'
                      || coalesce(' (cycle ' || v_cycle_no || ')', '') || '.',
                    '/reports/' || v_report,
                    'progress:' || v_report);
  end if;

  select care_user_id into v_doctor from assignments
   where member_id = p_member and care_role = 'doctor' and active;
  if v_doctor is not null then
    perform _notify(v_doctor, 'progress_summary_ready',
                    'Progress summary compiled — ' || v_name,
                    'Measures, timeline and open cases'
                      || coalesce(' for cycle ' || v_cycle_no, '') || '.',
                    '/reports/' || v_report,
                    'progressdoc:' || v_report);
  end if;

  perform _audit(auth.uid(), 'progress_summary.recorded', 'report', v_report,
                 jsonb_build_object('member_id', p_member, 'cycle_id', p_cycle,
                                    'version', coalesce(v_version, 0) + 1,
                                    'superseded', v_existing));
  return v_report;
end $$;
revoke execute on function record_progress_summary(uuid, uuid, jsonb, boolean) from public;
grant execute on function record_progress_summary(uuid, uuid, jsonb, boolean) to authenticated;
