-- PHLOEM migration 0026_progress_report.sql — W1.6 of the care-continuum spec.
--
-- Visibility for the new `progress_summary` type, and the one write path that
-- records it.
--
-- Division of labour: the DOCUMENT is composed in TypeScript
-- (lib/reports/build/progress-summary.ts) because it stitches together measure
-- series, a timeline, and cases — and because the improve/decline wording must come
-- from the same lib/measures.ts the live Trends tab uses, so a stored PDF can never
-- disagree with the screen. The INSERT and the notifications stay here, because
-- §12 makes the RPCs the source of truth for notification rows.

-- ============ RLS (§3) ============
-- rep_doctor already covers it: that policy is `type <> 'wellbeing'`, so the
-- doctor sees the new type with no change. rep_psych stays wellbeing-only, so the
-- psychologist is excluded by construction. The two allow-list policies need the
-- new value spelled out.
drop policy rep_nutri on reports;
create policy rep_nutri on reports for select
  using (auth_role()='nutritionist' and is_assigned_to(member_id)
         and type in ('onboarding_summary','doctor_initial','doctor_review',
                      'nutrition_plan','nutrition_review','performance',
                      'progress_summary'));

drop policy rep_trainer on reports;
create policy rep_trainer on reports for select
  using (auth_role()='trainer' and is_assigned_to(member_id)
         and type in ('onboarding_summary','doctor_initial','doctor_review',
                      'nutrition_plan','nutrition_review','training_plan',
                      'training_review','performance','progress_summary'));

-- The caregiver reaches it through rep_cg's `or share_with_caregiver` arm, which
-- needs no change: this report is created with share_with_caregiver = true (it is
-- designed as the family's monthly report), and a doctor can still withdraw it
-- with the existing set_report_sharing RPC.
--
-- rep_member (the elderly view-only login) is deliberately NOT extended: that
-- surface is capped at three items by §10, and a longitudinal clinical document is
-- not one of them.

-- ============ write path ============

-- Record a composed progress summary. Callable by the cron (auth.uid() IS NULL),
-- an admin, or the assigned doctor. Idempotent per cycle unless p_force, which
-- supersedes the previous version rather than mutating it (reports are immutable;
-- amendments insert with `supersedes`, per §8).
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

  select id, version into v_existing, v_version from reports
   where member_id = p_member and type = 'progress_summary'
     and cycle_id is not distinct from p_cycle
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
