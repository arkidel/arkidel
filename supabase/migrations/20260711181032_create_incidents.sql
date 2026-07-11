-- Incidents: org-scoped persistence for Respond.
--
-- Follows the multitenant-foundation conventions: default-deny RLS with
-- per-operation policies, membership checks via the SECURITY DEFINER helper
-- public.is_org_member (anti-recursion), writes carry WITH CHECK, and an
-- explicit grant to authenticated (this project has Data API auto-expose OFF).
--
-- created_by is nullable with ON DELETE SET NULL so future account deletion
-- (e.g. Art. 17 erasure) does not orphan-block org work product; the insert
-- policy still requires created_by = auth.uid() at creation time.

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null default 'Untitled incident',
  status text not null default 'draft',
  payload jsonb not null,
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create extension if not exists moddatetime with schema extensions;

create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function extensions.moddatetime (updated_at);

create index incidents_org_id_updated_at_idx
  on public.incidents (org_id, updated_at desc);

alter table public.incidents enable row level security;

create policy "incidents_select_member"
  on public.incidents
  for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "incidents_insert_member"
  on public.incidents
  for insert
  to authenticated
  with check (
    public.is_org_member(org_id)
    and created_by = (select auth.uid())
  );

create policy "incidents_update_member"
  on public.incidents
  for update
  to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy "incidents_delete_member"
  on public.incidents
  for delete
  to authenticated
  using (public.is_org_member(org_id));

grant select, insert, update, delete on public.incidents to authenticated;
