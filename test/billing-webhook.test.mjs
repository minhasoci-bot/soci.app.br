import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, metrics } from '../model.mjs';
import { refundCharge } from '../gateway-events.mjs';
import { invoiceView } from '../invoice-model.mjs';
import { invoicePaymentState } from '../ui/invoice-data.js';
import { startBilling } from './helpers/abacate.mjs';

async function charged(t, options) {
  const b = await startBilling(t, options), conn = await b.connect();
  const contactId = (await b.save('contacts', { name: 'Ana', email: 'ana@x.com' })).body.id;
  const invoiceId = (await b.save('invoices', { title: 'Projeto', contactId, value: 150, due: '2026-12-01', status: 'Open' })).body.id;
  const { body } = await b.send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId });
  const checkoutId = body.payment.checkoutId;
  const event = (name, checkout = {}, extra = {}) => ({ event: name, data: { checkout: { id: checkoutId, frequency: 'ONE_TIME', status: 'PAID', amount: 15000, platformFee: 80, metadata: { workspace: 'demo', invoiceId }, ...checkout }, payerInformation: { method: 'PIX' }, ...extra } });
  const invoice = async () => (await b.state()).invoices.find(row => row.id === invoiceId);
  const txs = async () => (await b.state()).transactions.filter(row => row.invoiceId === invoiceId);
  return { ...b, conn, contactId, invoiceId, checkoutId, event, invoice, txs };
}

test('Valor igual baixa e lança bruto e taxa; o mesmo pagamento reenviado com outro id lança uma vez', async t => {
  const c = await charged(t);
  assert.equal((await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }))).body.handled, true);
  assert.equal((await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }))).status, 200);
  assert.equal((await c.invoice()).status, 'Paid');
  assert.equal((await c.txs()).length, 1);
  const rows = await c.rows();
  assert.deepEqual(rows.map(row => [row.key, row.kind, row.amount_cents, row.fee_cents, row.method]), [[`demo:sale:abacatepay:${c.checkoutId}`, 'sale', 15000, 80, 'Pix']]);
  assert.equal(rows[0].payer.name, 'Ana');
});

test('Cartão com taxa repassada: baixa normal e o livro guarda o valor recebido', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15800, platformFee: 410 }, { payerInformation: { method: 'CARD' } }));
  assert.equal((await c.invoice()).status, 'Paid');
  assert.deepEqual((await c.rows()).map(row => [row.amount_cents, row.fee_cents, row.method]), [[15800, 410, 'Card']]);
});

test('Valor menor não baixa; a baixa manual usa o valor recebido e o livro não lança de novo', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 10000 }));
  let invoice = await c.invoice();
  assert.equal(invoice.status, 'Open');
  assert.deepEqual([invoice.payment.status, invoice.payment.received], ['MISMATCH', 100]);
  assert.equal(invoicePaymentState(invoice), 'mismatch');
  assert.equal((await c.txs()).length, 0);
  assert.equal((await c.rows()).length, 1);
  assert.equal((await c.send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId: c.invoiceId })).status, 409, 'não gera outra cobrança por cima');
  await c.save('invoices', { title: 'Projeto', contactId: c.contactId, value: 150, due: '2026-12-01', status: 'Paid' }, c.invoiceId);
  invoice = await c.invoice();
  assert.equal(invoice.status, 'Paid');
  assert.deepEqual((await c.txs()).map(row => [row.amount, row.method]), [[100, 'Pix']]);
  assert.deepEqual((await c.rows()).map(row => row.amount_cents), [10000]);
});

test('Sem valor no aviso, o gateway responde; sem resposta, diverge', async t => {
  const c = await charged(t);
  Object.assign(c.gateway.checkouts.get(c.checkoutId), { status: 'PAID', paidAmount: 15000 });
  await c.deliver(c.conn, c.event('checkout.completed', { amount: undefined }));
  assert.equal((await c.invoice()).status, 'Paid');
  const other = await charged(t);
  other.gateway.checkouts.clear();
  await other.deliver(other.conn, other.event('checkout.completed', { amount: undefined }));
  assert.equal(invoicePaymentState(await other.invoice()), 'mismatch');
  assert.deepEqual(await other.rows(), [], 'valor desconhecido não entra no livro');
});

test('Metadados de outra subconta não baixam a fatura', async t => {
  const c = await charged(t);
  const response = await c.deliver(c.conn, c.event('checkout.completed', { id: 'bill_alheio', paidAmount: 15000, metadata: { workspace: 'outra', invoiceId: c.invoiceId } }));
  assert.deepEqual([response.status, response.body.handled], [200, false]);
  assert.equal((await c.invoice()).status, 'Open');
  assert.deepEqual(await c.rows(), []);
});

test('Fatura excluída antes do aviso: o dinheiro entra no livro e o aviso é aceito', async t => {
  const c = await charged(t);
  await c.send('/api/action?workspace=demo', { type: 'delete', key: 'invoices', id: c.invoiceId });
  const response = await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  assert.deepEqual([response.status, response.body.handled], [200, false]);
  assert.deepEqual((await c.rows()).map(row => [row.kind, row.amount_cents, row.source]), [['sale', 15000, { type: 'invoice', id: c.invoiceId }]]);
  await c.deliver(c.conn, c.event('checkout.refunded', { paidAmount: 15000, status: 'REFUNDED' }));
  assert.equal(await c.sum(), 0);
});

test('Reembolso: fatura e transação mostram, o livro zera e não há nova cobrança', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  await c.deliver(c.conn, c.event('checkout.refunded', { paidAmount: 15000, status: 'REFUNDED' }));
  await c.deliver(c.conn, c.event('checkout.refunded', { paidAmount: 15000, status: 'REFUNDED' }));
  assert.equal(invoicePaymentState(await c.invoice()), 'refunded');
  assert.equal((await c.invoice()).status, 'Paid', 'as regras que dependem de paga não mudam');
  assert.equal((await c.txs())[0].status, 'Refunded');
  assert.equal(await c.sum(), 0);
  assert.equal((await c.rows()).length, 2);
  assert.equal((await c.send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId: c.invoiceId })).status, 409);
});

test('Contestação perdida seguida de reembolso lança um negativo só', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  await c.deliver(c.conn, c.event('checkout.disputed', { paidAmount: 15000, status: 'UNDER_DISPUTE' }));
  assert.equal(invoicePaymentState(await c.invoice()), 'disputed');
  assert.equal((await c.txs())[0].status, 'Disputed');
  assert.equal(await c.sum(), 15000, 'contestar ainda não tira o dinheiro');
  await c.deliver(c.conn, c.event('checkout.disputed', { paidAmount: 15000, status: 'REFUNDED' }));
  await c.deliver(c.conn, c.event('checkout.refunded', { paidAmount: 15000, status: 'REFUNDED' }));
  await c.deliver(c.conn, c.event('checkout.lost', { paidAmount: 15000, status: 'REFUNDED' }));
  assert.equal(invoicePaymentState(await c.invoice()), 'refunded');
  assert.equal(await c.sum(), 0);
  assert.deepEqual((await c.rows()).map(row => row.kind).sort(), ['dispute_lost', 'dispute_opened', 'sale']);
});

test('Contestação ganha volta a paga', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  await c.deliver(c.conn, c.event('checkout.disputed', { status: 'UNDER_DISPUTE' }));
  await c.deliver(c.conn, c.event('checkout.disputed', { status: 'PAID' }));
  assert.equal(invoicePaymentState(await c.invoice()), 'paid');
  assert.equal((await c.txs())[0].status, 'Succeeded');
  assert.equal(await c.sum(), 15000);
  assert.deepEqual((await c.rows()).map(row => row.kind).sort(), ['dispute_opened', 'dispute_won', 'sale']);
});

test('checkout.lost sem cobrança conhecida é aceito e não lança nada', async t => {
  const c = await charged(t);
  const response = await c.deliver(c.conn, { event: 'checkout.lost', data: {} });
  assert.deepEqual([response.status, response.body.handled], [200, false]);
  assert.deepEqual(await c.rows(), []);
});

test('Modo de teste do gateway baixa a fatura e fica fora do livro', async t => {
  const c = await charged(t, { devMode: true });
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  await c.deliver(c.conn, c.event('checkout.disputed', { status: 'UNDER_DISPUTE' }));
  await c.deliver(c.conn, c.event('checkout.refunded', { status: 'REFUNDED' }));
  assert.equal(invoicePaymentState(await c.invoice()), 'refunded');
  assert.deepEqual(await c.rows(), []);
});

test('Conflito de gravação responde 503, que o gateway repete, e a repetição conclui', async t => {
  const c = await charged(t);
  const change = c.store.change;
  let conflicts = 1;
  c.store.change = (id, mutate) => { if (id === 'demo' && conflicts-- > 0) throw Object.assign(new Error('The workspace changed concurrently. Please retry.'), { status: 409 }); return change(id, mutate); };
  assert.equal((await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }), { id: 'log_x' })).status, 503);
  assert.equal((await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }), { id: 'log_x' })).status, 200);
  assert.equal((await c.invoice()).status, 'Paid');
  assert.equal((await c.rows()).length, 1);
});

test('O rótulo de cada fatura', () => {
  const of = (status, payment) => invoicePaymentState({ status, payment: payment && { status: payment } });
  assert.deepEqual([of('Draft'), of('Open'), of('Void'), of('Paid'), of('Open', 'PENDING'), of('Open', 'MISMATCH'), of('Paid', 'MISMATCH'), of('Paid', 'REFUNDED'), of('Open', 'REFUNDED'), of('Paid', 'DISPUTED')],
    ['draft', 'open', 'void', 'paid', 'open', 'mismatch', 'paid', 'refunded', 'refunded', 'disputed']);
});

test('A página da fatura e o total recebido seguem o dinheiro', () => {
  const s = blank();
  const contactId = execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana', email: 'ana@x.com' } });
  const id = execute(s, { type: 'save', key: 'invoices', data: { title: 'A', contactId, value: 150, due: '2026-12-01', status: 'Paid' } });
  const row = s.invoices.find(item => item.id === id);
  assert.equal(metrics(s).invoicesPaid, 150);
  row.payment = { status: 'REFUNDED' };
  assert.equal(metrics(s).invoicesPaid, 0);
  assert.equal(invoiceView(s, row).state, 'refunded');
  assert.equal(invoiceView(s, row).receipt, null, 'recibo de dinheiro devolvido não vale');
  Object.assign(row, { status: 'Open', payment: { status: 'MISMATCH' } });
  assert.deepEqual([invoiceView(s, row).state, invoiceView(s, row).payable], ['mismatch', false]);
  row.payment = { status: 'PENDING' };
  assert.equal(invoiceView(s, row).payable, true);
});

test('Contato excluído depois de pagar: o reembolso do gateway marca a transação e o livro zera uma vez', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  await c.send('/api/action?workspace=demo', { type: 'delete', key: 'contacts', id: c.contactId });
  const refund = c.event('checkout.refunded', { paidAmount: 15000, status: 'REFUNDED' });
  assert.equal((await c.deliver(c.conn, refund)).body.handled, true);
  await c.deliver(c.conn, refund);
  assert.equal((await c.txs())[0].status, 'Refunded');
  assert.equal(await c.sum(), 0);
  assert.equal((await c.rows()).length, 2);
});

test('Pagamento com o contato na lixeira: restaurado, a fatura volta paga e não conta duas vezes', async t => {
  const c = await charged(t);
  await c.send('/api/action?workspace=demo', { type: 'delete', key: 'contacts', id: c.contactId });
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  await c.send('/api/action?workspace=demo', { type: 'contact-restore', id: c.contactId });
  assert.equal((await c.invoice()).status, 'Paid');
  assert.equal((await c.send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId: c.invoiceId })).status, 409);
  assert.equal(await c.sum(), 15000);
  await c.deliver(c.conn, c.event('checkout.refunded', { paidAmount: 15000, status: 'REFUNDED' }));
  assert.equal(await c.sum(), 0);
});

test('Transação excluída já saiu do livro: o reembolso dela não desconta de novo', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  await c.send('/api/action?workspace=demo', { type: 'delete', key: 'transactions', id: (await c.txs())[0].id });
  assert.equal(await c.sum(), 0);
  await c.deliver(c.conn, c.event('checkout.refunded', { paidAmount: 15000, status: 'REFUNDED' }));
  assert.equal(await c.sum(), 0);
});

test('Reenvio sem valor não apaga o valor recebido', async t => {
  const c = await charged(t);
  await c.deliver(c.conn, c.event('checkout.completed', { paidAmount: 15000 }));
  c.gateway.checkouts.clear();
  await c.deliver(c.conn, c.event('checkout.completed', { amount: undefined, platformFee: undefined }));
  const { payment } = await c.invoice();
  assert.deepEqual([payment.status, payment.receivedCents, payment.feeCents], ['PAID', 15000, 80]);
});

test('Mensalidade de um contrato excluído entra no livro; a de um plano da agência não vira venda', async t => {
  const c = await charged(t);
  const renewal = (metadata, id) => ({ event: 'subscription.renewed', data: { subscription: { id: 'subs_x', status: 'ACTIVE', method: 'CARD' }, checkout: { id: 'bill_doc', frequency: 'SUBSCRIPTION', metadata }, payment: { id, amount: 9900, paidAmount: 9900, platformFee: 300 } } });
  const gone = renewal({ workspace: 'demo', documentId: 'doc_1' }, 'card_1');
  assert.deepEqual([(await c.deliver(c.conn, gone)).status, (await c.deliver(c.conn, gone)).status], [200, 200]);
  await c.deliver(c.conn, renewal({ workspace: 'demo', planId: 'p1' }, 'card_2'));
  await c.deliver(c.conn, renewal({ workspace: 'outra', documentId: 'doc_1' }, 'card_3'));
  assert.deepEqual((await c.rows()).map(row => [row.key, row.kind, row.amount_cents, row.fee_cents, row.source]), [['demo:sale:abacatepay:card_1', 'sale', 9900, 300, { type: 'document', id: 'doc_1' }]]);
  const refund = metadata => ({ event: 'checkout.refunded', data: { checkout: { id: 'bill_doc', frequency: 'SUBSCRIPTION', status: 'REFUNDED', amount: 9900, metadata, updatedAt: '2026-12-01T12:00:00.000Z' } } });
  await c.deliver(c.conn, refund({ workspace: 'demo', planId: 'p1' }));
  assert.equal(await c.sum(), 9900, 'a devolução de um plano não é da subconta');
  await c.deliver(c.conn, refund({ workspace: 'demo', documentId: 'doc_1' }));
  await c.deliver(c.conn, refund({ workspace: 'demo', documentId: 'doc_1' }));
  assert.equal(await c.sum(), 0);
});

test('Reenvio do reembolso de uma mensalidade antiga não devolve a seguinte', () => {
  const s = blank(), tx = (id, created) => ({ id, created, date: created.slice(0, 10), contactId: '', amount: 99, method: 'Card', status: 'Succeeded', invoiceId: '', booked: 9900, bookedFor: 9900, gateway: { provider: 'abacatepay', status: 'PAID', paymentId: `card_${id}`, checkoutId: 'bill_doc' } });
  s.transactions.push(tx('1', '2026-10-01T12:00:00.000Z'), tx('2', '2026-11-01T12:00:00.000Z'));
  const charge = { checkoutId: 'bill_doc', status: 'REFUNDED', updatedAt: '2026-10-05T12:00:00.000Z', metadata: { workspace: 'demo', documentId: 'doc_1' }, paidCents: 9900 };
  refundCharge(s, charge, 'demo');
  refundCharge(s, charge, 'demo');
  assert.deepEqual(s.transactions.map(row => row.status), ['Refunded', 'Succeeded']);
  assert.deepEqual(s.ledgerOutbox.map(fact => [fact.key, fact.amountCents]), [['refund:abacatepay:card_1', -9900]]);
});
