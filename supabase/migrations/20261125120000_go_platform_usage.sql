-- Página Plataforma (admin geral): o uso do projeto contra os limites do plano.
-- Devolve o tamanho do banco, a soma dos arquivos do Storage e os usuários com login no mês.
-- Roda como dono (security definer) porque storage.objects e auth.users não são legíveis pelo anon,
-- e por isso só responde a quem manda a chave de armazenamento do servidor (o mesmo teste das policies).
-- Troque GO_STORAGE_KEY_SHA256 pelo SHA-256 em hexadecimal da GO_STORAGE_KEY, como no provision-storage.sql.
create or replace function public.go_platform_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') <> 'GO_STORAGE_KEY_SHA256' then
    raise exception 'not allowed';
  end if;
  return jsonb_build_object(
    'db_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'storage_bytes', coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0),
    'mau', (select count(*) from auth.users u where u.last_sign_in_at >= pg_catalog.date_trunc('month', pg_catalog.now()))
  );
end;
$$;

revoke all on function public.go_platform_usage() from public, anon, authenticated;
grant execute on function public.go_platform_usage() to anon;
