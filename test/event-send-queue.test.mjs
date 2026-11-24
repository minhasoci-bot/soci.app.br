import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { eventSendDue } from '../event-send-model.mjs';

const ids = { grupo: '3c4ad2e7-7ec3-4b15-a35c-155e081bd240', privado: '6ccf69dd-f808-4258-b12c-9d5de1f06c88' };
const G = n => ({ jid: `12036300000000000${n}@g.us`, name: `Grupo ${n}` });
const START = Date.parse('2026-12-01T13:00:00.000Z');
const SEC = 1000, MIN = 60 * SEC;

// Fila de verdade, com o relógio na mão: take reserva, result grava.
function setup({ contacts = 3, notes = 'Oi, {{contact.first_name}}!', group = 'Oi', channel = 'privado' } = {}) {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  for (let n = 1; n <= contacts; n++) execute(s, { type: 'save', key: 'contacts', id: '', data: { name: `Pessoa${n} Silva`, phone: `551198888000${n}`, tags: ['lead'] } });
  const items = [
    { id: ids.grupo, kind: 'message', title: 'Grupo', code: 'MCWF001', channel: 'grupos', audience: 'base', status: 'pronto', date: '2026-12-01', time: '10:00', notes: group },
    { id: ids.privado, kind: 'message', title: 'Privado', channel: 'privado', status: 'pronto', date: '2026-12-01', time: '10:00', notes, targets: { tags: ['lead'], excludeTags: [] } }
  ];
  const id = execute(s, { type: 'save', key: 'eventPlans', id: '', data: { title: 'Aula', eventDate: '2026-12-10', plan: { brief: {}, items } } });
  execute(s, { type: 'event-groups-save', id, data: { base: [G(1), G(2)], evento: [] } });
  const app = {
    s, id, now: START, random: 0.5,
    event: () => s.eventPlans.find(row => row.id === id),
    item: key => app.event().plan.items.find(row => row.id === ids[key]),
    delivery: key => app.event().deliveries[ids[key]],
    run: (type, key, data = {}) => execute(s, { type, id, data: { itemId: ids[key], ...data } }),
    take: () => execute(s, { type: 'event-send-take', data: { at: new Date(app.now).toISOString(), random: app.random } }),
    result: (row, outcome, error = '') => execute(s, { type: 'event-send-result', data: { id: row.id, outcome, error, providerId: 'P1', at: new Date(app.now).toISOString() } }),
    save: change => { const plan = structuredClone(app.event().plan); change(plan); return execute(s, { type: 'save', key: 'eventPlans', id, data: { plan, revision: app.event().revision } }); },
    rows: key => s.eventSends.filter(row => row.itemId === ids[key])
  };
  app.run('event-message-schedule', channel === 'grupos' ? 'grupo' : 'privado');
  return app;
}
const custom = s => s.runs.length; // sem fluxos, nada roda: os eventos são conferidos com um fluxo de escuta abaixo
function listen(s, name) {
  return execute(s, { type: 'save', key: 'workflows', id: '', data: { name, active: true, triggers: [{ id: 't', type: 'custom_event', config: { event: name } }], steps: [{ id: 'n', type: 'add_note', config: { body: 'x' } }] } });
}

test('Nothing leaves before its time', () => {
  const app = setup(); app.now = START - 1;
  assert.deepEqual(app.take(), { row: null, contact: null, waitMs: 1 });
  assert.equal(eventSendDue(app.s, app.now), false);
  assert.equal(eventSendDue(app.s, START), true);
});

test('Two overlapping runs never take the same row', () => {
  const app = setup({ channel: 'grupos' });
  const a = app.take().row; app.now += 3 * SEC; const b = app.take().row;
  assert.notEqual(a.id, b.id);
  app.now += 3 * SEC;
  assert.equal(app.take().row, null);
  assert.deepEqual(app.rows('grupo').map(row => row.status), ['sending', 'sending']);
});

test('Private messages keep the random gap while groups go ahead', () => {
  const app = setup(); app.run('event-message-schedule', 'grupo');
  const first = app.take(); assert.equal(first.row.target, 'contact'); assert.equal(first.row.part.text, 'Oi, Pessoa1!');
  assert.equal(first.contact.name, 'Pessoa1 Silva');
  app.result(first.row, 'sent');
  assert.equal(app.take().row.target, 'group', 'o grupo não espera o intervalo do privado');
  app.now += 3 * SEC; assert.equal(app.take().row.target, 'group');
  app.now += 3 * SEC; assert.deepEqual(app.take(), { row: null, contact: null, waitMs: 34 * SEC }, '40 s entre privados');
  app.now += 34 * SEC; assert.equal(app.take().row.part.text, 'Oi, Pessoa2!');
});

test('The gap stays between the configured limits', () => {
  for (const [random, gap] of [[0, 20], [1, 60]]) {
    const app = setup(); app.random = random;
    app.result(app.take().row, 'sent');
    assert.equal(app.take().waitMs, gap * SEC);
  }
});

test('The daily cap holds the rest until the next day of the sub-account', () => {
  const app = setup();
  execute(app.s, { type: 'event-send-settings', data: { minGapSeconds: 10, maxGapSeconds: 10, dailyCap: 2 } });
  app.result(app.take().row, 'sent'); app.now += 10 * SEC;
  app.result(app.take().row, 'sent'); app.now += 10 * SEC;
  assert.equal(app.take().row, null);
  assert.equal(app.rows('privado')[2].status, 'queued');
  app.now = Date.parse('2026-12-02T02:59:00.000Z'); assert.equal(app.take().row, null, '23:59 em São Paulo ainda é o mesmo dia');
  app.now = Date.parse('2026-12-02T03:00:00.000Z');
  app.result(app.take().row, 'sent');
  assert.equal(app.delivery('privado').late, 1);
  assert.equal(app.item('privado').status, 'enviado');
});

test('Parts of a message go in order, three seconds apart, to the same person', () => {
  const app = setup({ contacts: 2, notes: '## Mensagem 1\nUm\n## Mensagem 2\nDois' });
  const one = app.take().row; assert.equal(one.part.text, 'Um');
  app.now += 60 * SEC;
  const other = app.take().row; assert.equal(other.part.text, 'Um'); assert.notEqual(other.to, one.to);
  app.result(one, 'sent');
  assert.equal(app.take().row, null);
  app.now += 3 * SEC;
  const two = app.take().row; assert.equal(two.part.text, 'Dois'); assert.equal(two.to, one.to);
});

test('A part that fails holds back the rest for that person only', () => {
  const app = setup({ contacts: 2, notes: '## Mensagem 1\nUm\n## Mensagem 2\nDois' });
  app.result(app.take().row, 'failed', 'não tem WhatsApp');
  assert.deepEqual(app.rows('privado').map(row => [row.status, row.blocked || false]), [['failed', false], ['skipped', true], ['queued', false], ['queued', false]]);
  assert.deepEqual(app.run('event-message-retry', 'privado'), { total: 2 });
});

test('What surely did not leave is tried again later, up to three more times', () => {
  const app = setup({ contacts: 1 });
  for (const wait of [1, 5, 15]) {
    app.result(app.take().row, 'retry', 'reiniciando');
    assert.equal(app.rows('privado')[0].status, 'queued');
    assert.equal(Date.parse(app.rows('privado')[0].notBefore) - app.now, wait * MIN);
    app.now += wait * MIN;
  }
  app.result(app.take().row, 'retry', 'reiniciando');
  assert.equal(app.rows('privado')[0].status, 'failed');
});

test('A disconnected number waits without spending attempts or the daily cap', () => {
  const app = setup({ contacts: 1 });
  for (let n = 0; n < 6; n++) { app.result(app.take().row, 'waiting', 'WhatsApp desconectado.'); app.now += 2 * MIN; }
  const [row] = app.rows('privado');
  assert.deepEqual([row.status, row.attempts, app.s.eventSendSettings.sentToday], ['queued', 0, 0]);
  assert.equal(app.take().row.id, row.id);
});

test('An unconfirmed send fails and never repeats by itself', () => {
  const app = setup({ contacts: 1 });
  app.result(app.take().row, 'unconfirmed', 'timeout');
  app.now += 60 * MIN;
  assert.equal(app.take().row, null);
  const [row] = app.rows('privado');
  assert.deepEqual([row.status, row.unconfirmed], ['failed', true]);
  assert.match(row.error, /não confirmado.*Confira no WhatsApp/);
});

test('A process that dies between sending and recording does not send again', () => {
  const app = setup({ contacts: 1 });
  const { row } = app.take();
  app.now += 4 * MIN; assert.equal(app.take().row, null); assert.equal(app.rows('privado')[0].status, 'sending');
  app.now += 2 * MIN; assert.equal(app.take().row, null);
  assert.deepEqual([app.rows('privado')[0].status, app.rows('privado')[0].unconfirmed], ['failed', true]);
  app.result(row, 'sent');
  assert.equal(app.rows('privado')[0].status, 'sent', 'a confirmação atrasada ainda vale');
  assert.equal(app.delivery('privado').sent, 1);
});

test('People who opted out, lost the phone or were deleted after scheduling are skipped', () => {
  const app = setup({ contacts: 4 });
  const [a, b, c] = app.s.contacts; a.dnd = true; b.phone = '';
  app.s.contacts = app.s.contacts.filter(row => row !== c);
  const { row } = app.take();
  assert.equal(row.part.text, 'Oi, Pessoa4!');
  assert.deepEqual(app.rows('privado').map(r => r.status), ['skipped', 'skipped', 'skipped', 'sending']);
  assert.match(app.rows('privado')[0].error, /não receber/);
  app.result(row, 'sent');
  assert.deepEqual([app.delivery('privado').state, app.delivery('privado').sent, app.delivery('privado').skipped], ['done', 1, 3]);
});

test('A phone fixed after scheduling is the one used', () => {
  const app = setup({ contacts: 1 });
  app.s.contacts[0].phone = '+55 21 97777-0000';
  assert.equal(app.take().row.to, '5521977770000');
});

test('The text is read when it leaves, and copy that became invalid never leaves', () => {
  const app = setup({ contacts: 2 });
  app.result(app.take().row, 'sent'); app.now += 60 * SEC;
  app.save(plan => { plan.items[1].notes = 'Novo texto'; });
  assert.equal(app.take().row.part.text, 'Novo texto');
  const broken = setup({ contacts: 1 });
  broken.item('privado').notes = 'Veja [link]';
  assert.equal(broken.take().row, null);
  assert.match(broken.rows('privado')[0].error, /\[link\]/);
});

test('Editing a scheduled message: what may change and what needs cancelling', () => {
  const app = setup();
  app.save(plan => { plan.items[1].time = '11:30'; });
  assert.ok(app.rows('privado').every(row => row.dueAt === '2026-12-01T14:30:00.000Z'));
  assert.equal(app.delivery('privado').dueAt, '2026-12-01T14:30:00.000Z');
  const refuse = (change, message) => assert.throws(() => app.save(plan => change(plan.items[1])), message);
  refuse(item => { item.channel = 'email'; }, /Cancele o envio/);
  refuse(item => { item.targets = { tags: ['outra'], excludeTags: [] }; }, /Cancele o envio/);
  refuse(item => { item.date = ''; }, /Cancele o envio/);
  refuse(item => { item.notes = '## Um\na\n## Dois\nb'; }, /Cancele o envio/);
  refuse(item => { item.notes = 'Veja [link]'; }, /\[link\]/);
  assert.doesNotThrow(() => app.save(plan => { plan.items[1].title = 'Outro título'; }));
});

test('Saving from a stale tab neither conflicts with the queue nor undoes its progress', () => {
  const app = setup({ contacts: 1 });
  const stale = structuredClone(app.event().plan), revision = app.event().revision;
  app.result(app.take().row, 'sent');
  assert.equal(app.item('privado').status, 'enviado');
  assert.equal(app.event().revision, revision, 'a fila não mexe na revisão');
  stale.brief.goal = 'Vender';
  execute(app.s, { type: 'save', key: 'eventPlans', id: app.id, data: { plan: stale, revision } });
  assert.equal(app.item('privado').status, 'enviado');
  const running = setup({ contacts: 2 });
  running.save(plan => { plan.items[1].status = 'cancelado'; });
  assert.equal(running.item('privado').status, 'agendado', 'só Cancelar envio tira da fila');
});

test('Deleting the item or the event empties its queue', () => {
  const app = setup();
  app.save(plan => { plan.items = plan.items.filter(row => row.id !== ids.privado); });
  assert.ok(app.rows('privado').every(row => row.status === 'canceled'));
  assert.equal(app.take().row, null);
  const gone = setup();
  execute(gone.s, { type: 'delete', key: 'eventPlans', id: gone.id });
  assert.ok(gone.s.eventSends.every(row => row.status === 'canceled'));
  assert.equal(gone.take().row, null);
});

test('Cancelling mid-way leaves the one being sent and keeps the count', () => {
  const app = setup();
  const { row } = app.take();
  app.run('event-message-cancel', 'privado');
  app.result(row, 'sent');
  assert.deepEqual([app.delivery('privado').state, app.delivery('privado').sent, app.item('privado').status], ['canceled', 1, 'pronto']);
});

test('A finished message reports once to the workflows and lands in the contact conversation', () => {
  const app = setup({ contacts: 2 }), before = custom(app.s);
  for (const name of ['event_message_sent', 'event_message_failed', 'event_item_status_changed']) listen(app.s, name);
  app.result(app.take().row, 'sent'); app.now += 60 * SEC;
  assert.equal(custom(app.s), before);
  app.result(app.take().row, 'failed', 'não tem WhatsApp');
  const names = app.s.runs.slice(before).map(run => app.s.workflows.find(row => row.id === run.workflowId).name).sort();
  assert.deepEqual(names, ['event_item_status_changed', 'event_message_failed', 'event_message_sent']);
  const sent = app.s.messages.filter(row => row.origin === 'event');
  assert.deepEqual(sent.map(row => [row.channel, row.direction, row.body, row.contactId]), [['WhatsApp', 'Outbound', 'Oi, Pessoa1!', app.s.contacts[0].id]]);
  assert.equal('text' in app.rows('privado')[0], false, 'o texto não fica guardado em cada linha');
  app.run('event-message-retry', 'privado'); app.now += 60 * SEC;
  app.result(app.take().row, 'sent');
  assert.equal(app.s.runs.slice(before).filter(run => app.s.workflows.find(row => row.id === run.workflowId).name === 'event_message_sent').length, 1);
});

test('A message nobody received goes back to ready instead of sent', () => {
  const app = setup({ contacts: 1 });
  app.result(app.take().row, 'failed', 'não tem WhatsApp');
  assert.deepEqual([app.delivery('privado').state, app.item('privado').status], ['done', 'pronto']);
});

test('Manual status changes reach the workflows', () => {
  const app = setup({ contacts: 1 }); listen(app.s, 'event_item_status_changed');
  const before = custom(app.s);
  app.save(plan => { plan.items[0].status = 'revisao'; });
  assert.equal(custom(app.s), before + 1);
});

test('The history is trimmed without touching what still has to leave', () => {
  const app = setup({ contacts: 1 });
  const old = app.s.eventSends[0];
  for (let n = 0; n < 5100; n++) app.s.eventSends.push({ ...old, id: `v${n}`, itemId: 'antigo', status: 'sent' });
  app.result(app.take().row, 'sent');
  assert.ok(app.s.eventSends.length <= 5000);
  assert.equal(app.delivery('privado').sent, 1);
  const queued = setup({ contacts: 3 });
  for (let n = 0; n < 5100; n++) queued.s.eventSends.push({ ...queued.s.eventSends[0], id: `f${n}`, itemId: 'futuro', dueAt: '2027-01-01T00:00:00.000Z' });
  queued.result(queued.take().row, 'sent');
  assert.equal(queued.s.eventSends.filter(row => row.status === 'queued').length, 5102);
});

test('An unknown or already finished row is ignored', () => {
  const app = setup({ contacts: 1 });
  const { row } = app.take();
  app.result(row, 'sent'); app.result(row, 'failed'); app.result({ id: 'nada' }, 'sent');
  assert.equal(app.rows('privado')[0].status, 'sent');
});
