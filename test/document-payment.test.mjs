import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { signBody } from '../abacatepay.mjs';
import { tokenHash } from '../document-model.mjs';
import { paymentParts, validPayment } from '../ui/document-data.js';
import { saveFiscal } from './helpers/fiscal.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const KEY = 'abc_dev_shopkey_0000bbbb';
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data }, { workspace: 'demo' });

// A signed document with a R$ 1.000 price list and the given payment settings.
function signedDocument(payment) {
  const s = blank();
  const contactId = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@exemplo.com.br' });
  save(s, 'workflows', { name: 'Pago', active: true, triggers: [{ type: 'document_paid', config: {} }], steps: [{ type: 'add_tag', config: { tag: 'cliente-pagou' } }] });
  const id = save(s, 'documents', { title: 'Contrato', contactId, payment, recipients: [{ id: 'rec-ana', label: 'Cliente', contactId, role: 'signer' }],
    blocks: [{ type: 'products', items: [{ name: 'Gestão', qty: 1, price: 1000 }] }, { id: 'f-sig-0001', type: 'field', kind: 'signature', recipientId: 'rec-ana' }] });
  act(s, 'document-send', id, {});
  const token = s.workflowOutbox.find(item => item.kind === 'document').path.split('#')[1];
  const view = act(s, 'document-sign', '', { tokenHash: tokenHash(token), accept: true, values: { 'f-sig-0001': PNG } });
  return { s, id, token, view, doc: () => s.documents.find(row => row.id === id), invoices: () => s.invoices.filter(row => row.documentId === id) };
}

test('Payment settings: one charge, installments that add up to 100% and a monthly subscription', () => {
  assert.equal(validPayment(null), null);
  assert.equal(validPayment({ mode: '' }), null);
  assert.deepEqual(validPayment({ mode: 'one_time', timing: 'invoice', dueDays: 10 }), { mode: 'one_time', timing: 'invoice', dueDays: 10, schedule: [], interval: '' });
  assert.throws(() => validPayment({ mode: 'one_time', schedule: [{ percent: 60, dueDays: 0 }, { percent: 30, dueDays: 30 }] }), /somam 90%/);
  assert.throws(() => validPayment({ mode: 'pix' }), /como cobrar/);
  assert.equal(validPayment({ mode: 'recurring', schedule: [{ percent: 100, dueDays: 0 }] }).schedule.length, 0, 'subscriptions do not split');
  const parts = paymentParts(validPayment({ mode: 'one_time', schedule: [{ percent: 33.33, dueDays: 0 }, { percent: 33.33, dueDays: 30 }, { percent: 33.34, dueDays: 60 }] }), 100);
  assert.deepEqual(parts.map(part => part.value), [33.33, 33.33, 33.34]);
  assert.equal(parts.reduce((n, part) => n + part.value, 0).toFixed(2), '100.00');
});

test('Charge on signing: completion creates the invoice, and paying it marks the document paid and runs “Documento pago”', () => {
  const { s, view, doc, invoices, token } = signedDocument({ mode: 'one_time', timing: 'on_sign' });
  assert.equal(view.status, 'completed');
  assert.equal(invoices().length, 1);
  const [invoice] = invoices();
  assert.deepEqual([invoice.title, invoice.value, invoice.status, invoice.contactId], ['Contrato', 1000, 'Open', s.contacts[0].id]);
  assert.equal(invoice.due.slice(0, 10), new Date().toISOString().slice(0, 10));
  assert.equal(doc().payment.status, 'pending');
  assert.equal(view.payment.payable, true);
  assert.deepEqual(act(s, 'document-payable', '', { tokenHash: tokenHash(token) }), { kind: 'invoice', invoiceId: invoice.id });

  save(s, 'invoices', { title: invoice.title, contactId: invoice.contactId, value: invoice.value, due: invoice.due, status: 'Paid' }, invoice.id);
  assert.equal(doc().payment.status, 'paid');
  assert.ok(doc().audit.some(entry => entry.event === 'paid'));
  assert.ok(s.contacts[0].tags.includes('cliente-pagou'), 'the document_paid trigger ran');
  assert.ok(s.transactions.some(row => row.invoiceId === invoice.id && row.amount === 1000));
  assert.throws(() => act(s, 'document-payable', '', { tokenHash: tokenHash(token) }), /Não há faturas em aberto/);
});

test('Installments: one invoice per part with its due date; the document is paid only when all are', () => {
  const { s, doc, invoices } = signedDocument({ mode: 'one_time', timing: 'invoice', schedule: [{ percent: 30, dueDays: 0 }, { percent: 70, dueDays: 30 }] });
  const [first, second] = invoices();
  assert.deepEqual([first.title, first.value, second.title, second.value], ['Contrato (1/2)', 300, 'Contrato (2/2)', 700]);
  assert.equal(Math.round((Date.parse(second.due) - Date.parse(first.due)) / 864e5), 30);
  save(s, 'invoices', { ...first, status: 'Paid' }, first.id);
  assert.equal(doc().payment.status, 'partial');
  assert.equal(s.contacts[0].tags.includes('cliente-pagou'), false);
  save(s, 'invoices', { ...second, status: 'Paid' }, second.id);
  assert.equal(doc().payment.status, 'paid');
  assert.ok(s.contacts[0].tags.includes('cliente-pagou'));
});

test('Monthly subscription: pending until AbacatePay confirms, then active with one transaction per month', () => {
  const { s, doc, token, invoices } = signedDocument({ mode: 'recurring', timing: 'on_sign' });
  assert.equal(invoices().length, 0);
  assert.deepEqual(doc().payment.subscription.status, 'pending');
  const due = act(s, 'document-payable', '', { tokenHash: tokenHash(token) });
  assert.deepEqual([due.kind, due.amount, due.checkout], ['subscription', 1000, null]);
  act(s, 'document-subscription-checkout', '', { docId: doc().id, checkout: { checkoutId: 'subs_1', url: 'https://pay.test/subs_1', status: 'PENDING' } });
  assert.equal(act(s, 'document-subscription', '', { event: 'subscription.completed', checkoutId: 'subs_1', subscriptionId: 'sub_99', amount: 1000, method: 'Card' }), true);
  assert.equal(doc().payment.subscription.status, 'active');
  assert.equal(doc().payment.status, 'paid');
  assert.ok(s.contacts[0].tags.includes('cliente-pagou'));
  act(s, 'document-subscription', '', { event: 'subscription.renewed', subscriptionId: 'sub_99', amount: 1000 });
  assert.equal(s.transactions.filter(row => row.source === 'Subscription' && row.note === 'Contrato').length, 2);
  act(s, 'document-subscription', '', { event: 'subscription.cancelled', subscriptionId: 'sub_99' });
  assert.equal(doc().payment.subscription.status, 'cancelled');
  assert.equal(doc().status, 'completed', 'cancelling does not touch the signed document');
  assert.equal(act(s, 'document-subscription', '', { event: 'subscription.completed', checkoutId: 'outro' }), false, 'events of other subscriptions are ignored');
});

function fakeAbacate() {
  const calls = [];
  let seq = 0;
  const ok = data => Response.json({ data, error: null, success: true });
  return { calls, async request(url, init = {}) {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, body });
    if (init.headers?.Authorization !== `Bearer ${KEY}`) return Response.json({ data: null, error: 'Invalid key', success: false }, { status: 401 });
    if (u.pathname === '/v2/stores/get') return ok({ id: 'store_1', name: 'Loja', balance: 0 });
    if (u.pathname === '/v2/products/create') return ok({ id: `prod_${++seq}`, ...body });
    if (u.pathname === '/v2/checkouts/create') { const id = `bill_${++seq}`; return ok({ id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode: true }); }
    if (u.pathname === '/v2/subscriptions/create') { const id = `subs_${++seq}`; return ok({ id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode: true }); }
    return Response.json({ data: null, error: 'Not found', success: false }, { status: 404 });
  } };
}

test('Public page pays through AbacatePay and the webhook settles the document', async t => {
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
  const action = command => send('/api/action?workspace=demo', command);
  const contactId = (await action({ type: 'save', key: 'contacts', data: { name: 'Ana Souza', email: 'ana@exemplo.com.br' } })).body.id;
  const id = (await action({ type: 'save', key: 'documents', data: { title: 'Contrato', contactId, payment: { mode: 'one_time', timing: 'on_sign' },
    recipients: [{ id: 'rec-ana', label: 'Cliente', contactId, role: 'signer' }],
    blocks: [{ type: 'products', items: [{ name: 'Gestão', qty: 1, price: 150 }] }, { id: 'f-sig-0001', type: 'field', kind: 'signature', recipientId: 'rec-ana' }] } })).body.id;
  const token = (await action({ type: 'document-send', id })).body.id.links[0].path.split('#')[1];
  const signed = (await send('/api/assinar/demo', { action: 'sign', token, accept: true, values: { 'f-sig-0001': PNG } })).body;
  assert.equal(signed.payment.payable, true);
  assert.equal(signed.payment.online, false);
  assert.equal((await send('/api/assinar/demo', { action: 'pay', token })).status, 409, 'no gateway connected yet');

  await send('/api/action?workspace=demo', saveFiscal);
  const connected = (await send('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: KEY })).body;
  const paying = await send('/api/assinar/demo', { action: 'pay', token });
  assert.equal(paying.status, 200);
  assert.match(paying.body.url, /^https:\/\/app\.abacatepay\.com\/pay\/bill_/);
  const checkout = gateway.calls.find(call => call.path === '/v2/checkouts/create').body;
  assert.match(checkout.completionUrl, /\/assinar\/demo\?pagamento=ok$/);
  assert.doesNotMatch(JSON.stringify(checkout), new RegExp(token), 'the personal token never goes to the gateway');

  const invoice = (await send('/api/state?workspace=demo')).body.state.invoices.find(row => row.documentId === id);
  const raw = JSON.stringify({ id: 'log_doc_1', event: 'checkout.completed', data: { checkout: { id: invoice.payment.checkoutId, frequency: 'ONE_TIME', status: 'PAID', paidAmount: Math.round(invoice.value * 100) }, payerInformation: { method: 'PIX' } } });
  const hook = await fetch(`${connected.webhookUrl}?webhookSecret=${connected.webhookSecret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signBody(raw) }, body: raw });
  assert.equal(hook.status, 200);
  const doc = (await send('/api/state?workspace=demo')).body.state.documents.find(row => row.id === id);
  assert.equal(doc.payment.status, 'paid');
  const reopened = (await send('/api/assinar/demo', { action: 'open', token })).body;
  assert.equal(reopened.payment.status, 'paid');
  assert.equal(reopened.payment.payable, false);
});
