import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const act = command => send('/api/action?workspace=demo', command);
  const save = (key, data, id) => act({ type: 'save', key, id, data });
  const state = async () => (await send('/api/state?workspace=demo')).body.state;
  return { base, send, save, act, state };
}

async function shop(save) {
  const mug = (await save('products', { name: 'Caneca La Vaca', description: 'Cerâmica, 300 ml', price: 59.9, kind: 'One time', active: true })).body.state.products.at(-1);
  const kit = (await save('products', { name: 'Kit de adesivos', price: 20, kind: 'One time', active: true })).body.state.products.at(-1);
  const plan = (await save('products', { name: 'Mensalidade', price: 99, kind: 'Recurring', interval: 'Monthly', active: true })).body.state.products.at(-1);
  const store = (await save('stores', { name: 'Loja La Vaca', active: true, items: [{ productId: mug.id, stock: 3, category: 'Casa', imageUrl: 'https://example.com/caneca.jpg' }, { productId: kit.id, category: 'Papelaria' }],
    shipping: { mode: 'free-over', flat: 15, freeOver: 150, pickup: true }, taxPercent: 0, payment: { method: 'Pix', instructions: 'Chave Pix: [[sua chave]]' }, addTags: 'cliente-loja' })).body.state.stores.at(-1);
  return { mug, kit, plan, store };
}

test('Store items are validated and recurring products stay out', async t => {
  const { save } = await start(t);
  const { mug, plan } = await shop(save);
  assert.equal((await save('stores', { name: 'X', items: [{ productId: plan.id }] })).status, 400);
  assert.equal((await save('stores', { name: 'X', items: [{ productId: mug.id, imageUrl: 'http://inseguro.com/a.jpg' }] })).status, 400);
  const twice = (await save('stores', { name: 'Y', items: [{ productId: mug.id }, { productId: mug.id }] })).body.state.stores.at(-1);
  assert.deepEqual(twice.items.map(item => item.slug), ['caneca-la-vaca', 'caneca-la-vaca-2']);
});

test('The storefront sells, prices on the server and turns the cart into an order and an invoice', async t => {
  const { base, send, save, act, state } = await start(t);
  const { mug, kit, store } = await shop(save);
  await save('coupons', { name: 'Boas-vindas', code: 'BEMVINDO', kind: 'Percent', amount: 10, active: true });
  const api = `/api/store/demo/${store.id}`;

  const home = await (await fetch(`${base}/loja/demo/${store.id}`)).text();
  assert.match(home, /Caneca La Vaca/);
  assert.match(home, /R\$\s?59,90/);
  assert.match(home, /categoria=Casa/);
  assert.match(await (await fetch(`${base}/loja/demo/${store.id}/p/caneca-la-vaca`)).text(), /3 em estoque/);
  assert.match(await (await fetch(`${base}/loja/demo/${store.id}/carrinho`)).text(), /Finalizar pedido/);

  const quote = await send(`${api}/quote`, { items: [{ productId: mug.id, qty: 2 }, { productId: kit.id, qty: 1 }], coupon: 'bemvindo', delivery: 'shipping', price: 0.01 });
  assert.deepEqual([quote.body.subtotal, quote.body.discount, quote.body.shipping, quote.body.total], [139.8, 13.98, 15, 140.82], 'prices come from the workspace, never from the cart');
  assert.equal((await send(`${api}/quote`, { items: [{ productId: mug.id, qty: 4 }] })).status, 400, 'stock is checked');
  assert.equal((await send(`${api}/quote`, { items: [{ productId: mug.id, qty: 1 }], coupon: 'NAOEXISTE' })).status, 400);
  assert.equal((await send(`${api}/checkout`, { items: [{ productId: mug.id, qty: 1 }], name: 'Ana', email: 'ana@example.com', delivery: 'shipping', address: { zip: '30000-000' } })).status, 400, 'shipping needs the address');

  const order = await send(`${api}/checkout`, { items: [{ productId: mug.id, qty: 2 }, { productId: kit.id, qty: 1 }], coupon: 'BEMVINDO', delivery: 'shipping', name: 'Ana Souza', email: 'ANA@example.com', phone: '+55 31 98888-1111',
    address: { zip: '30140-000', street: 'Rua da Bahia', number: '100', city: 'Belo Horizonte', state: 'MG' } });
  assert.equal(order.status, 201);
  assert.deepEqual([order.body.number, order.body.total, order.body.method], [1001, 140.82, 'Pix']);
  assert.match(order.body.instructions, /Chave Pix/);

  let s = await state();
  const saved = s.orders.at(-1), contact = s.contacts.find(row => row.email === 'ana@example.com'), invoice = s.invoices.find(row => row.id === saved.invoiceId);
  assert.equal(saved.status, 'Pending');
  assert.deepEqual(contact.tags, ['cliente-loja']);
  assert.deepEqual([invoice.status, invoice.value, invoice.contactId], ['Open', 140.82, contact.id]);
  assert.equal(s.stores.find(row => row.id === store.id).items[0].stock, 1, 'stock goes down');
  assert.equal(s.coupons.find(row => row.code === 'BEMVINDO').redemptions, 1);

  assert.equal((await act({ type: 'delete', key: 'products', id: mug.id })).status, 409, 'a product on sale cannot be deleted');
  assert.equal((await save('orders', { status: 'Paid' }, saved.id)).status, 200);
  s = await state();
  assert.equal(s.invoices.find(row => row.id === saved.invoiceId).status, 'Paid');
  assert.deepEqual(s.transactions.filter(row => row.invoiceId === saved.invoiceId).map(row => [row.amount, row.method, row.source]), [[140.82, 'Pix', 'Invoice']]);

  const second = await send(`${api}/checkout`, { items: [{ productId: mug.id, qty: 1 }], delivery: 'pickup', name: 'Bruno', email: 'bruno@example.com' });
  s = await state();
  const pending = s.orders.find(row => row.number === second.body.number);
  assert.equal(pending.shipping, 0, 'pickup has no shipping');
  assert.equal(s.stores.find(row => row.id === store.id).items[0].stock, 0);
  assert.match(await (await fetch(`${base}/loja/demo/${store.id}`)).text(), /Esgotado/);
  await save('orders', { status: 'Cancelled' }, pending.id);
  s = await state();
  assert.equal(s.stores.find(row => row.id === store.id).items[0].stock, 1, 'cancelling puts the stock back');
  assert.equal(s.invoices.find(row => row.id === pending.invoiceId).status, 'Void');
  assert.equal((await save('orders', { status: 'Pending' }, pending.id)).status, 400, 'a cancelled order stays cancelled');

  await save('stores', { ...s.stores.find(row => row.id === store.id), active: false }, store.id);
  assert.equal((await fetch(`${base}/loja/demo/${store.id}`)).status, 404);
  assert.equal((await send(`${api}/checkout`, { items: [{ productId: kit.id, qty: 1 }], delivery: 'pickup', name: 'C', email: 'c@example.com' })).status, 404);
});
