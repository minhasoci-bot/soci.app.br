create table public.go_workspaces (
  id text primary key,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision uuid not null default gen_random_uuid(),
  name text generated always as (state #>> '{profile,name}') stored not null,
  created_at timestamptz not null default now()
);

alter table public.go_workspaces enable row level security;
revoke all on table public.go_workspaces from public, anon, authenticated, service_role;
grant select, insert, update on table public.go_workspaces to service_role;
