-- Fix: organizations insert().select() failed with 42501 because
-- INSERT ... RETURNING applies the SELECT policy to the new row, but the
-- owner-membership written by the on_organization_created AFTER INSERT
-- trigger isn't visible to that read-back yet. Widen SELECT so the creator
-- can always read their own org row.
--
-- Trade-off (recorded, acceptable for now): a user removed from an org they
-- created could still read that org's row via created_by. Revisit when
-- membership revocation / role management lands. created_by only ever
-- matches the caller's own rows, so no other tenant's org is exposed.

drop policy if exists "organizations_select_member" on public.organizations;

create policy "organizations_select_member"
  on public.organizations
  for select
  to authenticated
  using (
    public.is_org_member(id)
    or created_by = (select auth.uid())
  );
