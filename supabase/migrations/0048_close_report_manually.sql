-- PHLOEM migration 0048_close_report_manually.sql — the coordinator closes a
-- "chase the report" item by hand.
--
-- WHY (user request 2026-09-22). A report is chased until the clinician submits it
-- in the dashboard. In practice some arrive another way — a nutrition plan sent to
-- the family on WhatsApp — and some are simply not needed. Neither could ever leave
-- the coordinator's queue, and the daily job kept flagging them as overdue.
--
-- WHAT
--   * consultations.report_status gains 'closed' (0047), with the reason, an
--     optional short note, who closed it and when.
--   * close_report(cons, reason, note): admin or coordinator; only a report that is
--     actually being chased (meeting done, report pending). Everything that chases
--     reports already keys on 'pending', so a closed one leaves the queue, the
--     overdue alerts and the clinician's form without further changes.
--   * 'received_outside' is still a plan: the role counts as started for the monthly
--     cycle (_role_started, 0046), and a doctor's intake received that way starts the
--     program exactly as submitting it would. 'not_needed' only closes the item.

alter table consultations
  add column if not exists report_closed_reason text
    check (report_closed_reason in ('received_outside', 'not_needed')),
  add column if not exists report_closed_note text,
  add column if not exists report_closed_by uuid references profiles(id),
  add column if not exists report_closed_at timestamptz;

create or replace function close_report(p_cons uuid, p_reason text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cons consultations%rowtype; v_pro uuid; v_today date; v_consulted date;
begin
  if auth_role() is null or auth_role() not in ('admin','coordinator') then
    raise exception 'not_allowed';
  end if;
  if p_reason is null or p_reason not in ('received_outside','not_needed') then
    raise exception 'bad_reason';
  end if;

  update consultations
     set report_status        = 'closed',
         report_closed_reason = p_reason,
         report_closed_note   = nullif(left(trim(coalesce(p_note, '')), 200), ''),
         report_closed_by     = auth.uid(),
         report_closed_at     = now()
   where id = p_cons and meeting_status = 'done' and report_status = 'pending'
  returning * into v_cons;
  if not found then raise exception 'report_not_pending'; end if;

  -- A doctor's intake that reached the family another way still starts the program,
  -- from the same date submit_clinical_form would use (0046).
  if v_cons.type = 'doctor' and v_cons.cycle_id is null and p_reason = 'received_outside' then
    v_today := (now() at time zone 'Asia/Kolkata')::date;
    v_consulted := least(coalesce((v_cons.completed_at at time zone 'Asia/Kolkata')::date, v_today), v_today);
    if v_consulted < v_today - 14 then v_consulted := v_today; end if;
    perform _start_program(v_cons.member_id, v_consulted + 1, 'doctor_initial');
  end if;

  -- The clinician's form disappears; tell them why rather than let it vanish.
  select care_user_id into v_pro from assignments
   where member_id = v_cons.member_id and care_role = v_cons.type and active;
  if v_pro is not null then
    perform _notify(v_pro, 'report_closed', 'Report closed by the coordinator',
      case p_reason
        when 'received_outside' then 'Your report reached the family outside the dashboard, so its form is closed.'
        else 'This report is not needed, so its form is closed.' end,
      '/clinician/clients/' || v_cons.member_id, 'repclosed:' || p_cons);
  end if;

  perform _audit(auth.uid(), 'consultation.report_closed', 'consultation', p_cons,
                 jsonb_build_object('reason', p_reason, 'type', v_cons.type,
                                    'initial', v_cons.cycle_id is null,
                                    'has_note', p_note is not null and trim(p_note) <> ''));
end $$;

-- _role_started: reproduced from 0046; the ONLY change is the marked clause.
create or replace function _role_started(p_pkg uuid, p_role care_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from packages p
      join assignments a   on a.member_id = p.member_id and a.care_role = p_role and a.active
      join consultations c on c.member_id = p.member_id and c.type = p_role
     where p.id = p_pkg
       and c.cycle_id is null
       and (c.report_status = 'submitted'
            -- 0048: a plan that reached the family outside the dashboard is still a plan
            or (c.report_status = 'closed' and c.report_closed_reason = 'received_outside'))
       and c.created_at >= p.created_at)
$$;

-- 0033 discipline: nothing inherits PUBLIC.
revoke execute on function close_report(uuid, text, text)   from public, anon;
grant  execute on function close_report(uuid, text, text)   to authenticated;
revoke execute on function _role_started(uuid, care_role)   from public, anon, authenticated;
