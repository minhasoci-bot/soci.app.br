import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { cartTokenHash } from '../checkout-model.mjs';
import { orderRows } from '../ui/checkout-data.js';
import { requireWorkspaceCommand } from '../authorization.mjs';
import { documentMessage } from '../document-mail.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data, actor: 'Bia' }, { workspace: 'demo' });
const session = 'ab'.repeat(16), other = 'cd'.repeat(16);
const later = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

function shop() {
  const s = blank();
  const productId = save(s, 'products', { name: 'Caneca', price: 50, kind: 'One time', active: true });
  const storeId = save(s, 'stores', { name: 'Loja Bom Pão', active: true, items: [{ productId }], shipping: { mode: 'none', pickup: true }, taxPercent: 0, payment: { method: 'Pix' } });
  const cart = (data = {}) => act(s, 'store-cart', storeId, { session, name: 'Bia Lima', email: 'bia@exemplo.com.br', items: [{ productId, qty: 2 }], delivery: 'pickup', ...data });
  return { s, productId, storeId, cart };
}

test('The cart is tracked once the e-mail is filled and updated in place', () => {
  const { s, cart } = shop();
  assert.deepEqual(cart({ email: 'sem-arroba' }), { tracked: false });
  assert.deepEqual(cart({ items: [] }), { tracked: false });
  assert.throws(() => cart({ session: 'x' }), /Sessão/);
  assert.deepEqual(cart(), { tracked: true });
  cart({ items: [{ productId: s.products[0].id, qty: 3 }] });
  assert.equal(s.abandonedCheckouts.length, 1);
  const row = s.abandonedCheckouts[0];
  assert.deepEqual([row.status, row.total, row.items[0].qty, row.email, row.contactId], ['open', 150, 3, 'bia@exemplo.com.br', '']);
  assert.ok(!JSON.stringify(row).includes(session), 'only the hash of the session is kept');
  assert.equal(s.contacts.length, 0, 'no contact until the checkout is abandoned');
});

test('An idle checkout is abandoned: contact, trigger and recovery e-mail with a link that restores the cart', () => {
  const { s, storeId, cart } = shop();
  save(s, 'workflows', { name: 'Recuperar', active: true, triggers: [{ type: 'abandoned_checkout', config: { storeId, status: 'abandoned' } }], steps: [{ type: 'add_tag', config: { tag: 'carrinho-abandonado' } }] });
  cart();
  assert.equal(act(s, 'checkout-tick', '', { at: later(30) }), 0, 'still inside the 60 minute wait');
  assert.equal(act(s, 'checkout-tick', '', { at: later(61) }), 1);
  const row = s.abandonedCheckouts[0], contact = s.contacts.find(item => item.email === 'bia@exemplo.com.br');
  assert.deepEqual([row.status, row.contactId, row.recovery.sent], ['abandoned', contact.id, 1]);
  assert.ok(contact.tags.includes('carrinho-abandonado'));
  const mail = s.workflowOutbox.find(item => item.what === 'cart');
  assert.match(mail.path, new RegExp(`^/loja/demo/${storeId}/carrinho#recuperar=[0-9a-f]{48}$`));
  assert.equal(mail.subject, 'Bia Lima, seu carrinho na Loja Bom Pão está guardado');
  assert.match(documentMessage(mail, `https://x${mail.path}`).text, /2 × Caneca[\s\S]*R\$\s100,00[\s\S]*carrinho está guardado/);
  const restored = act(s, 'store-cart-restore', storeId, { tokenHash: cartTokenHash(mail.path.split('recuperar=')[1]) });
  assert.deepEqual([restored.items, restored.email, restored.done], [[{ productId: s.products[0].id, qty: 2 }], 'bia@exemplo.com.br', false]);
  assert.match(restored.session, /^[0-9a-f]{32}$/);
  act(s, 'store-checkout', storeId, { session: restored.session, name: 'Bia Lima', email: 'bia@exemplo.com.br', items: restored.items, delivery: 'pickup' });
  assert.deepEqual([row.status, row.orderId], ['recovered', s.orders.at(-1).id]);
  assert.throws(() => act(s, 'checkout-remind', row.id), /Só checkouts abandonados/);
});

test('Placing the order in time converts the checkout; reminders are capped; settings are validated', () => {
  const { s, storeId, productId, cart } = shop();
  cart();
  act(s, 'store-checkout', storeId, { session, name: 'Bia Lima', email: 'bia@exemplo.com.br', items: [{ productId, qty: 2 }], delivery: 'pickup' });
  assert.equal(s.abandonedCheckouts[0].status, 'converted');
  assert.equal(act(s, 'checkout-tick', '', { at: later(120) }), 0);
  assert.throws(() => act(s, 'checkout-settings', '', { afterMinutes: 5, subject: 'a', message: 'b' }), /15 minutos/);
  act(s, 'checkout-settings', '', { enabled: false, afterMinutes: 30, subject: 'Volte, {{cliente}}', message: 'Oi' });
  assert.equal(s.paymentSettings.receipts.prefix, 'REC-', 'receipt settings are kept');
  act(s, 'store-cart', storeId, { session: other, name: 'Caio', email: 'caio@exemplo.com.br', items: [{ productId, qty: 1 }] });
  act(s, 'checkout-tick', '', { at: later(31) });
  const row = s.abandonedCheckouts.find(item => item.email === 'caio@exemplo.com.br');
  assert.deepEqual([row.status, row.recovery.sent], ['abandoned', 0], 'no automatic e-mail when it is off');
  for (let i = 0; i < 3; i += 1) assert.match(act(s, 'checkout-remind', row.id).path, /carrinho#recuperar=/);
  assert.throws(() => act(s, 'checkout-remind', row.id), /3 lembretes/);
  assert.equal(s.workflowOutbox.filter(item => item.what === 'cart').at(-1).subject, 'Volte, Caio');
  assert.throws(() => save(s, 'abandonedCheckouts', { name: 'x' }), /registrados pela loja/);
  execute(s, { type: 'delete', key: 'abandonedCheckouts', id: row.id });
  assert.ok(!s.abandonedCheckouts.some(item => item.id === row.id));
  for (const type of ['checkout-settings', 'checkout-remind']) assert.doesNotThrow(() => requireWorkspaceCommand({ modules: ['payments'] }, { type }), type);
  for (const type of ['store-cart', 'store-cart-restore', 'checkout-tick']) assert.throws(() => requireWorkspaceCommand({ modules: ['payments'] }, { type }), /Unknown operation/, type);
});

test('Pedidos lists store orders and offer sales together; fulfilling an order fires its trigger', () => {
  const { s, storeId, productId } = shop();
  save(s, 'workflows', { name: 'Entregue', active: true, triggers: [{ type: 'order_fulfilled', config: {} }], steps: [{ type: 'add_tag', config: { tag: 'entregue' } }] });
  act(s, 'store-checkout', storeId, { name: 'Bia Lima', email: 'bia@exemplo.com.br', items: [{ productId, qty: 1 }], delivery: 'pickup' });
  const order = s.orders.at(-1);
  const contactId = s.contacts[0].id;
  s.offers = [{ id: 'offer-1', title: 'Curso de pães', price: 97 }];
  s.invoices.push({ id: 'inv-offer', created: later(1), title: 'Curso de pães', contactId, value: 97, due: '', status: 'Paid', offerId: 'offer-1' });
  const rows = orderRows(s);
  assert.deepEqual(rows.map(row => [row.kind, row.source, row.total, row.status]), [['offer', 'Oferta · Curso de pães', 97, 'Paid'], ['store', 'Loja · Loja Bom Pão', 50, 'Pending']]);
  save(s, 'orders', { id: order.id, status: 'Fulfilled', note: '', tracking: 'BR123' }, order.id);
  assert.ok(s.contacts[0].tags.includes('entregue'));
});
