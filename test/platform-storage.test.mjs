import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSqliteStore, createSupabaseStore, isDocument } from '../storage.mjs';

test('a linha platform-usage é um documento, não um workspace', () => {
  assert.equal(isDocument('platform-usage'), true);
});

test('SQLite: platformUsage mede o arquivo do banco e não tem storage nem usuários ativos', async () => {
  const store = createSqliteStore(':memory:');
  const usage = await store.platformUsage();
  assert.ok(usage.db_bytes > 0);
  assert.equal(usage.storage_bytes, 0);
  assert.equal(usage.mau, null);
});

test('Supabase: platformUsage chama a RPC go_platform_usage com a chave de armazenamento', async () => {
  const seen = [];
  const store = createSupabaseStore({ projectUrl: 'https://abc.supabase.co', publishableKey: 'pk', storageKey: 'a'.repeat(64),
    request: async (url, options) => { seen.push({ url: new URL(url), ...options }); return Response.json({ db_bytes: 123, storage_bytes: 4, mau: 5 }); } });
  assert.deepEqual(await store.platformUsage(), { db_bytes: 123, storage_bytes: 4, mau: 5 });
  assert.equal(seen[0].url.pathname, '/rest/v1/rpc/go_platform_usage');
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers['X-Go-Storage-Key'], 'a'.repeat(64));
});

test('a migration e o provision definem go_platform_usage como security definer conferindo a chave', () => {
  for (const file of ['supabase/migrations/20261125120000_go_platform_usage.sql', 'supabase/provision-storage.sql']) {
    const sql = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(sql, /create or replace function public\.go_platform_usage\(\)/, file);
    assert.match(sql, /security definer/, file);
    assert.match(sql, /set search_path = ''/, file);
    assert.match(sql, /x-go-storage-key/, file);
    assert.match(sql, /GO_STORAGE_KEY_SHA256/, file);
    assert.match(sql, /grant execute on function public\.go_platform_usage\(\) to anon/, file);
  }
});
