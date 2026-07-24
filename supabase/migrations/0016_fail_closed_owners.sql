-- PHLOEM migration 0016_fail_closed_owners.sql — S-2/S-3/S-4 (CODE-REVIEW.md):
-- extend the auth_role() fail-closed discipline (0002) to caregiver ownership
-- and to the two owned-row policies that bypassed it. After this migration,
-- "suspend = instant lockout" is true for every persona, matching the
-- is_member_self pattern introduced in 0008.
-- (Blueprint numbered this 0011; it lands as 0016 — see the plan's Divergences.)

-- S-2: is_caregiver_of now requires an ACTIVE caregiver-role profile.
-- auth_role() returns NULL for suspended accounts ⇒ fails closed.
create or replace function is_caregiver_of(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'caregiver'
     and exists (select 1 from members where id = m and caregiver_id = auth.uid())
$$;

-- S-2: the one policy that used the raw column instead of the helper.
drop policy mem_caregiver on members;
create policy mem_caregiver on members for select using (is_caregiver_of(id));

-- S-3: clinicians' own-draft policy — status-aware, and WITH CHECK so a row
-- can only be created/moved onto (respondent = self AND assigned member).
drop policy fr_own_clinical on form_responses;
create policy fr_own_clinical on form_responses for all
  using (auth_role() is not null and respondent_id = auth.uid())
  with check (auth_role() is not null and respondent_id = auth.uid()
              and is_assigned_to(member_id));

-- S-4: notifications — suspended users can no longer read or mark their rows.
drop policy notif_own on notifications;
create policy notif_own on notifications for all
  using (auth_role() is not null and user_id = auth.uid())
  with check (auth_role() is not null and user_id = auth.uid());
