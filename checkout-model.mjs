// Checkouts abandonados (Pagamentos), following GoHighLevel's Abandoned Checkouts: the store cart sends the
// buyer's name, e-mail and items as soon as the e-mail is filled; if the order is not placed within the
// configured wait, the checkout becomes abandoned, the contact is found or created, the workflow trigger
// fires and (when on) a recovery e-mail goes out with a link that restores the cart
// (/loja/<ws>/<store>/carrinho#recuperar=<token>). Placing the order marks it converted, or recovered when
// it had already been abandoned.
import { createHash, randomBytes } from 'node:crypto';
import { quoteOrder } from './store-model.mjs';
import { abandonedDefaults } from './ui/checkout-data.js';

export const checkoutCollections = ['abandonedCheckouts'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const sha = value => createHash('sha256').update(value).digest('hex');
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const mail = value => { const v = str(value, 160).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ''; };
const now = () => new Date().toISOString();
const fill = (template, values) => String(template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key) => Object.hasOwn(values, key) ? values[key] : match);
const MAX_ROWS = 5000, MAX_REMINDERS = 3;

export const abandonedOf = s => ({ ...abandonedDefaults(), ...(s.paymentSettings?.abandoned || {}) });
export const cartTokenHash = token => /^[0-9a-f]{48}$/.test(String(token || '')) ? sha(token) : '';
export const cartPath = (workspace, storeId, token) => `/loja/${workspace}/${storeId}/carrinho#recuperar=${token}`;

export const checkoutFields = {
  abandonedCheckouts: () => fail('Os checkouts são registrados pela loja. Você pode excluir ou enviar um lembrete.', 409)
};

export function checkoutBeforeDelete(s, key, id) {
  if (key === 'contacts') s.abandonedCheckouts = (s.abandonedCheckouts || []).filter(row => row.contactId !== id);
  if (key === 'stores') s.abandonedCheckouts = (s.abandonedCheckouts || []).filter(row => row.storeId !== id);
}

/** Pagamentos → Checkouts abandonados → Configurar notificações. */
export function saveAbandonedSettings(s, d) {
  const after = Math.round(Number(d.afterMinutes ?? 60));
  if (!Number.isFinite(after) || after < 15 || after > 4320) fail('Considere abandonado depois de 15 minutos a 72 horas.');
  const settings = { enabled: d.enabled !== false, afterMinutes: after,
    subject: str(d.subject, 200) || fail('Informe o assunto do e-mail de recuperação.'),
    message: (typeof d.message === 'string' ? d.message.trim().slice(0, 3000) : '') || fail('Escreva a mensagem do e-mail de recuperação.') };
  s.paymentSettings = { ...(s.paymentSettings || {}), abandoned: settings };
  return settings;
}

/** Public: the cart page reports the buyer and the items (once the e-mail is filled, and again on changes). */
export function captureCart(s, storeId, d, { run = null } = {}) {
  const store = (s.stores || []).find(row => row.id === storeId && row.active) || fail('Esta loja não está aberta.', 404);
  const session = str(d.session, 64);
  if (!/^[0-9a-f]{32,64}$/.test(session)) fail('Sessão inválida.');
  const email = mail(d.email);
  if (!email || !Array.isArray(d.items) || !d.items.length) return { tracked: false };
  const quote = quoteOrder(s, store, d);
  if (!quote.lines.length) return { tracked: false };
  const hash = sha(session);
  s.abandonedCheckouts ||= [];
  let row = s.abandonedCheckouts.find(item => item.sessionHash === hash && item.storeId === store.id);
  if (row && ['converted', 'recovered'].includes(row.status)) row = null;
  const before = row ? JSON.stringify((row.items || []).map(line => [line.productId, line.qty])) : '';
  const details = { name: str(d.name, 120), email, phone: str(d.phone, 48), items: quote.lines.map(line => ({ productId: line.productId, name: line.name, qty: line.qty, price: line.price, total: line.total })),
    subtotal: quote.subtotal, total: quote.total, coupon: quote.coupon || '', updated: now() };
  if (row) Object.assign(row, details, row.status === 'abandoned' ? { returnedAt: details.updated } : {});
  else {
    row = { id: randomBytes(16).toString('hex'), created: details.updated, source: 'store', storeId: store.id, sessionHash: hash, status: 'open', contactId: '', recovery: { sent: 0, lastSentAt: '' }, ...details };
    s.abandonedCheckouts.push(row);
    if (s.abandonedCheckouts.length > MAX_ROWS) {
      const drop = s.abandonedCheckouts.findIndex(item => item.status !== 'open' && item.status !== 'abandoned');
      s.abandonedCheckouts.splice(drop >= 0 ? drop : 0, 1);
    }
  }
  // "Produtos adicionados ao carrinho": a known contact put or changed products in the cart.
  const contact = run && s.contacts.find(item => String(item.email || '').toLowerCase() === email);
  if (contact && JSON.stringify(details.items.map(line => [line.productId, line.qty])) !== before) {
    run(s, 'cart_updated', { contactId: contact.id, storeId: store.id, total: details.total, items: details.items.length });
  }
  return { tracked: true };
}

/** Public: the recovery link puts the items back in the cart and fills the buyer's data. */
export function restoreCart(s, storeId, tokenHash) {
  const row = tokenHash ? (s.abandonedCheckouts || []).find(item => item.storeId === storeId && (item.tokens || []).includes(tokenHash)) : null;
  if (!row) fail('Este link de recuperação não é válido.', 404);
  if (['converted', 'recovered'].includes(row.status)) return { items: [], name: row.name, email: row.email, phone: row.phone, done: true };
  row.openedAt ||= now();
  // A new session for this browser, so placing the order here marks this checkout as recovered.
  const session = randomBytes(16).toString('hex');
  row.sessionHash = sha(session);
  return { items: row.items.map(item => ({ productId: item.productId, qty: item.qty })), name: row.name, email: row.email, phone: row.phone, coupon: row.coupon || '', session, done: false };
}

/** The order was placed: the session's checkout is converted (or recovered, if it had been abandoned). */
export function checkoutConverted(s, session, order, run) {
  if (!/^[0-9a-f]{32,64}$/.test(String(session || '')) || !order) return;
  const hash = sha(session);
  const row = (s.abandonedCheckouts || []).find(item => item.sessionHash === hash && item.storeId === order.storeId && ['open', 'abandoned'].includes(item.status));
  if (!row) return;
  const recovered = row.status === 'abandoned';
  Object.assign(row, { status: recovered ? 'recovered' : 'converted', orderId: order.id, contactId: order.contactId, [recovered ? 'recoveredAt' : 'convertedAt']: now(), updated: now(), total: order.total });
  if (recovered) run(s, 'abandoned_checkout', { contactId: order.contactId, storeId: row.storeId, total: order.total, status: 'recovered' });
}

function remind(s, row, workspace, origin = '') {
  const cfg = abandonedOf(s), store = (s.stores || []).find(item => item.id === row.storeId);
  if (!row.email) fail('Este checkout não tem e-mail.');
  if ((row.recovery?.sent || 0) >= MAX_REMINDERS) fail(`Já foram enviados ${MAX_REMINDERS} lembretes para este checkout.`, 409);
  const token = randomBytes(24).toString('hex');
  row.tokens = [...(row.tokens || []).slice(-2), sha(token)];
  row.recovery = { sent: (row.recovery?.sent || 0) + 1, lastSentAt: now() };
  const values = { cliente: row.name || 'cliente', loja: store?.name || s.profile?.name || '', empresa: s.profile?.name || '', valor: brl(row.total),
    itens: row.items.map(item => `${item.qty} × ${item.name}`).join(', ') };
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document', what: 'cart', checkoutId: row.id, channels: ['email'], email: row.email, name: row.name, title: values.loja, sender: s.profile?.name || '',
    subject: fill(cfg.subject, values), message: fill(cfg.message, values), path: cartPath(workspace, row.storeId, token), origin, final: false, event: `recovery-${row.recovery.sent}` });
  return cartPath(workspace, row.storeId, token);
}

function abandon(s, row, { workspace, run, add }) {
  const cfg = abandonedOf(s);
  let contact = s.contacts.find(item => item.email && item.email.toLowerCase() === row.email);
  if (!contact) {
    contact = add(s, 'contacts', { name: row.name || row.email, email: row.email, phone: row.phone, tags: [], company: '', notes: '', custom: {} });
    run(s, 'Contact created', { contactId: contact.id });
  } else if (!contact.phone && row.phone) contact.phone = row.phone;
  Object.assign(row, { status: 'abandoned', abandonedAt: now(), contactId: contact.id });
  run(s, 'abandoned_checkout', { contactId: contact.id, storeId: row.storeId, total: row.total, status: 'abandoned' });
  if (cfg.enabled) remind(s, row, workspace);
}

/** Per-minute tick: open checkouts idle for longer than the wait become abandoned. Returns how many. */
export function checkoutTick(s, at, ctx) {
  const limit = at - abandonedOf(s).afterMinutes * 60000;
  let count = 0;
  for (const row of s.abandonedCheckouts || []) {
    if (row.status !== 'open' || Date.parse(row.updated) > limit) continue;
    abandon(s, row, ctx);
    count += 1;
  }
  return count;
}

export function checkoutCommand(s, command, { workspace = 'demo' }) {
  const { type, id, data: d = {} } = command;
  if (type === 'checkout-settings') return saveAbandonedSettings(s, d);
  const row = (s.abandonedCheckouts || []).find(item => item.id === id) || fail('Checkout não encontrado.', 404);
  if (type === 'checkout-remind') {
    if (row.status !== 'abandoned') fail('Só checkouts abandonados recebem lembrete.', 409);
    return { path: remind(s, row, workspace, str(d.origin, 200)) };
  }
  fail('Ação inválida.');
}
