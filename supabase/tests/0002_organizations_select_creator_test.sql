-- Regression test for the widened organizations SELECT policy.
--
-- The app's createOrganization does insert().select().single(), which compiles
-- to INSERT ... RETURNING. Postgres applies the SELECT policy to the RETURNING
-- row. Under the original membership-only policy that read-back failed with a
-- misleading 42501, because the owner-membership row written by the
-- on_organization_created AFTER INSERT trigger isn't visible to the read-back
-- yet. The widened policy (… OR created_by = auth.uid()) lets the creator read
-- their own org row, so the read-back succeeds.
--
-- Modeled on 0001_tenant_isolation_test.sql: same pgTAP setup, same "act as a
-- user via jwt claims" idiom, single transaction rolled back at the end.

create extension if not exists pgtap with schema extensions;

begin;

-- Fixtures: a creator (User D) and an unrelated user (User E). The auth.users
-- trigger auto-creates their profiles. No org is pre-created — User D creates
-- one through the same INSERT ... RETURNING path the app uses.
insert into auth.users (id, email)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'user-d@example.test'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'user-e@example.test');

select plan(4);

-- ---------------------------------------------------------------------------
-- The regression: creator reads back their own org from INSERT ... RETURNING —
-- the exact call the app makes. The SELECT policy is applied to the RETURNING
-- row; under the old membership-only policy that read-back throws 42501, so the
-- statement raises. lives_ok asserts it runs cleanly under the widened policy.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';

select lives_ok(
  $$ insert into public.organizations (id, name, created_by)
     values (
       'd0000000-0000-0000-0000-000000000000',
       'Org D',
       'dddddddd-dddd-dddd-dddd-dddddddddddd'
     )
     returning id $$,
  'creator reads their own org back from INSERT ... RETURNING (widened SELECT policy)'
);

-- And the creator can subsequently SELECT that org row directly.
select is(
  (select count(*)::int from public.organizations
   where id = 'd0000000-0000-0000-0000-000000000000'),
  1,
  'creator can SELECT their own org row (created_by branch of the policy)'
);

-- ---------------------------------------------------------------------------
-- No isolation regression: a user who neither created nor belongs to the org
-- still cannot see it.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';

select is(
  (select count(*)::int from public.organizations
   where id = 'd0000000-0000-0000-0000-000000000000'),
  0,
  'unrelated user (neither creator nor member) cannot select the org'
);

-- ---------------------------------------------------------------------------
-- End-to-end sanity (as superuser): the insert really happened and the
-- AFTER INSERT trigger made the creator the owner.
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select role from public.org_members
   where org_id = 'd0000000-0000-0000-0000-000000000000'
     and user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'owner',
  'on_organization_created made the creator the owner of the new org'
);

select * from finish();
rollback;
