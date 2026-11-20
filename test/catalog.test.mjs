import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { catalog, storeHome, storeProduct } from '../ui/store-data.js';
import { giftCardStatus } from '../catalog-model.mjs';
import { requireWorkspaceCommand } from '../authorization.mjs';
import { documentMessage } from '../document-mail.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data, actor: 'Bia' }, { workspace: 'demo' });

function shop() {
  const s = blank();
  const mug = save(s, 'products', { name: 'Caneca', price: 50, kind: 'One time', active: true });
  const kit = save(s, 'products', { name: 'Kit', price: 20, kind: 'One time', active: true });
  const storeId = save(s, 'stores', { name: 'Loja', active: true, items: [{ productId: mug }, { productId: kit, stock: 10 }], shipping: { mode: 'none', pickup: true }, taxPercent: 0, payment: { method: 'Pix' } });
  const buy = (items, extra = {}) => act(s, 'store-checkout', storeId, { name: 'Ana', email: 'ana@exemplo.com.br', items, delivery: 'pickup', ...extra });
  const product = id => s.products.find(row => row.id === id);
  return { s, mug, kit, storeId, buy, product };
}

test('Collections group products, get a unique slug and filter the store', () => {
  const { s, mug, kit, storeId } = shop();
  const id = save(s, 'productCollections', { name: 'Cozinha', productIds: [mug] });
  const loose = save(s, 'products', { name: 'Avulso', price: 5, kind: 'One time', active: true });
  save(s, 'productCollections', { name: 'Cozinha', productIds: [kit, loose] });
  assert.deepEqual(s.productCollections.map(row => row.slug), ['cozinha', 'cozinha-2']);
  assert.throws(() => save(s, 'productCollections', { name: 'X', productIds: ['nada'] }), /não existe/);
  const store = s.stores.find(row => row.id === storeId);
  const html = storeHome(s, store, { base: '/loja/demo/x', collection: 'cozinha' });
  assert.match(html, /Caneca/);
  assert.doesNotMatch(html.slice(html.indexOf('st-grid')), /Kit/);
  execute(s, { type: 'delete', key: 'products', id: loose });
  assert.deepEqual(s.productCollections.find(row => row.slug === 'cozinha-2').productIds, [kit], 'deleted products leave their collections');
  assert.equal(s.productCollections.find(row => row.id === id).productIds[0], mug);
});

test('Inventory per product: SKU, quantity, out of stock, backorder, log and cancel puts it back', () => {
  const { s, mug, kit, storeId, buy, product } = shop();
  act(s, 'catalog-inventory', '', { productId: mug, sku: 'CAN-01', trackInventory: true, quantity: 3, lowStock: 1 });
  assert.throws(() => act(s, 'catalog-inventory', '', { productId: kit, sku: 'can-01' }), /SKU can-01 já está/);
  assert.throws(() => buy([{ productId: mug, qty: 4 }]), /Só há 3 unidade/);
  buy([{ productId: mug, qty: 2 }]);
  assert.equal(product(mug).quantity, 1);
  const order = s.orders.at(-1);
  save(s, 'orders', { id: order.id, status: 'Cancelled' }, order.id);
  assert.equal(product(mug).quantity, 3, 'cancelled orders put the stock back');
  act(s, 'catalog-inventory', '', { productId: mug, adjust: -3, reason: 'Quebrou' });
  assert.equal(catalog(s, s.stores.find(row => row.id === storeId))[0].stock, 0);
  assert.throws(() => buy([{ productId: mug, qty: 1 }]), /esgotou/);
  act(s, 'catalog-inventory', '', { productId: mug, allowBackorder: true });
  buy([{ productId: mug, qty: 2 }]);
  assert.equal(product(mug).quantity, -2, 'keeps selling when backorder is on');
  assert.deepEqual(s.inventoryLog.filter(row => row.productId === mug).map(row => [row.delta, row.reason]),
    [[3, 'Ajuste manual'], [-2, 'Pedido #1001'], [2, 'Pedido #1001 cancelado'], [-3, 'Quebrou'], [-2, 'Pedido #1002']]);
  act(s, 'catalog-inventory', '', { productId: kit, trackInventory: true, quantity: 4 });
  assert.equal(catalog(s, s.stores.find(row => row.id === storeId))[1].stock, 4, 'the smaller of store limit (10) and inventory (4) wins');
});

test('Workflows update the inventory', () => {
  const { s, mug, product } = shop();
  save(s, 'workflows', { name: 'Repor', active: true, triggers: [{ type: 'contact_tag', config: { tag: 'repor' } }], steps: [{ type: 'update_inventory', config: { productId: mug, mode: 'add', quantity: 5 } }] });
  const contactId = save(s, 'contacts', { name: 'Ana', email: 'ana@exemplo.com.br' });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === contactId), tags: ['repor'] }, contactId);
  assert.deepEqual([product(mug).quantity, product(mug).trackInventory, s.inventoryLog.at(-1).reason], [5, true, 'Automação']);
});

test('Reviews come from the store, wait for approval and show with the average', () => {
  const { s, mug, storeId } = shop();
  save(s, 'workflows', { name: 'Nota baixa', active: true, triggers: [{ type: 'product_review', config: { rating: '2' } }], steps: [{ type: 'add_tag', config: { tag: 'nota-baixa' } }] });
  save(s, 'contacts', { name: 'Ana', email: 'ana@exemplo.com.br' });
  act(s, 'store-review', storeId, { productId: mug, name: 'Ana', email: 'ana@exemplo.com.br', rating: 2, body: 'Chegou lascada.' });
  assert.ok(s.contacts[0].tags.includes('nota-baixa'), 'the trigger filters low ratings');
  assert.throws(() => act(s, 'store-review', storeId, { productId: mug, name: 'Ana', email: 'ana@exemplo.com.br', rating: 5, body: 'De novo' }), /já avaliou/);
  act(s, 'store-review', storeId, { productId: mug, name: 'Caio', email: 'caio@exemplo.com.br', rating: 5, title: 'Linda', body: 'Adorei a caneca.' });
  assert.deepEqual(act(s, 'store-review', storeId, { productId: mug, name: 'Bot', email: 'bot@exemplo.com.br', rating: 5, body: 'spam', website: 'x' }), { ok: true });
  assert.equal(s.productReviews.length, 2, 'the honeypot drops bots');
  assert.throws(() => act(s, 'store-review', storeId, { productId: mug, name: 'X', email: 'x@exemplo.com.br', rating: 7, body: 'ok ok' }), /1 a 5/);
  const store = s.stores.find(row => row.id === storeId), item = catalog(s, store)[0];
  assert.doesNotMatch(storeProduct(s, store, item, { base: '/loja/demo/x' }), /Adorei/, 'pending reviews stay hidden');
  act(s, 'catalog-reviews', '', { ids: s.productReviews.map(row => row.id), status: 'approved' });
  save(s, 'productReviews', { status: 'approved', reply: 'Obrigado, Caio!' }, s.productReviews[1].id);
  const html = storeProduct(s, store, item, { base: '/loja/demo/x' });
  assert.match(html, /3,5[\s\S]*2 avaliações[\s\S]*Adorei a caneca[\s\S]*Obrigado, Caio!/);
  assert.throws(() => save(s, 'productReviews', { status: 'approved' }), /página do produto/);
});

test('Gift cards: issued by hand, spent at checkout, refunded on cancel, sold as products', () => {
  const { s, mug, kit, storeId, buy } = shop();
  assert.throws(() => save(s, 'giftCards', { value: 0 }), /R\$ 0,01/);
  const id = save(s, 'giftCards', { value: 80, recipientName: 'Ana', recipientEmail: 'ana@exemplo.com.br', message: 'Parabéns' });
  const card = () => s.giftCards.find(row => row.id === id);
  assert.match(card().code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  act(s, 'catalog-giftcard-send', id);
  const mail = s.workflowOutbox.find(item => item.what === 'giftcard');
  assert.match(documentMessage(mail, '').text, new RegExp(`R\\$\\s80,00[\\s\\S]*Parabéns[\\s\\S]*${card().code}`));
  const code = card().code.toLowerCase().replace(/-/g, ' ');
  buy([{ productId: mug, qty: 1 }], { giftCard: code });
  let order = s.orders.at(-1);
  assert.deepEqual([order.giftCardAmount, order.total, order.status, card().balance], [50, 0, 'Paid', 30], 'fully paid by the card');
  buy([{ productId: mug, qty: 1 }], { giftCard: card().code });
  order = s.orders.at(-1);
  assert.deepEqual([order.giftCardAmount, order.total, order.status, card().balance, giftCardStatus(card())], [30, 20, 'Pending', 0, 'used']);
  assert.throws(() => buy([{ productId: mug, qty: 1 }], { giftCard: card().code }), /não tem mais saldo/);
  assert.throws(() => buy([{ productId: mug, qty: 1 }], { giftCard: 'AAAA-BBBB-CCCC' }), /não encontrado/);
  save(s, 'orders', { id: order.id, status: 'Cancelled' }, order.id);
  assert.equal(card().balance, 30, 'the balance comes back');
  act(s, 'catalog-giftcard-adjust', id, { amount: -10, reason: 'Correção' });
  assert.throws(() => act(s, 'catalog-giftcard-adjust', id, { amount: -50 }), /negativo/);
  assert.throws(() => execute(s, { type: 'delete', key: 'giftCards', id }), /Desative/);
  save(s, 'giftCards', { ...card(), status: 'disabled' }, id);
  assert.throws(() => buy([{ productId: mug, qty: 1 }], { giftCard: card().code }), /não encontrado/);
  act(s, 'catalog-giftcard-products', '', { productIds: [kit] });
  buy([{ productId: kit, qty: 2 }]);
  const sold = s.orders.at(-1);
  save(s, 'orders', { id: sold.id, status: 'Paid' }, sold.id);
  const issued = s.giftCards.filter(row => row.orderId === sold.id);
  assert.deepEqual(issued.map(row => [row.initialValue, row.recipientEmail]), [[20, 'ana@exemplo.com.br'], [20, 'ana@exemplo.com.br']]);
  save(s, 'orders', { id: sold.id, status: 'Fulfilled' }, sold.id);
  assert.equal(s.giftCards.filter(row => row.orderId === sold.id).length, 2, 'issued once');
  for (const type of ['catalog-inventory', 'catalog-reviews', 'catalog-giftcard-send', 'catalog-giftcard-adjust', 'catalog-giftcard-products'])
    assert.doesNotThrow(() => requireWorkspaceCommand({ modules: ['payments'] }, { type }), type);
  assert.throws(() => requireWorkspaceCommand({ modules: ['payments'] }, { type: 'store-review' }), /Unknown operation/);
});
