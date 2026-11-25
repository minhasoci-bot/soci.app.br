import test from 'node:test';
import assert from 'node:assert/strict';
import { blank } from '../model.mjs';
import { blankAgency } from '../agency-model.mjs';
import { createSqliteStore, createSupabaseStore } from '../storage.mjs';
import { createLedgerFlush } from '../ledger-flush.mjs';
import { postFact } from '../ledger-model.mjs';
import { makeServer } from '../server.mjs';

const fiscal = { person: 'pj', name: 'Loja Ltda', taxId: '11222333000181' };
const fact = (key, extra = {}) => ({ key, layer: 'account', kind: 'sale', amountCents: 15000, feeCents: 80, method: 'Pix', provider: 'abacatepay', ref: 'bill_1', source: { type: 'invoice', id: 'i1' }, at: '2026-05-01T10:00:00.000Z', ...extra });
const year = { from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' };

function base(t) {
  const store = createSqliteStore(':memory:'); t.after(() => store.close());
  const s = blank('Loja da Ana');
  s.contacts.push({ id: 'c1', name: 'Bia', email: 'b@x.com', taxId: '52998224725' });
  store.insert('demo', s);
  store.insert('agency', { ...blankAgency(), company: { ...blankAgency().company, name: 'Agência X' } });
  const post = (...facts) => store.change('demo', state => { for (const item of facts) postFact(state, item); });
  const list = async (layer = 'account') => (await store.ledgerList({ layer, agencyId: 'agency', ...year })).rows;
  return { store, post, list, flush: createLedgerFlush({ store, log() {} }), box: () => store.load('demo').ledgerOutbox };
}

test('Envia com vendedor e comprador, prefixa a chave e esvazia a caixa', async t => {
  const { store, post, list, flush, box } = base(t);
  store.change('demo', s => { s.fiscal = fiscal; });
  post(fact('a', { contactId: 'c1' }), fact('b', { feeCents: null }));
  assert.equal(await flush.workspace('demo'), 2);
  const rows = Object.fromEntries((await list()).map(row => [row.key, row]));
  assert.deepEqual(Object.keys(rows).sort(), ['demo:a', 'demo:b']);
  assert.deepEqual(rows['demo:a'].seller, { name: 'Loja Ltda', taxId: '11222333000181' });
  assert.deepEqual(rows['demo:a'].payer, { name: 'Bia', taxId: '52998224725' });
  assert.deepEqual([rows['demo:a'].agency_id, rows['demo:a'].workspace_id, rows['demo:a'].amount_cents, rows['demo:a'].fee_cents, rows['demo:a'].provider_ref], ['agency', 'demo', 15000, 80, 'bill_1']);
  assert.equal(rows['demo:b'].fee_cents, null);
  assert.deepEqual(rows['demo:b'].payer, { name: '', taxId: '' });
  assert.deepEqual(box(), []);
  assert.equal(await flush.workspace('demo'), 0);
});

test('Fato da camada da agência: vende a agência, compra a subconta; sem cadastro usa o nome', async t => {
  const { store, post, list, flush } = base(t);
  post(fact('t', { layer: 'agency', kind: 'wallet_topup' }));
  await flush.workspace('demo');
  let [row] = await list('agency');
  assert.deepEqual([row.seller.name, row.payer.name, row.workspace_id], ['Agência X', 'Loja da Ana', 'demo']);
  store.change('agency', agency => postFact(agency, fact('p', { layer: 'agency', kind: 'plan_payment', workspaceId: 'demo', at: '2026-06-01T10:00:00.000Z' })));
  store.change('agency', agency => { agency.fiscal = { ...fiscal, name: 'Agência Ltda' }; });
  assert.equal(await flush.agency('agency'), 1);
  [row] = await list('agency');
  assert.deepEqual([row.key, row.seller.name, row.payer.name, row.workspace_id], ['agency:p', 'Agência Ltda', 'Loja da Ana', 'demo']);
  assert.deepEqual(store.load('agency').ledgerOutbox, []);
});

test('O que chega durante o envio fica para o próximo; o retrato não muda depois', async t => {
  const { store, post, list, box } = base(t);
  post(fact('a'));
  const append = store.ledgerAppend;
  let once = true;
  const racing = { ...store, ledgerAppend: async rows => { await append(rows); if (once) { once = false; post(fact('b')); } } };
  await createLedgerFlush({ store: racing, log() {} }).workspace('demo');
  const left = box().map(item => item.key);
  assert.ok(left.length === 0 || (left.length === 1 && left[0] === 'b'), 'nunca se perde');
  await createLedgerFlush({ store, log() {} }).workspace('demo');
  assert.deepEqual((await list()).map(row => row.key).sort(), ['demo:a', 'demo:b']);
  store.change('demo', s => { s.profile.name = 'Outro nome'; });
  assert.equal((await list())[0].seller.name, 'Loja da Ana');
});

test('Queda depois de gravar o livro e antes de limpar a caixa: a próxima passada não duplica', async t => {
  const { store, post, list, flush, box } = base(t);
  post(fact('a'));
  const broken = createLedgerFlush({ store: { ...store, change: async () => { throw new Error('caiu'); } }, log() {} });
  await assert.rejects(broken.workspace('demo'), /caiu/);
  assert.equal(box().length, 1);
  await flush.workspace('demo');
  assert.equal((await list()).length, 1);
  assert.deepEqual(box(), []);
});

test('Muitos fatos vão em lotes, e dois envios ao mesmo tempo não repetem', async t => {
  const { store, post, box } = base(t);
  post(...Array.from({ length: 450 }, (_, i) => fact(`k${i}`)));
  const sizes = [];
  const flush = createLedgerFlush({ store: { ...store, ledgerAppend: async rows => { sizes.push(rows.length); await store.ledgerAppend(rows); } }, log() {} });
  await Promise.all([flush.workspace('demo'), flush.workspace('demo')]);
  assert.deepEqual(sizes, [200, 200, 50]);
  assert.deepEqual(box(), []);
  const { rows } = await store.ledgerList({ layer: 'account', agencyId: 'agency', ...year, limit: 1000 });
  assert.equal(rows.length, 450);
});

test('Sem a tabela, o fato espera na caixa sem erro; armazenamento sem livro também', async t => {
  const { post, box, store } = base(t);
  post(fact('a'));
  const missing = Object.assign(new Error('sem tabela'), { code: 'ledger_unavailable' });
  assert.equal(await createLedgerFlush({ store: { ...store, ledgerAppend: async () => { throw missing; } }, log() {} }).workspace('demo'), 0);
  const { ledgerAppend: _no, ...old } = store;
  assert.equal(await createLedgerFlush({ store: old, log() {} }).workspace('demo'), 0);
  assert.equal(box().length, 1);
});

test('No Supabase sem a migração, o livro se declara indisponível', async () => {
  const store = createSupabaseStore({ projectUrl: 'https://abc.supabase.co', publishableKey: 'pk', storageKey: 'a'.repeat(64),
    request: async () => new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 }) });
  await assert.rejects(store.ledgerAppend([{ key: 'a' }]), error => error.code === 'ledger_unavailable');
  await assert.rejects(store.ledgerList({ layer: 'account', agencyId: 'agency', ...year }), error => error.code === 'ledger_unavailable');
});

test('Uma transação criada no app chega ao livro, e o livro fora do ar não impede a gravação', async t => {
  const store = createSqliteStore(':memory:');
  let down = true;
  const append = store.ledgerAppend;
  store.ledgerAppend = async rows => { if (down) throw new Error('fora do ar'); await append(rows); };
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0, socialScheduler: false, openAISecret: 'ledger-test-seal-secret-32-chars!!!' });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://${host}:${server.address().port}`;
  const action = body => fetch(`${origin}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  const { id: contactId } = await (await action({ type: 'save', key: 'contacts', data: { name: 'Bia', email: 'bia@x.com' } })).json();
  const save = amount => action({ type: 'save', key: 'transactions', data: { contactId, amount, date: '2026-05-02', method: 'Cash', status: 'Succeeded' } });
  const logged = console.error; console.error = () => {}; t.after(() => { console.error = logged; });
  assert.equal((await save(10)).status, 200);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(store.load('demo').ledgerOutbox.length, 1, 'espera na caixa');
  down = false;
  assert.equal((await save(20)).status, 200);
  for (let i = 0; i < 40 && store.load('demo').ledgerOutbox.length; i++) await new Promise(resolve => setTimeout(resolve, 25));
  const { rows } = await store.ledgerList({ layer: 'account', agencyId: 'agency', ...year });
  assert.deepEqual(rows.map(row => row.amount_cents).sort((a, b) => a - b), [1000, 2000]);
});
