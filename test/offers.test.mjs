import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { signBody } from '../abacatepay.mjs';

const KEY = 'abc_dev_shopkey_0000bbbb';
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Offers bundle existing courses and communities, and paid ones need a price of at least R$ 1', () => {
  const s = blank();
  const course = save(s, 'courses', { name: 'Curso', lesson: 'Aula', body: '', active: true });
  const group = save(s, 'communities', { name: 'Clube' });
  const id = save(s, 'offers', { title: 'Pacote completo', courseIds: [course], communityIds: [group], type: 'one_time', price: 97, status: 'published' });
  const offer = s.offers.find(row => row.id === id);
  assert.deepEqual([offer.type, offer.price, offer.courseIds, offer.communityIds, offer.status], ['one_time', 97, [course], [group], 'published']);
  assert.throws(() => save(s, 'offers', { title: 'Vazia', type: 'free' }), /curso ou comunidade/);
  assert.throws(() => save(s, 'offers', { title: 'Barata', courseIds: [course], type: 'one_time', price: 0.5 }), /R\$ 1/);
  assert.throws(() => save(s, 'offers', { title: 'X', courseIds: ['nao-existe'], type: 'free' }), /curso/);
  const gift = save(s, 'offers', { title: 'Grátis', courseIds: [course], type: 'free', price: 50 });
  assert.equal(s.offers.find(row => row.id === gift).price, 0);
  execute(s, { type: 'delete', key: 'courses', id: course });
  assert.deepEqual(s.offers.find(row => row.id === id).courseIds, []);
});

function fakeAbacate() {
  const products = new Map(), calls = [];
  let seq = 0;
  const ok = data => Response.json({ data, error: null, success: true });
  return { calls, async request(url, init = {}) {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, body });
    if (init.headers?.Authorization !== `Bearer ${KEY}`) return Response.json({ data: null, error: 'Invalid key', success: false }, { status: 401 });
    if (u.pathname === '/v2/stores/get') return ok({ id: 'store_1', name: 'Loja', balance: 0 });
    if (u.pathname === '/v2/products/create') { products.set(body.externalId, body); return ok({ id: `prod_${++seq}`, ...body }); }
    if (u.pathname === '/v2/checkouts/create') { const id = `bill_${++seq}`; return ok({ id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode: true }); }
    return Response.json({ data: null, error: 'Not found', success: false }, { status: 404 });
  } };
}

test('Free offers enroll at once; paid offers enroll after AbacatePay confirms the payment', async t => {
  const gateway = fakeAbacate();
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false,
    openAISecret: 'abacate-test-seal-secret-32-chars!!', abacatePayRequest: gateway.request });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
  };
  const saveRemote = async (key, data) => (await send('/api/action?workspace=demo', { type: 'save', key, data })).body.id;
  const course = await saveRemote('courses', { name: 'Método', lesson: 'Aula 1', body: 'Conteúdo', active: true });
  const group = await saveRemote('communities', { name: 'Clube', visibility: 'private' });
  const free = await saveRemote('offers', { title: 'Aula grátis', description: 'Comece hoje', courseIds: [course], communityIds: [group], type: 'free', status: 'published' });
  const draft = await saveRemote('offers', { title: 'Rascunho', courseIds: [course], type: 'free', status: 'draft' });

  const page = await send(`/oferta/demo/${free}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /Aula grátis/);
  assert.match(page.body, /Método/);
  assert.equal((await send(`/oferta/demo/${draft}`)).status, 404);
  assert.equal((await send(`/api/offer/demo/${free}`, { name: 'Caio', email: 'nao-e-email' })).status, 400);

  const enrolled = await send(`/api/offer/demo/${free}`, { name: 'Caio', email: 'Caio@Example.test' });
  assert.deepEqual(enrolled.body, { enrolled: true, emailed: false });
  const portal = (await send('/api/client-portal/demo/admin')).body;
  const caio = portal.members.find(row => row.email === 'caio@example.test');
  assert.deepEqual(caio.courseIds, [course]);
  assert.equal((await send(`/api/client-portal/demo/community-admin/${group}`)).body.members.find(row => row.id === caio.id).status, 'active');
  const state = async () => (await send('/api/state?workspace=demo')).body.state;
  assert.ok((await state()).contacts.some(row => row.email === 'caio@example.test' && row.name === 'Caio'));

  const paid = await saveRemote('offers', { title: 'Pacote', courseIds: [course], type: 'one_time', price: 97, status: 'published' });
  assert.equal((await send(`/api/offer/demo/${paid}`, { name: 'Dani', email: 'dani@example.test' })).status, 409);
  const connected = (await send('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: KEY })).body;
  const bought = await send(`/api/offer/demo/${paid}`, { name: 'Dani', email: 'dani@example.test' });
  assert.match(bought.body.payUrl, /^https:\/\/app\.abacatepay\.com\/pay\/bill_/);
  let s = await state();
  const invoice = s.invoices.find(row => row.offerId === paid);
  assert.deepEqual([invoice.status, invoice.value], ['Open', 97]);
  assert.equal((await send('/api/client-portal/demo/admin')).body.members.some(row => row.email === 'dani@example.test'), false);

  const event = { id: 'log_offer_1', event: 'checkout.completed', data: { checkout: { id: invoice.payment.checkoutId, frequency: 'ONE_TIME', status: 'PAID', paidAmount: Math.round(invoice.value * 100) }, payerInformation: { method: 'PIX' } } };
  const raw = JSON.stringify(event);
  const hook = await fetch(`${connected.webhookUrl}?webhookSecret=${connected.webhookSecret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signBody(raw) }, body: raw });
  assert.equal(hook.status, 200);
  s = await state();
  const settled = s.invoices.find(row => row.id === invoice.id);
  assert.equal(settled.status, 'Paid');
  assert.ok(settled.offerGrantedAt);
  assert.deepEqual((await send('/api/client-portal/demo/admin')).body.members.find(row => row.email === 'dani@example.test').courseIds, [course]);

  // Staff can grant by hand (an invoice paid offline, for example) and it does not grant twice.
  const again = await send(`/api/client-portal/demo/offer-grant/${invoice.id}`, {});
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyGranted, true);
});
