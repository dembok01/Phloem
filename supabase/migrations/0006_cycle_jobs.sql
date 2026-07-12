-- PHLOEM migration 0006_cycle_jobs.sql — §9 cycle-engine daily jobs + §8 compiled
-- performance report. The §6 lifecycle RPCs (activate/pause/resume/close/compile/
-- submit_feedback/duration/deactivate/reactivate) already shipped in 0003; this
-- migration adds the time-driven layer that drives them.
--
--   * consultations.created_at  — §9 job 6 ages `to_schedule` rows by creation time.
--   * _build_performance()      — §8 "compiled" performance content (SQL, because the
--                                 compiler runs server-side from both submit_feedback
--                                 and the cron soft-block; no human free-text section).
--   * compile_performance_report() — now idempotent (one performance report per cycle)
--                                 and stores real §8 content instead of a stub.
--   * run_daily_jobs(p_today)   — all six §9 jobs; offsets from cycle end_date; skips
--                                 paused packages; every notification carries a dedupe
--                                 key so reruns / time-travel replays are no-ops.

-- ============ consultations.created_at (§9 job 6 aging) ============
alter table consultations add column if not exists created_at timestamptz not null default now();

-- ============ §8 performance content builder (compiled, SQL) ============

-- "12 (Δ +2)" style delta vs the previous cycle's number; null-safe, non-numeric-safe.
create or replace function _num_delta(cur text, prev text) returns text
language sql immutable set search_path = public as $$
  select case
    when cur is null or cur = '' then null
    when cur !~ '^-?[0-9]+(\.[0-9]+)?$' then cur
    when prev is null or prev = '' or prev !~ '^-?[0-9]+(\.[0-9]+)?$' then cur
    else cur || ' (Δ ' || case when (cur::numeric - prev::numeric) >= 0 then '+' else '' end
             || trim(trailing '.' from trim(trailing '0' from (cur::numeric - prev::numeric)::text)) || ')'
  end
$$;

create or replace function _build_performance(p_cycle uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cyc cycles%rowtype; v_member uuid; v_name text;
  v_nut jsonb; v_trn jsonb; v_nut_sub boolean := false; v_trn_sub boolean := false;
  v_prev_cycle uuid; v_prev_trn jsonb := '{}'::jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_pending text[] := '{}'; v_flags text[] := '{}'; v_adj text[] := '{}';
  v_trend jsonb; v_sts text; v_bal text; v_kv jsonb;
begin
  select * into v_cyc from cycles where id = p_cycle;
  select member_id into v_member from packages where id = v_cyc.package_id;
  select full_name into v_name from members where id = v_member;

  select fr.answers, fr.submitted_at is not null into v_nut, v_nut_sub
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.cycle_id = p_cycle and fr.member_id = v_member and t.key = 'feedback_nutrition'
   order by fr.submitted_at desc nulls last, fr.created_at desc limit 1;
  select fr.answers, fr.submitted_at is not null into v_trn, v_trn_sub
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.cycle_id = p_cycle and fr.member_id = v_member and t.key = 'feedback_training'
   order by fr.submitted_at desc nulls last, fr.created_at desc limit 1;
  v_nut := coalesce(v_nut, '{}'::jsonb); v_trn := coalesce(v_trn, '{}'::jsonb);
  -- absent draft ⇒ treated as pending (a missing row means feedback never started)
  if not found then null; end if;
  if v_nut = '{}'::jsonb then v_nut_sub := false; end if;

  select id into v_prev_cycle from cycles
   where package_id = v_cyc.package_id and number = v_cyc.number - 1;
  if v_prev_cycle is not null then
    select fr.answers into v_prev_trn from form_responses fr join form_templates t on t.id = fr.template_id
     where fr.cycle_id = v_prev_cycle and fr.member_id = v_member and t.key = 'feedback_training'
     order by fr.submitted_at desc nulls last, fr.created_at desc limit 1;
    v_prev_trn := coalesce(v_prev_trn, '{}'::jsonb);
  end if;

  -- 1. Overview (kv)
  v_sections := v_sections || jsonb_build_array(jsonb_build_object(
    'heading', 'Overview', 'kind', 'kv', 'data', jsonb_build_object(
      'Cycle', v_cyc.number,
      'Dates', to_char(v_cyc.start_date, 'DD Mon') || ' – ' || to_char(v_cyc.end_date, 'DD Mon YYYY'))));

  -- Feedback-pending callout (soft block) — prominent, right after Overview
  if not v_trn_sub then v_pending := v_pending || 'trainer'; end if;
  if not v_nut_sub then v_pending := v_pending || 'nutritionist'; end if;
  if array_length(v_pending, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Feedback Pending', 'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'warning',
        'text', 'Feedback pending: ' || array_to_string(v_pending, ', ')
              || '. This report will be updated when it arrives.')));
  end if;

  -- 2. Adverse events callout (danger)
  if (v_trn->>'adverse_events') = 'true' then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Adverse Events', 'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'danger', 'lead', 'Reported during training this cycle',
        'text', coalesce(nullif(v_trn->>'adverse_detail', ''), 'See training feedback for detail.'))));
  end if;

  -- 3. Training (kv, with re-assessment deltas vs prior cycle)
  if v_trn <> '{}'::jsonb then
    v_sts := _num_delta(v_trn->>'sit_to_stand', v_prev_trn->>'sit_to_stand');
    v_bal := _num_delta(v_trn->>'balance_seconds', v_prev_trn->>'balance_seconds');
    v_kv := jsonb_strip_nulls(jsonb_build_object(
      'Sessions completed', case when v_trn ? 'sessions_completed'
        then (v_trn->>'sessions_completed') || ' / ' || coalesce(v_trn->>'sessions_planned', '—') else null end,
      'Adherence & effort', case when v_trn ? 'adherence' then (v_trn->>'adherence') || ' / 5' else null end,
      'Progress vs goals', nullif(v_trn->>'progress_by_area', ''),
      'Sit-to-stand (reps)', v_sts,
      'Balance hold (s)', v_bal,
      'Next focus', nullif(v_trn->>'next_focus', '')));
    if v_kv <> '{}'::jsonb then
      v_sections := v_sections || jsonb_build_array(jsonb_build_object(
        'heading', 'Training', 'kind', 'kv', 'data', v_kv));
    end if;
  end if;

  -- 4. Nutrition (kv)
  if v_nut <> '{}'::jsonb then
    v_kv := jsonb_strip_nulls(jsonb_build_object(
      'Adherence', case when v_nut ? 'adherence' then (v_nut->>'adherence') || ' / 5' else null end,
      'Adherence basis', nullif(v_nut->>'adherence_basis', ''),
      'Weight change', nullif(v_nut->>'weight_change', ''),
      'Worked well', nullif(v_nut->>'worked_well', ''),
      'Challenges', nullif(v_nut->>'challenges', ''),
      'Reported changes', nullif(v_nut->>'reported_changes', '')));
    if v_kv <> '{}'::jsonb then
      v_sections := v_sections || jsonb_build_array(jsonb_build_object(
        'heading', 'Nutrition', 'kind', 'kv', 'data', v_kv));
    end if;
  end if;

  -- 5. Flags for Doctor (list, merged from both)
  if nullif(trim(v_trn->>'doctor_flags'), '') is not null then
    v_flags := v_flags || ('Trainer: ' || trim(v_trn->>'doctor_flags'));
  end if;
  if nullif(trim(v_nut->>'doctor_flags'), '') is not null then
    v_flags := v_flags || ('Nutritionist: ' || trim(v_nut->>'doctor_flags'));
  end if;
  if array_length(v_flags, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Flags for Doctor', 'kind', 'list', 'data', to_jsonb(v_flags)));
  end if;

  -- 6. Proposed Adjustments (list, merged from both)
  if nullif(trim(v_trn->>'modifications'), '') is not null then
    v_adj := v_adj || ('Training: ' || trim(v_trn->>'modifications'));
  end if;
  if nullif(trim(v_nut->>'modifications'), '') is not null then
    v_adj := v_adj || ('Nutrition: ' || trim(v_nut->>'modifications'));
  end if;
  if array_length(v_adj, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Proposed Adjustments', 'kind', 'list', 'data', to_jsonb(v_adj)));
  end if;

  -- 7. Adherence trend vs previous cycles (table)
  select jsonb_agg(jsonb_build_array(
           'Cycle ' || c.number,
           coalesce(tr.answers->>'adherence', '—'),
           coalesce(nu.answers->>'adherence', '—')) order by c.number)
    into v_trend
    from cycles c
    left join lateral (
      select fr.answers from form_responses fr join form_templates t on t.id = fr.template_id
       where fr.cycle_id = c.id and fr.member_id = v_member and t.key = 'feedback_training'
       order by fr.submitted_at desc nulls last, fr.created_at desc limit 1) tr on true
    left join lateral (
      select fr.answers from form_responses fr join form_templates t on t.id = fr.template_id
       where fr.cycle_id = c.id and fr.member_id = v_member and t.key = 'feedback_nutrition'
       order by fr.submitted_at desc nulls last, fr.created_at desc limit 1) nu on true
   where c.package_id = v_cyc.package_id and c.number <= v_cyc.number;
  if v_trend is not null then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Adherence Trend', 'kind', 'table', 'data', jsonb_build_object(
        'columns', jsonb_build_array('Cycle', 'Training adherence', 'Nutrition adherence'),
        'rows', v_trend)));
  end if;

  return jsonb_build_object(
    'title', 'Performance Report — ' || v_name,
    'generated_at', now(), 'cycle', v_cyc.number, 'sections', v_sections);
end $$;

-- ============ compile_performance_report — idempotent + real content ============
create or replace function compile_performance_report(p_cycle uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cyc cycles%rowtype; v_member uuid; v_report uuid; v_doctor uuid; v_name text;
begin
  select * into v_cyc from cycles where id = p_cycle;
  if not found then raise exception 'not_found'; end if;
  -- One performance report per cycle (submit_feedback and the cron soft-block may both fire).
  select id into v_report from reports where cycle_id = p_cycle and type = 'performance'
   order by created_at limit 1;
  if v_report is not null then return v_report; end if;

  select member_id into v_member from packages where id = v_cyc.package_id;
  select full_name into v_name from members where id = v_member;
  insert into reports(member_id, cycle_id, type, content, created_by)
  values (v_member, p_cycle, 'performance', _build_performance(p_cycle), auth.uid())
  returning id into v_report;

  select care_user_id into v_doctor from assignments
   where member_id = v_member and care_role = 'doctor' and active;
  if v_doctor is not null then
    perform _notify(v_doctor, 'performance_ready',
                    'Performance report ready — review before your call',
                    'Cycle ' || v_cyc.number || ' performance report for ' || v_name || '.',
                    '/clinician/clients/' || v_member, 'perf:' || p_cycle);
  end if;
  perform _audit(auth.uid(), 'performance.compiled', 'report', v_report,
                 jsonb_build_object('cycle_id', p_cycle));
  return v_report;
end $$;

-- ============ §9 daily jobs ============
-- Service/cron (auth.uid() IS NULL) or admin only. All offsets from cycle end_date;
-- paused packages are skipped everywhere; every notification is dedupe-keyed.
create or replace function run_daily_jobs(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; v_pro uuid; v_tmpl uuid; v_report uuid; v_role text;
  j1 int := 0; j2 int := 0; j3 int := 0; j4 int := 0; j5 int := 0; j6 int := 0;
begin
  if auth.uid() is not null and auth_role() <> 'admin' then raise exception 'not_allowed'; end if;

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

-- ============ Execute privileges ============
revoke execute on function _num_delta(text, text)      from public, anon, authenticated;
revoke execute on function _build_performance(uuid)     from public, anon, authenticated;
revoke execute on function run_daily_jobs(date)         from public, anon, authenticated;
