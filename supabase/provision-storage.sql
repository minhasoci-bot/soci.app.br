-- Replace GO_STORAGE_KEY_SHA256 below with the hexadecimal SHA-256 of the
-- server's random 32-byte GO_STORAGE_KEY as stored in .env.local.
-- Apply after the storage migrations (go_workspaces and go_tracking_events). Reapply with a new hash to rotate the key.
begin;

grant select, insert, update on table public.go_workspaces to anon;
drop policy if exists go_storage_read on public.go_workspaces;
drop policy if exists go_storage_insert on public.go_workspaces;
drop policy if exists go_storage_update on public.go_workspaces;

create policy go_storage_read on public.go_workspaces for select to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_storage_insert on public.go_workspaces for insert to anon
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_storage_update on public.go_workspaces for update to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'))
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

-- Eventos do rastreamento (migração 20261124030000_go_tracking_events.sql).
grant select, insert, delete on table public.go_tracking_events to anon;
grant execute on function public.go_tracking_summary(text, timestamptz) to anon;
drop policy if exists go_tracking_read on public.go_tracking_events;
drop policy if exists go_tracking_insert on public.go_tracking_events;
drop policy if exists go_tracking_delete on public.go_tracking_events;

create policy go_tracking_read on public.go_tracking_events for select to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_tracking_insert on public.go_tracking_events for insert to anon
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_tracking_delete on public.go_tracking_events for delete to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

commit;
