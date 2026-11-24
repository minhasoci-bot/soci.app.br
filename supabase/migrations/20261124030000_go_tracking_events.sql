-- Eventos do rastreamento externo fora do documento da subconta (plano de melhoria P2.5).
-- O app funciona com ou sem esta migração: sem ela os eventos seguem em go_workspaces.state.trackingEvents.
-- Depois de aplicar, rode de novo supabase/provision-storage.sql: é ele que dá acesso ao servidor (papel anon + chave).
create table public.go_tracking_events (
  workspace text not null,
  id text not null,
  created_at timestamptz not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  type text generated always as (data ->> 'type') stored,
  contact_id text generated always as (nullif(data ->> 'contactId', '')) stored,
  primary key (workspace, id)
);

create index go_tracking_events_recent on public.go_tracking_events (workspace, created_at desc, id desc);
create index go_tracking_events_age on public.go_tracking_events (created_at);

alter table public.go_tracking_events enable row level security;
revoke all on table public.go_tracking_events from public, anon, authenticated, service_role;
grant select, insert, delete on table public.go_tracking_events to service_role;

-- Números da tela de rastreamento. Roda com o acesso de quem chama (as políticas da tabela continuam valendo).
create function public.go_tracking_summary(p_workspace text, p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'last', (select e.data - 'fields' - 'formKey' from public.go_tracking_events e
      where e.workspace = p_workspace order by e.created_at desc, e.id desc limit 1),
    'views', count(*) filter (where r.type = 'pageview'),
    'forms', count(*) filter (where r.type = 'form'),
    'known', count(distinct r.contact_id),
    'visitors', count(distinct r.data ->> 'vid'),
    'byForm', (select coalesce(jsonb_agg(to_jsonb(f) order by f.last desc, f.name), '[]'::jsonb) from (
      select e.data ->> 'formKey' as name,
        (array_agg(e.data ->> 'url' order by e.created_at desc, e.id desc))[1] as url,
        count(*) as total,
        count(distinct e.contact_id) as contacts,
        max(e.data ->> 'created') as last
      from public.go_tracking_events e
      where e.workspace = p_workspace and e.type = 'form'
      group by 1
      order by last desc, name
      limit 200
    ) f)
  )
  from public.go_tracking_events r
  where r.workspace = p_workspace and r.created_at >= p_since;
$$;

revoke all on function public.go_tracking_summary(text, timestamptz) from public, anon, authenticated;
grant execute on function public.go_tracking_summary(text, timestamptz) to service_role;
