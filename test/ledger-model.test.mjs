import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { blankAgency, extractSnapshot, hydrateAgency } from '../agency-model.mjs';
import { workspaceView } from '../authorization.mjs';
import { cents, postFact } from '../ledger-model.mjs';

const setup = () => {
  const s = blank();
  const contactId = execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana', email: 'ana@x.com' } });
  return { s, contactId, box: () => s.ledgerOutbox, sum: () => s.ledgerOutbox.reduce((n, fact) => n + fact.amountCents, 0) };
};
const invoice = (s, contactId, data = {}) => execute(s, { type: 'save', key: 'invoices', data: { title: 'Projeto', contactId, value: 150, due: '2026-12-01', status: 'Open', ...data } });
const pay = (s, id) => { const row = s.invoices.find(item => item.id === id); return execute(s, { type: 'save', key: 'invoices', id, data: { title: row.title, contactId: row.contactId, value: row.value, due: row.due, status: 'Paid' } }); };

test('Fatura paga à mão lança uma venda; editar lança só a diferença; excluir estorna o resto', () => {
  const { s, contactId, box, sum } = setup();
  const id = invoice(s, contactId);
  assert.equal(box().length, 0, 'fatura aberta não é dinheiro');
  pay(s, id);
  assert.equal(box().length, 1);
  assert.deepEqual([box()[0].kind, box()[0].layer, box()[0].amountCents, box()[0].contactId], ['manual_sale', 'account', 15000, contactId]);
  assert.deepEqual(box()[0].source, { type: 'invoice', id });
  assert.ok(s.ledgerSince);
  const tx = () => s.transactions[0];
  execute(s, { type: 'save', key: 'transactions', id: tx().id, data: { ...tx(), note: 'obs' } });
  assert.equal(box().length, 1, 'mudar a observação não lança');
  execute(s, { type: 'save', key: 'transactions', id: tx().id, data: { ...tx(), amount: 120 } });
  assert.deepEqual([box()[1].kind, box()[1].amountCents], ['adjustment', -3000]);
  execute(s, { type: 'delete', key: 'transactions', id: tx().id });
  assert.deepEqual([box()[2].kind, box()[2].amountCents], ['adjustment', -12000]);
  assert.equal(sum(), 0);
  assert.equal(new Set(box().map(fact => fact.key)).size, 3, 'cada fato tem a sua chave');
});

test('Reembolso lança o negativo; desfazer e reembolsar de novo mantém a conta certa', () => {
  const { s, contactId, box, sum } = setup();
  execute(s, { type: 'save', key: 'transactions', data: { contactId, amount: 80, date: '2026-05-02', method: 'Pix', status: 'Succeeded' } });
  const set = status => execute(s, { type: 'save', key: 'transactions', id: s.transactions[0].id, data: { ...s.transactions[0], status } });
  assert.match(box()[0].at, /^2026-05-02T/, 'vale a data informada');
  set('Refunded'); assert.deepEqual([box()[1].kind, sum()], ['refund', 0]);
  set('Succeeded'); assert.equal(sum(), 8000);
  set('Refunded'); assert.equal(sum(), 0);
  set('Failed'); assert.equal(sum(), 0);
  assert.equal(new Set(box().map(fact => fact.key)).size, box().length);
  execute(s, { type: 'save', key: 'transactions', data: { contactId, amount: 10, date: '2026-05-02', method: 'Pix', status: 'Failed' } });
  assert.equal(box().length, 4, 'transação que nasce falha não lança');
});

test('Contestação não é devolução: o dinheiro continua no livro até o resultado', () => {
  const { s, contactId, box } = setup();
  execute(s, { type: 'save', key: 'transactions', data: { contactId, amount: 80, date: '2026-05-02', method: 'Card', status: 'Succeeded' } });
  execute(s, { type: 'save', key: 'transactions', id: s.transactions[0].id, data: { ...s.transactions[0], status: 'Disputed' } });
  assert.equal(box().length, 1);
});

test('Venda pelo gateway usa a cobrança como chave, o valor recebido e a taxa', () => {
  const { s, contactId, box } = setup();
  const id = invoice(s, contactId);
  Object.assign(s.invoices.find(row => row.id === id), { paidMethod: 'Card', payment: { provider: 'abacatepay', checkoutId: 'bill_9', status: 'PAID', receivedCents: 15800, feeCents: 410 } });
  pay(s, id);
  assert.deepEqual([box()[0].key, box()[0].kind, box()[0].amountCents, box()[0].feeCents, box()[0].ref, box()[0].provider, box()[0].method], ['sale:abacatepay:bill_9', 'sale', 15800, 410, 'bill_9', 'abacatepay', 'Card']);
  const tx = s.transactions[0];
  execute(s, { type: 'save', key: 'transactions', id: tx.id, data: { ...tx, status: 'Refunded' } });
  assert.deepEqual([box()[1].key, box()[1].amountCents], ['refund:abacatepay:bill_9', -15800]);
});

test('Pagamento de teste não gera fato, nem ao editar ou excluir', () => {
  const { s, contactId, box } = setup();
  const id = invoice(s, contactId);
  s.invoices.find(row => row.id === id).payment = { provider: 'abacatepay', checkoutId: 'bill_9', status: 'PAID', devMode: true };
  pay(s, id);
  const tx = s.transactions[0];
  assert.equal(tx.test, true);
  execute(s, { type: 'save', key: 'transactions', id: tx.id, data: { ...tx, amount: 1 } });
  execute(s, { type: 'delete', key: 'transactions', id: tx.id });
  assert.deepEqual(box(), []);
});

test('Transação anterior ao livro, ao ser editada, entra primeiro com o valor antigo', () => {
  const { s, contactId, box } = setup();
  s.transactions.push({ id: 'velha', created: '2026-01-01T00:00:00.000Z', contactId, amount: 50, date: '2026-01-01', method: 'Cash', source: 'Manual', status: 'Succeeded', note: '', invoiceId: '' });
  execute(s, { type: 'save', key: 'transactions', id: 'velha', data: { ...s.transactions[0], amount: 70 } });
  assert.deepEqual(box().map(fact => [fact.key, fact.kind, fact.amountCents]), [['sale:tx:velha', 'manual_sale', 5000], ['adj:velha:1', 'adjustment', 2000]]);
  assert.equal(box()[0].detail.imported, true);
});

test('Mensalidade de contrato reenviada não duplica; sem id do pagamento, lança', () => {
  const { s, contactId, box } = setup();
  s.documents.push({ id: 'doc1', title: 'Contrato', contactId, status: 'completed', audit: [], payment: { mode: 'recurring', status: 'pending', invoiceIds: [], subscription: { status: 'pending', amount: 99, contactId, checkout: { checkoutId: 'bill_5', status: 'PENDING' } } } });
  const send = extra => execute(s, { type: 'document-subscription', data: { event: 'subscription.renewed', checkoutId: 'bill_5', subscriptionId: 'subs_1', amount: 99, method: 'Card', ...extra } });
  assert.equal(send({ paymentId: 'card_1', feeCents: 300 }), true);
  assert.equal(send({ paymentId: 'card_1', feeCents: 300 }), true);
  assert.equal(s.transactions.length, 1);
  assert.equal(s.documents[0].payment.subscription.payments.length, 1);
  assert.deepEqual(box().map(fact => [fact.key, fact.amountCents, fact.feeCents]), [['sale:abacatepay:card_1', 9900, 300]]);
  send({ paymentId: 'card_2' });
  assert.equal(s.transactions.length, 2);
  send({ paymentId: 'card_3', devMode: true });
  assert.equal(box().length, 2, 'modo de teste fica fora');
});

test('Pedido da loja pago lança uma vez', () => {
  const { s, contactId, box } = setup();
  const invoiceId = invoice(s, contactId, { title: 'Pedido #1' });
  s.stores.push({ id: 'st', active: true, payment: { method: 'Cash' }, items: [] });
  s.orders.push({ id: 'o1', number: 1, storeId: 'st', invoiceId, contactId, total: 150, items: [], status: 'Pending', note: '', tracking: '' });
  execute(s, { type: 'save', key: 'orders', id: 'o1', data: { id: 'o1', status: 'Paid', note: '', tracking: '' } });
  assert.equal(box().length, 1);
  assert.equal(box()[0].amountCents, 15000);
});

test('A caixa de saída não repete chave, não é cortada e não vaza', () => {
  const { s } = setup();
  const fact = { key: 'k', layer: 'account', kind: 'sale', amountCents: 1, at: '2026-01-01T00:00:00.000Z' };
  assert.equal(postFact(s, fact), true);
  assert.equal(postFact(s, fact), false);
  for (let i = 0; i < 2000; i++) postFact(s, { ...fact, key: `k${i}` });
  assert.equal(s.ledgerOutbox.length, 2001);
  const view = workspaceView({ modules: null }, s);
  assert.equal('ledgerOutbox' in view.state, false);
  assert.equal(s.ledgerOutbox.length, 2001, 'a projeção não mexe no original');
  assert.equal('ledgerOutbox' in workspaceView({ modules: ['payments'] }, s).state, false);
  const agency = blankAgency();
  const snap = extractSnapshot(s);
  assert.doesNotMatch(JSON.stringify(snap), /ledgerOutbox/);
  const old = blank(); delete old.ledgerOutbox; assert.deepEqual(hydrateWorkspace(old).ledgerOutbox, []);
  delete agency.ledgerOutbox; assert.deepEqual(hydrateAgency(agency).ledgerOutbox, []);
  assert.equal(cents(10.005), 1001);
  assert.equal(cents(0.1 + 0.2), 30);
});
