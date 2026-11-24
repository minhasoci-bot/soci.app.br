// A stand-in for api.abacatepay.com/v2 and a server wired to it, for the billing tests.
import { makeServer } from '../../server.mjs';
import { signBody } from '../../abacatepay.mjs';
import { createSqliteStore } from '../../storage.mjs';
import { saveFiscal } from './fiscal.mjs';

export const KEY_AGENCY = 'abc_live_agencykey_0000aaaa';
export const KEY_SHOP = 'abc_live_shopkey_0000bbbb';

export function fakeAbacate({ devMode = false } = {}) {
  const calls = [], products = new Map(), checkouts = new Map(), webhooks = [];
  const state = { refuseEvents: [], failCreateWebhook: false };
  let seq = 0;
  const ok = data => new Response(JSON.stringify({ data, error: null, success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const bad = (status, error) => new Response(JSON.stringify({ data: null, error, success: false }), { status });
  async function request(url, init = {}) {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null, auth = init.headers?.Authorization || '';
    calls.push({ path: u.pathname, method: init.method || 'GET', body, auth, query: Object.fromEntries(u.searchParams) });
    if (![KEY_AGENCY, KEY_SHOP].some(key => auth === `Bearer ${key}`)) return bad(401, 'Invalid or inactive API key');
    if (u.pathname === '/v2/stores/get') return ok({ id: 'store_1', name: auth.includes('agency') ? 'Agência Teste' : 'Loja Teste', balance: 0 });
    if (u.pathname === '/v2/products/create') {
      if (products.has(body.externalId)) return bad(400, 'Product with this externalId already exists');
      products.set(body.externalId, body);
      return ok({ id: `prod_${++seq}`, ...body, status: 'ACTIVE' });
    }
    if (u.pathname === '/v2/checkouts/create' || u.pathname === '/v2/subscriptions/create') {
      if (!products.has(body.items[0].id)) return bad(400, `Product ${body.items[0].id} not found`);
      const id = `bill_${++seq}`, row = { id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode, amount: products.get(body.items[0].id).price, externalId: body.externalId };
      checkouts.set(id, row);
      return ok(row);
    }
    if (u.pathname === '/v2/checkouts/get') return checkouts.has(u.searchParams.get('id')) ? ok(checkouts.get(u.searchParams.get('id'))) : bad(400, 'Billing not found');
    if (u.pathname === '/v2/subscriptions/cancel') return ok({ id: body.id, status: 'CANCELLED' });
    if (u.pathname === '/v2/webhooks/create') {
      if (state.failCreateWebhook) return bad(500, 'Internal error');
      const refused = body.events.filter(event => state.refuseEvents.includes(event));
      if (refused.length) return bad(400, `Invalid events: ${refused.join(', ')}`);
      const row = { id: `webh_${++seq}`, ...body };
      webhooks.push(row);
      return ok(row);
    }
    if (u.pathname === '/v2/webhooks/list') return ok(webhooks);
    if (u.pathname === '/v2/webhooks/delete') { const at = webhooks.findIndex(row => row.id === body.id); if (at >= 0) webhooks.splice(at, 1); return ok({ id: body.id }); }
    return bad(404, 'Not found');
  }
  return { request, calls, products, checkouts, webhooks, state };
}

/** A local server with the fake gateway. `rows(layer)` sends what is waiting and reads the ledger. */
export async function startBilling(t, { devMode = false, documentMail, store = createSqliteStore(':memory:') } = {}) {
  const gateway = fakeAbacate({ devMode });
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0, socialScheduler: false,
    openAISecret: 'abacate-seal-secret-for-the-tests-32', abacatePayRequest: gateway.request, ...(documentMail && { documentMail }) });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); }));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const save = (key, data, id) => send('/api/action?workspace=demo', { type: 'save', key, id, data });
  const state = async () => (await send('/api/state?workspace=demo')).body.state;
  const connect = async (scope = 'workspace') => {
    const path = scope === 'agency' ? '/api/abacatepay/agency/connect' : '/api/abacatepay/workspace/connect?workspace=demo';
    await send(scope === 'agency' ? '/api/agency/action' : '/api/action?workspace=demo', saveFiscal);
    const { body } = await send(path, { apiKey: scope === 'agency' ? KEY_AGENCY : KEY_SHOP });
    return body;
  };
  let events = 0;
  const deliver = async (conn, event, { sign = true, secret = conn.webhookSecret, id = `log_${++events}` } = {}) => {
    const raw = JSON.stringify({ id, apiVersion: 2, devMode, ...event });
    const r = await fetch(`${conn.webhookUrl}?webhookSecret=${secret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': sign ? signBody(raw) : 'x' }, body: raw });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  async function rows(layer = 'account', agencyId = 'agency') {
    for (let i = 0; i < 60; i++) {
      const waiting = store.list().some(({ id }) => { try { return store.load(id).ledgerOutbox?.length; } catch { return false; } });
      if (!waiting) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return (await store.ledgerList({ layer, agencyId, from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z', limit: 1000 })).rows;
  }
  const sum = async (layer, agencyId) => (await rows(layer, agencyId)).reduce((total, row) => total + row.amount_cents, 0);
  return { base, store, gateway, send, save, state, connect, deliver, rows, sum };
}

/** A sub-account with a SaaS plan and its subscription created (not paid yet). */
export async function planBilling(t, { enabled = true, ...options } = {}) {
  const mails = [];
  const documentMail = { configured: true, linkOf: () => '', email: async (to, message, idempotency) => { mails.push({ to, ...message, idempotency }); return 'e-mail enviado'; } };
  const b = await startBilling(t, { documentMail, ...options }), conn = await b.connect('agency');
  const action = body => b.send('/api/agency/action', body);
  await action({ type: 'saas-suspension', data: { enabled, maxRetry: 3, retryEvery: 1 } });
  const planId = (await action({ type: 'save', key: 'plans', data: { name: 'Pro', price: 297, trialDays: 7 } })).body.result;
  await action({ type: 'account-meta', id: 'demo', data: { plan: planId, status: 'Active' } });
  await action({ type: 'save', key: 'users', data: { first: 'Rui', last: 'Dono', email: 'rui@agencia.com', role: 'Agency Admin' } });
  const subscribe = () => b.send('/api/abacatepay/agency/subscribe', { workspace: 'demo' });
  const created = await subscribe();
  if (created.status !== 200) throw new Error(JSON.stringify(created.body));
  const account = async () => (await b.send('/api/agency')).body.agency.accounts.demo;
  const checkout = (await account()).billing.checkoutId;
  const event = (name, { subscriptionId = 'subs_1', checkoutId = checkout, subscription = {}, ...rest } = {}) =>
    ({ event: name, data: { subscription: { id: subscriptionId, status: name === 'subscription.cancelled' ? 'CANCELLED' : 'ACTIVE', method: 'CARD', ...subscription }, checkout: { id: checkoutId, frequency: 'SUBSCRIPTION' }, ...rest } });
  const deliver = value => b.deliver(conn, value);
  const paid = (id = 'card_1', extra = {}) => deliver(event('subscription.completed', { payment: { id, amount: 29700, platformFee: 900 }, ...extra }));
  return { ...b, conn, mails, action, subscribe, account, event, deliver, paid, checkout, planId };
}
