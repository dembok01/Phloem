-- PHLOEM migration 0053_review_round_follows_doctor.sql — the monthly review round
-- revolves around the doctor's consultation (owner decision 2026-10-02).
--
-- WHY. Under 0046 a role joined a cycle's review round only if its own initial report
-- was in when the cycle opened. A dietitian whose first report landed a week into
-- month 2 got no month-2 review and nothing to schedule until month 3 (Mohammed Haja,
-- Sunitha Suresh). The owner's rule: the month runs from the doctor. Once the doctor's
-- consultation for month N is held, the dietitian's, trainer's and psychologist's
-- month-N reviews open — whatever happened to their first meeting or report.
--
-- WHAT
--   1. _open_review_consults(pkg, cycle)   a cycle opens with the doctor's review only
--                                          (rollover and backdated start call it).
--   2. _open_round_after_doctor(cycle)     the other ASSIGNED roles' reviews, once; only
--                                          for an active cycle — a late "done" on last
--                                          month's doctor must not open hidden rows that
--                                          the hygiene job would then nag about.
--   3. trigger on consultations            when a doctor's cycle consultation becomes
--                                          'done' by any path (mark_meeting_done, a
--                                          backdated start filing a manual review) → 2.
--   4. _role_in_cycle(cycle, role)         "part of this month": month 1 keeps 0046's
--                                          meaning (has an initial plan); month 2+ means
--                                          has this month's review consultation.
--   5. run_daily_jobs                      monthly feedback drafts and the overdue check
--                                          use 4; drafts are attempted every day from
--                                          end-3, so a late-opened review still gets one.
--   6. _build_performance                  "pending" vs "no review this month" uses 4.
--   7. backfill                            opens the reviews the rule says exist now:
--                                          active month-2+ cycles whose doctor met.
--
-- UNCHANGED. Month 1: initial consultations are still created on assignment, and the
-- program still starts with the doctor's initial report. _role_started keeps its 0048
-- meaning for month 1 and for _start_program's psychologist override. Reviews opened
-- under the old rule are left as they are (none conflict as of this migration).
--
-- Functions 5–6 are reproduced verbatim from 0046 (live bodies verified identical by
-- md5 before writing); only the blocks marked 0053 differ.

-- ============ 1. a cycle opens with the doctor's review ============
create or replace function _open_review_consults(p_pkg uuid, p_cycle uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_member uuid;
begin
  select member_id into v_member from packages where id = p_pkg;
  if exists (select 1 from consultations
              where member_id = v_member and cycle_id = p_cycle and type = 'doctor') then
    return 0;
  end if;
  insert into consultations(member_id, cycle_id, type) values (v_member, p_cycle, 'doctor');
  return 1;
end $$;

-- ============ 2. the rest of the round, after the doctor ============
create or replace function _open_round_after_doctor(p_cycle uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_member uuid; r care_role; n int := 0;
begin
  select p.member_id into v_member
    from cycles c join packages p on p.id = c.package_id
   where c.id = p_cycle and c.status = 'active' and p.status = 'active';
  if v_member is null then return 0; end if;
  foreach r in array array['nutritionist','trainer','psychologist']::care_role[] loop
    continue when not exists (select 1 from assignments
                               where member_id = v_member and care_role = r and active);
    if not exists (select 1 from consultations
                    where member_id = v_member and cycle_id = p_cycle and type = r) then
      insert into consultations(member_id, cycle_id, type) values (v_member, p_cycle, r);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ============ 3. the doctor's meeting held → the round opens ============
create or replace function _doctor_meeting_opens_round()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'doctor' and new.cycle_id is not null and new.meeting_status = 'done'
     and (tg_op = 'INSERT' or old.meeting_status is distinct from new.meeting_status) then
    perform _open_round_after_doctor(new.cycle_id);
  end if;
  return null;
end $$;

drop trigger if exists consultations_doctor_opens_round on consultations;
create trigger consultations_doctor_opens_round
  after insert or update of meeting_status on consultations
  for each row execute function _doctor_meeting_opens_round();

-- ============ 4. part of this month's round ============
create or replace function _role_in_cycle(p_cycle uuid, p_role care_role)
returns boolean language sql stable security definer set search_path = public as $$
  select case when c.number = 1 then _role_started(c.package_id, p_role)
              else exists (select 1
                             from consultations x join packages p on p.id = c.package_id
                            where x.member_id = p.member_id and x.cycle_id = c.id
                              and x.type = p_role and x.meeting_status <> 'cancelled') end
    from cycles c where c.id = p_cycle
$$;

-- ============ 5. run_daily_jobs ============
create or replace function run_daily_jobs(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; v_pro uuid; v_tmpl uuid; v_report uuid; v_role text;
  j1 int := 0; j2 int := 0; j3 int := 0; j4 int := 0; j5 int := 0; j6 int := 0;
  v_failed int := 0; v_skip uuid[] := '{}';
begin
  if auth.uid() is not null and auth_role() is distinct from 'admin' then raise exception 'not_allowed'; end if;
  perform pg_advisory_xact_lock(hashtext('phloem_run_daily_jobs'));

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

  for rec in
    select c.id as cycle_id, m.id as member_id, m.full_name, p.id as package_id  -- 0046: + package_id
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     -- 0053: every day from end-3 to the last day, not only on end-3, so a role whose
     -- review opened late (the doctor met late) still gets its form. Idempotent: the
     -- insert is guarded and the notice is deduped.
     where p.status = 'active' and c.status = 'active' and c.end_date between p_today and p_today + 3
  loop
    for v_role in select unnest(array['nutritionist', 'trainer']) loop
      v_tmpl := (select id from form_templates
                  where key = case v_role when 'nutritionist' then 'feedback_nutrition' else 'feedback_training' end
                    and active order by version desc limit 1);
      v_pro := (select care_user_id from assignments
                 where member_id = rec.member_id and care_role = v_role::care_role and active);
      if v_pro is not null and v_tmpl is not null
         and _role_in_cycle(rec.cycle_id, v_role::care_role)  -- 0053: part of this cycle's round
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

  loop
    select c.id as cycle_id, c.end_date, m.id as member_id, m.full_name, p.id as package_id  -- 0046: + package_id
      into rec
      from cycles c join packages p on p.id = c.package_id join members m on m.id = p.member_id
     where p.status = 'active' and c.status = 'active' and p_today > c.end_date
       and not (c.id = any(v_skip))
     order by c.end_date, c.number limit 1;
    exit when not found;
    begin
      if exists (select 1 from form_responses fr join form_templates t on t.id = fr.template_id
                  where fr.cycle_id = rec.cycle_id and fr.submitted_at is null
                    and t.key in ('feedback_nutrition', 'feedback_training'))
         or exists (select 1 from assignments a where a.member_id = rec.member_id and a.active
                      and a.care_role in ('nutritionist', 'trainer')
                      and _role_in_cycle(rec.cycle_id, a.care_role)  -- 0053
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
    exception when others then
      v_failed := v_failed + 1;
      v_skip := v_skip || rec.cycle_id;
      perform _notify_roles(array['admin', 'coordinator']::user_role[], 'cron_error',
        'Cycle rollover failed',
        'Automated rollover for ' || rec.full_name || ' failed and needs manual review.',
        '/admin/members/' || rec.member_id, 'cronfail:' || rec.cycle_id || ':' || p_today);
      raise warning 'run_daily_jobs job4 failed for cycle %: %', rec.cycle_id, sqlerrm;
    end;
  end loop;

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
  for rec in
    select i.id as invite_id, i.email from invites i
     where i.used_at is null and i.expires_at < p_today
  loop
    perform _notify_roles(array['admin']::user_role[], 'invite_expired', 'Invite expired',
      'The invite for ' || rec.email || ' has expired unused.', '/admin/invites', 'hyginv:' || rec.invite_id);
    j6 := j6 + 1;
  end loop;

  return jsonb_build_object('today', p_today, 'reviews_due', j1, 'feedback_drafts', j2,
    'feedback_nudges', j3, 'cycles_rolled', j4, 'renewals', j5, 'hygiene', j6, 'failures', v_failed);
end $$;

-- ============ 6. _build_performance ============
create or replace function _build_performance(p_cycle uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cyc cycles%rowtype; v_member uuid; v_name text;
  v_nut jsonb; v_trn jsonb; v_nut_sub boolean := false; v_trn_sub boolean := false;
  v_prev_cycle uuid; v_prev_trn jsonb := '{}'::jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_pending text[] := '{}'; v_flags text[] := '{}'; v_adj text[] := '{}';
  v_trend jsonb; v_sts text; v_bal text; v_kv jsonb;
  v_not_started text[] := '{}';  -- 0046
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
  if v_nut = '{}'::jsonb then v_nut_sub := false; end if;
  if v_trn = '{}'::jsonb then v_trn_sub := false; end if;

  select id into v_prev_cycle from cycles
   where package_id = v_cyc.package_id and number = v_cyc.number - 1;
  if v_prev_cycle is not null then
    select fr.answers into v_prev_trn from form_responses fr join form_templates t on t.id = fr.template_id
     where fr.cycle_id = v_prev_cycle and fr.member_id = v_member and t.key = 'feedback_training'
     order by fr.submitted_at desc nulls last, fr.created_at desc limit 1;
    v_prev_trn := coalesce(v_prev_trn, '{}'::jsonb);
  end if;

  v_sections := v_sections || jsonb_build_array(jsonb_build_object(
    'heading', 'Overview', 'kind', 'kv', 'data', jsonb_build_object(
      'Cycle', v_cyc.number,
      'Dates', to_char(v_cyc.start_date, 'DD Mon') || ' – ' || to_char(v_cyc.end_date, 'DD Mon YYYY'))));

  -- ============ 0053: in the cycle = has this month's review (month 1: has a plan) ============
  if not v_trn_sub then
    if _role_in_cycle(p_cycle, 'trainer') then v_pending := array_append(v_pending, 'trainer');
    else v_not_started := array_append(v_not_started,
           case when v_cyc.number = 1 then 'training plan' else 'trainer' end); end if;
  end if;
  if not v_nut_sub then
    if _role_in_cycle(p_cycle, 'nutritionist') then v_pending := array_append(v_pending, 'nutritionist');
    else v_not_started := array_append(v_not_started,
           case when v_cyc.number = 1 then 'nutrition plan' else 'nutritionist' end); end if;
  end if;
  if array_length(v_not_started, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', case when v_cyc.number = 1 then 'Not Started Yet' else 'No Review This Month' end,
      'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'info',
        'text', case when v_cyc.number = 1
          then 'Not started yet: ' || array_to_string(v_not_started, ', ')
               || '. Monthly feedback joins this report once the initial plan is submitted.'
          else 'No review this month: ' || array_to_string(v_not_started, ', ')
               || '. Their review opens once the doctor''s consultation for the month is held.' end)));
  end if;
  -- ============ end 0053 ============
  if array_length(v_pending, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Feedback Pending', 'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'warning',
        'text', 'Feedback pending: ' || array_to_string(v_pending, ', ')
              || '. This report will be updated when it arrives.')));
  end if;

  if (v_trn->>'adverse_events') = 'true' then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Adverse Events', 'kind', 'callout', 'data', jsonb_build_object(
        'tone', 'danger', 'lead', 'Reported during training this cycle',
        'text', coalesce(nullif(v_trn->>'adverse_detail', ''), 'See training feedback for detail.'))));
  end if;

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

  if nullif(trim(v_trn->>'doctor_flags'), '') is not null then
    v_flags := array_append(v_flags, 'Trainer: ' || trim(v_trn->>'doctor_flags'));
  end if;
  if nullif(trim(v_nut->>'doctor_flags'), '') is not null then
    v_flags := array_append(v_flags, 'Nutritionist: ' || trim(v_nut->>'doctor_flags'));
  end if;
  if array_length(v_flags, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Flags for Doctor', 'kind', 'list', 'data', to_jsonb(v_flags)));
  end if;

  if nullif(trim(v_trn->>'modifications'), '') is not null then
    v_adj := array_append(v_adj, 'Training: ' || trim(v_trn->>'modifications'));
  end if;
  if nullif(trim(v_nut->>'modifications'), '') is not null then
    v_adj := array_append(v_adj, 'Nutrition: ' || trim(v_nut->>'modifications'));
  end if;
  if array_length(v_adj, 1) > 0 then
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'heading', 'Proposed Adjustments', 'kind', 'list', 'data', to_jsonb(v_adj)));
  end if;

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

revoke execute on function _open_round_after_doctor(uuid)        from public, anon, authenticated;
revoke execute on function _doctor_meeting_opens_round()          from public, anon, authenticated;
revoke execute on function _role_in_cycle(uuid, care_role)        from public, anon, authenticated;

-- ============ 7. backfill: the reviews the rule says exist now ============
do $$
declare n int := 0; c record;
begin
  for c in
    select cy.id
      from cycles cy join packages p on p.id = cy.package_id
     where p.status = 'active' and cy.status = 'active' and cy.number > 1
       and exists (select 1 from consultations d
                    where d.member_id = p.member_id and d.cycle_id = cy.id
                      and d.type = 'doctor' and d.meeting_status = 'done')
  loop
    n := n + _open_round_after_doctor(c.id);
  end loop;
  raise notice '0053 backfill opened % review consultation(s)', n;

  -- Invariant: no active month-2+ cycle whose doctor met is missing an assigned role's review.
  if exists (
    select 1
      from cycles cy join packages p on p.id = cy.package_id
      join assignments a on a.member_id = p.member_id and a.active
                        and a.care_role in ('nutritionist','trainer','psychologist')
     where p.status = 'active' and cy.status = 'active' and cy.number > 1
       and exists (select 1 from consultations d
                    where d.member_id = p.member_id and d.cycle_id = cy.id
                      and d.type = 'doctor' and d.meeting_status = 'done')
       and not exists (select 1 from consultations x
                        where x.member_id = p.member_id and x.cycle_id = cy.id and x.type = a.care_role))
  then raise exception '0053: a review round is still incomplete after the backfill'; end if;
end $$;
