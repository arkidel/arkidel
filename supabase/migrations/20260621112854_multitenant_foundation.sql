-- Multi-tenant database foundation for Arkidel.
--
-- Org-based tenancy: every user has a profile; organizations are tenants;
-- org_members is the link that scopes a user to an organization with a role.
--
-- Security posture: RLS is enabled on every table and is DEFAULT-DENY — there
-- is no `using (true)` anywhere. Each operation has its own policy, and every
-- write carries a WITH CHECK so a row can never be written into a tenant the
-- caller is not an admin of. Table grants go to `authenticated` only, never
-- `anon`; RLS then gates which rows/operations are actually permitted.
--
-- Two classic footguns are handled explicitly:
--   1. RLS recursion — membership checks used inside org_members /
--      organizations policies run through SECURITY DEFINER helpers that bypass
--      RLS on org_members, so a policy never re-triggers itself.
--   2. Org-creation bootstrap — the creator's first membership is written by an
--      AFTER INSERT trigger (SECURITY DEFINER), not an org_members INSERT
--      policy, avoiding the chicken-and-egg where you must already be a member
--      to add the first member.

-- ============================================================================
-- Tables
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ============================================================================
-- SECURITY DEFINER membership helpers (anti-recursion)
-- ============================================================================
-- These run as the function owner (the migration role), which is the table
-- owner and therefore bypasses RLS on org_members. That is what lets the
-- org_members / organizations policies ask "is the caller a member/admin?"
-- without the membership lookup re-triggering org_members RLS and recursing.
--
-- STABLE: result is constant within a statement. SECURITY DEFINER: bypass RLS.
-- SET search_path = '': no schema is implicitly trusted, so every reference is
-- fully qualified (this is required for SECURITY DEFINER hardening).
--
-- NOTE: org_members must NOT use FORCE ROW LEVEL SECURITY — forcing RLS would
-- subject these owner-run helpers to RLS too, reintroducing the recursion.

create function public.is_org_member(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = _org_id
      and user_id = (select auth.uid())
  );
$$;

create function public.is_org_admin(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = _org_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

-- Default-deny on the helpers too: revoke the implicit PUBLIC execute, then
-- grant only to authenticated. anon can never call them.
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- ============================================================================
-- Profile auto-creation: one profile per auth user
-- ============================================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Org-creation bootstrap: creator becomes the first owner
-- ============================================================================
-- Runs as SECURITY DEFINER so the first org_members row is written by the
-- trigger, not by an org_members INSERT policy. This breaks the chicken-and-egg
-- (you'd otherwise need to be a member to insert the first member).

create function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_members (org_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

revoke all on function public.handle_new_organization() from public;

create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- ============================================================================
-- Row Level Security — enable + default-deny
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;

-- ---- profiles: a user sees and edits only their own profile -----------------
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- (No profiles INSERT/DELETE policy: inserts come from the SECURITY DEFINER
--  trigger, and deletes cascade from auth.users. Anything else is denied.)

-- ---- organizations ----------------------------------------------------------
create policy "organizations_select_member"
  on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

create policy "organizations_insert_creator"
  on public.organizations
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "organizations_update_admin"
  on public.organizations
  for update
  to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy "organizations_delete_admin"
  on public.organizations
  for delete
  to authenticated
  using (public.is_org_admin(id));

-- ---- org_members: members can read the roster; admins manage it -------------
create policy "org_members_select_member"
  on public.org_members
  for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "org_members_insert_admin"
  on public.org_members
  for insert
  to authenticated
  with check (public.is_org_admin(org_id));

create policy "org_members_update_admin"
  on public.org_members
  for update
  to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

create policy "org_members_delete_admin"
  on public.org_members
  for delete
  to authenticated
  using (public.is_org_admin(org_id));

-- ============================================================================
-- Grants — Data API exposure is to authenticated ONLY (never anon)
-- ============================================================================
-- This project has auto-expose OFF, so without explicit grants the Data API
-- returns nothing even with policies present. RLS still gates which rows and
-- operations are actually allowed; these grants only open the door for the
-- authenticated role to reach the tables at all.

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.org_members to authenticated;
