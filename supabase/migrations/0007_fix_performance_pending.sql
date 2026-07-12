-- PHLOEM migration 0007_fix_performance_pending.sql
-- Fix: in _build_performance (0006), appending a bare string literal to a text[]
-- (`v_pending || 'trainer'`) makes Postgres resolve `||` as array||array and choke
-- with "malformed array literal". Use array_append() so the element side is
-- unambiguous. This path is hit whenever a cycle closes with feedback outstanding
-- (§9 job 4 soft block). Behaviour is otherwise identical.
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

  if not v_trn_sub then v_pending := array_append(v_pending, 'trainer'); end if;
  if not v_nut_sub then v_pending := array_append(v_pending, 'nutritionist'); end if;
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

revoke execute on function _build_performance(uuid) from public, anon, authenticated;
