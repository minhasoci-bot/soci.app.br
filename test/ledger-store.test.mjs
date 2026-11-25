import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteStore, createSupabaseStore } from '../storage.mjs';

const row = (key, amount_cents, extra = {}) => ({ key, layer: 'account', agency_id: 'agency', workspace_id: 'demo', kind: 'sale', amount_cents, fee_cents: null, usage_micros: null,
  method: 'Pix', provider: 'abacatepay', provider_ref: 'bill_1', source: { type: 'invoice', id: 'i1' }, seller: { name: 'Loja', taxId: '' }, payer: { name: 'Ana', taxId: '' }, detail: {},
  occurred_at: '2026-05-01T10:00:00.000Z', ...extra });
const year = { from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' };
const mine = { layer: 'account', agencyId: 'agency', ...year };

test('O livro só inclui e ignora a chave repetida', async t => {
  const store = createSqliteStore(':memory:'); t.after(() => store.close());
  await store.ledgerAppend([row('a', 100), row('a', 999), row('b', 200)]);
  await store.ledgerAppend([row('a', 5)]);
  const { rows, next } = await store.ledgerList(mine);
  assert.deepEqual(rows.map(r => [r.key, r.amount_cents]).sort(), [['a', 100], ['b', 200]]);
  assert.equal(next, '');
  assert.deepEqual(rows[0].source, { type: 'invoice', id: 'i1' });
  assert.ok(rows[0].recorded_at);
  await store.ledgerAppend([]);
});

test('Alterar, apagar ou trocar uma linha do livro falha', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-')), path = join(dir, 'go.sqlite');
  const store = createSqliteStore(path);
  await store.ledgerAppend([row('a', 100)]);
  const db = new DatabaseSync(path);
  t.after(() => { db.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.throws(() => db.exec('UPDATE go_billing_ledger SET amount_cents = 1'), /imutável/);
  assert.throws(() => db.exec('DELETE FROM go_billing_ledger'), /imutável/);
  assert.throws(() => db.exec("INSERT INTO go_billing_ledger (key, layer, agency_id, kind, amount_cents, occurred_at) VALUES ('x','outra','agency','sale',1,'2026-01-01T00:00:00.000Z')"), /constraint/i);
  assert.equal((await store.ledgerList(mine)).rows.length, 1);
});

test('Cada agência, subconta e camada lê só o que é seu', async t => {
  const store = createSqliteStore(':memory:'); t.after(() => store.close());
  await store.ledgerAppend([row('a', 1), row('b', 2, { workspace_id: 'other' }), row('c', 3, { layer: 'agency' }), row('d', 4, { agency_id: 'agency-2' })]);
  const keys = async query => (await store.ledgerList(query)).rows.map(r => r.key).sort();
  assert.deepEqual(await keys(mine), ['a', 'b']);
  assert.deepEqual(await keys({ ...mine, workspaceId: 'demo' }), ['a']);
  assert.deepEqual(await keys({ ...mine, layer: 'agency' }), ['c']);
  assert.deepEqual(await keys({ ...mine, agencyId: 'agency-2' }), ['d']);
  assert.deepEqual(await keys({ ...mine, kind: 'refund' }), []);
  assert.deepEqual(await keys({ ...mine, from: '2026-05-01T10:00:00.000Z' }), ['a', 'b'], 'início inclusivo');
  assert.deepEqual(await keys({ ...mine, to: '2026-05-01T10:00:00.000Z' }), [], 'fim exclusivo');
});

test('A paginação não pula nem repete linhas do mesmo instante', async t => {
  const store = createSqliteStore(':memory:'); t.after(() => store.close());
  await store.ledgerAppend(['a', 'b', 'c', 'd', 'e'].map((key, i) => row(key, i)));
  const seen = [];
  let after = '', pages = 0;
  do { const page = await store.ledgerList({ ...mine, limit: 2, after }); seen.push(...page.rows.map(r => r.key)); after = page.next; pages++; } while (after && pages < 9);
  assert.deepEqual(seen, ['e', 'd', 'c', 'b', 'a']);
});

test('No Supabase, o envio ignora repetidas, usa a chave de servidor e filtra a leitura', async () => {
  const calls = [];
  const store = createSupabaseStore({ projectUrl: 'https://abc.supabase.co', publishableKey: 'pk', storageKey: 'a'.repeat(64),
    request: async (url, init) => { calls.push({ url: new URL(url), init }); return new Response('[]', { status: 200 }); } });
  await store.ledgerAppend([row('a', 100)]);
  const [post] = calls;
  assert.equal(post.url.pathname, '/rest/v1/go_billing_ledger');
  assert.equal(post.url.searchParams.get('on_conflict'), 'key');
  assert.match(post.init.headers.Prefer, /resolution=ignore-duplicates/);
  assert.equal(post.init.headers['X-Go-Storage-Key'], 'a'.repeat(64));
  assert.equal(JSON.parse(post.init.body)[0].key, 'a');
  await store.ledgerList({ ...mine, workspaceId: 'demo', kind: 'sale', limit: 2, after: '2026-05-01T10:00:00.000Z|sale:x,(y)"z' });
  const q = calls[1].url.searchParams;
  assert.equal(q.get('layer'), 'eq.account');
  assert.equal(q.get('agency_id'), 'eq.agency');
  assert.equal(q.get('workspace_id'), 'eq.demo');
  assert.equal(q.get('limit'), '3');
  assert.equal(q.get('order'), 'occurred_at.desc,key.desc');
  assert.match(q.get('and'), /occurred_at\.gte\.2026-01-01T00:00:00\.000Z/);
  assert.match(q.get('and'), /or\(occurred_at\.lt\.2026-05-01T10:00:00\.000Z,and\(occurred_at\.eq\.2026-05-01T10:00:00\.000Z,key\.lt\."sale:x,\(y\)\\"z"\)\)/);
  await store.ledgerAppend([]);
  assert.equal(calls.length, 2, 'lista vazia não chama o banco');
});

test('A migração do Supabase impede mudança e só dá leitura e inclusão à chave de servidor', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261124120000_go_billing_ledger.sql', import.meta.url), 'utf8');
  assert.match(sql, /before update or delete on public\.go_billing_ledger/i);
  assert.match(sql, /before truncate on public\.go_billing_ledger/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant select, insert on table public\.go_billing_ledger to anon/i);
  assert.doesNotMatch(sql, /grant[^;]*(update|delete)/i);
  const policies = readFileSync(new URL('../supabase/provision-storage.sql', import.meta.url), 'utf8');
  for (const name of ['go_ledger_read', 'go_ledger_insert']) assert.match(policies, new RegExp(`create policy ${name} on public\.go_billing_ledger`));
});

test('No Supabase, que devolve no máximo 1000 linhas por leitura, o período inteiro é lido', async () => {
  const all = Array.from({ length: 2500 }, (_, i) => ({ key: `demo:k${String(i).padStart(5, '0')}`, occurred_at: new Date(Date.UTC(2026, 10, 30) - i * 1000).toISOString() }));
  const store = createSupabaseStore({ projectUrl: 'https://abc.supabase.co', publishableKey: 'pk', storageKey: 'a'.repeat(64),
    request: async url => {
      const q = new URL(url).searchParams, before = /occurred_at\.lt\.([^,)]+),and/.exec(q.get('and'))?.[1];
      return new Response(JSON.stringify(all.filter(row => !before || row.occurred_at < before).slice(0, Math.min(1000, Number(q.get('limit'))))), { status: 200 });
    } });
  const seen = [];
  for (let after = '', more = true; more;) {
    const page = await store.ledgerList({ layer: 'account', agencyId: 'agency', from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z', limit: 1000, after });
    seen.push(...page.rows);
    after = page.next;
    more = Boolean(after);
  }
  assert.equal(seen.length, 2500);
  assert.equal(new Set(seen.map(row => row.key)).size, 2500);
});

test('Uma continuação de página inválida é recusada', async () => {
  const store = createSqliteStore(':memory:');
  await assert.rejects(() => store.ledgerList({ layer: 'account', agencyId: 'a', from: '2026', to: '2027', after: 'x),or(layer.eq.agency|k' }), error => error.status === 400);
  store.close();
});
