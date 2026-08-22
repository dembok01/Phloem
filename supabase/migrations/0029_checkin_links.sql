-- PHLOEM migration 0029_checkin_links.sql — W3.2 of the care-continuum spec.
--
-- The "dynamic link": a coordinator generates a URL, sends it over WhatsApp with
-- the existing wa.me helper, and the family answers five questions without logging
-- in. It exists because the families most worth reaching are exactly the ones who
-- will not log in — the ones the engagement queue has already flagged as quiet.
--
-- This is the only UNAUTHENTICATED WRITE PATH in the product, so it is built to be
-- boring and narrow:
--
--   * RLS is never opened. `anon` gets EXECUTE on precisely two security-definer
--     functions and nothing else — no table privileges, no other RPC (0004 revoked
--     the whole Data API surface from anon, and this migration re-grants only what
--     these two functions need).
--   * The caller never names a member. They present a token; the function resolves
--     the member. There is no parameter that could be tampered into another
--     family's record.
--   * The page shows a FIRST NAME and nothing else. No conditions, no plan, no
--     contact details — a forwarded link must not leak a health record.
--   * Invalid, expired, revoked and already-used-today all return the SAME generic
--     answer, so the endpoint cannot be used to discover which tokens exist.
--   * Links expire (14 days by default), are revocable, are capped at 60 uses, and
--     accept at most one submission per 20 hours.

create table checkin_links (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  token        uuid not null unique default gen_random_uuid(),
  created_by   uuid references profiles(id),
  expires_at   timestamptz not null default now() + interval '14 days',
  revoked_at   timestamptz,
  last_used_at timestamptz,
  uses         int not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_checkin_links_member on checkin_links (member_id, created_at desc);
create index idx_checkin_links_token  on checkin_links (token);

alter table checkin_links enable row level security;

-- Staff manage links; the family never sees the table (they only ever hold a URL).
create policy chk_admin_coord on checkin_links for select
  using (auth_role() in ('admin','coordinator'));
create policy chk_clinician on checkin_links for select
  using (auth_role() in ('doctor','nutritionist','trainer') and is_assigned_to(member_id));

-- The template the responses are stored against. Kept in the repo as
-- supabase/templates/family_checkin.v1.json so a rebuild seeds it too.
insert into form_templates (key, version, schema, active)
values ('family_checkin', 1, '{
 "key": "family_checkin",
 "version": 1,
 "title": "Quick check-in",
 "sections": [
  {
   "id": "s1",
   "title": "How are things going?",
   "fields": [
    {
     "id": "how_is_feeling",
     "type": "scale_1_5",
     "label": "Overall, how has the last week been?",
     "required": true
    },
    {
     "id": "following_plan",
     "type": "select",
     "label": "How is the plan going?",
     "required": true,
     "options": [
      { "value": "well", "label": "Going well" },
      { "value": "mostly", "label": "Mostly, with some gaps" },
      { "value": "struggling", "label": "Struggling to keep up" }
     ]
    },
    {
     "id": "concerns",
     "type": "textarea",
     "label": "Anything worrying you?",
     "hint": "Symptoms, side effects, anything that has changed"
    },
    {
     "id": "question",
     "type": "textarea",
     "label": "Any question for the care team?"
    },
    {
     "id": "needs_call",
     "type": "boolean",
     "label": "Would you like someone to call you?"
    }
   ]
  }
 ]
}
'::jsonb, true)
on conflict (key, version) do update set schema = excluded.schema, active = true;

-- ============ staff side ============

create or replace function create_checkin_link(p_member uuid, p_days int default 14)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  if not (auth_role() in ('admin','coordinator') or is_assigned_to(p_member)) then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from members where id = p_member) then raise exception 'not_found'; end if;

  -- Reuse a live link rather than minting a second one: two valid URLs for the
  -- same family is a support problem, not a feature.
  select token into v_token from checkin_links
   where member_id = p_member and revoked_at is null and expires_at > now()
   order by created_at desc limit 1;
  if v_token is not null then return v_token; end if;

  insert into checkin_links(member_id, created_by, expires_at)
  values (p_member, auth.uid(), now() + make_interval(days => greatest(1, least(coalesce(p_days, 14), 60))))
  returning token into v_token;

  perform _audit(auth.uid(), 'checkin_link.created', 'member', p_member, '{}'::jsonb);
  return v_token;
end $$;

create or replace function revoke_checkin_link(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_member uuid;
begin
  if auth_role() is null then raise exception 'not_allowed'; end if;
  select member_id into v_member from checkin_links where token = p_token;
  if v_member is null then raise exception 'not_found'; end if;
  if not (auth_role() in ('admin','coordinator') or is_assigned_to(v_member)) then
    raise exception 'not_allowed';
  end if;
  update checkin_links set revoked_at = now() where token = p_token and revoked_at is null;
  perform _audit(auth.uid(), 'checkin_link.revoked', 'member', v_member, '{}'::jsonb);
end $$;

-- ============ public side (anon) ============

-- What the check-in page may render. Returns a first name or nothing at all; every
-- failure mode looks identical from outside.
create or replace function get_checkin_link(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_link checkin_links%rowtype; v_name text;
begin
  select * into v_link from checkin_links where token = p_token;
  if not found or v_link.revoked_at is not null or v_link.expires_at <= now()
     or v_link.uses >= 60 then
    return jsonb_build_object('ok', false);
  end if;
  select split_part(full_name, ' ', 1) into v_name from members where id = v_link.member_id;
  return jsonb_build_object(
    'ok', true,
    'first_name', coalesce(v_name, 'your parent'),
    -- so the page can say "you already answered today" instead of silently failing
    'answered_today', coalesce(v_link.last_used_at > now() - interval '20 hours', false)
  );
end $$;

-- Accept one check-in. Writes the response, records the activity that clears the
-- family's "quiet" flag, and escalates anything that reads as a concern.
create or replace function submit_checkin(p_token uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link checkin_links%rowtype; v_tmpl uuid; v_resp uuid;
  v_name text; v_concern boolean; v_doctor uuid;
begin
  select * into v_link from checkin_links where token = p_token for update;
  if not found or v_link.revoked_at is not null or v_link.expires_at <= now()
     or v_link.uses >= 60 then
    return jsonb_build_object('ok', false);
  end if;
  if v_link.last_used_at is not null and v_link.last_used_at > now() - interval '20 hours' then
    return jsonb_build_object('ok', false, 'reason', 'already_today');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('ok', false);
  end if;

  select id into v_tmpl from form_templates where key = 'family_checkin' and active
   order by version desc limit 1;
  if v_tmpl is null then return jsonb_build_object('ok', false); end if;

  insert into form_responses(member_id, template_id, respondent_id, answers, submitted_at)
  values (v_link.member_id, v_tmpl, null, p_answers, now())
  returning id into v_resp;

  -- Anonymous, but unmistakably the family: actor_id NULL counts as family
  -- activity in _last_family_activity, which is what lifts the quiet flag.
  insert into activity_events(member_id, actor_id, kind, meta)
  values (v_link.member_id, null, 'checkin_response', jsonb_build_object('response_id', v_resp));

  update checkin_links
     set uses = uses + 1, last_used_at = now()
   where id = v_link.id;

  select full_name into v_name from members where id = v_link.member_id;

  v_concern := coalesce((p_answers->>'needs_call') = 'true', false)
            or coalesce(nullif(trim(p_answers->>'concerns'), ''), '') <> ''
            or coalesce(nullif(trim(p_answers->>'question'), ''), '') <> ''
            or coalesce(p_answers->>'following_plan', '') = 'struggling'
            or coalesce((p_answers->>'how_is_feeling')::int <= 2, false);

  perform _notify_roles(array['coordinator']::user_role[], 'checkin_response',
    'Check-in from ' || coalesce(v_name, 'a family') ||
      case when v_concern then ' — needs a look' else '' end,
    coalesce(nullif(trim(p_answers->>'concerns'), ''),
             nullif(trim(p_answers->>'question'), ''),
             'The family answered the check-in.'),
    '/coordinator/members/' || v_link.member_id,
    'checkin:' || v_resp);

  if v_concern then
    select care_user_id into v_doctor from assignments
     where member_id = v_link.member_id and care_role = 'doctor' and active;
    if v_doctor is not null then
      perform _notify(v_doctor, 'checkin_concern',
        'Check-in flagged — ' || coalesce(v_name, 'a member'),
        coalesce(nullif(trim(p_answers->>'concerns'), ''), 'The family asked for a call.'),
        '/clinician/clients/' || v_link.member_id, 'checkinflag:' || v_resp);
    end if;
  end if;

  perform _audit(null, 'checkin.submitted', 'member', v_link.member_id,
                 jsonb_build_object('response_id', v_resp, 'concern', v_concern));
  return jsonb_build_object('ok', true, 'concern', v_concern);
end $$;

-- ============ grants ============
-- 0004 revoked the entire public schema from anon. Re-grant the minimum: USAGE on
-- the schema (needed to reference anything at all) plus EXECUTE on exactly these
-- two functions. No table privileges are restored, and RLS still covers every
-- table, so a compromised anon key still reaches nothing but these two guarded
-- entry points.
grant usage on schema public to anon;

revoke execute on function create_checkin_link(uuid, int) from public;
revoke execute on function revoke_checkin_link(uuid) from public;
revoke execute on function get_checkin_link(uuid) from public;
revoke execute on function submit_checkin(uuid, jsonb) from public;

grant execute on function create_checkin_link(uuid, int) to authenticated;
grant execute on function revoke_checkin_link(uuid) to authenticated;
grant execute on function get_checkin_link(uuid) to anon, authenticated;
grant execute on function submit_checkin(uuid, jsonb) to anon, authenticated;
