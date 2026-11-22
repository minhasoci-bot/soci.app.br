import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { blankAgency, executeAgency } from '../agency-model.mjs';
import { checkAiBudget, recordAiUsage } from '../ai-model.mjs';
import { addTopup, paidTopup, pricingFor, setPricing, walletAdjust, walletSummary } from '../wallet-model.mjs';
import { emailResults } from '../email-campaign-model.mjs';
import { makeServer } from '../server.mjs';
import { signBody } from '../abacatepay.mjs';

const agencyWith = () => {
  const agency = blankAgency();
  executeAgency(agency, { type: 'saas-rebilling', data: { ...agency.saas.rebilling, ai: 2, email: 3, whatsapp: 1.5, cost_ai: 6, cost_email: 1, cost_whatsapp: 0.1, lowBalance: 10 } }, { accountIds: ['demo'] });
  executeAgency(agency, { type: 'rebill-account', id: 'demo', data: { products: ['ai', 'email', 'whatsapp', 'phone'] } }, { accountIds: ['demo'] });
  return agency;
};

test('Agency prices: unit cost and markup per product, rebilled sub-accounts only', () => {
  const agency = agencyWith();
  assert.deepEqual(agency.saas.rebill.demo, ['ai', 'email', 'whatsapp', 'phone'], 'only products with metered usage (calls are metered by minute)');
  assert.throws(() => executeAgency(agency, { type: 'rebill-account', id: 'other', data: { products: ['ai'] } }, { accountIds: ['demo'] }), /Sub-account/);
  assert.throws(() => executeAgency(agency, { type: 'saas-rebilling', data: { ...agency.saas.rebilling, cost_ai: -1 } }, { accountIds: ['demo'] }), /custo/i);
  const { pricing, lowAt } = pricingFor(agency, 'demo');
  assert.deepEqual(pricing, { ai: { unit: 6, markup: 2 }, email: { unit: 0.001, markup: 3 }, whatsapp: { unit: 0.1, markup: 1.5 }, phone: { unit: 0.12, markup: 1 } });
  assert.equal(lowAt, 10);
  assert.deepEqual(pricingFor(agency, 'nobody').pricing, {});
});

test('Usage is charged with the markup; AI stops at zero, sends go negative; a paid recharge counts once', () => {
  const s = blank();
  const ana = execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana', email: 'ana@x.test', phone: '+5511999990000', tags: [] } });
  // Without rebilling nothing is charged.
  execute(s, { type: 'message', data: { contactId: ana, channel: 'WhatsApp', direction: 'Outbound', body: 'Oi' } });
  assert.equal(s.wallet.balance, 0);
  setPricing(s, pricingFor(agencyWith(), 'demo'));
  walletAdjust(s, { kind: 'credit', amount: 50, note: 'Pix recebido' });
  recordAiUsage(s, { kind: 'other', model: 'gpt-5-mini', usage: { input_tokens: 1_000_000, output_tokens: 0 } }); // US$ 0,25
  execute(s, { type: 'message', data: { contactId: ana, channel: 'Email', direction: 'Outbound', subject: 'Oi', body: 'Oi' } });
  execute(s, { type: 'message', data: { contactId: ana, channel: 'WhatsApp', direction: 'Outbound', body: 'Oi' } });
  execute(s, { type: 'message', data: { contactId: ana, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi' } });
  execute(s, { type: 'message', data: { contactId: ana, channel: 'Note', direction: 'Outbound', body: 'nota' } });
  assert.equal(s.wallet.balance, 46.847, '50 − 3,00 (IA) − 0,003 (e-mail) − 0,15 (WhatsApp)');
  const summary = walletSummary(s);
  assert.deepEqual([summary.month.amount, summary.month.cost, summary.month.profit], [3.15, 1.6, 1.55]);
  assert.equal(s.wallet.entries.filter(e => e.kind === 'usage' && e.product === 'whatsapp').length, 1, 'one statement line per product and day');

  walletAdjust(s, { kind: 'debit', amount: 46.85, note: 'ajuste' });
  assert.ok(s.wallet.balance <= 0);
  assert.throws(() => checkAiBudget(s), err => err.status === 402 && /créditos/.test(err.message));
  execute(s, { type: 'message', data: { contactId: ana, channel: 'WhatsApp', direction: 'Outbound', body: 'Oi de novo' } });
  assert.ok(s.wallet.balance < -0.1, 'sends keep going and the balance turns negative');
  assert.equal(walletSummary(s).low, true);

  addTopup(s, { checkoutId: 'chk_1', amount: 100, url: 'https://pay', createdAt: '2026-11-21T10:00:00Z' });
  const before = s.wallet.balance;
  assert.equal(paidTopup(s, { checkoutId: 'chk_1', method: 'Pix' }), 100);
  assert.equal(paidTopup(s, { checkoutId: 'chk_1', method: 'Pix' }), false, 'never twice');
  assert.equal(Math.round((s.wallet.balance - before) * 100) / 100, 100);
  checkAiBudget(s);
});

test('Campaign e-mails delivered are charged to the wallet', () => {
  const s = blank();
  setPricing(s, pricingFor(agencyWith(), 'demo'));
  s.emailCampaigns = [{ id: 'c1', name: 'Novidades', status: 'sending', recipients: [{ c: 'x', t: 'tx', st: 'sending' }, { c: 'y', t: 'ty', st: 'sending' }] }];
  emailResults(s, [{ campaignId: 'c1', token: 'tx', ok: true }, { campaignId: 'c1', token: 'ty', ok: false, error: 'bounce' }], Date.parse('2026-11-21T12:00:00Z'));
  assert.equal(s.wallet.balance, -0.003);
});

const KEY = 'abc_dev_agencykey_0000aaaa';
function fakeAbacate() {
  const products = new Set();
  let seq = 0;
  const ok = data => new Response(JSON.stringify({ data, error: null, success: true }), { status: 200 });
  return async (url, init = {}) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    if (u.pathname === '/v2/stores/get') return ok({ id: 'store_1', name: 'Agência Teste' });
    if (u.pathname === '/v2/products/create') { products.add(body.externalId); return ok({ id: body.externalId }); }
    if (u.pathname === '/v2/checkouts/create') { const id = `bill_${++seq}`; return ok({ id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode: true }); }
    return new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404 });
  };
}

test('Agency sets prices, credits a wallet, the client recharges by Pix and AI stops without credit', async t => {
  const contentAI = { askAssistant: async () => ({ text: 'Resposta.', sources: [] }) };
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false, contentAI,
    openAISecret: 'abacate-test-seal-secret-32-chars!!', abacatePayRequest: fakeAbacate() });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body) => { const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const state = async () => (await send('/api/state?workspace=demo')).body.state;

  const agency = (await send('/api/agency')).body.agency;
  await send('/api/agency/action', { type: 'saas-rebilling', data: { ...agency.saas.rebilling, ai: 2, cost_ai: 6 } });
  await send('/api/agency/action', { type: 'rebill-account', id: 'demo', data: { products: ['ai'] } });
  assert.deepEqual((await state()).wallet.pricing, { ai: { unit: 6, markup: 2 } }, 'prices are pushed to the sub-account');
  assert.equal((await send('/api/action?workspace=demo', { type: 'save', key: 'wallet', data: { balance: 999 } })).status, 400, 'the client cannot write its wallet');

  assert.equal((await send('/api/agency/subaccount-wallet', { workspace: 'demo', kind: 'credit', amount: 0 })).status, 400);
  const credited = await send('/api/agency/subaccount-wallet', { workspace: 'demo', kind: 'credit', amount: 20, note: 'Pix de novembro' });
  assert.equal(credited.status, 200, JSON.stringify(credited.body));
  assert.equal(credited.body.overview.accounts.find(a => a.id === 'demo').wallet.balance, 20);

  await send('/api/action?workspace=demo', { type: 'visibility-settings', data: { brand: 'Marca', prompts: ['Qual a melhor marca?'] } });
  assert.equal((await send('/api/visibility/run?workspace=demo', {})).status, 200, 'with credit the AI works');
  await send('/api/agency/subaccount-wallet', { workspace: 'demo', kind: 'debit', amount: 20, note: 'zerar' });
  const blocked = await send('/api/visibility/run?workspace=demo', {});
  assert.equal(blocked.status, 402);
  assert.match(blocked.body.error, /créditos/);

  assert.equal((await send('/api/wallet/topup?workspace=demo', { amount: 50 })).status, 409, 'the agency must connect AbacatePay');
  const connected = (await send('/api/abacatepay/agency/connect', { apiKey: KEY })).body;
  assert.equal((await send('/api/wallet/topup?workspace=demo', { amount: 5 })).status, 400, 'minimum R$ 10');
  const topup = await send('/api/wallet/topup?workspace=demo', { amount: 50 });
  assert.equal(topup.status, 200, JSON.stringify(topup.body));
  assert.match(topup.body.url, /^https:\/\/app\.abacatepay\.com\/pay\//);
  const raw = JSON.stringify({ id: 'log_w1', event: 'checkout.completed', data: { checkout: { id: topup.body.checkoutId, frequency: 'ONE_TIME', metadata: { walletTopup: 'demo' } }, payerInformation: { method: 'PIX' } } });
  const hook = () => fetch(`${connected.webhookUrl}?webhookSecret=${connected.webhookSecret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signBody(raw) }, body: raw }).then(r => r.json());
  assert.equal((await hook()).handled, true);
  const after = await state();
  assert.equal(after.wallet.topups[0].status, 'PAID');
  assert.ok(Math.abs(after.wallet.balance - 50) < 0.05, `recharged: ${after.wallet.balance}`);
  assert.equal((await send('/api/visibility/run?workspace=demo', {})).status, 200, 'AI is back');
});
