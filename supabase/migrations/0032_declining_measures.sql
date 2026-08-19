-- PHLOEM migration 0032_declining_measures.sql — W5 of the care-continuum spec.
--
-- The doctor's dashboard needs "which of my members have a number moving the wrong
-- way" across their whole list. Calling get_measure_series once per member would be
-- one round trip per member on the hot path; this answers it in one query.
--
-- "Wrong way" is per-measure, exactly as in lib/measures.ts: a rising timed
-- up-and-go is a decline, a rising sit-to-stand is not. Measures with no direction
-- (weight) are excluded entirely — a chart must never decide whether an elderly
-- member gaining weight is bad news.

create or replace function my_declining_measures()
returns table (member_id uuid, measure_key text, label text, latest numeric, previous numeric)
language sql stable security definer set search_path = public as $$
  with visible as (
    select m.id
      from members m
     where auth_role() is not null
       and (auth_role() = 'admin' or is_assigned_to(m.id))
  ),
  pts as (
    select fr.member_id,
           mc.measure_key,
           mc.label,
           mc.higher_is_better,
           coalesce(
             case when fr.answers->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
                  then ((fr.answers->>'date') || 'T00:00:00+05:30')::timestamptz end,
             fr.submitted_at
           ) as at,
           _measure_value(fr.answers, ms.field_id, ms.parse) as value
      from form_responses fr
      join visible v            on v.id = fr.member_id
      join form_templates t     on t.id = fr.template_id
      join measure_sources ms   on ms.template_key = t.key
      join measure_catalog mc   on mc.measure_key = ms.measure_key
     where fr.submitted_at is not null
       -- psych measures never reach this surface: the doctor's dashboard is not a
       -- place wellbeing scores may appear (§3).
       and mc.domain <> 'psych'
       and mc.higher_is_better is not null
       and _measure_value(fr.answers, ms.field_id, ms.parse) is not null
  ),
  ranked as (
    select p.*, row_number() over (
             partition by p.member_id, p.measure_key order by p.at desc
           ) as rn
      from pts p
  )
  select r1.member_id, r1.measure_key, r1.label, r1.value, r2.value
    from ranked r1
    join ranked r2
      on r2.member_id = r1.member_id
     and r2.measure_key = r1.measure_key
     and r2.rn = 2
   where r1.rn = 1
     -- moved the wrong way for THIS measure. Equality is not a decline.
     and r1.value <> r2.value
     and (r1.value > r2.value) <> r1.higher_is_better
   order by r1.member_id, r1.label
$$;

revoke execute on function my_declining_measures() from public;
grant execute on function my_declining_measures() to authenticated;
