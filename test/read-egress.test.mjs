// O que sai do Supabase (egress): um documento que não mudou não é mandado de novo, um change que não muda nada não
// regrava, e um minuto de cron lê cada subconta uma vez. Nada disso pode fazer alguém ver dado velho depois de uma gravação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank } from '../model.mjs';
import { createSqliteStore, createSupabaseStore, KEEP_MS } from '../storage.mjs';
import { SCOPE_MS, scopedReads } from '../read-scope.mjs';
import { makeServer } from '../server.mjs';

const byJsonb = (a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b));
/** jsonb keeps the keys in its own order. */
const jsonb = v => Array.isArray(v) ? v.map(jsonb) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort(byJsonb).map(k => [k, jsonb(v[k])])) : v;

/** The Data API over a Map, as far as go_workspaces needs it. */
function dataApi() {
  const rows = new Map(), seen = [];
  const set = (id, state, revision = crypto.randomUUID()) => rows.set(id, { id, revision, state: jsonb(state) });
  async function request(url, options) {
    const q = url.searchParams;
    if (!url.pathname.endsWith('/go_workspaces')) return Response.json([]);
    const filter = (value, test) => value == null || test(value);
    let found = [...rows.values()].filter(row => filter(q.get('id'), v => v.startsWith('in.(') ? JSON.parse(`[${v.slice(4, -1)}]`).includes(row.id) : row.id === v.slice(3))
      && filter(q.get('revision'), v => v.startsWith('neq.') ? row.revision !== v.slice(4) : row.revision === v.slice(3))
      && filter(q.get('state->>agencyId'), v => v === 'is.null' ? row.state.agencyId == null : row.state.agencyId === v.slice(3)));
    if (options.method === 'POST') {
      const { id, state } = JSON.parse(options.body);
      const fresh = !rows.has(id);
      if (fresh) set(id, state);
      found = fresh ? [rows.get(id)] : [];
    }
    if (options.method === 'PATCH') for (const row of found) { const { state, revision } = JSON.parse(options.body); Object.assign(row, { state: jsonb(state), revision }); }
    const out = q.get('or') ? [] : found.map(row => Object.fromEntries(q.get('select').split(',').map(c => [c, c === 'name' ? row.state.profile?.name ?? '' : row[c]])));
    seen.push({ method: options.method, select: q.get('select'), revision: q.get('revision'), rows: out.length, whole: out.length > 0 && q.get('select').includes('state') });
    return Response.json(out);
  }
  let at = 0;
  const open = () => createSupabaseStore({ projectUrl: 'https://abc.supabase.co', publishableKey: 'pk', storageKey: 'a'.repeat(64), request, clock: () => at });
  return { rows, seen, set, open, store: open(), later: ms => { at += ms; }, take: () => seen.splice(0) };
}

test('A document that did not change is asked by revision and not sent again', async () => {
  const api = dataApi();
  api.set('demo', blank('Loja'));
  const first = await api.store.load('demo');
  first.contacts.push({ id: 'só aqui' });
  const second = await api.store.load('demo');
  assert.equal(second.profile.name, 'Loja');
  assert.deepEqual(second.contacts, [], 'each reader gets its own copy');
  const [one, two] = api.take();
  assert.equal(one.revision, null);
  assert.equal(one.whole, true);
  assert.match(two.revision, /^neq\./);
  assert.equal(two.rows, 0);
});

test('A write by this server or by another one is seen by the very next read', async () => {
  const api = dataApi(), other = api.open();
  api.set('demo', blank('Loja'));
  await api.store.load('demo'); await other.load('demo');
  await other.change('demo', s => { s.profile.name = 'Outro servidor'; });
  assert.equal((await api.store.load('demo')).profile.name, 'Outro servidor');
  await api.store.change('demo', s => { s.profile.name = 'Este servidor'; });
  assert.equal((await api.store.load('demo')).profile.name, 'Este servidor');
  assert.equal((await other.load('demo')).profile.name, 'Este servidor');
});

test('change starts from the database, not from the copy, and a conflict is done again over the new state', async () => {
  const api = dataApi(), other = api.open();
  api.set('demo', blank('Loja'));
  await api.store.load('demo');
  await other.change('demo', s => { s.profile.phone = '111'; });
  await api.store.change('demo', s => { s.profile.name = 'Nova'; });
  assert.deepEqual([api.rows.get('demo').state.profile.phone, api.rows.get('demo').state.profile.name], ['111', 'Nova']);
  let tries = 0;
  const pending = [];
  await api.store.change('demo', s => {
    if (!tries++) { const row = api.rows.get('demo'); pending.push(api.set('demo', { ...row.state, profile: { ...row.state.profile, phone: '222' } })); }
    s.profile.name = 'Final';
  });
  assert.equal(tries, 2);
  assert.deepEqual([api.rows.get('demo').state.profile.phone, api.rows.get('demo').state.profile.name], ['222', 'Final']);
});

test('A row that is gone is "not found" in a change, and in a read once the copy is too old', async () => {
  const api = dataApi();
  api.set('demo', blank('Loja'));
  await api.store.load('demo');
  api.rows.delete('demo');
  await assert.rejects(api.store.change('demo', s => { s.profile.name = 'x'; }), { status: 404 });
  await assert.rejects(api.store.load('demo'), { status: 404 });
  await assert.rejects(api.store.load('nunca'), { status: 404 });
});

test('A state edited by hand (same revision) is picked up when the copy is too old', async () => {
  const api = dataApi();
  api.set('demo', blank('Loja'));
  const { revision } = api.rows.get('demo');
  await api.store.load('demo');
  api.set('demo', blank('Editada por SQL'), revision);
  api.later(KEEP_MS - 1);
  assert.equal((await api.store.load('demo')).profile.name, 'Loja');
  api.later(1);
  assert.equal((await api.store.load('demo')).profile.name, 'Editada por SQL');
});

test('A change that changes nothing does not write, whatever the order of the keys', async () => {
  const api = dataApi();
  api.set('demo', blank('Loja'));
  await api.store.change('demo', s => { s.profile.phone = '1'; });
  const { revision } = api.rows.get('demo');
  api.take();
  assert.equal(await api.store.change('demo', s => s.profile.name), 'Loja', 'the result is given all the same');
  await api.store.change('demo', s => { s.profile = { ...s.profile, name: s.profile.name }; });
  assert.ok(!api.take().some(r => r.method === 'PATCH'));
  assert.equal(api.rows.get('demo').revision, revision);
  await api.store.change('demo', s => { s.profile.phone = '2'; });
  assert.notEqual(api.rows.get('demo').revision, revision);
  assert.equal(api.rows.get('demo').state.profile.phone, '2');
});

test('A very large document is not kept in memory', async () => {
  const api = dataApi();
  api.set('media-1', { data: 'x'.repeat(4_100_000) });
  await api.store.load('media-1'); await api.store.load('media-1');
  assert.deepEqual(api.take().map(r => r.whole), [true, true]);
});

test('unchanged answers about many documents in one request, only with the ones that are the same', async () => {
  const api = dataApi();
  for (const id of ['a', 'b', 'c']) api.set(id, blank(id.toUpperCase()));
  await api.store.load('a'); await api.store.load('b');
  api.set('b', blank('B mudou'));
  api.take();
  const same = await api.store.unchanged(['a', 'b', 'c', 'nunca']);
  assert.deepEqual([...same.keys()], ['a']);
  assert.equal(same.get('a').profile.name, 'A');
  assert.deepEqual(api.take().map(r => [r.select, r.whole]), [['id,revision', false]]);
  assert.equal((await api.store.unchanged([])).size, 0);
  assert.equal(api.take().length, 0);
});

/** A store that counts its reads. */
function counted() {
  const store = createSqliteStore(':memory:'), reads = [];
  for (const id of ['demo', 'agency', 'loja']) store.insert(id, id === 'agency' ? { audit: [] } : blank(id));
  return { reads, store: { ...store, load: id => { reads.push(id); return store.load(id); }, list: (...args) => { reads.push('list'); return store.list(...args); } } };
}

test('Scoped reads: one read per document of the round, with a copy for each task', async () => {
  const { reads, store } = counted(), scoped = scopedReads(store);
  await scoped.run(async () => {
    await scoped.prime(['demo']);
    const first = await scoped.store.load('demo');
    first.contacts.push({ id: 'só aqui' });
    assert.deepEqual((await scoped.store.load('demo')).contacts, []);
    await Promise.all([scoped.store.list(), scoped.store.list()]);
  });
  assert.deepEqual(reads, ['demo', 'list']);
  scoped.store.load('demo'); scoped.store.load('demo'); scoped.store.list();
  assert.equal(reads.length, 5, 'outside a round every read is a read');
});

test('Scoped reads: the agency and the documents not listed are always read again', async () => {
  const { reads, store } = counted(), scoped = scopedReads(store);
  await scoped.run(async () => {
    await scoped.prime(['demo']);
    for (const id of ['agency', 'agency', 'loja', 'loja']) await scoped.store.load(id);
  });
  assert.equal(reads.length, 4);
});

test('Scoped reads: after a write, from inside the round or from a request, the round sees the database', async () => {
  const { store } = counted(), scoped = scopedReads(store);
  await scoped.run(async () => {
    await scoped.prime(['demo', 'loja']);
    await scoped.store.load('demo');
    await scoped.store.change('demo', s => { s.profile.name = 'Gravado na volta'; });
    assert.equal((await scoped.store.load('demo')).profile.name, 'Gravado na volta');
    store.change('demo', s => { s.profile.name = 'Outro servidor'; });
    assert.equal((await scoped.store.load('demo')).profile.name, 'Outro servidor', 'a document being worked on is never a copy again');
  });
  let go; const gate = new Promise(resolve => { go = resolve; });
  const round = scoped.run(async () => {
    await scoped.prime(['loja']);
    await scoped.store.load('loja');
    await gate;
    return (await scoped.store.load('loja')).profile.name;
  });
  await new Promise(resolve => setTimeout(resolve, 5));
  await scoped.store.change('loja', s => { s.profile.name = 'Gravado por uma requisição'; });
  go();
  assert.equal(await round, 'Gravado por uma requisição');
});

test('Scoped reads: a copy is good for a few seconds, a failure is asked again, and what stays in the background reads again', async () => {
  let at = 0, broken = true, reads = 0;
  const scoped = scopedReads({ load: () => { reads++; if (broken) throw Object.assign(new Error('rede'), { status: 500 }); return { n: reads }; }, list: () => [] }, { clock: () => at });
  let late;
  await scoped.run(async () => {
    await scoped.prime(['demo']);
    await assert.rejects(scoped.store.load('demo'), /rede/);
    broken = false;
    assert.equal((await scoped.store.load('demo')).n, 2);
    at = SCOPE_MS - 1;
    assert.equal((await scoped.store.load('demo')).n, 2);
    at = SCOPE_MS;
    assert.equal((await scoped.store.load('demo')).n, 3);
    late = new Promise(resolve => setTimeout(resolve, 5)).then(() => scoped.store.load('demo'));
  });
  assert.equal((await late).n, 4);
});

test('Scoped reads: the other methods are the ones of the store', () => {
  const store = createSqliteStore(':memory:'), scoped = scopedReads(store).store;
  assert.equal(scoped.kind, 'SQLite');
  assert.equal(scoped.findAgency, store.findAgency);
  assert.equal(scoped.audit, store.audit);
  assert.equal(scoped.tracking, store.tracking);
});

test('An idle minute of cron does not send any document again', async t => {
  const api = dataApi(), secret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'fixture-egress-cron-secret';
  const { server, host } = makeServer({ store: api.store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => { if (secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret; return new Promise(resolve => server.close(resolve)); });
  const base = `http://${host}:${server.address().port}`;
  const cron = async () => { api.take(); assert.equal((await fetch(`${base}/api/social/cron`, { headers: { Authorization: 'Bearer fixture-egress-cron-secret' } })).status, 200); await new Promise(resolve => setTimeout(resolve, 150)); return api.take(); };
  assert.equal((await fetch(`${base}/api/state?workspace=demo`)).status, 200);
  for (let n = 0; n < 5; n++) await fetch(`${base}/api/workspaces`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Loja ${n}` }) });
  await api.store.change('demo', s => { s.socialAccounts = [{ id: 'a1', provider: 'linkedin', externalId: 'x', name: 'x' }]; });
  await cron(); await cron();
  const idle = await cron();
  assert.ok(!idle.some(r => r.whole), 'no document was sent');
  assert.ok(!idle.some(r => r.method === 'PATCH'), 'nothing was written');
  assert.ok(idle.length <= 20, `${idle.length} requests`);
});
