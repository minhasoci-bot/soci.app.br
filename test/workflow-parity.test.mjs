import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { formatDate, formatNumber } from '../workflow-engine.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data, actor: 'Bia' }, { workspace: 'demo' });
const flow = (s, name, trigger, steps = [{ type: 'internal_notification', config: { body: name } }]) =>
  save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);

test('T.1 formatters: dates in pt-BR with days added, numbers in Brazilian formats', () => {
  assert.equal(formatDate('2026-11-21', 0, 'br'), '21/11/2026');
  assert.equal(formatDate('21/11/2026', 10, 'iso'), '2026-12-01');
  assert.equal(formatDate('2026-11-21', 0, 'long'), '21 de novembro de 2026');
  assert.equal(formatDate('2026-11-22', 0, 'weekday'), 'domingo');
  assert.equal(formatDate('2026-11-21T15:30:00Z', 0, 'time', 'America/Sao_Paulo'), '12:30');
  assert.equal(formatDate('2026-11-21', 0, 'time'), null, 'a date without time has no hour');
  assert.equal(formatDate('ontem', 0, 'br'), null);
  assert.match(formatDate('hoje', 0, 'iso'), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatNumber('1234.5', 'brl').replace(/\s/g, ' '), 'R$ 1.234,50');
  assert.equal(formatNumber('R$ 1.234,56', 'decimal'), '1.234,56');
  assert.equal(formatNumber('1234,6', 'integer'), '1.235');
  assert.equal(formatNumber('12.5', 'percent'), '12,5%');
  assert.equal(formatNumber('abc', 'decimal'), null);
});

test('T.1 actions: conversation, followers, custom value, appointment, opportunity, formatters and delete', () => {
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@x.test', tags: [], custom: {} });
  act(s, 'message', '', { contactId: ana, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi' });
  const valueId = save(s, 'customValues', { name: 'Promoção', value: 'nenhuma' });
  const iso = ms => new Date(ms).toISOString(), soon = Date.now() + 2 * 864e5, past = Date.now() - 2 * 864e5;
  save(s, 'appointments', { title: 'Antiga', contactId: ana, start: iso(past), end: iso(past + 36e5), status: 'Completed' });
  const next = save(s, 'appointments', { title: 'Próxima', contactId: ana, start: iso(soon), end: iso(soon + 36e5), status: 'Confirmed' });
  save(s, 'opportunities', { title: 'Plano anual', contactId: ana, stage: 'new', value: 900, status: 'Open' });
  const canceled = flow(s, 'Cancelado', { type: 'appointment_status', config: { status: 'Canceled' } });
  const main = flow(s, 'Tudo', { type: 'contact_tag', config: { change: 'added', tag: 'teste' } }, [
    { type: 'edit_conversation', config: { op: 'star' } },
    { type: 'edit_conversation', config: { op: 'read' } },
    { type: 'conversation_followers', config: { op: 'add', users: 'Bia, Caio, bia' } },
    { type: 'conversation_followers', config: { op: 'remove', users: 'caio' } },
    { type: 'update_custom_value', config: { valueId, value: 'Black Friday de {{contact.first_name}}' } },
    { type: 'appointment_status_update', config: { status: 'Canceled' } },
    { type: 'date_format', config: { value: '2026-11-21', days: 1, format: 'br', variable: 'amanha' } },
    { type: 'number_format', config: { value: '99,9', format: 'brl', variable: 'valor' } }
  ]);
  const cleanup = flow(s, 'Limpar', { type: 'contact_tag', config: { change: 'added', tag: 'apagar' } }, [
    { type: 'remove_opportunity', config: {} },
    { type: 'delete_contact', config: {} },
    { type: 'add_tag', config: { tag: 'depois' } }
  ]);
  save(s, 'contacts', { ...s.contacts.find(c => c.id === ana), tags: ['teste'] }, ana);
  const run = runsOf(s, main)[0];
  assert.ok(run, 'the flow ran');
  assert.ok(s.messages.filter(m => m.contactId === ana).length);
  assert.equal(s.messages.filter(m => m.contactId === ana).every(m => m.starred && m.read), true);
  assert.deepEqual(s.threads.find(t => t.contactId === ana).followers, ['Bia']);
  assert.equal(s.customValues.find(v => v.id === valueId).value, 'Black Friday de Ana');
  assert.equal(s.appointments.find(a => a.id === next).status, 'Canceled', 'the next appointment, not the past one');
  assert.equal(runsOf(s, canceled).length, 1, 'changing the status fires "Status do agendamento"');
  assert.deepEqual([run.vars.amanha, run.vars.valor.replace(/\s/g, ' ')], ['22/11/2026', 'R$ 99,90']);

  save(s, 'contacts', { ...s.contacts.find(c => c.id === ana), tags: ['teste', 'apagar'] }, ana);
  const text = runsOf(s, cleanup)[0].results.join(' | ');
  assert.match(text, /removida: Plano anual/);
  assert.equal(s.opportunities.length, 0);
  assert.match(text, /Ana Souza foi para a lixeira/);
  assert.equal(s.contacts.some(c => c.id === ana), false);
  assert.equal(s.contactTrash.length, 1, 'the contact can be restored from the trash');
  assert.match(text, /sem contato/, 'the steps after the deletion have no contact');
});

test('T.1 triggers: task reminder, service booking, transcript, subscription, refund', () => {
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [] });
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [] });
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: s.profile.timezone }).format(Date.now() + 864e5);
  save(s, 'tasks', { title: 'Ligar', contactId: ana, due: tomorrow });
  save(s, 'tasks', { title: 'Feita', contactId: bia, due: tomorrow, done: true });
  const reminder = flow(s, 'Lembrete', { type: 'task_reminder', config: { days: 1, time: '00:00' } });
  act(s, 'workflow-tick', '', { at: new Date().toISOString() });
  assert.deepEqual(runsOf(s, reminder).map(r => r.contactId), [ana], 'only open tasks due on the chosen day');
  act(s, 'workflow-tick', '', { at: new Date().toISOString() });
  assert.equal(runsOf(s, reminder).length, 1, 'once a day');

  const rental = save(s, 'resources', { name: 'Tenda', kind: 'rental', quantity: 2 });
  const service = save(s, 'services', { name: 'Aluguel de tenda', kind: 'rental', rentalUnit: 'day', resourceIds: [rental], price: 100 });
  const consult = save(s, 'services', { name: 'Consulta', kind: 'appointment', duration: 30 });
  const rentals = flow(s, 'Locações', { type: 'service_booked', config: { kind: 'rental' } });
  const anyService = flow(s, 'Serviços', { type: 'service_booked', config: {} });
  const slot = hours => { const start = Date.now() + 3 * 864e5 + hours * 36e5; return { start: new Date(start).toISOString(), end: new Date(start + 18e5).toISOString() }; };
  save(s, 'appointments', { title: 'Tenda', contactId: ana, ...slot(0), status: 'Confirmed', serviceId: service });
  save(s, 'appointments', { title: 'Consulta', contactId: bia, ...slot(2), status: 'Confirmed', serviceId: consult });
  save(s, 'appointments', { title: 'Sem serviço', contactId: bia, ...slot(4), status: 'Confirmed' });
  assert.deepEqual([runsOf(s, rentals).length, runsOf(s, anyService).length], [1, 2]);

  const transcript = flow(s, 'Transcrição', { type: 'transcript_generated', config: {} });
  const meeting = save(s, 'meetings', { title: 'Kickoff', contactId: ana });
  act(s, 'meeting-transcript', '', { id: meeting, transcript: 'Ana: vamos começar o projeto na segunda.' });
  assert.equal(runsOf(s, transcript)[0]?.contactId, ana);

  const product = save(s, 'products', { name: 'Mensal', price: 90, kind: 'Recurring', interval: 'Monthly', active: true });
  const canceled = flow(s, 'Cancelou', { type: 'subscription_status', config: { status: 'Canceled' } });
  const anySub = flow(s, 'Assinatura', { type: 'subscription_status', config: {} });
  const sub = save(s, 'subscriptions', { contactId: ana, productId: product, start: tomorrow, status: 'Active' });
  save(s, 'subscriptions', { ...s.subscriptions.find(x => x.id === sub), status: 'Canceled' }, sub);
  save(s, 'subscriptions', { ...s.subscriptions.find(x => x.id === sub), status: 'Canceled' }, sub);
  assert.deepEqual([runsOf(s, canceled).length, runsOf(s, anySub).length], [1, 2]);

  const refunds = flow(s, 'Reembolso', { type: 'refund', config: {} });
  const paid = save(s, 'transactions', { contactId: ana, amount: 90, date: tomorrow, status: 'Succeeded' });
  save(s, 'transactions', { ...s.transactions.find(x => x.id === paid), status: 'Refunded' }, paid);
  save(s, 'transactions', { contactId: bia, amount: 10, date: tomorrow, status: 'Refunded' });
  assert.deepEqual(runsOf(s, refunds).map(r => r.contactId), [ana, bia]);
  assert.equal(Number(runsOf(s, refunds)[0].context.total), 90);
});

test('T.1 triggers in the store: cart updated by a known contact, coupon used and coupon limit', () => {
  const s = blank();
  const productId = save(s, 'products', { name: 'Caneca', price: 50, kind: 'One time', active: true });
  const storeId = save(s, 'stores', { name: 'Loja', active: true, items: [{ productId }], shipping: { mode: 'none', pickup: true }, taxPercent: 0, payment: { method: 'Pix' } });
  const couponId = save(s, 'coupons', { name: 'Dez', code: 'DEZ', kind: 'Percent', amount: 10, limit: 1, active: true });
  const carts = flow(s, 'Carrinho', { type: 'cart_updated', config: { storeId } });
  const used = flow(s, 'Cupom', { type: 'coupon_redeemed', config: { couponId } });
  const limit = flow(s, 'Limite', { type: 'coupon_limit_reached', config: {} });
  const cart = (email, qty, session) => act(s, 'store-cart', storeId, { session, name: 'Cliente', email, items: [{ productId, qty }], delivery: 'pickup' });
  cart('nova@x.test', 1, 'ab'.repeat(16));
  assert.equal(runsOf(s, carts).length, 0, 'an unknown buyer is not a contact yet');
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [] });
  cart('bia@x.test', 1, 'cd'.repeat(16));
  cart('bia@x.test', 1, 'cd'.repeat(16));
  cart('bia@x.test', 3, 'cd'.repeat(16));
  assert.deepEqual(runsOf(s, carts).map(r => r.contactId), [bia, bia], 'only when the products change');
  assert.equal(Number(runsOf(s, carts)[1].context.total), 150);
  act(s, 'store-checkout', storeId, { session: 'cd'.repeat(16), name: 'Bia', email: 'bia@x.test', items: [{ productId, qty: 1 }], delivery: 'pickup', coupon: 'dez' });
  assert.equal(runsOf(s, used)[0]?.context.code, 'DEZ');
  assert.equal(runsOf(s, limit).length, 1, 'the only redemption reaches the limit');
});
