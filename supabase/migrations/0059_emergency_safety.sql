-- PHLOEM migration 0059_emergency_safety.sql — the Emergency & Safety record, the
-- session log, and the doctor's hold.
--
-- WHY (client items 3–6, owner decisions 2026-10-21/28; design in
-- docs/superpowers/specs/2026-10-21-emergency-safety-design.md). Trainers run video
-- sessions with elderly clients at home, often alone. When something goes wrong they
-- had no local contact, no hospital and, by §3, no number of any kind; an incident
-- reached the doctor weeks later in the day-27 feedback, and nothing stopped training
-- restarting before the doctor had looked.
--
-- WHAT.
--   member_safety  one row per member: a nearby contact, the hospital, the ambulance
--                  numbers, two yes/no answers, and where the consent came from
--                  (the family's own tick, or the coordinator reading it on a call).
--   safety_events  "no session today" (with reasons) and incidents. An uncleared
--                  incident means sessions are on hold until the assigned doctor
--                  clears it with a note.
--   members.safety_requested_at/by — when the coordinator asked the family to fill it
--                  in on their dashboard, so nobody is forgotten.
--
-- WHO READS. member_safety: admin, coordinator, the family, the assigned trainer and
-- doctor. The trainer and doctor get the address and the family emergency contact
-- through emergency_card — member_contacts keeps its policies, so the member's own
-- phone, WhatsApp and email still reach no clinician. Nutritionist and psychologist
-- read none of it. safety_events: admin, coordinator, assigned trainer and doctor;
-- the doctor's clearing note is not granted to anyone (the coordinator sees doctor
-- status, never doctor content) — it reaches the trainer in the notification and
-- stays in the audit log. Every write is an RPC; neither table has a write grant.

alter table members
  add column if not exists safety_requested_at timestamptz,
  add column if not exists safety_requested_by uuid references profiles(id) on delete set null;

create table member_safety (
  member_id               uuid primary key references members(id) on delete cascade,
  local_contact_name      text not null,
  local_contact_relation  text not null,
  local_contact_phone     text not null,
  local_contact_eta       text not null check (local_contact_eta in ('under_10','10_30','over_30')),
  hospital_name           text not null,
  hospital_phone          text not null,
  ambulance_phone         text not null default '108',
  private_ambulance_phone text,
  someone_home            boolean not null,
  bp_or_glucometer        boolean not null,
  consent_source          text not null check (consent_source in ('family_form','coordinator_call')),
  consent_recorded_by     uuid references profiles(id) on delete set null,
  consent_at              timestamptz not null default now(),
  updated_by              uuid references profiles(id) on delete set null,
  updated_at              timestamptz not null default now()
);

create table safety_events (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  kind        text not null check (kind in ('skipped','incident')),
  reasons     text[] not null default '{}',
  detail      text,
  -- clock time, not transaction time: two reports in one transaction still order.
  occurred_at timestamptz not null default clock_timestamp(),
  reported_by uuid references profiles(id) on delete set null,
  cleared_at  timestamptz,
  cleared_by  uuid references profiles(id) on delete set null,
  clear_note  text
);
create index safety_events_member_idx on safety_events(member_id, occurred_at desc);
create index safety_events_open_idx on safety_events(member_id)
  where kind = 'incident' and cleared_at is null;

alter table member_safety enable row level security;
alter table safety_events enable row level security;

create policy saf_staff on member_safety for select
  using (auth_role() in ('admin','coordinator'));
create policy saf_caregiver on member_safety for select
  using (is_caregiver_of(member_id));
create policy saf_care on member_safety for select
  using (auth_role() in ('trainer','doctor') and is_assigned_to(member_id));

create policy sev_staff on safety_events for select
  using (auth_role() in ('admin','coordinator'));
create policy sev_care on safety_events for select
  using (auth_role() in ('trainer','doctor') and is_assigned_to(member_id));

revoke all on member_safety, safety_events from anon, authenticated;
grant select on member_safety to authenticated;
grant select (id, member_id, kind, reasons, detail, occurred_at, reported_by, cleared_at, cleared_by)
  on safety_events to authenticated;

-- ============ internal: validate and upsert ============
-- Every required answer non-blank, the two yes/no answers given, a known reach time,
-- and the emergency consent ticked when the record is new. An update keeps the consent
-- already on file. A blank ambulance number is 108; a blank private ambulance is none.
create or replace function _save_safety(p_member uuid, p_fields jsonb, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_k text;
begin
  foreach v_k in array array['local_contact_name','local_contact_relation','local_contact_phone',
                             'local_contact_eta','hospital_name','hospital_phone'] loop
    if btrim(coalesce(v_f->>v_k, '')) = '' then raise exception 'safety_incomplete'; end if;
  end loop;
  foreach v_k in array array['someone_home','bp_or_glucometer'] loop
    if coalesce(v_f->>v_k, '') not in ('true','false') then raise exception 'safety_incomplete'; end if;
  end loop;
  if v_f->>'local_contact_eta' not in ('under_10','10_30','over_30') then raise exception 'bad_eta'; end if;
  if not exists (select 1 from member_safety where member_id = p_member)
     and coalesce(v_f->>'emergency_consent', '') <> 'true' then
    raise exception 'emergency_consent_required';
  end if;

  insert into member_safety(member_id, local_contact_name, local_contact_relation, local_contact_phone,
                            local_contact_eta, hospital_name, hospital_phone, ambulance_phone,
                            private_ambulance_phone, someone_home, bp_or_glucometer,
                            consent_source, consent_recorded_by, consent_at, updated_by, updated_at)
  values (p_member, btrim(v_f->>'local_contact_name'), btrim(v_f->>'local_contact_relation'),
          btrim(v_f->>'local_contact_phone'), v_f->>'local_contact_eta', btrim(v_f->>'hospital_name'),
          btrim(v_f->>'hospital_phone'), coalesce(nullif(btrim(coalesce(v_f->>'ambulance_phone', '')), ''), '108'),
          nullif(btrim(coalesce(v_f->>'private_ambulance_phone', '')), ''),
          (v_f->>'someone_home')::boolean, (v_f->>'bp_or_glucometer')::boolean,
          p_source, auth.uid(), now(), auth.uid(), now())
  on conflict (member_id) do update set
    local_contact_name      = excluded.local_contact_name,
    local_contact_relation  = excluded.local_contact_relation,
    local_contact_phone     = excluded.local_contact_phone,
    local_contact_eta       = excluded.local_contact_eta,
    hospital_name           = excluded.hospital_name,
    hospital_phone          = excluded.hospital_phone,
    ambulance_phone         = excluded.ambulance_phone,
    private_ambulance_phone = excluded.private_ambulance_phone,
    someone_home            = excluded.someone_home,
    bp_or_glucometer        = excluded.bp_or_glucometer,
    updated_by              = excluded.updated_by,
    updated_at              = excluded.updated_at;
end $$;

-- ============ the coordinator on a call, or the family on their dashboard ============
create or replace function save_member_safety(p_member uuid, p_fields jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role   user_role := auth_role();
  v_source text;
  v_name   text;
  v_had    boolean;
  v_verb   text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if v_role in ('admin','coordinator') then v_source := 'coordinator_call';
  elsif is_caregiver_of(p_member) then v_source := 'family_form';
  else raise exception 'not_allowed';
  end if;
  select full_name into v_name from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;

  v_had := exists (select 1 from member_safety where member_id = p_member);
  perform _save_safety(p_member, p_fields, v_source);

  if v_source = 'family_form' then
    v_verb := case when v_had then 'updated' else 'added' end;
    perform _notify_roles(array['coordinator']::user_role[], 'safety_family_saved',
      'Emergency details ' || v_verb,
      v_name || '''s family ' || v_verb || ' their emergency & safety details.',
      '/coordinator/members/' || p_member || '#safety',
      'safety_family:' || v_verb || ':' || p_member || ':' || (now() at time zone 'Asia/Kolkata')::date);
  end if;
  perform _audit(auth.uid(), 'member_safety.saved', 'member', p_member,
                 jsonb_build_object('source', v_source, 'first', not v_had));
end $$;

-- ============ the coordinator asks the family ============
create or replace function request_safety_details(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_cg uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if auth_role() not in ('admin','coordinator') then raise exception 'not_allowed'; end if;
  select full_name, caregiver_id into v_name, v_cg from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;
  if exists (select 1 from member_safety where member_id = p_member) then raise exception 'already_filled'; end if;
  if v_cg is null then raise exception 'no_family_login'; end if;

  update members set safety_requested_at = now(), safety_requested_by = auth.uid() where id = p_member;
  perform _notify(v_cg, 'safety_request', 'Add emergency details for ' || split_part(v_name, ' ', 1),
    'So the trainer knows who to call if something happens in a session. It takes about 2 minutes.',
    '/portal?member=' || p_member || '#safety',
    'safety_request:' || p_member || ':' || (now() at time zone 'Asia/Kolkata')::date);
  perform _audit(auth.uid(), 'member_safety.requested', 'member', p_member, null);
end $$;

-- ============ what the trainer and doctor see ============
-- { safety | null, address, pin_code, family_contact {name, phone},
--   health {conditions, medications, latest_doctor_report {id, created_at} | null} | null,
--   hold {since, open_count, detail, reported_by_name} | null }
-- health is left out for the coordinator (§3: no health answers).
create or replace function emergency_card(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_role   user_role := auth_role();
  v_safety jsonb;
  v_c      member_contacts%rowtype;
  v_ans    jsonb;
  v_health jsonb;
  v_hold   jsonb;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if not (v_role in ('admin','coordinator')
          or (v_role in ('trainer','doctor') and is_assigned_to(p_member))) then
    raise exception 'not_allowed';
  end if;

  select to_jsonb(s) - 'member_id' - 'consent_recorded_by' - 'updated_by' into v_safety
    from member_safety s where s.member_id = p_member;
  select * into v_c from member_contacts where member_id = p_member;

  if v_role <> 'coordinator' then
    select fr.answers into v_ans
      from form_responses fr join form_templates t on t.id = fr.template_id
     where fr.member_id = p_member and t.key = 'onboarding' and fr.submitted_at is not null
     order by fr.submitted_at desc limit 1;
    v_health := jsonb_build_object(
      'conditions',  coalesce(v_ans->'conditions', '[]'::jsonb),
      'medications', coalesce(v_ans->'medications', '[]'::jsonb),
      'latest_doctor_report',
        (select jsonb_build_object('id', r.id, 'created_at', r.created_at)
           from reports r
          where r.member_id = p_member and r.type in ('doctor_initial','doctor_review')
          order by r.created_at desc limit 1));
  end if;

  select jsonb_build_object(
           'since',            min(e.occurred_at),
           'open_count',       count(*),
           'detail',           (array_agg(e.detail order by e.occurred_at desc))[1],
           'reported_by_name', (array_agg(p.full_name order by e.occurred_at desc))[1])
    into v_hold
    from safety_events e left join profiles p on p.id = e.reported_by
   where e.member_id = p_member and e.kind = 'incident' and e.cleared_at is null
  having count(*) > 0;

  return jsonb_build_object(
    'safety', v_safety, 'address', v_c.address, 'pin_code', v_c.pin_code,
    'family_contact', jsonb_build_object('name', v_c.emergency_contact_name,
                                         'phone', v_c.emergency_contact_phone),
    'health', v_health, 'hold', v_hold);
end $$;

-- ============ no session today / an incident ============
create or replace function report_safety_event(p_member uuid, p_kind text, p_reasons text[], p_detail text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role    user_role := auth_role();
  v_name    text;
  v_reasons text[] := coalesce(p_reasons, '{}');
  v_detail  text := nullif(btrim(coalesce(p_detail, '')), '');
  v_id      uuid;
  v_why     text;
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if not (v_role in ('admin','coordinator') or (v_role = 'trainer' and is_assigned_to(p_member))) then
    raise exception 'not_allowed';
  end if;
  select full_name into v_name from members where id = p_member;
  if v_name is null then raise exception 'not_found'; end if;
  if p_kind is null or p_kind not in ('skipped','incident') then raise exception 'bad_kind'; end if;
  if p_kind = 'skipped' and (cardinality(v_reasons) = 0
     or not v_reasons <@ array['chest_pain','dizziness','breathlessness','high_bp','other']) then
    raise exception 'reasons_required';
  end if;
  if p_kind = 'incident' and v_detail is null then raise exception 'detail_required'; end if;

  insert into safety_events(member_id, kind, reasons, detail, reported_by)
  values (p_member, p_kind, case when p_kind = 'skipped' then v_reasons else '{}' end, v_detail, auth.uid())
  returning id into v_id;

  if p_kind = 'skipped' then
    select string_agg(case r when 'chest_pain' then 'chest pain' when 'high_bp' then 'very high BP'
                             when 'other' then 'feeling unwell' else r end, ', ')
      into v_why from unnest(v_reasons) r;
    perform _notify_roles(array['coordinator']::user_role[], 'safety_skipped',
      'No session today — ' || v_name,
      'Today''s session was called off: ' || v_why || '.',
      '/coordinator/members/' || p_member || '#safety', 'safety:' || v_id);
  else
    perform _notify(a.care_user_id, 'safety_incident', 'Incident during a session — ' || v_name,
      'Sessions are on hold until you clear them. ' || left(v_detail, 300),
      '/clinician/clients/' || p_member, 'safety:' || v_id || ':' || a.care_user_id)
      from assignments a
     where a.member_id = p_member and a.active and a.care_role = 'doctor';
    perform _notify_roles(array['coordinator','admin']::user_role[], 'safety_incident',
      'Incident during a session — ' || v_name,
      'Sessions are on hold until the doctor clears them. ' || left(v_detail, 300),
      '/coordinator/members/' || p_member || '#safety', 'safety:' || v_id);
  end if;
  perform _audit(auth.uid(), 'safety_event.reported', 'member', p_member,
                 jsonb_build_object('event', v_id, 'kind', p_kind));
  return v_id;
end $$;

-- ============ the doctor clears sessions to restart ============
-- Clears every open incident at once; returns how many.
create or replace function clear_safety_hold(p_member uuid, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := auth_role();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
  v_n    int;
  v_key  text := 'safety_cleared:' || gen_random_uuid();
begin
  if v_role is null then raise exception 'not_allowed'; end if;
  if not (v_role = 'admin' or (v_role = 'doctor' and is_assigned_to(p_member))) then
    raise exception 'not_allowed';
  end if;
  if v_note is null then raise exception 'note_required'; end if;
  select full_name into v_name from members where id = p_member;

  update safety_events set cleared_at = now(), cleared_by = auth.uid(), clear_note = v_note
   where member_id = p_member and kind = 'incident' and cleared_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'not_on_hold'; end if;

  perform _notify(a.care_user_id, 'safety_cleared', 'Sessions can restart — ' || v_name,
    'The doctor cleared sessions to restart: ' || left(v_note, 300),
    '/clinician/clients/' || p_member, v_key || ':' || a.care_user_id)
    from assignments a
   where a.member_id = p_member and a.active and a.care_role = 'trainer';
  -- The coordinator hears that sessions may restart, not the doctor's reasoning.
  perform _notify_roles(array['coordinator']::user_role[], 'safety_cleared',
    'Sessions can restart — ' || v_name,
    'The doctor cleared ' || v_name || '''s sessions to restart.',
    '/coordinator/members/' || p_member || '#safety', v_key);
  perform _audit(auth.uid(), 'safety_hold.cleared', 'member', p_member,
                 jsonb_build_object('cleared', v_n, 'note', v_note));
  return v_n;
end $$;

revoke execute on function _save_safety(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function save_member_safety(uuid, jsonb) from public, anon;
grant  execute on function save_member_safety(uuid, jsonb) to authenticated;
revoke execute on function request_safety_details(uuid) from public, anon;
grant  execute on function request_safety_details(uuid) to authenticated;
revoke execute on function emergency_card(uuid) from public, anon;
grant  execute on function emergency_card(uuid) to authenticated;
revoke execute on function report_safety_event(uuid, text, text[], text) from public, anon;
grant  execute on function report_safety_event(uuid, text, text[], text) to authenticated;
revoke execute on function clear_safety_hold(uuid, text) from public, anon;
grant  execute on function clear_safety_hold(uuid, text) to authenticated;
