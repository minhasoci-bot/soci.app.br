// Links de pagamento: página pública, compra que abre a fatura e cobrança pela AbacatePay, transação com
// origem "Link de pagamento" quando a fatura é paga. Antes o link era só um registro, sem página nem checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blank, execute } from '../model.mjs';
import { renderPaymentLinkPage, sellableLink } from '../payment-link.mjs';
import { createPaymentLinkRoutes } from '../routes/payment-links.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const error = (message, status) => Object.assign(new Error(message), { status });

function shop() {
  const s = blank();
  s.profile.name = 'Clínica Sorriso';
  const product = save(s, 'products', { name: 'Clareamento', description: 'Sessão de clareamento a laser.', price: 350, kind: 'One time', active: true });
  const link = save(s, 'paymentLinks', { name: 'Clareamento no site', productId: product, active: true });
  return { s, product, link };
}

test('Buying through a link creates the contact and an open invoice tied to the link', () => {
  const { s, link } = shop();
  const invoiceId = execute(s, { type: 'payment-link-checkout', id: link, data: { name: 'Ana', email: 'ANA@exemplo.com' } });
  const invoice = s.invoices.find(row => row.id === invoiceId);
  const ana = s.contacts.find(row => row.email === 'ana@exemplo.com');
  assert.deepEqual([invoice.title, invoice.value, invoice.status, invoice.contactId, invoice.paymentLinkId], ['Clareamento', 350, 'Open', ana.id, link]);
  assert.ok(ana.tags.includes('link-de-pagamento'));
  execute(s, { type: 'payment-link-checkout', id: link, data: { name: 'Ana', email: 'ana@exemplo.com' } });
  assert.equal(s.contacts.filter(row => row.email === 'ana@exemplo.com').length, 1, 'a second purchase reuses the contact');
  assert.throws(() => execute(s, { type: 'payment-link-checkout', id: link, data: { name: 'Ana', email: 'nada' } }), /e-mail válido/);
});

test('A paid link invoice is booked as a "Payment link" transaction', () => {
  const { s, link } = shop();
  const invoiceId = execute(s, { type: 'payment-link-checkout', id: link, data: { name: 'Bia', email: 'bia@exemplo.com' } });
  save(s, 'invoices', { ...s.invoices.find(row => row.id === invoiceId), status: 'Paid' }, invoiceId);
  const tx = s.transactions.find(row => row.invoiceId === invoiceId);
  assert.deepEqual([tx.source, tx.amount], ['Payment link', 350]);
});

test('Only active one-time links with an active product can be paid online', () => {
  const { s, product, link } = shop();
  assert.equal(sellableLink(s, link).product.id, product);
  save(s, 'paymentLinks', { ...s.paymentLinks[0], active: false }, link);
  assert.throws(() => sellableLink(s, link), { status: 404 });
  const monthly = save(s, 'products', { name: 'Plano mensal', price: 90, kind: 'Recurring', interval: 'Monthly', active: true });
  const recurring = save(s, 'paymentLinks', { name: 'Mensal', productId: monthly, active: true });
  assert.throws(() => sellableLink(s, recurring), { status: 409, message: /recorrente/ });
});

test('The page shows the product, the price and posts to the link API', () => {
  const { s, link } = shop();
  const html = renderPaymentLinkPage(s, sellableLink(s, link), { workspace: 'demo', status: 'voltou' });
  assert.match(html, /<h1>Clareamento<\/h1>/);
  assert.match(html, /R\$\s?350,00/);
  assert.match(html, /não foi concluído/);
  assert.ok(html.includes(`"/api/pagar/demo/${link}"`));
  assert.match(html, /noindex/);
});

test('The API opens the invoice and answers with the AbacatePay charge; without the gateway it says so', async () => {
  const { s, link } = shop();
  const charged = [];
  const deps = connected => ({
    workspaceSegment, ready: Promise.resolve(), error, store: { load: async () => s }, publicAccountPolicy: async () => true,
    payload: async () => ({ name: 'Caio', email: 'caio@exemplo.com' }), publicBase: () => 'https://app.exemplo.com',
    change: async (workspace, command) => ({ id: execute(s, command) }),
    abacate: { connected: async () => connected, chargeInvoice: async (agency, workspace, invoiceId, origin, urls) => { charged.push({ invoiceId, urls }); return { url: 'https://pay.exemplo/abc' }; } }
  });
  const call = (route, method = 'POST') => route({ req: {}, res: {}, p: `/api/pagar/demo/${link}`, method, url: new URL(`http://x/api/pagar/demo/${link}`), json: body => body });
  assert.deepEqual(await call(createPaymentLinkRoutes(deps(true))), { payUrl: 'https://pay.exemplo/abc' });
  assert.equal(charged[0].invoiceId, s.invoices.at(-1).id);
  assert.equal(charged[0].urls.completionUrl, `https://app.exemplo.com/pagar/demo/${link}?status=pago`);
  await assert.rejects(call(createPaymentLinkRoutes(deps(false))), { status: 409 });
  await assert.rejects(call(createPaymentLinkRoutes(deps(true)), 'GET'), { status: 405 });
  assert.equal(await createPaymentLinkRoutes(deps(true))({ p: '/oferta/demo/x', method: 'GET' }), NEXT_ROUTE);
});

test('The links screen gives each link its address instead of the local-project notice', async () => {
  const crm = await readFile(new URL('../ui/crm.js', import.meta.url), 'utf8');
  assert.ok(!crm.includes('Neste projeto local'), 'the old notice is gone');
  assert.match(crm, /\/pagar\//);
});
