-- Livro da cobrança: cada fato de dinheiro entra uma vez (key) e não muda. Correção é outro lançamento.
-- A política de acesso fica em provision-storage.sql (a mesma chave de servidor de go_workspaces).
create table public.go_billing_ledger (
  key text primary key,
  layer text not null check (layer in ('platform', 'agency', 'account')),
  agency_id text not null,
  workspace_id text,
  kind text not null check (kind in ('sale', 'manual_sale', 'refund', 'dispute_opened', 'dispute_won', 'dispute_lost', 'adjustment',
    'plan_payment', 'wallet_topup', 'wallet_credit', 'wallet_debit', 'wallet_usage')),
  amount_cents bigint not null,
  fee_cents bigint,
  usage_micros bigint,
  method text not null default '',
  provider text not null default '',
  provider_ref text not null default '',
  source jsonb not null default '{}'::jsonb,
  seller jsonb not null default '{}'::jsonb,
  payer jsonb not null default '{}'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create index go_billing_ledger_agency on public.go_billing_ledger (agency_id, layer, occurred_at desc, key desc);
create index go_billing_ledger_workspace on public.go_billing_ledger (workspace_id, layer, occurred_at desc, key desc);

create function public.go_billing_ledger_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'livro imutável';
end;
$$;

create trigger go_billing_ledger_no_change before update or delete on public.go_billing_ledger
  for each row execute function public.go_billing_ledger_immutable();
create trigger go_billing_ledger_no_truncate before truncate on public.go_billing_ledger
  for each statement execute function public.go_billing_ledger_immutable();

alter table public.go_billing_ledger enable row level security;
revoke all on table public.go_billing_ledger from public, anon, authenticated, service_role;
grant select, insert on table public.go_billing_ledger to anon;
grant select, insert on table public.go_billing_ledger to service_role;
