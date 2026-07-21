alter table public.incidents
  add constraint incidents_status_check
  check (status in ('draft', 'active', 'closed'));
