-- PHLOEM migration 0052_new_medicine_and_food_frequency.sql — two requests from a
-- doctor (2026-09-30).
--
-- 1. NEW MEDICINES IN THE DOCTOR'S FORMS
--    The medication list (doctor_initial.med_recon, doctor_review.med_changes) could
--    only say what to do with a medicine the member already takes — Continue /
--    Modify / Stop / Flag — so a newly prescribed one had no honest action, and the
--    list's button said only "Add another". New versions add a "New medicine" action
--    (`new_medicine`, which the report prints as "New medicine"), a one-line hint,
--    and an "Add a medicine" button (`addLabel`, read by DynamicForm).
--    Versioning, not mutation (the 0023 pattern): the old versions stay for the
--    responses that point at them; only `active` moves. Field ids are unchanged, so a
--    draft in progress keeps its answers (drafts are found by consultation, not by
--    template) and the report builder reads every version alike. No RPC validates
--    option values, so a draft begun on the old version can still submit the new one.
--    supabase/templates/doctor_initial.v2.json and doctor_review.v3.json are exported
--    from the result, so scripts/seed.ts keeps the same versions active.
--
-- 2. FOOD FREQUENCY IN ISSUED ONBOARDING SUMMARIES
--    "How often do they eat…" was written as six kv rows keyed by the food. Report
--    sections are jsonb, which re-orders keys by length, so the six scattered among
--    the other diet rows and read as a column of bare frequencies. The builder now
--    writes one "How often they eat" row, a food per line in the form's order
--    (lib/reports/build/onboarding-summary.ts). This rewrites the reports already
--    issued to exactly that shape, from their own stored values, and clears pdf_path
--    so the next download re-renders the PDF (to the same object path).

create or replace function pg_temp.with_new_medicine(p_schema jsonb, p_field text, p_version int)
returns jsonb language sql immutable as $$
  select jsonb_set(
    jsonb_set(p_schema, '{version}', to_jsonb(p_version)),
    '{sections}',
    (select jsonb_agg(
        jsonb_set(s, '{fields}', (
          select jsonb_agg(
            case when f->>'id' = p_field then
              f || jsonb_build_object(
                'hint', 'List what they take now and what to do with each. Prescribing something new? Use "Add a medicine" and set its action to "New medicine".',
                'addLabel', 'Add a medicine',
                'subfields', (
                  select jsonb_agg(
                    case when sf->>'id' = 'action'
                      then jsonb_set(sf, '{options}',
                        (sf->'options') || '[{"label": "New medicine", "value": "new_medicine"}]'::jsonb)
                      else sf end
                    order by sn)
                  from jsonb_array_elements(f->'subfields') with ordinality as x(sf, sn)))
            else f end
            order by fn)
          from jsonb_array_elements(s->'fields') with ordinality as y(f, fn)))
        order by secn)
     from jsonb_array_elements(p_schema->'sections') with ordinality as z(s, secn)))
$$;

insert into form_templates (key, version, schema, active)
select 'doctor_initial', 2, pg_temp.with_new_medicine(t.schema, 'med_recon', 2), true
from form_templates t
where t.key = 'doctor_initial' and t.version = 1
on conflict (key, version) do update set schema = excluded.schema, active = excluded.active;
update form_templates set active = false where key = 'doctor_initial' and version < 2;

insert into form_templates (key, version, schema, active)
select 'doctor_review', 3, pg_temp.with_new_medicine(t.schema, 'med_changes', 3), true
from form_templates t
where t.key = 'doctor_review' and t.version = 2
on conflict (key, version) do update set schema = excluded.schema, active = excluded.active;
update form_templates set active = false where key = 'doctor_review' and version < 3;

-- Issued onboarding summaries: six food rows → one "How often they eat" row.
with food(label, ord) as (
  values ('Fruits', 1), ('Vegetables', 2), ('Dairy', 3), ('Protein', 4), ('Processed foods', 5), ('Sweets', 6)
),
fixed as (
  select r.id,
    (select jsonb_agg(
        case when s->>'heading' = 'Diet & Nutrition'
                  and s->'data' ?| array['Fruits', 'Vegetables', 'Dairy', 'Protein', 'Processed foods', 'Sweets']
          then jsonb_set(s, '{data}',
            ((s->'data') - array['Fruits', 'Vegetables', 'Dairy', 'Protein', 'Processed foods', 'Sweets'])
            || jsonb_build_object('How often they eat', coalesce(
                 (select string_agg(f.label || ' — ' || (s->'data'->>f.label), E'\n' order by f.ord)
                    from food f
                   where coalesce(s->'data'->>f.label, '') not in ('', '—')),
                 '—')))
          else s end
        order by i)
     from jsonb_array_elements(r.content->'sections') with ordinality as x(s, i)) as sections
  from reports r
  where r.type = 'onboarding_summary'
    and exists (
      select 1 from jsonb_array_elements(r.content->'sections') s
      where s->>'heading' = 'Diet & Nutrition'
        and s->'data' ?| array['Fruits', 'Vegetables', 'Dairy', 'Protein', 'Processed foods', 'Sweets'])
)
update reports r
   set content = jsonb_set(r.content, '{sections}', fixed.sections),
       pdf_path = null
  from fixed
 where r.id = fixed.id;

-- Invariants.
do $$
declare n int;
begin
  select count(*) into n from form_templates where key = 'doctor_initial' and active;
  if n <> 1 then raise exception 'doctor_initial must have exactly one active version, found %', n; end if;
  select count(*) into n from form_templates where key = 'doctor_review' and active;
  if n <> 1 then raise exception 'doctor_review must have exactly one active version, found %', n; end if;

  select count(*) into n
    from form_templates t, jsonb_array_elements(t.schema->'sections') s, jsonb_array_elements(s->'fields') f,
         jsonb_array_elements(f->'subfields') sf, jsonb_array_elements(sf->'options') o
   where t.active and t.key in ('doctor_initial', 'doctor_review')
     and f->>'id' in ('med_recon', 'med_changes') and sf->>'id' = 'action'
     and o->>'value' = 'new_medicine';
  if n <> 2 then raise exception 'expected the New medicine action on both doctor forms, found %', n; end if;

  select count(*) into n
    from reports r, jsonb_array_elements(r.content->'sections') s
   where r.type = 'onboarding_summary' and s->>'heading' = 'Diet & Nutrition'
     and s->'data' ?| array['Fruits', 'Vegetables', 'Dairy', 'Protein', 'Processed foods', 'Sweets'];
  if n <> 0 then raise exception '% onboarding summaries still carry the old food rows', n; end if;
end $$;
