-- PHLOEM migration 0045_amend_clinical_report.sql — a clinician corrects a report
-- they already submitted.
--
-- WHY. §8 already says reports are "immutable once submitted (amendments create
-- versions)", and reports.version / reports.supersedes have existed since 0001.
-- amend_onboarding (0039/0040) put that to work for the family's answers. The
-- clinical side had no equivalent: a doctor who typed 148/92 as 184/92, or a
-- nutritionist who left the protein target out, had no way to fix it. The only
-- path was to ask an admin to do surgery on the row.
--
-- WHAT. One RPC, amend_clinical_report, in the amend_onboarding mould: nothing is
-- overwritten. A correction inserts a fresh form_responses row and a fresh reports
-- row at version + 1 pointing at the one it replaces. The clinician RLS policies
-- still carry no UPDATE or DELETE on reports, so immutability is untouched.
--
-- Numbered 0045 because 0035 and 0037–0044 (the record-correction branch) are
-- applied to the hosted project from their own branch and are not on main.
--
-- Two supporting changes the feature cannot be correct without:
--
--   1. reports.form_response_id. A report and the answers behind it were written
--      in the same transaction and never linked, so "which answers produced this
--      report" was only ever recoverable by guesswork — and ambiguous outright once
--      0036 allowed a second cycle_id-NULL doctor_review. Amending needs that link
--      to be a fact, so it becomes one. Backfilled by the equality that was already
--      true: same member, same author, and submitted_at = created_at, because both
--      defaulted to the same transaction's now().
--
--   2. form_responses.supersedes + a get_measure_series filter. get_measure_series
--      (0022) reads EVERY submitted response, so without this a corrected blood
--      pressure would not replace the wrong one on the trend chart — it would plot
--      beside it, two readings for one consultation, with no way to tell which the
--      doctor meant. The filter also settles the same latent duplicate that
--      amend_onboarding can already produce on the baseline weight.

-- ============ 1. link a report to the answers behind it ============

alter table reports add column if not exists form_response_id uuid references form_responses(id);

-- Same member, same author, and the same transaction timestamp: submitted_at was
-- now() and created_at defaulted to now() inside submit_clinical_form's single
-- transaction. Verified 12/12 on the hosted project with no ambiguity.
update reports r
   set form_response_id = fr.id
  from form_responses fr
 where r.form_response_id is null
   and fr.member_id     = r.member_id
   and fr.respondent_id = r.created_by
   and fr.submitted_at  = r.created_at;

create index if not exists idx_reports_form_response on reports (form_response_id)
  where form_response_id is not null;

-- ============ 2. a response can be superseded, same as a report ============

alter table form_responses add column if not exists supersedes uuid references form_responses(id);

-- Unique, not merely indexed: a version may be replaced once. Two corrections of
-- the same version would fork the history into two "current" answers with no way
-- to say which is the record. The RPC refuses it too; this makes it impossible.
create unique index if not exists form_responses_one_successor
  on form_responses (supersedes) where supersedes is not null;
create unique index if not exists reports_one_successor
  on reports (supersedes) where supersedes is not null;

-- ============ 3. get_measure_series: superseded answers leave the series ============
-- Reproduced verbatim from its 0022 definition; the ONLY change is the marked
-- `not exists` clause (the convention 0015/0017/0024 used for the same purpose).

create or replace function get_measure_series(m uuid, p_domain text default null)
returns table (
  measure_key      text,
  label            text,
  unit             text,
  domain           text,
  higher_is_better boolean,
  at               timestamptz,
  cycle_number     int,
  value            numeric,
  source           text
)
language sql stable security definer set search_path = public as $$
  with allowed as (select _measure_domains(m) as domains),
  family_only as (
    -- caregivers and the elderly member see only family-safe measures
    select coalesce(is_caregiver_of(m) or is_member_self(m), false) as yes
  )
  select mc.measure_key,
         mc.label,
         mc.unit,
         mc.domain,
         mc.higher_is_better,
         -- the clinician's own consultation date beats the submission timestamp
         coalesce(
           case when fr.answers->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
                then ((fr.answers->>'date') || 'T00:00:00+05:30')::timestamptz end,
           fr.submitted_at
         ) as at,
         cy.number as cycle_number,
         _measure_value(fr.answers, ms.field_id, ms.parse) as value,
         ms.template_key as source
    from form_responses fr
    join form_templates t   on t.id = fr.template_id
    join measure_sources ms on ms.template_key = t.key
    join measure_catalog mc on mc.measure_key = ms.measure_key
    left join cycles cy     on cy.id = fr.cycle_id
   cross join allowed, family_only
   where fr.member_id = m
     and fr.submitted_at is not null
     -- ============ 0045 ============
     -- A corrected reading REPLACES the wrong one rather than plotting beside it.
     and not exists (select 1 from form_responses s where s.supersedes = fr.id)
     -- ============ end 0045 ============
     and mc.domain = any (allowed.domains)
     and (not family_only.yes or mc.family_safe)
     and (p_domain is null or mc.domain = p_domain)
     and _measure_value(fr.answers, ms.field_id, ms.parse) is not null
   order by mc.domain, mc.sort, mc.measure_key,
            coalesce(
              case when fr.answers->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
                   then ((fr.answers->>'date') || 'T00:00:00+05:30')::timestamptz end,
              fr.submitted_at
            )
$$;

-- ============ 4. the amendment RPC ============

-- Which report types does each care role author? A clinician may correct their own
-- work and nothing else, so this is both the role gate and the report_type gate.
create or replace function _amendable_types(p_role user_role) returns report_type[]
language sql immutable set search_path = public as $$
  select case p_role
    when 'doctor'       then array['doctor_initial','doctor_review']::report_type[]
    when 'nutritionist' then array['nutrition_plan','nutrition_review']::report_type[]
    when 'trainer'      then array['training_plan','training_review']::report_type[]
    when 'psychologist' then array['wellbeing']::report_type[]
    else array[]::report_type[]
  end
$$;

-- Which care roles may READ a report of this type — rep_doctor / rep_nutri /
-- rep_trainer / rep_psych (0002) expressed as data, so the amendment notification
-- reaches exactly the people the permission matrix already lets read the document.
-- Note the asymmetry §3 draws: the trainer reads nutrition reports, the
-- nutritionist does not read training ones.
create or replace function _report_readers(p_type report_type) returns care_role[]
language sql immutable set search_path = public as $$
  select case
    when p_type = 'wellbeing' then array['psychologist']::care_role[]
    when p_type = any (array['training_plan','training_review']::report_type[])
      then array['doctor','trainer']::care_role[]
    when p_type = any (array['doctor_initial','doctor_review',
                             'nutrition_plan','nutrition_review']::report_type[])
      then array['doctor','nutritionist','trainer']::care_role[]
    else array[]::care_role[]
  end
$$;

create or replace function amend_clinical_report(
  p_report uuid, p_answers jsonb, p_reason text, p_report_content jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role       user_role;
  v_old_report reports%rowtype;
  v_old_resp   form_responses%rowtype;
  v_name       text;
  v_cycle_no   int;
  v_clearance  text;
  v_new_resp   uuid;
  v_new_report uuid;
  v_cg         uuid;
  v_changed    text[];
begin
  -- auth_role() is NULL for a suspended account as well as a missing one (the 0017
  -- lesson), so this single guard closes both.
  v_role := auth_role();
  if v_role is null then raise exception 'not_allowed'; end if;
  if not (v_role = any (array['doctor','nutritionist','trainer','psychologist']::user_role[])) then
    raise exception 'not_allowed';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'summary_required'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_content'; end if;

  select * into v_old_report from reports where id = p_report;
  if not found then raise exception 'not_found'; end if;

  -- Their own report, for a member they are still assigned to, of a type their own
  -- role writes. An admin borrowing a desk fails the first of these — borrowed desks
  -- stay read-only, exactly as submit_clinical_form holds.
  if v_old_report.created_by is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if not is_assigned_to(v_old_report.member_id) then raise exception 'not_allowed'; end if;
  if not (v_old_report.type = any (_amendable_types(v_role))) then raise exception 'not_allowed'; end if;

  -- Correct the newest version, never fork an old one.
  if exists (select 1 from reports r where r.supersedes = v_old_report.id) then
    raise exception 'not_latest_version';
  end if;

  if v_old_report.form_response_id is null then raise exception 'invalid_response'; end if;
  select * into v_old_resp from form_responses where id = v_old_report.form_response_id;
  if v_old_resp.id is null then raise exception 'invalid_response'; end if;
  if p_answers = v_old_resp.answers then raise exception 'no_changes'; end if;

  -- The trainer gate is re-checked, not assumed: if the doctor has since withdrawn
  -- clearance, the training plan is not the document to be editing.
  if v_role = 'trainer' then
    select content->>'clearance' into v_clearance from reports
     where member_id = v_old_report.member_id and type in ('doctor_initial','doctor_review')
       and coalesce(content->>'clearance', '') <> ''
     order by created_at desc limit 1;
    if v_clearance is null or v_clearance not in ('cleared','cleared_with_restrictions') then
      raise exception 'awaiting_doctor_clearance';
    end if;
  end if;

  select full_name into v_name from members where id = v_old_report.member_id;
  select number into v_cycle_no from cycles where id = v_old_report.cycle_id;

  -- Superseded, not overwritten — on both rows, so the answers and the document
  -- that quoted them stay in step.
  insert into form_responses(member_id, template_id, consultation_id, cycle_id,
                             respondent_id, answers, submitted_at, supersedes)
  values (v_old_resp.member_id, v_old_resp.template_id, v_old_resp.consultation_id,
          v_old_resp.cycle_id, auth.uid(), p_answers, now(), v_old_resp.id)
  returning id into v_new_resp;

  insert into reports(member_id, cycle_id, type, content, version, supersedes,
                      share_with_caregiver, created_by, form_response_id)
  values (v_old_report.member_id, v_old_report.cycle_id, v_old_report.type,
          coalesce(p_report_content,
                   _report_stub(initcap(replace(v_old_report.type::text, '_', ' ')) || ' — ' || v_name,
                                v_cycle_no,
                                case when v_role = 'doctor'
                                     then jsonb_build_object('clearance', p_answers->>'clearance')
                                     else '{}'::jsonb end))
            || jsonb_build_object('amended_reason', btrim(p_reason)),
          coalesce(v_old_report.version, 1) + 1, v_old_report.id,
          -- A correction inherits who was allowed to see the original. Changing who
          -- reads a report is set_report_sharing's job, not this one's.
          v_old_report.share_with_caregiver, auth.uid(), v_new_resp)
  returning id into v_new_report;

  -- Cases are deliberately NOT re-seeded or re-appended. _seed_cases_from_problem_list
  -- and _append_review_to_cases (0024) both APPEND, so running them again would
  -- duplicate every problem and every review note. A doctor whose correction changes
  -- the problem list edits the cases directly, in the panel built for it.

  -- consultations.report_status stays 'submitted' and members.status is untouched:
  -- the consultation was reported on, and still is.

  select caregiver_id into v_cg from members where id = v_old_report.member_id;
  select coalesce(array_agg(ks.k order by ks.k), array[]::text[]) into v_changed
    from (select jsonb_object_keys(p_answers) as k
           union
          select jsonb_object_keys(v_old_resp.answers)) ks
   where p_answers -> ks.k is distinct from v_old_resp.answers -> ks.k;

  if v_old_report.type = 'wellbeing' then
    -- §3: anyone who cannot read the wellbeing report is told only that a check-in
    -- happened. Telling the care team it was CORRECTED would say more than that, so
    -- only the admins — who may read it — hear about this one.
    perform _notify_roles(array['admin']::user_role[], 'report_amended',
      'Wellbeing report corrected',
      'The psychologist corrected ' || v_name || '''s wellbeing report.',
      '/reports/' || v_new_report, 'rep_amended:' || v_new_report);
  else
    -- NOT _notify_care_team: that reaches every assignee, which would tell a
    -- nutritionist a training plan changed and hand them the clinician's reason for
    -- it. The colleagues who may open the document are the ones who hear about it.
    perform _notify(a.care_user_id, 'report_amended',
      initcap(replace(v_old_report.type::text, '_', ' ')) || ' corrected',
      v_name || '''s ' || replace(v_old_report.type::text, '_', ' ') || ' was corrected: '
        || btrim(p_reason),
      '/reports/' || v_new_report, 'rep_amended:' || v_new_report || ':' || a.care_user_id)
      from assignments a
     where a.member_id = v_old_report.member_id and a.active
       and a.care_role = any (_report_readers(v_old_report.type))
       and a.care_user_id <> auth.uid();

    -- The family is told only about a document they can actually open — the plans
    -- they always see, or a doctor report the clinician chose to share. They may
    -- have acted on the version that was wrong.
    if v_cg is not null
       and (v_old_report.type = any (array['nutrition_plan','nutrition_review',
                                           'training_plan','training_review']::report_type[])
            or v_old_report.share_with_caregiver) then
      perform _notify(v_cg, 'report_amended',
        'An updated version of a report is ready',
        initcap(replace(v_old_report.type::text, '_', ' '))
          || ' for ' || v_name || ' has been corrected by the care team.',
        '/reports/' || v_new_report, 'rep_amended_cg:' || v_new_report);
    end if;
  end if;

  -- Keys and the reason, never values: the answers themselves live in form_responses,
  -- and the audit log is read by roles who may not see them.
  perform _audit(auth.uid(), 'clinical_report.amended', 'report', v_new_report,
    jsonb_build_object('reason', btrim(p_reason),
                       'type', v_old_report.type,
                       'fields', to_jsonb(v_changed),
                       'supersedes', v_old_report.id,
                       'response', v_new_resp));

  return v_new_report;
end $$;

-- ============ grants ============
-- Functions grant EXECUTE to PUBLIC by default and anon inherits it via PUBLIC
-- (the 0009 lesson) — revoke, then re-grant to authenticated only.
revoke execute on function _amendable_types(user_role) from public, anon;
revoke execute on function _report_readers(report_type) from public, anon;
revoke execute on function amend_clinical_report(uuid,jsonb,text,jsonb) from public, anon;
grant  execute on function _amendable_types(user_role) to authenticated;
grant  execute on function _report_readers(report_type) to authenticated;
grant  execute on function amend_clinical_report(uuid,jsonb,text,jsonb) to authenticated;
