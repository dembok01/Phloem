-- PHLOEM migration 0018_hot_path_indexes.sql — M-4 (CODE-REVIEW.md): the schema
-- had no secondary indexes; RLS helpers (is_assigned_to / is_caregiver_of) run
-- per-row EXISTS probes and the cron joins cycles→packages→members daily.
-- (Blueprint numbered this 0012; it lands as 0018 — see the plan's Divergences,
--  incl. the unplanned 0017 security migration.)

create index idx_assignments_care_user   on assignments (care_user_id) where active;
create index idx_assignments_member      on assignments (member_id) where active;
create index idx_members_caregiver       on members (caregiver_id);
create index idx_members_member_user     on members (member_user_id);
create index idx_consultations_member    on consultations (member_id);
create index idx_consultations_cycle     on consultations (cycle_id);
create index idx_reports_member_type     on reports (member_id, type);
create index idx_reports_cycle           on reports (cycle_id);
create index idx_cycles_package          on cycles (package_id);
create index idx_packages_member         on packages (member_id);
create index idx_form_responses_member   on form_responses (member_id, template_id);
create index idx_form_responses_cycle    on form_responses (cycle_id);
create index idx_form_responses_resp     on form_responses (respondent_id);
create index idx_notifications_user_unread on notifications (user_id, read_at);
create index idx_invites_token           on invites (token);

-- Advisory lock: overlapping cron invocations (Vercel retry, manual + scheduled)
-- serialize. run_daily_jobs is reproduced verbatim from 0006_cycle_jobs.sql, with
-- two edits: the advisory-lock line, and the service guard hardened to
-- `is distinct from 'admin'` so a suspended admin is denied (D-5) while the cron
-- path (auth.uid() IS NULL) still runs.
create or replace function run_daily_jobs(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; v_pro uuid; v_tmpl uuid; v_report uuid; v_role text;
  j1 int := 0; j2 int := 0; j3 int := 0; j4 int := 0; j5 int := 0; j6 int := 0;
begin
  if auth.uid() is not null and auth_role() is distinct from 'admin' then raise exception 'not_allowed'; end if;
  -- 0018: overlapping cron invocations (Vercel retry, manual + scheduled) serialize.
  perform pg_advisory_xact_lock(hashtext('phloem_run_daily_jobs'));

  -- JOB 1 — end_date − 7: coordinator "reviews due"
  for rec in
    select c.id as cycle_id, c.end_date, m.id as member_id, m.full_name
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and c.end_date = p_today + 7
  loop
    perform _notify_roles(array['coordinator']::user_role[], 'reviews_due', 'Reviews due',
      'Reviews due for ' || rec.full_name || ' on ' || to_char(rec.end_date, 'DD Mon') || '.',
      '/coordinator/members/' || rec.member_id, 'rev7:' || rec.cycle_id);
    j1 := j1 + 1;
  end loop;

  -- JOB 2 — end_date − 3: create draft feedback responses + notify nutritionist & trainer
  for rec in
    select c.id as cycle_id, m.id as member_id, m.full_name
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and c.end_date = p_today + 3
  loop
    for v_role in select unnest(array['nutritionist', 'trainer']) loop
      v_tmpl := (select id from form_templates
                  where key = case v_role when 'nutritionist' then 'feedback_nutrition' else 'feedback_training' end
                    and active order by version desc limit 1);
      v_pro := (select care_user_id from assignments
                 where member_id = rec.member_id and care_role = v_role::care_role and active);
      if v_pro is not null and v_tmpl is not null
         and not exists (select 1 from form_responses
                          where cycle_id = rec.cycle_id and template_id = v_tmpl) then
        insert into form_responses(member_id, template_id, cycle_id, respondent_id, answers)
        values (rec.member_id, v_tmpl, rec.cycle_id, v_pro, '{}'::jsonb);
        perform _notify(v_pro, 'feedback_due', 'Monthly feedback due',
          'Please complete this cycle''s feedback for ' || rec.full_name || '.',
          '/clinician/clients/' || rec.member_id || '?tab=feedback',
          'fbdraft:' || rec.cycle_id || ':' || v_role);
        j2 := j2 + 1;
      end if;
    end loop;
  end loop;

  -- JOB 3 — end_date − 1: re-nudge unsubmitted feedback owners + escalate to coordinator
  for rec in
    select fr.id as fr_id, fr.respondent_id, fr.cycle_id, t.key, m.id as member_id, m.full_name
      from form_responses fr
      join form_templates t on t.id = fr.template_id
      join cycles c on c.id = fr.cycle_id
      join packages p on p.id = c.package_id
      join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and c.end_date = p_today + 1
       and t.key in ('feedback_nutrition', 'feedback_training') and fr.submitted_at is null
  loop
    perform _notify(rec.respondent_id, 'feedback_nudge', 'Feedback due tomorrow',
      'Your monthly feedback for ' || rec.full_name || ' is due tomorrow.',
      '/clinician/clients/' || rec.member_id || '?tab=feedback', 'fbnudge:' || rec.fr_id);
    perform _notify_roles(array['coordinator']::user_role[], 'feedback_overdue_soon',
      'Feedback outstanding', rec.full_name || ': ' || replace(rec.key, 'feedback_', '') || ' feedback still pending.',
      '/coordinator/members/' || rec.member_id, 'fbnudgec:' || rec.fr_id);
    j3 := j3 + 1;
  end loop;

  -- JOB 4 — past end_date & still active: compile performance (soft-block if pending) then roll over.
  loop
    select c.id as cycle_id, c.end_date, m.id as member_id, m.full_name
      into rec
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and p_today > c.end_date
     order by c.end_date, c.number limit 1;
    exit when not found;
    -- Soft block: if a feedback is still unsubmitted, flag the coordinator; compile regardless.
    if exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                where fr.cycle_id = rec.cycle_id and fr.submitted_at is null
                  and t.key in ('feedback_nutrition', 'feedback_training'))
       or exists (select 1 from assignments a where a.member_id = rec.member_id and a.active
                    and a.care_role in ('nutritionist', 'trainer')
                    and not exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                                     where fr.cycle_id = rec.cycle_id
                                       and t.key = 'feedback_' || (case a.care_role when 'nutritionist' then 'nutrition' else 'training' end)))
    then
      perform _notify_roles(array['coordinator']::user_role[], 'feedback_overdue', 'Feedback overdue',
        rec.full_name || '''s cycle ended with feedback outstanding — performance report compiled with a pending note.',
        '/coordinator/members/' || rec.member_id, 'fbover:' || rec.cycle_id);
    end if;
    v_report := compile_performance_report(rec.cycle_id);
    perform close_cycle_open_next(rec.cycle_id);
    j4 := j4 + 1;
  end loop;

  -- JOB 5 — package end_date − 14: member → renewal_due; notify admin + coordinator
  for rec in
    select p.id as package_id, m.id as member_id, m.full_name, p.end_date
      from packages p join members m on m.id = p.member_id
     where p.status = 'active' and p.end_date = p_today + 14
  loop
    update members set status = 'renewal_due' where id = rec.member_id and status = 'active';
    perform _notify_roles(array['admin', 'coordinator']::user_role[], 'renewal_due', 'Renewal conversation',
      rec.full_name || '''s package renews on ' || to_char(rec.end_date, 'DD Mon') || ' — start the renewal conversation.',
      '/admin/members/' || rec.member_id, 'renew:' || rec.package_id);
    j5 := j5 + 1;
  end loop;

  -- JOB 6 — hygiene
  -- 6a: to_schedule > 48h after creation → coordinator
  for rec in
    select cn.id as cons_id, cn.member_id, cn.type, m.full_name
      from consultations cn join members m on m.id = cn.member_id
     where cn.meeting_status = 'to_schedule' and cn.created_at::date <= p_today - 2
       and m.status not in ('inactive')
  loop
    perform _notify_roles(array['coordinator']::user_role[], 'consult_unscheduled', 'Consultation needs scheduling',
      rec.full_name || '''s ' || rec.type || ' consultation is still unscheduled.',
      '/coordinator/members/' || rec.member_id, 'hygsched:' || rec.cons_id);
    j6 := j6 + 1;
  end loop;
  -- 6b: done but report pending > 72h → professional + coordinator
  for rec in
    select cn.id as cons_id, cn.member_id, cn.type, cn.completed_at, m.full_name
      from consultations cn join members m on m.id = cn.member_id
     where cn.meeting_status = 'done' and cn.report_status = 'pending'
       and cn.completed_at::date <= p_today - 3
  loop
    v_pro := (select care_user_id from assignments
               where member_id = rec.member_id and care_role = rec.type and active);
    if v_pro is not null then
      perform _notify(v_pro, 'report_overdue', 'Report overdue',
        'Your report for ' || rec.full_name || ' is overdue.',
        '/clinician/clients/' || rec.member_id, 'hygrep:' || rec.cons_id);
    end if;
    perform _notify_roles(array['coordinator']::user_role[], 'report_overdue', 'Report overdue',
      rec.full_name || '''s ' || rec.type || ' report is overdue.',
      '/coordinator/members/' || rec.member_id, 'hygrepc:' || rec.cons_id);
    j6 := j6 + 1;
  end loop;
  -- 6c: expired unused invites → admin
  for rec in
    select i.id as invite_id, i.email from invites i
     where i.used_at is null and i.expires_at < p_today
  loop
    perform _notify_roles(array['admin']::user_role[], 'invite_expired', 'Invite expired',
      'The invite for ' || rec.email || ' has expired unused.', '/admin/invites', 'hyginv:' || rec.invite_id);
    j6 := j6 + 1;
  end loop;

  return jsonb_build_object('today', p_today, 'reviews_due', j1, 'feedback_drafts', j2,
    'feedback_nudges', j3, 'cycles_rolled', j4, 'renewals', j5, 'hygiene', j6);
end $$;
