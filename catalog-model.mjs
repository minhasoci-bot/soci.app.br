// Catálogo (Pagamentos), following GoHighLevel's Products → Collections, Inventory and Reviews, and Gift cards:
// - Coleções group products and become filters of the stores.
// - Estoque is per product (SKU, quantity, keep selling when out of stock, low-stock mark) with an adjustment
//   log; the stores check and decrement it, and cancelled orders put it back. The per-store limit stays.
// - Avaliações come from the store product page, wait for approval and show with the average rating.
// - Cartões-presente hold a balance spent at the store checkout (refunded when the order is cancelled); they
//   are issued by hand or sold as gift-card products, and e-mailed to the recipient.
import { randomBytes, randomUUID } from 'node:crypto';
import { slugify } from './ui/blog-data.js';

export const catalogCollections = ['productCollections', 'productReviews', 'giftCards', 'inventoryLog'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const cents = value => Math.round(Number(value) * 100) / 100;
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const mail = value => { const v = str(value, 160).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Use um e-mail válido.'); return v; };
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const whole = (value, min, max, message) => { const n = Math.round(Number(value)); if (!Number.isFinite(n) || n < min || n > max) fail(message); return n; };
const day = (value, label) => { const v = str(value, 10); if (!v) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`Use uma data válida em ${label}.`); return v; };

/* ───────── Coleções ───────── */

export const catalogFields = {
  productCollections: (s, d) => {
    const name = str(d.name, 80) || fail('Dê um nome à coleção.');
    const ids = [...new Set((Array.isArray(d.productIds) ? d.productIds : []).map(String))].slice(0, 500);
    const missing = ids.find(id => !s.products.some(row => row.id === id));
    if (missing) fail('Um dos produtos da coleção não existe mais.');
    let slug = slugify(d.slug || name) || 'colecao';
    for (let n = 2; (s.productCollections || []).some(row => row.slug === slug && row.id !== d.id); n++) slug = `${slugify(d.slug || name) || 'colecao'}-${n}`;
    return { name, slug, description: str(d.description, 400), productIds: ids };
  },
  productReviews: (s, d) => {
    const prior = d.id ? (s.productReviews || []).find(row => row.id === d.id) : null;
    if (!prior) fail('As avaliações chegam pela página do produto na loja.');
    return { status: reviewStatuses.includes(d.status) ? d.status : prior.status, reply: str(d.reply ?? prior.reply, 1000) };
  },
  giftCards: (s, d) => {
    const prior = d.id ? (s.giftCards || []).find(row => row.id === d.id) : null;
    const expiresAt = day(d.expiresAt, 'Validade');
    if (expiresAt && expiresAt < today()) fail('A validade precisa ser uma data futura.');
    const common = { recipientName: str(d.recipientName, 120), recipientEmail: mail(d.recipientEmail), message: str(d.message, 500), expiresAt,
      status: d.status === 'disabled' ? 'disabled' : 'active' };
    if (prior) return common;
    const value = cents(String(d.value ?? '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > 100000) fail('O valor do cartão-presente vai de R$ 0,01 a R$ 100.000.');
    return { ...common, code: newCode(s), initialValue: value, balance: value, source: 'manual', history: [{ at: now(), kind: 'issued', amount: value }] };
  }
};

/* ───────── Estoque ───────── */

const logInventory = (s, product, delta, reason, by = '') => {
  s.inventoryLog ||= [];
  s.inventoryLog.push({ id: randomUUID(), at: now(), productId: product.id, delta, quantity: product.quantity, reason: str(reason, 120), by: str(by, 120) });
  if (s.inventoryLog.length > 3000) s.inventoryLog.splice(0, s.inventoryLog.length - 3000);
};

/** Out-of-stock check of the store cart (only for products that track inventory and do not keep selling). */
export function inventoryCheck(product, qty) {
  if (!product?.trackInventory || product.allowBackorder) return;
  const left = Math.max(0, Number(product.quantity) || 0);
  if (qty > left) fail(left ? `Só há ${left} unidade(s) de “${product.name}”.` : `“${product.name}” esgotou.`);
}

/** Moves the stock of tracked products (negative = sold). */
export function moveInventory(s, lines, sign, reason) {
  for (const line of lines || []) {
    const product = s.products.find(row => row.id === line.productId);
    if (!product?.trackInventory) continue;
    product.quantity = (Number(product.quantity) || 0) + sign * line.qty;
    logInventory(s, product, sign * line.qty, reason);
  }
}

function updateInventory(s, d, actor) {
  const product = s.products.find(row => row.id === str(d.productId, 60)) || fail('Produto não encontrado.', 404);
  if (product.kind === 'Recurring') fail('Produtos recorrentes não têm estoque.');
  const sku = str(d.sku, 40);
  if (sku && s.products.some(row => row.id !== product.id && row.sku && row.sku.toLowerCase() === sku.toLowerCase())) fail(`O SKU ${sku} já está em outro produto.`);
  const before = Number(product.quantity) || 0;
  let quantity = before;
  if (d.quantity !== undefined && d.quantity !== '') quantity = whole(d.quantity, -100000, 1000000, 'Use uma quantidade entre -100.000 e 1.000.000.');
  if (d.adjust !== undefined && d.adjust !== '') quantity = before + whole(d.adjust, -1000000, 1000000, 'Use um ajuste válido.');
  Object.assign(product, { sku, trackInventory: d.trackInventory !== undefined ? Boolean(d.trackInventory) : Boolean(product.trackInventory),
    allowBackorder: d.allowBackorder !== undefined ? Boolean(d.allowBackorder) : Boolean(product.allowBackorder),
    lowStock: d.lowStock === '' || d.lowStock === undefined ? (product.lowStock ?? 0) : whole(d.lowStock, 0, 100000, 'Use um alerta de estoque entre 0 e 100.000.'),
    quantity, updated: now() });
  if (quantity !== before) logInventory(s, product, quantity - before, str(d.reason, 120) || 'Ajuste manual', actor);
  return product.id;
}

/** Workflow action “Atualizar estoque”. */
export function workflowInventory(s, config) {
  const product = s.products.find(row => row.id === config.productId) || fail('Produto não encontrado.');
  const qty = Math.round(Number(config.quantity) || 0);
  const before = Number(product.quantity) || 0;
  const quantity = config.mode === 'set' ? qty : config.mode === 'subtract' ? before - qty : before + qty;
  product.trackInventory = true;
  product.quantity = quantity;
  logInventory(s, product, quantity - before, 'Automação');
  return product;
}

/* ───────── Avaliações ───────── */

export const reviewStatuses = ['pending', 'approved', 'unapproved', 'trash'];

/** Public: a review sent from the store product page (pending until approved). */
export function submitReview(s, storeId, d, run) {
  const store = (s.stores || []).find(row => row.id === storeId && row.active) || fail('Esta loja não está aberta.', 404);
  const item = store.items.find(row => row.productId === str(d.productId, 60) && !row.hidden) || fail('Produto não encontrado.', 404);
  if (str(d.website, 200)) return { ok: true };
  const rating = whole(d.rating, 1, 5, 'Escolha de 1 a 5 estrelas.');
  const name = str(d.name, 80) || fail('Informe seu nome.');
  const email = mail(d.email) || fail('Informe seu e-mail.');
  const body = str(d.body, 2000);
  if (body.length < 3) fail('Conte um pouco da sua experiência.');
  s.productReviews ||= [];
  const recent = s.productReviews.filter(row => row.email === email && row.productId === item.productId && Date.parse(row.created) > Date.now() - 864e5);
  if (recent.length) fail('Você já avaliou este produto hoje. Obrigado!', 429);
  if (s.productReviews.length >= 20000) s.productReviews.splice(s.productReviews.findIndex(row => row.status === 'trash') >>> 0, 1);
  const contactId = s.contacts.find(row => row.email && row.email.toLowerCase() === email)?.id || '';
  const review = { id: randomUUID(), created: now(), productId: item.productId, storeId, name, email, contactId, rating, title: str(d.title, 120), body, status: 'pending', reply: '' };
  s.productReviews.push(review);
  run(s, 'product_review', { contactId, storeId, productId: item.productId, rating });
  return { ok: true };
}

/** Approved reviews of a product for the store page (newest first) and the average. */
export function productRating(s, productId) {
  const rows = (s.productReviews || []).filter(row => row.productId === productId && row.status === 'approved').sort((a, b) => b.created.localeCompare(a.created));
  return { count: rows.length, average: rows.length ? Math.round(rows.reduce((n, row) => n + row.rating, 0) / rows.length * 10) / 10 : 0,
    reviews: rows.slice(0, 50).map(row => ({ name: row.name, rating: row.rating, title: row.title, body: row.body, reply: row.reply, created: row.created })) };
}

/* ───────── Cartões-presente ───────── */

const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(s) {
  for (;;) {
    const bytes = randomBytes(12);
    const code = [...bytes].map(b => CODE[b % CODE.length]).join('').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');
    if (!(s.giftCards || []).some(row => row.code === code)) return code;
  }
}
const cardState = card => card.status === 'disabled' ? 'disabled' : card.expiresAt && card.expiresAt < today() ? 'expired' : card.balance <= 0 ? 'used' : 'active';
export const giftCardStatus = cardState;

/** The store checkout's gift card: how much of the total it pays (never more than its balance). */
export function giftCardFor(s, code, total) {
  const clean = str(code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');
  if (!clean) return null;
  const card = (s.giftCards || []).find(row => row.code === clean);
  const state = card ? cardState(card) : '';
  if (!card || state === 'disabled') fail('Cartão-presente não encontrado.');
  if (state === 'expired') fail('Este cartão-presente venceu.');
  if (state === 'used') fail('Este cartão-presente não tem mais saldo.');
  return { card, amount: cents(Math.min(card.balance, total)) };
}
export function redeemGiftCard(s, card, amount, order) {
  if (!card || !(amount > 0)) return;
  card.balance = cents(card.balance - amount);
  card.history = [...(card.history || []), { at: now(), kind: 'redeemed', amount: -amount, orderId: order.id, detail: `Pedido #${order.number}` }].slice(-200);
  card.updated = now();
}
function refundGiftCard(s, order) {
  const card = order.giftCard && (s.giftCards || []).find(row => row.code === order.giftCard);
  if (!card || !(order.giftCardAmount > 0)) return;
  card.balance = cents(card.balance + order.giftCardAmount);
  card.history = [...(card.history || []), { at: now(), kind: 'refunded', amount: order.giftCardAmount, orderId: order.id, detail: `Pedido #${order.number} cancelado` }].slice(-200);
}

function sendCard(s, card, workspace) {
  if (!card.recipientEmail) fail('Informe o e-mail de quem recebe o cartão-presente.');
  if (cardState(card) !== 'active') fail('Só cartões ativos podem ser enviados.', 409);
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document', what: 'giftcard', giftCardId: card.id, channels: ['email'], email: card.recipientEmail, name: card.recipientName || '',
    title: card.code, sender: s.profile?.name || '', value: card.balance, code: card.code, expiresAt: card.expiresAt, message: card.message, path: '', origin: '', event: `giftcard-${Date.now()}` });
  card.sentAt = now();
  return card.id;
}

function adjustCard(s, card, d, actor) {
  const amount = cents(String(d.amount ?? '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) fail('Informe um ajuste diferente de zero.');
  if (card.balance + amount < 0) fail(`O saldo não pode ficar negativo (saldo atual ${brl(card.balance)}).`);
  card.balance = cents(card.balance + amount);
  card.history = [...(card.history || []), { at: now(), kind: 'adjusted', amount, detail: str(d.reason, 120) || 'Ajuste manual', by: str(actor, 120) }].slice(-200);
  return card.id;
}

/** A paid order with gift-card products issues one card per unit and e-mails it to the buyer. */
function issueFromOrder(s, order, workspace) {
  if (order.giftCardsIssued) return;
  const lines = (order.items || []).filter(line => s.products.find(row => row.id === line.productId)?.giftCard);
  if (!lines.length) return;
  s.giftCards ||= [];
  for (const line of lines) for (let n = 0; n < line.qty; n += 1) {
    const card = { id: randomUUID(), created: now(), code: newCode(s), initialValue: line.price, balance: line.price, source: 'order', orderId: order.id,
      recipientName: order.name || '', recipientEmail: order.email || '', message: '', expiresAt: '', status: 'active',
      history: [{ at: now(), kind: 'issued', amount: line.price, orderId: order.id, detail: `Pedido #${order.number}` }] };
    s.giftCards.push(card);
    if (card.recipientEmail) sendCard(s, card, workspace);
  }
  order.giftCardsIssued = true;
}

/* ───────── Ganchos e comandos ───────── */

export function catalogBeforeDelete(s, key, id) {
  if (key === 'products') {
    for (const row of s.productCollections || []) row.productIds = row.productIds.filter(productId => productId !== id);
    s.productReviews = (s.productReviews || []).filter(row => row.productId !== id);
  }
  if (key === 'stores') s.productReviews = (s.productReviews || []).filter(row => row.storeId !== id);
  if (key === 'giftCards') {
    const card = (s.giftCards || []).find(row => row.id === id);
    if (card && card.balance < card.initialValue) fail('Este cartão-presente já foi usado. Desative em vez de excluir.', 409);
  }
  if (key === 'inventoryLog') fail('O histórico de estoque não pode ser excluído.', 409);
}

/** Orders: paid issues sold gift cards; cancelled puts tracked stock and gift card balance back. */
export function catalogAfterSave(s, key, prior, row, workspace) {
  if (key !== 'orders' || !prior || prior.status === row.status) return;
  if (['Paid', 'Fulfilled'].includes(row.status)) issueFromOrder(s, row, workspace);
  if (row.status === 'Cancelled') {
    moveInventory(s, row.items, 1, `Pedido #${row.number} cancelado`);
    refundGiftCard(s, row);
  }
}

export function catalogCommand(s, command, { workspace = 'demo' }) {
  const { type, id, data: d = {} } = command;
  const actor = str(command.actor, 120);
  if (type === 'catalog-inventory') return updateInventory(s, d, actor);
  if (type === 'catalog-giftcard-products') {
    const ids = new Set((Array.isArray(d.productIds) ? d.productIds : []).map(String));
    for (const product of s.products) {
      const on = ids.has(product.id);
      if (on && product.kind !== 'One time') fail(`“${product.name}” é recorrente e não pode virar cartão-presente.`);
      product.giftCard = on;
    }
    return [...ids];
  }
  const card = () => (s.giftCards || []).find(row => row.id === id) || fail('Cartão-presente não encontrado.', 404);
  if (type === 'catalog-giftcard-send') return sendCard(s, card(), workspace);
  if (type === 'catalog-giftcard-adjust') return adjustCard(s, card(), d, actor);
  if (type === 'catalog-reviews') {
    const status = reviewStatuses.includes(d.status) ? d.status : fail('Escolha a situação das avaliações.');
    const ids = new Set((Array.isArray(d.ids) ? d.ids : []).map(String));
    let n = 0;
    for (const row of s.productReviews || []) if (ids.has(row.id)) { row.status = status; row.updated = now(); n += 1; }
    return n;
  }
  fail('Ação inválida.');
}
