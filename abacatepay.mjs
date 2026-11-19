// AbacatePay: the payment gateway. The agency connects one account to bill its SaaS plans (subscriptions)
// and each sub-account may connect its own account to collect invoices and store orders (hosted checkout).
// API keys are sealed with GO_STORAGE_KEY in a row of their own; webhooks prove their origin with the
// per-connection secret in the URL and their integrity with the HMAC-SHA256 signature of the raw body.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { execute } from './model.mjs';

export const ABACATEPAY_API = 'https://api.abacatepay.com/v2';
// Published by AbacatePay for every account: it signs the body, the secret proves the sender.
export const ABACATEPAY_SIGNATURE_KEY = 't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';
export const webhookEvents = ['checkout.completed', 'checkout.refunded', 'transparent.completed', 'transparent.refunded',
  'subscription.completed', 'subscription.trial_started', 'subscription.renewed', 'subscription.cancelled'];
const AGENCY_SCOPE = 'agency';
const methodNames = { PIX: 'Pix', CARD: 'Card', BOLETO: 'Boleto' };

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const rowId = agencyId => `abacatepay-${agencyId}`;
const stamp = () => new Date().toISOString();
const cents = value => Math.round(Number(value || 0) * 100);
const clean = (value, limit = 200) => String(value ?? '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').trim().slice(0, limit);

function deriveKey(secret) {
  const material = typeof secret === 'string' && secret.trim() ? secret.trim() : 'soci-local-dev-abacatepay-seal-key-do-not-use-without-env';
  return createHash('sha256').update(material).digest();
}
function seal(secret, aad, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}
function unseal(secret, aad, sealed) {
  const parts = String(sealed || '').split('.');
  if (parts.length !== 3) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(parts[0], 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'base64url')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
export function signBody(raw) {
  return createHmac('sha256', ABACATEPAY_SIGNATURE_KEY).update(raw).digest('base64');
}

const blankRow = () => ({ profile: { name: 'AbacatePay' }, agency: null, subaccounts: {}, seen: [] });
function normalizeConn(raw) {
  if (!raw || typeof raw !== 'object' || !raw.keySealed) return null;
  return {
    keySealed: String(raw.keySealed), last4: String(raw.last4 || '').slice(-4), storeName: String(raw.storeName || '').slice(0, 120),
    storeId: String(raw.storeId || '').slice(0, 80), devMode: Boolean(raw.devMode),
    webhookSecret: typeof raw.webhookSecret === 'string' && raw.webhookSecret.length >= 32 ? raw.webhookSecret : randomBytes(24).toString('hex'),
    webhookStatus: ['registered', 'manual', 'failed'].includes(raw.webhookStatus) ? raw.webhookStatus : 'manual',
    webhookError: String(raw.webhookError || '').slice(0, 240), connectedAt: String(raw.connectedAt || '')
  };
}
function normalizeRow(raw) {
  const row = { ...blankRow(), ...(raw && typeof raw === 'object' ? raw : {}) };
  row.profile = { name: 'AbacatePay' };
  row.agency = normalizeConn(row.agency);
  const subs = row.subaccounts && typeof row.subaccounts === 'object' ? row.subaccounts : {};
  row.subaccounts = Object.fromEntries(Object.entries(subs).map(([id, conn]) => [id, normalizeConn(conn)]).filter(([, conn]) => conn));
  row.seen = Array.isArray(row.seen) ? row.seen.filter(id => typeof id === 'string').slice(-300) : [];
  return row;
}
const connOf = (row, scope) => scope === AGENCY_SCOPE ? row.agency : row.subaccounts[scope] || null;
const aadOf = (agencyId, scope) => `${rowId(agencyId)}:${scope}`;
const webhookPath = (agencyId, scope) => `/api/abacatepay/webhook/${encodeURIComponent(agencyId)}/${encodeURIComponent(scope)}`;

function resolvePath(url) {
  let raw = url.searchParams.get('__path') || url.pathname;
  if (!raw.startsWith('/')) raw = '/' + raw;
  return raw.replace(/\/+/g, '/');
}
async function rawBody(req, limit = 512000) {
  let size = 0; const chunks = [];
  for await (const part of req) { size += part.length; if (size > limit) throw fail('Request is too large.', 413); chunks.push(part); }
  return Buffer.concat(chunks);
}

export function createAbacatePayHandler({ store, secret = process.env.GO_STORAGE_KEY, request = fetch, baseUrl = ABACATEPAY_API }) {
  async function loadRow(agencyId) {
    try { return normalizeRow(await store.load(rowId(agencyId))); }
    catch (err) { if (err?.status !== 404) throw err; }
    await store.insert(rowId(agencyId), blankRow());
    return normalizeRow(await store.load(rowId(agencyId)));
  }
  async function changeRow(agencyId, mutate) {
    await loadRow(agencyId);
    let updated;
    await store.change(rowId(agencyId), raw => {
      const row = normalizeRow(raw);
      const result = mutate(row);
      updated = normalizeRow(row);
      Object.assign(raw, updated);
      return result;
    });
    return updated;
  }

  async function call(apiKey, path, { method = 'GET', body, query } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const init = { method, headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    let res;
    try { res = await request(`${baseUrl}${path}${qs}`, init); }
    catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw fail('O AbacatePay não respondeu a tempo.', 504);
      throw fail(`Não foi possível falar com o AbacatePay: ${err?.message || 'erro de rede'}.`, 502);
    }
    const text = await res.text().catch(() => '');
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text.slice(0, 200) }; }
    if (!res.ok || parsed.success === false || parsed.error) {
      const message = typeof parsed.error === 'string' ? parsed.error : parsed.message || `HTTP ${res.status}`;
      throw Object.assign(fail(res.status === 401 ? `Chave do AbacatePay recusada: ${message}` : `AbacatePay: ${message}`, res.status === 401 ? 400 : 502), { gateway: message });
    }
    return parsed.data ?? parsed;
  }
  const keyOf = (row, agencyId, scope) => {
    const conn = connOf(row, scope);
    const key = conn && unseal(secret, aadOf(agencyId, scope), conn.keySealed);
    if (!key) throw fail(scope === AGENCY_SCOPE ? 'Conecte o AbacatePay da agência em Configurações → AbacatePay.' : 'Conecte o AbacatePay desta subconta em Configurações → Integrações.', 409);
    return key;
  };

  function view(row, agencyId, scope, publicOrigin) {
    const conn = connOf(row, scope);
    if (!conn) return { connected: false, webhookUrl: `${publicOrigin}${webhookPath(agencyId, scope)}`, events: webhookEvents };
    return {
      connected: true, storeName: conn.storeName, last4: conn.last4, devMode: conn.devMode, connectedAt: conn.connectedAt,
      webhookStatus: conn.webhookStatus, webhookError: conn.webhookError, events: webhookEvents,
      webhookUrl: `${publicOrigin}${webhookPath(agencyId, scope)}`, webhookSecret: conn.webhookSecret
    };
  }

  async function connect(agencyId, scope, apiKeyRaw, publicOrigin) {
    const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : '';
    if (apiKey.length < 12 || apiKey.length > 400 || /\s/.test(apiKey)) throw fail('Cole a chave de API v2 do AbacatePay (app.abacatepay.com → Chaves de API).');
    const shop = await call(apiKey, '/stores/get');
    const webhookSecret = randomBytes(24).toString('hex');
    const endpoint = `${publicOrigin}${webhookPath(agencyId, scope)}`;
    let webhookStatus = 'manual', webhookError = '';
    if (/^https:\/\//i.test(endpoint)) {
      try {
        await call(apiKey, '/webhooks/create', { method: 'POST', body: { name: `soci · ${scope === AGENCY_SCOPE ? 'agência' : 'subconta'}`, endpoint, secret: webhookSecret, events: webhookEvents } });
        webhookStatus = 'registered';
      } catch (err) { webhookStatus = 'failed'; webhookError = err.gateway || err.message; }
    } else webhookError = 'O endereço do app não é HTTPS público; cadastre o webhook no painel do AbacatePay quando publicar.';
    const row = await changeRow(agencyId, current => {
      const conn = {
        keySealed: seal(secret, aadOf(agencyId, scope), apiKey), last4: apiKey.slice(-4), storeName: clean(shop?.name || shop?.store?.name, 120),
        storeId: clean(shop?.id || shop?.store?.id, 80), devMode: Boolean(shop?.devMode) || /test|dev/i.test(apiKey.slice(0, 12)),
        webhookSecret, webhookStatus, webhookError, connectedAt: stamp()
      };
      if (scope === AGENCY_SCOPE) current.agency = conn; else current.subaccounts[scope] = conn;
    });
    return view(row, agencyId, scope, publicOrigin);
  }
  async function disconnect(agencyId, scope, publicOrigin) {
    const row = await changeRow(agencyId, current => { if (scope === AGENCY_SCOPE) current.agency = null; else delete current.subaccounts[scope]; });
    return view(row, agencyId, scope, publicOrigin);
  }

  // A product per price: AbacatePay checkouts are built from catalog items, addressed by their externalId.
  async function ensureProduct(apiKey, product) {
    try { await call(apiKey, '/products/create', { method: 'POST', body: { currency: 'BRL', ...product } }); }
    catch (err) { if (!/exist|duplicad|already/i.test(err.gateway || '')) throw err; }
    return product.externalId;
  }

  async function createCheckout(agencyId, scope, { reference, name, amount, returnUrl, completionUrl, metadata }) {
    const row = await loadRow(agencyId);
    const apiKey = keyOf(row, agencyId, scope);
    const price = cents(amount);
    if (price < 100) throw fail('O AbacatePay cobra a partir de R$ 1,00.');
    const productId = await ensureProduct(apiKey, { externalId: `soci-${reference}-${price}`, name: clean(name, 120) || 'Cobrança', price });
    const body = { items: [{ id: productId, quantity: 1 }], externalId: `${reference}-${Date.now().toString(36)}`, methods: ['PIX', 'CARD'], metadata };
    if (/^https?:\/\//.test(returnUrl || '')) body.returnUrl = returnUrl;
    if (/^https?:\/\//.test(completionUrl || '')) body.completionUrl = completionUrl;
    const checkout = await call(apiKey, '/checkouts/create', { method: 'POST', body });
    if (!checkout?.id || !checkout?.url) throw fail('O AbacatePay não devolveu o link de pagamento.', 502);
    return { provider: 'abacatepay', checkoutId: String(checkout.id), url: String(checkout.url), status: String(checkout.status || 'PENDING'),
      amount: price / 100, devMode: Boolean(checkout.devMode), createdAt: stamp() };
  }

  // ---- Sub-account: invoices and store orders ----------------------------------------------
  async function chargeInvoice(agencyId, workspaceId, invoiceId, publicOrigin, { returnUrl, completionUrl } = {}) {
    const state = await store.load(workspaceId);
    const invoice = state.invoices?.find(item => item.id === invoiceId);
    if (!invoice) throw fail('Fatura não encontrada.', 404);
    if (invoice.status === 'Paid') throw fail('Esta fatura já está paga.', 409);
    if (invoice.status === 'Void') throw fail('Esta fatura foi cancelada.', 409);
    const reuse = invoice.payment?.provider === 'abacatepay' && invoice.payment.status === 'PENDING' && invoice.payment.amount === invoice.value;
    if (reuse) return invoice.payment;
    const back = `${publicOrigin}/app#payments`;
    const payment = await createCheckout(agencyId, workspaceId, {
      reference: `inv-${invoiceId}`, name: invoice.title, amount: invoice.value,
      returnUrl: returnUrl || back, completionUrl: completionUrl || back, metadata: { workspace: workspaceId, invoiceId }
    });
    await store.change(workspaceId, current => {
      const row = current.invoices.find(item => item.id === invoiceId);
      if (!row) throw fail('Fatura não encontrada.', 404);
      row.payment = payment;
      if (row.status === 'Draft') row.status = 'Open';
      row.updated = stamp();
    });
    return payment;
  }

  function paidInvoice(state, { checkoutId, invoiceId, method, receiptUrl }) {
    const invoice = state.invoices.find(item => (checkoutId && item.payment?.checkoutId === checkoutId) || (invoiceId && item.id === invoiceId));
    if (!invoice) return false;
    invoice.payment = { ...(invoice.payment || { provider: 'abacatepay', checkoutId }), status: 'PAID', paidAt: stamp(), method, receiptUrl: receiptUrl || '' };
    if (invoice.status === 'Paid') return true;
    invoice.paidMethod = method;
    const order = state.orders?.find(item => item.invoiceId === invoice.id && item.status === 'Pending');
    if (order) {
      order.paidMethod = method;
      execute(state, { type: 'save', key: 'orders', id: order.id, data: { id: order.id, status: 'Paid', note: order.note, tracking: order.tracking } });
    } else {
      execute(state, { type: 'save', key: 'invoices', id: invoice.id, data: { title: invoice.title, contactId: invoice.contactId, value: invoice.value, due: invoice.due, status: 'Paid' } });
    }
    return true;
  }
  function refundedInvoice(state, checkoutId) {
    const invoice = state.invoices.find(item => item.payment?.checkoutId === checkoutId);
    if (!invoice) return false;
    invoice.payment = { ...invoice.payment, status: 'REFUNDED', refundedAt: stamp() };
    for (const tx of state.transactions || []) if (tx.invoiceId === invoice.id) tx.status = 'Refunded';
    return true;
  }

  // ---- Agency: SaaS plans billed as subscriptions -------------------------------------------
  async function subscribe(agencyId, workspaceId, plan, publicOrigin) {
    const row = await loadRow(agencyId);
    const apiKey = keyOf(row, agencyId, AGENCY_SCOPE);
    if (!plan) throw fail('Atribua um plano SaaS a esta subconta antes de gerar a assinatura.');
    const price = cents(plan.price);
    if (price < 100) throw fail('O plano precisa custar pelo menos R$ 1,00.');
    const product = { externalId: `soci-plan-${plan.id}-${price}`, name: clean(plan.name, 120) || 'Plano', price, cycle: 'MONTHLY' };
    const trial = Math.round(Number(plan.trialDays) || 0);
    if (trial >= 1 && trial <= 90) { product.trialDays = trial; product.externalId += `-t${trial}`; }
    const productId = await ensureProduct(apiKey, product);
    const body = { items: [{ id: productId, quantity: 1 }], externalId: `saas-${workspaceId}-${Date.now().toString(36)}`, methods: ['PIX', 'CARD'],
      completionUrl: `${publicOrigin}/app`, returnUrl: `${publicOrigin}/app`, metadata: { workspace: workspaceId, planId: plan.id } };
    let checkout;
    try { checkout = await call(apiKey, '/subscriptions/create', { method: 'POST', body }); }
    catch (err) {
      if (!/PIX is not available/i.test(err.gateway || '')) throw err;
      checkout = await call(apiKey, '/subscriptions/create', { method: 'POST', body: { ...body, methods: ['CARD'] } });
    }
    if (!checkout?.id || !checkout?.url) throw fail('O AbacatePay não devolveu o link da assinatura.', 502);
    return { provider: 'abacatepay', checkoutId: String(checkout.id), url: String(checkout.url), status: 'Pending', planId: plan.id, planName: plan.name,
      amount: price / 100, subscriptionId: '', devMode: Boolean(checkout.devMode), createdAt: stamp(), updatedAt: stamp(), payments: [] };
  }
  async function cancelSubscription(agencyId, billing) {
    if (!billing?.subscriptionId) return;
    const row = await loadRow(agencyId);
    await call(keyOf(row, agencyId, AGENCY_SCOPE), '/subscriptions/cancel', { method: 'POST', body: { id: billing.subscriptionId } })
      .catch(err => { if (!/not found|not active/i.test(err.gateway || '')) throw err; });
  }
  // Applies a subscription event to the sub-account's billing record; returns the touched account id.
  function subscriptionEvent(agency, event, data) {
    const checkoutId = String(data?.checkout?.id || ''), subscriptionId = String(data?.subscription?.id || '');
    const entry = Object.entries(agency.accounts || {}).find(([, meta]) => meta?.billing?.provider === 'abacatepay'
      && ((checkoutId && meta.billing.checkoutId === checkoutId) || (subscriptionId && meta.billing.subscriptionId === subscriptionId)));
    if (!entry) return '';
    const billing = entry[1].billing;
    if (subscriptionId) billing.subscriptionId = subscriptionId;
    billing.status = event === 'subscription.cancelled' || data?.subscription?.status === 'CANCELLED' ? 'Cancelled'
      : event === 'subscription.trial_started' ? 'Trial' : 'Active';
    billing.method = methodNames[data?.subscription?.method] || billing.method || '';
    if (event === 'subscription.completed' || event === 'subscription.renewed') {
      const pay = data?.payment || {};
      billing.lastPaidAt = stamp();
      billing.payments = [...(billing.payments || []), { id: String(pay.id || ''), amount: Number(pay.paidAmount || pay.amount || 0) / 100, at: stamp(), receiptUrl: String(pay.receiptUrl || '') }].slice(-24);
    }
    if (billing.status === 'Cancelled') billing.cancelledAt = stamp();
    billing.updatedAt = stamp();
    return entry[0];
  }

  // ---- Webhook ------------------------------------------------------------------------------
  async function handleWebhook({ req, url, json, listWorkspaces, changeAgency, onSubscription }) {
    const match = resolvePath(url).match(/^\/api\/abacatepay\/webhook\/([^/]+)\/([^/]+)$/);
    if (!match) throw fail('Webhook inválido.', 404);
    const agencyId = decodeURIComponent(match[1]), scope = decodeURIComponent(match[2]);
    const raw = await rawBody(req);
    let row;
    try { row = normalizeRow(await store.load(rowId(agencyId))); }
    catch (err) { if (err.status === 404) throw fail('Webhook não autorizado.', 401); throw err; }
    const conn = connOf(row, scope);
    const given = url.searchParams.get('webhookSecret') || req.headers['x-webhook-secret'] || '';
    if (!conn || !safeEqual(conn.webhookSecret, given)) throw fail('Webhook não autorizado.', 401);
    if (!safeEqual(signBody(raw), req.headers['x-webhook-signature'])) throw fail('Assinatura do webhook inválida.', 401);
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { throw fail('Invalid JSON request.', 400); }
    const event = String(body?.event || ''), data = body?.data || {}, deliveryId = String(body?.id || '');
    if (deliveryId && row.seen.includes(deliveryId)) return json({ ok: true, duplicate: true });

    let handled = false;
    if (scope === AGENCY_SCOPE) {
      if (event.startsWith('subscription.')) {
        let account = '';
        await changeAgency(agencyId, agency => { account = subscriptionEvent(agency, event, data); });
        handled = Boolean(account);
        if (account && onSubscription) await onSubscription(agencyId, account, event).catch(() => {});
      }
    } else {
      if (!(await listWorkspaces(agencyId)).some(w => w.id === scope)) throw fail('Subconta não encontrada.', 404);
      const charge = data.checkout || data.transparent || {};
      const checkoutId = String(charge.id || '');
      const method = methodNames[data.payerInformation?.method] || 'Pix';
      if ((event === 'checkout.completed' && charge.frequency !== 'SUBSCRIPTION') || event === 'transparent.completed') {
        await store.change(scope, state => { handled = paidInvoice(state, { checkoutId, invoiceId: charge.metadata?.invoiceId, method, receiptUrl: charge.receiptUrl }); });
      } else if (event === 'checkout.refunded' || event === 'transparent.refunded') {
        await store.change(scope, state => { handled = refundedInvoice(state, checkoutId); });
      }
    }
    if (deliveryId) await changeRow(agencyId, current => { current.seen = [...current.seen, deliveryId].slice(-300); });
    return json({ ok: true, handled, event });
  }

  return {
    status: async (agencyId, scope, publicOrigin) => view(await loadRow(agencyId), agencyId, scope, publicOrigin),
    connected: async (agencyId, scope) => Boolean(connOf(await loadRow(agencyId), scope)),
    connect, disconnect, createCheckout, chargeInvoice, subscribe, cancelSubscription, handleWebhook,
    AGENCY_SCOPE
  };
}
