-- PHLOEM migration 0013_report_view_receipts.sql
-- DESIGN-PROPOSALS P-5 — read receipts on shared plans.
--
-- `log_report_view` (0003) already audits every open as a `report.viewed` row in
-- audit_log (actor + report + timestamp). The data exists; only its exposure was a
-- pending privacy decision. Decision taken here, scoped deliberately narrow:
--   • surfaced ONLY to admin and to the clinician who AUTHORED the report
--     (`created_by = auth.uid()`) — "did the family open the plan I wrote";
--   • counts ONLY family-side views (caregiver / member logins), never other
--     staff, so it never reveals colleagues' activity;
--   • returns just the latest view per report — a receipt, not a browsing history.
-- audit_log RLS is admin-only, so this security-definer RPC is the sole read path.

create or replace function get_report_view_receipts(p_member uuid)
returns table(report_id uuid, last_viewed_at timestamptz, viewer_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (auth_role() = 'admin'
          or (auth_role() in ('doctor','nutritionist','trainer','psychologist')
              and is_assigned_to(p_member))) then
    raise exception 'not_allowed';
  end if;
  return query
    select distinct on (r.id) r.id, a.created_at, p.full_name
      from reports r
      join audit_log a
        on a.entity_type = 'report' and a.entity_id = r.id and a.action = 'report.viewed'
      join profiles p
        on p.id = a.actor_id and p.role in ('caregiver','member')
     where r.member_id = p_member
       and (auth_role() = 'admin' or r.created_by = auth.uid())
     order by r.id, a.created_at desc;
end $$;

revoke execute on function get_report_view_receipts(uuid) from public, anon;
