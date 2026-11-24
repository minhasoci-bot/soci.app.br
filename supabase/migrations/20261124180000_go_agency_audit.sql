-- Log de auditoria da agência fora do documento dela (plano de melhoria P2.5, fatia 2).
-- O app funciona com ou sem esta migração: sem ela as entradas seguem em go_workspaces.state.audit.
-- Depois de aplicar, rode de novo supabase/provision-storage.sql: é ele que dá acesso ao servidor (papel anon + chave).
create table public.go_agency_audit (
  agency text not null,
  id text not null,
  created_at timestamptz not null,
  target text not null default '',
  search text not null default '',
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key (agency, id)
);

create index go_agency_audit_recent on public.go_agency_audit (agency, created_at desc, id desc);
create index go_agency_audit_target on public.go_agency_audit (agency, target, created_at desc, id desc);
create index go_agency_audit_age on public.go_agency_audit (created_at);

-- Sem update: uma entrada gravada não muda. O delete existe só para a limpeza do que passou da retenção.
alter table public.go_agency_audit enable row level security;
revoke all on table public.go_agency_audit from public, anon, authenticated, service_role;
grant select, insert, delete on table public.go_agency_audit to service_role;
