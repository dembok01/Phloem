-- PHLOEM migration 0010_report_sharing_rpc.sql
-- DESIGN-PROPOSALS P-1 / CODE-REVIEW H-3 — the share-with-caregiver control.
--
-- The `reports.share_with_caregiver` column and the caregiver read policy
-- (`rep_cg`, 0002_rls.sql) that gates doctor/performance reports on it have
-- existed since 0001, but nothing ever flipped the flag, so the §3 caregiver
-- "🔸 if share_with_caregiver" branch was unreachable. Clinicians deliberately
-- have NO update policy on `reports` (immutability), so the toggle must be an
-- audited security-definer RPC (§0.4 — all state transitions go through §6).
--
-- Admin-only per §3 ("Assign … / share_with_caregiver toggles" sit with admin on
-- the member page, §10). Only the three report types the matrix marks caregiver-
-- conditional are shareable; the plan/summary types are always caregiver-visible
-- and the wellbeing/psych types must never be, so both are rejected here.

create or replace function set_report_sharing(p_report uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_type report_type; v_member uuid;
begin
  if auth_role() <> 'admin' then raise exception 'not_allowed'; end if;
  select type, member_id into v_type, v_member from reports where id = p_report;
  if not found then raise exception 'not_found'; end if;
  if v_type not in ('doctor_initial','doctor_review','performance') then
    raise exception 'not_shareable';
  end if;
  update reports set share_with_caregiver = p_shared where id = p_report;
  perform _audit(auth.uid(), 'report.sharing_set', 'report', p_report,
                 jsonb_build_object('shared', p_shared, 'member_id', v_member));
end $$;

-- Authenticated-facing (the calling admin is `authenticated`; the RPC validates
-- the caller). Drop anon/public, consistent with 0003/0004/0005.
revoke execute on function set_report_sharing(uuid, boolean) from public, anon;
