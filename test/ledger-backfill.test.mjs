import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { blankAgency } from '../agency-model.mjs';
import { createSqliteStore } from '../storage.mjs';
import { backfill, importWorkspace } from '../scripts/ledger-backfill.mjs';

const all = { from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z', limit: 1000 };
function setup(t) {
  const store = createSqliteStore(':memory:'); t.after(() => store.close());
  const s = blank('Loja');
  const tx = (id, extra = {}) => s.transactions.push({ id, created: '2026-03-01T13:00:00.000Z', contactId: 'c1', amount: 50, date: '2026-03-01', method: 'Pix', source: 'Manual', status: 'Succeeded', note: '', invoiceId: '', ...extra });
  s.contacts.push({ id: 'c1', name: 'Ana', email: 'a@x.com' });
  s.invoices.push({ id: 'i1', title: 'A', contactId: 'c1', value: 80, status: 'Paid', payment: { provider: 'abacatepay', checkoutId: 'bill_1', status: 'PAID' } }, { id: 'i2', title: 'Teste', contactId: 'c1', value: 10, status: 'Paid', payment: { provider: 'abacatepay', checkoutId: 'bill_2', status: 'PAID', devMode: true } });
  tx('t1'); tx('t2', { invoiceId: 'i1', amount: 80 }); tx('t3', { status: 'Refunded', amount: 30 }); tx('t4', { status: 'Failed' }); tx('t5', { invoiceId: 'i2', amount: 10 });
  s.wallet = { balance: 0, pricing: {}, lowAt: 20, topups: [{ checkoutId: 'bill_9', amount: 100, status: 'PAID' }, { checkoutId: 'bill_8', amount: 100, status: 'PAID', devMode: true }], entries: [
    { id: 'w1', kind: 'usage', product: 'email', day: '2026-03-02', units: 10, cost: 0.01, amount: 0.03, at: '2026-03-02T15:00:00.000Z' }, { id: 'w2', kind: 'credit', amount: 100, note: 'Recarga paga', method: 'Pix', checkoutId: 'bill_9', day: '2026-03-02', at: '2026-03-02T16:00:00.000Z' },
    { id: 'w3', kind: 'credit', amount: 20, note: 'Cortesia', checkoutId: '', day: '2026-03-03', at: '2026-03-03T15:00:00.000Z' }, { id: 'w4', kind: 'credit', amount: 100, note: 'Recarga paga', checkoutId: 'bill_8', day: '2026-03-04', at: '2026-03-04T15:00:00.000Z' }] };
  store.insert('demo', s);
  const agency = blankAgency();
  agency.accounts.demo = { status: 'Active', name: 'Loja', billing: { provider: 'abacatepay', checkoutId: 'bill_5', planId: 'p1', planName: 'Pro', payments: [{ id: 'card_1', amount: 297, at: '2026-04-01T12:00:00.000Z' }, { id: '', amount: 297, at: '2026-05-01T12:00:00.000Z' }] } };
  agency.accounts.teste = { status: 'Active', billing: { provider: 'abacatepay', checkoutId: 'bill_6', devMode: true, payments: [{ id: 'card_9', amount: 1, at: '2026-04-01T12:00:00.000Z' }] } };
  store.insert('agency', agency);
  const list = async layer => (await store.ledgerList({ ...all, layer, agencyId: 'agency' })).rows;
  return { store, list };
}

test('Sem aplicar, só conta e não grava nada', async t => {
  const { store, list } = setup(t);
  const before = JSON.stringify(store.load('demo'));
  const report = await backfill({ store, log() {} });
  assert.deepEqual(report, { accounts: 2, facts: 9, skipped: [] });
  assert.equal(JSON.stringify(store.load('demo')), before);
  assert.deepEqual([...await list('account'), ...await list('agency')], []);
});

test('Importa vendas, devoluções, planos e carteira com a data original e a marca de importado', async t => {
  const { store, list } = setup(t);
  assert.equal((await backfill({ store, dryRun: false, log() {} })).facts, 9);
  const account = await list('account'), agency = await list('agency');
  assert.deepEqual(account.map(row => [row.key, row.kind, row.amount_cents]).sort(), [['demo:refund:tx:t3', 'refund', -3000], ['demo:sale:abacatepay:bill_1', 'sale', 8000], ['demo:sale:tx:t1', 'manual_sale', 5000], ['demo:sale:tx:t3', 'manual_sale', 3000]]);
  assert.deepEqual(agency.map(row => [row.key, row.kind, row.amount_cents]).sort(), [['agency:plan:abacatepay:bill_5:2026-05-01T12:00:00.000Z', 'plan_payment', 29700], ['agency:plan:abacatepay:card_1', 'plan_payment', 29700],
    ['demo:topup:bill_9', 'wallet_topup', 10000], ['demo:usage:w1', 'wallet_usage', -3], ['demo:wallet:w3', 'wallet_credit', 2000]]);
  assert.ok([...account, ...agency].every(row => row.detail.imported === true));
  assert.match(account.find(row => row.key === 'demo:sale:tx:t1').occurred_at, /^2026-03-01/);
  assert.match(agency.find(row => row.key === 'agency:plan:abacatepay:card_1').occurred_at, /^2026-04-01/);
  assert.deepEqual(store.load('demo').ledgerOutbox, []);
});

test('Rodar de novo, ou depois de uma edição, não duplica', async t => {
  const { store, list } = setup(t);
  await backfill({ store, dryRun: false, log() {} });
  store.change('demo', s => { execute(s, { type: 'save', key: 'transactions', id: 't1', data: { ...s.transactions.find(row => row.id === 't1'), amount: 60 } }); });
  assert.deepEqual(await backfill({ store, dryRun: false, log() {} }), { accounts: 2, facts: 0, skipped: [] });
  const rows = (await list('account')).filter(row => /t1/.test(row.key));
  assert.deepEqual(rows.map(row => row.amount_cents).sort((a, b) => a - b), [1000, 5000]);
  assert.equal((await list('agency')).length, 5);
});

test('Editar antes de importar lança o valor antigo uma vez só; pagamento de teste antigo fica fora', async t => {
  const { store, list } = setup(t);
  store.change('demo', s => {
    execute(s, { type: 'save', key: 'transactions', id: 't1', data: { ...s.transactions.find(row => row.id === 't1'), amount: 60 } });
    execute(s, { type: 'save', key: 'transactions', id: 't5', data: { ...s.transactions.find(row => row.id === 't5'), amount: 11 } });
  });
  await backfill({ store, dryRun: false, log() {} });
  const rows = await list('account');
  assert.deepEqual(rows.filter(row => /t1/.test(row.key)).map(row => row.amount_cents).sort((a, b) => a - b), [1000, 5000]);
  assert.equal(rows.some(row => /t5|bill_2/.test(row.key)), false);
});

test('Uma conta com erro não para as outras', async t => {
  const { store } = setup(t);
  const broken = { ...store, change: (id, mutate) => { if (id === 'demo') throw new Error('sem gravação'); return store.change(id, mutate); } };
  const report = await backfill({ store: broken, dryRun: false, log() {} });
  assert.deepEqual(report.skipped, ['demo']);
  assert.equal(report.facts, 2);
});

test('A importação inclui a baixa manual de uma fatura com link de teste nunca pago', () => {
  const s = blank();
  s.invoices.push({ id: 'i1', title: 'x', status: 'Paid', value: 50, payment: { provider: 'abacatepay', checkoutId: 'bill_dev', status: 'PENDING', devMode: true } });
  s.transactions.push({ id: 't1', created: '2026-01-01T00:00:00.000Z', contactId: '', amount: 50, date: '2026-01-01', method: 'Manual', source: 'Invoice', status: 'Succeeded', note: '', invoiceId: 'i1' });
  assert.equal(importWorkspace(s), 1);
  assert.deepEqual(s.ledgerOutbox.map(fact => [fact.key, fact.amountCents]), [['sale:tx:t1', 5000]]);
});
