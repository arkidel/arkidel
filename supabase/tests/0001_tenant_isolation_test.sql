-- Tenant-isolation tests for the multi-tenant foundation (pgTAP).
--
-- These are the security proof for the migration: default-deny RLS, per-tenant
-- visibility, WITH CHECK on writes, and admin-only management. They run inside a
-- single transaction that is rolled back at the end (no state persists).
--
-- Test users (fixed UUIDs so assertions can reference them):
--   User A  = org 1 owner
--   User B  = org 2 owner
--   User C  = org 1 plain member (for the admin-only checks)
--
-- Acting "as" a user means setting the role to `authenticated` and supplying a
-- JWT claims blob whose `sub` is that user's id; auth.uid() reads it. Resetting
-- the role returns to the superuser session, which bypasses RLS — used for
-- out-of-band assertions about what actually landed in the tables.

-- pgTAP is a test-only dependency, so it lives here rather than in a migration.
-- `supabase db reset` rebuilds the database from migrations alone, so each test
-- run re-enables it. (extensions is on the search_path, so calls stay unqualified.)
create extension if not exists pgtap with schema extensions;

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (created as superuser; the auth.users and organizations triggers
-- fire to auto-create profiles and the owner memberships).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user-b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'user-c@example.test');

insert into public.organizations (id, name, created_by)
values
  ('11111111-1111-1111-1111-111111111111', 'Org One', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'Org Two', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- User C joins org 1 as a plain member (inserted directly as superuser).
insert into public.org_members (org_id, user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member');

select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures wired up correctly (sanity, as superuser / RLS-bypassing)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.profiles),
  3,
  'handle_new_user created a profile for each of the 3 auth users'
);
select is(
  (select role from public.org_members
   where org_id = '11111111-1111-1111-1111-111111111111'
     and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'owner',
  'handle_new_organization made the creator (User A) the owner of org 1'
);

-- ===========================================================================
-- anon: no data reaches the unauthenticated role
-- ===========================================================================
-- Grants go to `authenticated` only, never `anon`, so anon has no SELECT
-- privilege on any of the three tables. The result is a privilege-layer denial
-- (SQLSTATE 42501) — strictly stronger than "zero rows": anon cannot read the
-- tables at all, RLS never even gets a chance to filter.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select * from public.profiles $$,
  '42501', null,
  'anon cannot read profiles (no grant to anon)'
);
select throws_ok(
  $$ select * from public.organizations $$,
  '42501', null,
  'anon cannot read organizations (no grant to anon)'
);
select throws_ok(
  $$ select * from public.org_members $$,
  '42501', null,
  'anon cannot read org_members (no grant to anon)'
);
reset role;

-- ===========================================================================
-- User A (org 1): sees only org 1, own profile, org 1 roster
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles),
  1,
  'User A sees exactly 1 profile (their own)'
);
select is(
  (select id from public.profiles),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'User A: the one visible profile is their own'
);
select is(
  (select count(*)::int from public.organizations),
  1,
  'User A sees exactly 1 organization'
);
select is(
  (select name from public.organizations),
  'Org One',
  'User A: the one visible organization is org 1'
);
select is(
  (select count(*)::int from public.organizations
   where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'User A: cross-tenant SELECT of org 2 returns zero rows (not an error)'
);
select is(
  (select count(*)::int from public.org_members),
  2,
  'User A sees the full org 1 roster (owner A + member C), and nothing else'
);
select is(
  (select count(*)::int from public.org_members
   where org_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'User A: cross-tenant SELECT of org 2 members returns zero rows (not an error)'
);

-- WITH CHECK on writes: User A cannot write into org 2 ----------------------
select throws_ok(
  $$ insert into public.org_members (org_id, user_id, role)
     values ('22222222-2222-2222-2222-222222222222',
             'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member') $$,
  '42501',
  null,
  'User A cannot INSERT a membership into org 2 (WITH CHECK is_org_admin denies)'
);
select throws_ok(
  $$ insert into public.organizations (name, created_by)
     values ('Spoofed', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '42501',
  null,
  'User A cannot INSERT an organization created_by someone else (WITH CHECK)'
);
select throws_ok(
  $$ update public.org_members
       set org_id = '22222222-2222-2222-2222-222222222222'
     where org_id = '11111111-1111-1111-1111-111111111111'
       and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  '42501',
  null,
  'User A cannot UPDATE a row to move it into org 2 (WITH CHECK denies)'
);

-- ===========================================================================
-- User B (org 2): symmetric — sees only org 2
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(
  (select count(*)::int from public.organizations),
  1,
  'User B sees exactly 1 organization'
);
select is(
  (select name from public.organizations),
  'Org Two',
  'User B: the one visible organization is org 2'
);
select is(
  (select count(*)::int from public.organizations
   where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'User B: cross-tenant SELECT of org 1 returns zero rows (not an error)'
);
select is(
  (select count(*)::int from public.org_members),
  1,
  'User B sees only the org 2 roster (owner B)'
);
select is(
  (select count(*)::int from public.profiles
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'User B cannot see User A''s profile'
);

-- ===========================================================================
-- User C (plain 'member' of org 1): admin-only management is denied
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

-- Positive control: a member CAN read their org and roster.
select is(
  (select count(*)::int from public.organizations),
  1,
  'Member C can SELECT their own org (membership read works)'
);
select is(
  (select count(*)::int from public.org_members),
  2,
  'Member C can read the full org 1 roster'
);

-- Member's writes are no-ops (USING filters the row out) or throw (WITH CHECK).
update public.organizations set name = 'HACKED'
 where id = '11111111-1111-1111-1111-111111111111';
update public.org_members set role = 'admin'
 where org_id = '11111111-1111-1111-1111-111111111111'
   and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
delete from public.organizations
 where id = '11111111-1111-1111-1111-111111111111';

select throws_ok(
  $$ insert into public.org_members (org_id, user_id, role)
     values ('11111111-1111-1111-1111-111111111111',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member') $$,
  '42501',
  null,
  'Member C cannot INSERT a new membership (admin-only, WITH CHECK denies)'
);

-- Confirm the member's update/delete attempts changed nothing (as superuser).
reset role;
select is(
  (select name from public.organizations
   where id = '11111111-1111-1111-1111-111111111111'),
  'Org One',
  'Member C UPDATE on the org was a no-op (name unchanged)'
);
select is(
  (select role from public.org_members
   where org_id = '11111111-1111-1111-1111-111111111111'
     and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'member',
  'Member C could not escalate their own role to admin'
);
select is(
  (select count(*)::int from public.organizations
   where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'Member C DELETE on the org was a no-op (org still present)'
);

select * from finish();
rollback;
