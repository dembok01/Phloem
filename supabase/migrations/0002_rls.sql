-- PHLOEM migration 0002_rls.sql — RLS per PHLOEM-BUILD-SPEC.md §5

-- ============ §5.1 Helper functions ============
-- security definer; owned by postgres → bypass RLS, no recursion

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active'
$$;
-- Suspended user ⇒ NULL ⇒ every policy fails closed. Suspend switch = instant lockout.

create or replace function is_assigned_to(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments
                 where member_id = m and care_user_id = auth.uid() and active)
$$;

create or replace function is_caregiver_of(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where id = m and caregiver_id = auth.uid())
$$;

-- ============ §5.2 Enable RLS on EVERY table ============
alter table profiles        enable row level security;
alter table members         enable row level security;
alter table member_contacts enable row level security;
alter table invites         enable row level security;
alter table assignments     enable row level security;
alter table packages        enable row level security;
alter table cycles          enable row level security;
alter table consultations   enable row level security;
alter table form_templates  enable row level security;
alter table form_responses  enable row level security;
alter table reports         enable row level security;
alter table notifications   enable row level security;
alter table audit_log       enable row level security;

-- ============ §5.2 Policies ============

-- profiles
create policy prof_own_read   on profiles for select using (id = auth.uid());
create policy prof_admin      on profiles for all    using (auth_role() = 'admin');
create policy prof_coord_read on profiles for select
  using (auth_role() = 'coordinator');           -- coordinator sees care-team contacts

-- members
create policy mem_admin      on members for all    using (auth_role() = 'admin');
create policy mem_coord      on members for select using (auth_role() = 'coordinator');
create policy mem_clinician  on members for select
  using (auth_role() in ('doctor','nutritionist','trainer','psychologist')
         and is_assigned_to(id));
create policy mem_caregiver  on members for select using (caregiver_id = auth.uid());

-- member_contacts  (note who is ABSENT: all four clinical roles)
create policy con_admin      on member_contacts for all    using (auth_role() = 'admin');
create policy con_coord      on member_contacts for select using (auth_role() = 'coordinator');
create policy con_caregiver  on member_contacts for select using (is_caregiver_of(member_id));
create policy con_cg_update  on member_contacts for update using (is_caregiver_of(member_id));

-- reports (per-type, mirrors §3 exactly)
create policy rep_admin   on reports for all using (auth_role() = 'admin');
create policy rep_doctor  on reports for select
  using (auth_role()='doctor' and is_assigned_to(member_id) and type <> 'wellbeing');
create policy rep_nutri   on reports for select
  using (auth_role()='nutritionist' and is_assigned_to(member_id)
         and type in ('onboarding_summary','doctor_initial','doctor_review',
                      'nutrition_plan','nutrition_review','performance'));
create policy rep_trainer on reports for select
  using (auth_role()='trainer' and is_assigned_to(member_id)
         and type in ('onboarding_summary','doctor_initial','doctor_review',
                      'nutrition_plan','nutrition_review','training_plan',
                      'training_review','performance'));
create policy rep_psych   on reports for select
  using (auth_role()='psychologist' and is_assigned_to(member_id) and type='wellbeing');
create policy rep_cg      on reports for select
  using (is_caregiver_of(member_id)
         and (type in ('onboarding_summary','nutrition_plan','nutrition_review',
                       'training_plan','training_review')
              or share_with_caregiver));
create policy rep_insert  on reports for insert
  with check (created_by = auth.uid()
              and (auth_role()='admin' or is_assigned_to(member_id)));
-- NO update/delete for clinicians ⇒ immutability; amendments insert with supersedes.

-- consultations
create policy cons_admin_coord on consultations for all
  using (auth_role() in ('admin','coordinator'));
create policy cons_clinician on consultations for select
  using (auth_role()::text = type::text and is_assigned_to(member_id));
create policy cons_caregiver on consultations for select using (is_caregiver_of(member_id));

-- form_responses (raw rows). Scoped access for nutri/trainer/psych = RPC only (§5.3).
create policy fr_admin on form_responses for all using (auth_role()='admin');
create policy fr_cg    on form_responses for all
  using (is_caregiver_of(member_id));            -- own onboarding draft/submit
create policy fr_doctor_onboarding on form_responses for select
  using (auth_role()='doctor' and is_assigned_to(member_id)
         and template_id in (select id from form_templates where key='onboarding'));
create policy fr_own_clinical on form_responses for all
  using (respondent_id = auth.uid());            -- professionals: their own drafts/submissions
create policy fr_feedback_doctor on form_responses for select
  using (auth_role()='doctor' and is_assigned_to(member_id)
         and template_id in (select id from form_templates
                             where key in ('feedback_nutrition','feedback_training')));

-- notifications / audit / templates / invites / packages / cycles / assignments
create policy notif_own   on notifications for all    using (user_id = auth.uid());
create policy audit_admin on audit_log     for select using (auth_role()='admin');
create policy tmpl_read   on form_templates for select using (auth_role() is not null);
create policy inv_admin   on invites for all using (auth_role()='admin');
create policy inv_coord   on invites for all
  using (auth_role()='coordinator' and role='caregiver');
create policy pkg_admin_coord on packages for select using (auth_role() in ('admin','coordinator'));
create policy pkg_cg          on packages for select using (is_caregiver_of(member_id));
create policy cyc_read on cycles for select using (
  auth_role() in ('admin','coordinator')
  or exists (select 1 from packages p where p.id = package_id
             and (is_caregiver_of(p.member_id) or is_assigned_to(p.member_id))));
create policy asg_admin_coord on assignments for select using (auth_role() in ('admin','coordinator'));
create policy asg_own         on assignments for select using (care_user_id = auth.uid());
create policy asg_cg          on assignments for select using (is_caregiver_of(member_id));
-- All workflow WRITES to packages/cycles/assignments/consultations happen via §6 RPCs.

-- ============ §5.3 Scoped onboarding RPC (RLS can't split a row) ============

create or replace function get_onboarding_scoped(m uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r user_role := auth_role(); a jsonb;
begin
  if r is null then return null; end if;
  select fr.answers into a
    from form_responses fr join form_templates t on t.id = fr.template_id
   where fr.member_id = m and t.key = 'onboarding' and fr.submitted_at is not null
   order by fr.submitted_at desc limit 1;
  if a is null then return null; end if;

  if r = 'admin' or is_caregiver_of(m) or (r = 'doctor' and is_assigned_to(m)) then
    return a;
  elsif r = 'nutritionist' and is_assigned_to(m) then
    return jsonb_build_object(
      'conditions',a->'conditions','allergies',a->'allergies',
      'food_allergies',a->'food_allergies','medications',a->'medications',
      'meal_routine',a->'meal_routine','diet_pref',a->'diet_pref',
      'food_frequency',a->'food_frequency','water_liters',a->'water_liters',
      'protein_grams',a->'protein_grams','goals',a->'goals','reason',a->'reason');
  elsif r = 'trainer' and is_assigned_to(m) then
    return jsonb_build_object(
      'activity_level',a->'activity_level','sitting_hours',a->'sitting_hours',
      'current_activities',a->'current_activities','activity_minutes',a->'activity_minutes',
      'limiting_factors',a->'limiting_factors','activity_symptoms',a->'activity_symptoms',
      'joint_pain',a->'joint_pain','sleep_hours',a->'sleep_hours',
      'goals',a->'goals','focus_area',a->'focus_area','preferred_slots',a->'preferred_slots',
      'trainer_before',a->'trainer_before','trainer_experience',a->'trainer_experience');
  elsif r = 'psychologist' and is_assigned_to(m) then
    return jsonb_build_object(
      'reason',a->'reason','goals',a->'goals','sleep_hours',a->'sleep_hours',
      'condition_names',(select jsonb_agg(c->'condition') from jsonb_array_elements(coalesce(a->'conditions','[]'::jsonb)) c));
  end if;
  return null;
end $$;

-- ============ Data API grants (logged assumption) ============
-- Supabase is phasing out automatic grants for new tables in `public`
-- (changelog 2026-04-28). RLS above is the row boundary; these grants only
-- make the tables reachable through PostgREST, mirroring the historical
-- Supabase defaults so the schema stays portable to hosted projects.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
