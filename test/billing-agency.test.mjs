import test from 'node:test';
import assert from 'node:assert/strict';
import { blank } from '../model.mjs';
import { addTopup, closeUsage, paidTopup, reverseTopup, setPricing, walletAdjust, walletCharge, walletLimits } from '../wallet-model.mjs';
import { startBilling } from './helpers/abacate.mjs';

const wallet = () => { const s = blank('Loja'); s.profile.timezone = 'America/Sao_Paulo'; setPricing(s, { pricing: { email: { unit: 0.001, markup: 3 }, phone: { unit: 0.12, markup: 1 } }, lowAt: 10 }); return s; };
const facts = (s, kind) => s.ledgerOutbox.filter(fact => !kind || fact.kind === kind);

test('O consumo entra uma vez por dia e produto, no fuso da subconta e com o valor exato', () => {
  const s = wallet();
  walletCharge(s, 'email', 1, '2026-12-01T02:30:00.000Z'); // 23h30 de 30/11 em São Paulo
  walletCharge(s, 'email', 2, '2026-12-01T02:40:00.000Z');
  walletCharge(s, 'phone', 1, '2026-12-01T15:00:00.000Z');
  assert.deepEqual(s.wallet.entries.map(entry => [entry.product, entry.day]), [['phone', '2026-12-01'], ['email', '2026-11-30']]);
  assert.equal(closeUsage(s, '2026-12-01'), 1, 'o dia de hoje ainda está aberto');
  assert.equal(closeUsage(s, '2026-12-01'), 0);
  const [usage] = facts(s);
  assert.deepEqual([usage.kind, usage.layer, usage.usageMicros, usage.amountCents], ['wallet_usage', 'agency', -9000, -1]);
  assert.deepEqual(usage.detail, { product: 'email', day: '2026-11-30', units: 3, costMicros: 3000 });
  walletCharge(s, 'email', 1, '2026-12-01T02:50:00.000Z');
  assert.equal(s.wallet.entries.length, 3, 'consumo atrasado abre linha nova');
  assert.equal(closeUsage(s, '2026-12-02'), 2);
  assert.equal(new Set(facts(s).map(fact => fact.key)).size, 3);
});

test('Cortar o extrato antes lança o que falta; linhas antigas ficam para a importação', () => {
  const s = wallet();
  s.wallet.entries.push({ id: 'velha', kind: 'usage', product: 'email', day: '2025-01-01', units: 1, cost: 1, amount: 1, at: '2025-01-01T00:00:00.000Z' });
  for (let i = 0; i < walletLimits.entries + 100; i++) walletCharge(s, 'email', 1, new Date(Date.UTC(2026, 0, 1 + i, 15)).toISOString());
  assert.equal(s.wallet.entries.length, walletLimits.entries);
  closeUsage(s, '2099-01-01');
  assert.equal(facts(s, 'wallet_usage').length, walletLimits.entries + 100);
});

test('Recarga é dinheiro; crédito, débito e consumo são movimento de saldo', () => {
  const s = wallet();
  walletAdjust(s, { kind: 'credit', amount: 50, note: 'Cortesia', by: 'Dono' });
  walletAdjust(s, { kind: 'debit', amount: 20 });
  addTopup(s, { checkoutId: 'bill_1', amount: 100 });
  assert.equal(paidTopup(s, { checkoutId: 'bill_1', method: 'Pix', feeCents: 80, paidCents: 10000 }), 100);
  assert.equal(paidTopup(s, { checkoutId: 'bill_1', method: 'Pix', feeCents: 80, paidCents: 10000 }), false);
  assert.deepEqual(facts(s).map(fact => [fact.kind, fact.amountCents, fact.feeCents ?? null]), [['wallet_credit', 5000, null], ['wallet_debit', -2000, null], ['wallet_topup', 10000, 80]]);
  assert.equal(facts(s)[0].detail.by, 'Dono');
  assert.equal(s.wallet.balance, 130);
});

test('Recarga paga a menos credita o que entrou; em modo de teste não vai ao livro', () => {
  const s = wallet();
  addTopup(s, { checkoutId: 'bill_1', amount: 100 });
  assert.equal(paidTopup(s, { checkoutId: 'bill_1', paidCents: 4000 }), 40);
  assert.equal(facts(s)[0].amountCents, 4000);
  addTopup(s, { checkoutId: 'bill_2', amount: 100 });
  paidTopup(s, { checkoutId: 'bill_2', devMode: true });
  reverseTopup(s, { checkoutId: 'bill_2' });
  assert.equal(facts(s).length, 1);
  assert.equal(s.wallet.balance, 40);
});

test('Recarga com taxa repassada: o saldo recebe o valor da recarga e o livro, o que entrou', () => {
  const s = wallet();
  addTopup(s, { checkoutId: 'bill_1', amount: 100 });
  assert.equal(paidTopup(s, { checkoutId: 'bill_1', paidCents: 10500, feeCents: 500 }), 100);
  assert.equal(s.wallet.balance, 100);
  assert.deepEqual([facts(s)[0].amountCents, facts(s)[0].feeCents], [10500, 500]);
  reverseTopup(s, { checkoutId: 'bill_1' });
  assert.equal(s.wallet.balance, 0);
  assert.equal(facts(s)[1].amountCents, -10500);
});

test('Reembolso que chega antes do pagamento: a recarga não credita depois', () => {
  const s = wallet();
  addTopup(s, { checkoutId: 'bill_1', amount: 100 });
  assert.equal(reverseTopup(s, { checkoutId: 'bill_1' }), true);
  assert.equal(paidTopup(s, { checkoutId: 'bill_1', paidCents: 10000 }), false);
  assert.equal(s.wallet.balance, 0);
  assert.equal(facts(s).length, 0);
});

test('Recarga devolvida debita uma vez e pode ficar negativa', () => {
  const s = wallet();
  addTopup(s, { checkoutId: 'bill_1', amount: 100 });
  paidTopup(s, { checkoutId: 'bill_1' });
  walletAdjust(s, { kind: 'debit', amount: 90 });
  assert.equal(reverseTopup(s, { checkoutId: 'bill_1', kind: 'dispute_lost' }), true);
  assert.equal(reverseTopup(s, { checkoutId: 'bill_1' }), false);
  assert.equal(s.wallet.balance, -90);
  assert.deepEqual(facts(s).map(fact => [fact.kind, fact.amountCents]), [['wallet_topup', 10000], ['wallet_debit', -9000], ['dispute_lost', -10000]]);
  assert.equal(paidTopup(s, { checkoutId: 'bill_1' }), false, 'um aviso atrasado não credita de novo');
});

async function plan(t, options) {
  const b = await startBilling(t, options), conn = await b.connect('agency');
  const planId = (await b.send('/api/agency/action', { type: 'save', key: 'plans', data: { name: 'Pro', price: 297, trialDays: 0 } })).body.result;
  await b.send('/api/agency/action', { type: 'account-meta', id: 'demo', data: { plan: planId, status: 'Active' } });
  const agency = async () => (await b.send('/api/agency')).body.agency;
  const { body } = await b.send('/api/abacatepay/agency/subscribe', { workspace: 'demo' });
  const { checkoutId } = body.agency.accounts.demo.billing;
  const event = (name, { payment = { id: 'card_1', amount: 29700, paidAmount: 29700, platformFee: 900 }, subscription = {}, checkout = {}, ...rest } = {}) =>
    ({ event: name, data: { subscription: { id: 'subs_1', status: 'ACTIVE', method: 'CARD', ...subscription }, checkout: { id: checkoutId, frequency: 'SUBSCRIPTION', ...checkout }, payment, ...rest } });
  return { ...b, conn, planId, checkoutId, event, agency, account: async () => (await agency()).accounts.demo };
}

test('Plano pago entra uma vez, mesmo com os dois avisos e com reenvio', async t => {
  const c = await plan(t);
  await c.deliver(c.conn, c.event('subscription.completed'));
  await c.deliver(c.conn, c.event('checkout.completed', { checkout: { paidAmount: 29700 } }));
  await c.deliver(c.conn, c.event('subscription.completed'));
  assert.equal((await c.account()).billing.payments.length, 1);
  let rows = await c.rows('agency');
  assert.deepEqual(rows.map(row => [row.key, row.kind, row.amount_cents, row.fee_cents, row.workspace_id]), [['agency:plan:abacatepay:card_1', 'plan_payment', 29700, 900, 'demo']]);
  await c.deliver(c.conn, c.event('subscription.renewed', { payment: { id: 'card_2', amount: 29700 } }));
  rows = await c.rows('agency');
  assert.equal(rows.length, 2);
  assert.deepEqual(await c.rows('account'), [], 'plano não é venda da subconta');
});

test('Plano sem id de pagamento atualiza a assinatura e não lança automaticamente', async t => {
  const c = await plan(t);
  const warn = console.warn; console.warn = () => {}; t.after(() => { console.warn = warn; });
  await c.deliver(c.conn, c.event('subscription.completed', { payment: { amount: 29700 } }));
  assert.equal((await c.account()).billing.status, 'Active');
  assert.deepEqual(await c.rows('agency'), []);
});

test('Teste grátis e modo de teste do gateway não entram no livro', async t => {
  const c = await plan(t);
  await c.deliver(c.conn, c.event('subscription.trial_started', { payment: { id: 'card_0', amount: 0 } }));
  assert.deepEqual(await c.rows('agency'), []);
  const dev = await plan(t, { devMode: true });
  await dev.deliver(dev.conn, dev.event('subscription.completed'));
  assert.equal((await dev.account()).billing.status, 'Active');
  assert.deepEqual(await dev.rows('agency'), []);
});

test('Reembolso de plano lança o negativo uma vez e não suspende', async t => {
  const c = await plan(t);
  await c.deliver(c.conn, c.event('subscription.completed'));
  const refund = { event: 'checkout.refunded', data: { checkout: { id: c.checkoutId, frequency: 'SUBSCRIPTION', status: 'REFUNDED', amount: 29700 } } };
  await c.deliver(c.conn, refund);
  await c.deliver(c.conn, refund);
  assert.equal(await c.sum('agency'), 0);
  assert.equal((await c.rows('agency')).length, 2);
  assert.equal((await c.account()).status, 'Active');
});

test('Reenvio de um reembolso antigo não devolve a renovação', async t => {
  const c = await plan(t), pause = () => new Promise(resolve => setTimeout(resolve, 5));
  const refund = updatedAt => c.deliver(c.conn, { event: 'checkout.refunded', data: { checkout: { id: c.checkoutId, frequency: 'SUBSCRIPTION', status: 'REFUNDED', amount: 29700, ...(updatedAt && { updatedAt }) } } });
  await c.deliver(c.conn, c.event('subscription.completed'));
  await pause();
  const first = new Date().toISOString();
  await refund(first);
  await pause();
  await c.deliver(c.conn, c.event('subscription.renewed', { payment: { id: 'card_2', amount: 29700 } }));
  await refund(first);
  assert.equal(await c.sum('agency'), 29700, 'a renovação continua no livro');
  await refund();
  assert.equal(await c.sum('agency'), 29700, 'sem a data, na dúvida não lança');
  await pause();
  await refund(new Date().toISOString());
  assert.equal(await c.sum('agency'), 0, 'o reembolso da renovação entra');
  assert.deepEqual((await c.rows('agency')).map(row => row.key).sort(), ['agency:plan:abacatepay:card_1', 'agency:plan:abacatepay:card_2', 'agency:refund:abacatepay:card_1', 'agency:refund:abacatepay:card_2']);
});

test('Contestação de plano: aberta vale zero, ganha zero, perdida devolve uma vez', async t => {
  const c = await plan(t);
  await c.deliver(c.conn, c.event('subscription.completed'));
  const dispute = status => c.deliver(c.conn, { event: 'checkout.disputed', data: { checkout: { id: c.checkoutId, frequency: 'SUBSCRIPTION', status, amount: 29700 } } });
  await dispute('UNDER_DISPUTE'); await dispute('PAID');
  assert.equal(await c.sum('agency'), 29700);
  await dispute('REFUNDED'); await dispute('REFUNDED');
  assert.equal(await c.sum('agency'), 0);
  assert.deepEqual((await c.rows('agency')).map(row => row.kind).sort(), ['dispute_lost', 'dispute_opened', 'dispute_won', 'plan_payment']);
});

test('Recarga pelo gateway: credita, devolve e contesta na conta da agência', async t => {
  const c = await plan(t);
  await c.send('/api/agency/action', { type: 'saas-rebilling', data: { email: 2, cost_email: 1 } });
  await c.send('/api/agency/action', { type: 'rebill-account', id: 'demo', data: { products: ['email'] } });
  const topup = (await c.send('/api/wallet/topup?workspace=demo', { amount: 100 })).body;
  assert.ok(topup.checkoutId, JSON.stringify(topup));
  const event = (name, extra) => ({ event: name, data: { checkout: { id: topup.checkoutId, frequency: 'ONE_TIME', status: 'PAID', amount: 10000, platformFee: 80, metadata: { walletTopup: 'demo' }, ...extra }, payerInformation: { method: 'PIX' } } });
  await c.deliver(c.conn, event('checkout.completed', { paidAmount: 10000 }));
  assert.equal(c.store.load('demo').wallet.balance, 100);
  await c.deliver(c.conn, event('checkout.disputed', { status: 'UNDER_DISPUTE' }));
  assert.equal(await c.sum('agency'), 10000);
  await c.deliver(c.conn, event('checkout.disputed', { status: 'REFUNDED' }));
  await c.deliver(c.conn, event('checkout.refunded', { status: 'REFUNDED' }));
  assert.equal(c.store.load('demo').wallet.balance, 0);
  assert.equal(await c.sum('agency'), 0);
  const [row] = (await c.rows('agency')).filter(item => item.kind === 'wallet_topup');
  assert.deepEqual([row.fee_cents, row.workspace_id, row.seller.name.length > 0], [80, 'demo', true]);
  assert.deepEqual(await c.rows('account'), []);
});
