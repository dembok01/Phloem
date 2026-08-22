-- PHLOEM migration 0023_doctor_review_v2.sql — W1.3 of the care-continuum spec.
--
-- doctor_review v1 captures NO vitals, so a doctor's own monthly review
-- contributed nothing to any longitudinal series: weight/BP/pulse existed only at
-- intake (doctor_initial) and then never again. v2 adds a "Vitals This Month"
-- section reusing the EXACT field ids from doctor_initial, so measure_sources
-- (0022) reads intake and every review as ONE continuous series.
--
-- Versioning, not mutation: v1 stays in the table and historical form_responses
-- keep pointing at it; only `active` moves. §6 RPCs resolve templates with
-- `where key = ... and active`, so exactly one version per key may be active —
-- scripts/seed.ts enforces the same invariant for rebuilds.
--
-- v2 is derived from v1 in SQL rather than pasted as a literal, so it is provably
-- "v1 plus one section" and cannot silently drift from it.
-- supabase/templates/doctor_review.v2.json is regenerated from the result.

insert into form_templates (key, version, schema, active)
select
  'doctor_review',
  2,
  jsonb_insert(
    jsonb_set(t.schema, '{version}', '2'::jsonb),
    '{sections,1}',                    -- immediately after "Consultation"
    jsonb_build_object(
      'id', 's_vitals',
      'title', 'Vitals This Month',
      'fields', jsonb_build_array(
        jsonb_build_object('id','bp',           'type','text',    'label','Blood pressure', 'hint','e.g. 128/82'),
        jsonb_build_object('id','pulse',        'type','number',  'label','Pulse'),
        jsonb_build_object('id','weight_kg',    'type','number',  'label','Weight (kg)'),
        jsonb_build_object('id','sugar_hba1c',  'type','text',    'label','Sugar / HbA1c'),
        jsonb_build_object('id','recent_labs',  'type','textarea','label','Recent labs'),
        jsonb_build_object('id','tests_advised','type','textarea','label','Tests advised')
      )
    )
  ),
  true
from form_templates t
where t.key = 'doctor_review' and t.version = 1
on conflict (key, version) do update
  set schema = excluded.schema, active = excluded.active;

update form_templates set active = false where key = 'doctor_review' and version < 2;

-- Invariants: exactly one active doctor_review, and the new section really is
-- readable by the measure catalog (a typo'd field id would silently break the series).
do $$
declare n int; v jsonb;
begin
  select count(*) into n from form_templates where key = 'doctor_review' and active;
  if n <> 1 then
    raise exception 'doctor_review must have exactly one active version, found %', n;
  end if;

  select schema into v from form_templates where key = 'doctor_review' and version = 2;
  if not exists (
    select 1 from measure_sources ms
    where ms.template_key = 'doctor_review'
      and ms.field_id in (
        select f->>'id'
        from jsonb_array_elements(v->'sections') s,
             jsonb_array_elements(s->'fields') f
      )
  ) then
    raise exception 'doctor_review v2 exposes no field the measure catalog reads';
  end if;
end $$;
