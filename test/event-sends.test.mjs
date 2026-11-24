import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { requireWorkspaceCommand, workspaceView } from '../authorization.mjs';

const G = n => ({ jid: `12036300000000000${n}@g.us`, name: `Grupo ${n}` });
const ids = { grupo: '3c4ad2e7-7ec3-4b15-a35c-155e081bd240', privado: '6ccf69dd-f808-4258-b12c-9d5de1f06c88', email: '8a1a03c8-1837-4c22-90f1-73512e20d11c' };
const items = () => [
  { id: ids.grupo, kind: 'message', title: 'Convite', channel: 'grupos', audience: 'base', status: 'pronto', date: '2026-12-01', time: '18:00', notes: '## Mensagem 1\nOi\n## Mensagem 2\nTchau' },
  { id: ids.privado, kind: 'message', title: 'Reativar', channel: 'privado', status: 'pronto', date: '2026-12-01', time: '10:00', notes: 'Oi, {{contact.first_name}}!', targets: { tags: ['Lead', 'Aluna'], excludeTags: ['cliente'] } },
  { id: ids.email, kind: 'message', title: 'E-mail', channel: 'email', status: 'pronto', date: '2026-12-01', time: '10:00', notes: 'Oi' }
];
function setup({ groups = { base: [G(1), G(2)], evento: [G(3)] }, change = () => {} } = {}) {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  const contact = data => execute(s, { type: 'save', key: 'contacts', id: '', data });
  contact({ name: 'Ana Lima', phone: '+55 11 98888-0001', tags: ['lead'] });
  contact({ name: 'Bia', phone: '5511988880002', tags: ['ALUNA'] });
  contact({ name: 'Caio', phone: '5511988880003', tags: ['lead', 'Cliente'] });
  contact({ name: 'Duda', phone: '5511988880004', tags: ['lead'], dnd: true });
  contact({ name: 'Eva', phone: '', email: 'eva@example.test', tags: ['lead'] });
  s.contacts.push({ ...structuredClone(s.contacts[0]), id: 'repetido', name: 'Ana de novo', phone: '(55) 11988880001' });
  contact({ name: 'Fora', phone: '5511988880009', tags: ['outro'] });
  const list = items(); change(list);
  const id = execute(s, { type: 'save', key: 'eventPlans', id: '', data: { title: 'Aula', eventDate: '2026-12-10', plan: { brief: {}, items: list } } });
  if (groups) execute(s, { type: 'event-groups-save', id, data: groups });
  const run = (type, itemId, data = {}) => execute(s, { type, id, data: { itemId, ...data } });
  return { s, id, run, event: () => s.eventPlans.find(row => row.id === id), item: key => s.eventPlans.find(row => row.id === id).plan.items.find(row => row.id === ids[key]) };
}

test('Scheduling a group message queues every part for every group at the sub-account time', () => {
  const { s, run, event, item } = setup();
  assert.deepEqual(run('event-message-schedule', ids.grupo), { total: 4 });
  assert.deepEqual(s.eventSends.map(r => [r.to, r.part, r.parts, r.status, r.dueAt, r.target]), [
    [G(1).jid, 0, 2, 'queued', '2026-12-01T21:00:00.000Z', 'group'], [G(1).jid, 1, 2, 'queued', '2026-12-01T21:00:00.000Z', 'group'],
    [G(2).jid, 0, 2, 'queued', '2026-12-01T21:00:00.000Z', 'group'], [G(2).jid, 1, 2, 'queued', '2026-12-01T21:00:00.000Z', 'group']
  ]);
  assert.equal(item('grupo').status, 'agendado');
  const delivery = event().deliveries[ids.grupo];
  assert.deepEqual([delivery.state, delivery.total, delivery.sent], ['scheduled', 4, 0]);
});

test('Private recipients follow the tags and leave out dnd, missing and repeated phones', () => {
  const { s, run } = setup();
  const preview = run('event-message-preview', ids.privado, { at: '2026-11-25T12:00:00.000Z' });
  assert.equal(preview.recipients, 2);
  assert.deepEqual(preview.skipped, { dnd: 1, noPhone: 1, duplicate: 1 });
  assert.deepEqual(preview.sample, ['Ana Lima', 'Bia']);
  assert.deepEqual(preview.parts, [{ kind: 'text', text: 'Oi, {{contact.first_name}}!' }]);
  assert.equal(preview.problem, '');
  assert.equal(preview.dueAt, '2026-12-01T13:00:00.000Z');
  assert.equal(preview.endsAt, '2026-12-01T13:00:40.000Z', '2 contatos, 40 s em média entre eles');
  assert.equal(run('event-message-preview', ids.privado, { at: '2026-12-03T13:00:00.000Z' }).endsAt, '2026-12-03T13:00:40.000Z', 'com o horário passado, a conta parte de agora');
  assert.equal(s.eventSends.length, 0, 'a prévia não agenda');
  assert.deepEqual(run('event-message-schedule', ids.privado), { total: 2 });
  assert.deepEqual(s.eventSends.map(r => [r.name, r.to, r.target]), [['Ana Lima', '5511988880001', 'contact'], ['Bia', '5511988880002', 'contact']]);
});

test('The preview spreads a big list over the days the cap allows', () => {
  const { s, run } = setup();
  execute(s, { type: 'event-send-settings', data: { minGapSeconds: 20, maxGapSeconds: 60, dailyCap: 1 } });
  assert.equal(run('event-message-preview', ids.privado, { at: '2026-11-25T12:00:00.000Z' }).endsAt.slice(0, 10), '2026-12-02');
});

test('What is missing stops the schedule and is explained in the preview', () => {
  const problem = (key, change, options = {}) => {
    const app = setup({ change: list => change?.(list.find(row => row.id === ids[key])), ...options });
    const text = app.run('event-message-preview', ids[key]).problem;
    assert.throws(() => app.run('event-message-schedule', ids[key]), err => err.message === text, text);
    assert.equal(app.s.eventSends.length, 0);
    return text;
  };
  assert.match(problem('email'), /WhatsApp/);
  assert.match(problem('grupo', row => { row.date = ''; }), /data e horário/);
  assert.match(problem('grupo', row => { row.notes = 'Veja [link do grupo]'; }), /\[link do grupo\]/);
  assert.match(problem('grupo', row => { row.audience = ''; }), /grupos de destino/);
  assert.match(problem('grupo', null, { groups: null }), /Grupos do evento/);
  assert.match(problem('privado', row => { row.targets = { tags: [], excludeTags: [] }; }), /etiqueta/);
  assert.match(problem('privado', row => { row.targets = { tags: ['ninguém'], excludeTags: [] }; }), /Nenhum contato/);
});

test('A message is never scheduled twice, and cancelling frees only what was not sent', () => {
  const { s, run, event, item } = setup();
  run('event-message-schedule', ids.grupo);
  assert.throws(() => run('event-message-schedule', ids.grupo), /já está agendada/);
  Object.assign(s.eventSends[0], { status: 'sent', sentAt: '2026-12-01T21:00:01.000Z' });
  run('event-message-cancel', ids.grupo);
  assert.deepEqual(s.eventSends.map(r => r.status), ['sent', 'canceled', 'canceled', 'canceled']);
  assert.equal(item('grupo').status, 'pronto');
  assert.equal(event().deliveries[ids.grupo].state, 'canceled');
  assert.throws(() => run('event-message-cancel', ids.grupo), /não está agendada/);
  assert.deepEqual(run('event-message-schedule', ids.grupo), { total: 3 }, 'o que já saiu não vai de novo');
  assert.deepEqual(s.eventSends.map(r => [r.to, r.part, r.status]), [[G(1).jid, 0, 'sent'], [G(1).jid, 1, 'queued'], [G(2).jid, 0, 'queued'], [G(2).jid, 1, 'queued']]);
});

test('A finished message is not scheduled again; only failures are resent', () => {
  const { s, run, event } = setup();
  run('event-message-schedule', ids.privado);
  Object.assign(s.eventSends[0], { status: 'sent' });
  Object.assign(s.eventSends[1], { status: 'failed', error: 'não tem WhatsApp', attempts: 3 });
  Object.assign(event().deliveries[ids.privado], { state: 'done', sent: 1, failed: 1 });
  assert.throws(() => run('event-message-schedule', ids.privado), /já foi enviada/);
  assert.deepEqual(run('event-message-retry', ids.privado), { total: 1, dropped: 0 });
  assert.deepEqual([s.eventSends[1].status, s.eventSends[1].attempts, s.eventSends[1].error], ['queued', 0, '']);
  assert.equal(event().deliveries[ids.privado].state, 'sending');
  assert.throws(() => run('event-message-retry', ids.privado), /Não há falhas/);
});

test('Unconfirmed sends are only retried on purpose', () => {
  const { s, run, event } = setup();
  run('event-message-schedule', ids.privado);
  for (const row of s.eventSends) Object.assign(row, { status: 'failed', unconfirmed: true });
  event().deliveries[ids.privado].state = 'done';
  assert.throws(() => run('event-message-retry', ids.privado), /Não há falhas/);
  assert.deepEqual(run('event-message-retry', ids.privado, { include: 'all' }), { total: 2, dropped: 0 });
  assert.equal(s.eventSends[0].unconfirmed, false);
});

test('Groups and pace are validated and do not bump the event revision', () => {
  const { s, id, event } = setup(), revision = event().revision;
  execute(s, { type: 'event-groups-save', id, data: { base: [G(1), G(1)], evento: [] } });
  assert.deepEqual(event().groups, { base: [G(1)], evento: [] });
  assert.equal(event().revision, revision);
  assert.throws(() => execute(s, { type: 'event-groups-save', id, data: { base: [{ jid: '5511@s.whatsapp.net', name: 'x' }], evento: [] } }), /Grupo inválido/);
  assert.throws(() => execute(s, { type: 'event-groups-save', id, data: { base: Array.from({ length: 21 }, (_, n) => ({ jid: `1203630000000000${n}@g.us`, name: 'x' })), evento: [] } }), /20 grupos/);
  const set = data => execute(s, { type: 'event-send-settings', data });
  set({ minGapSeconds: 15, maxGapSeconds: 30, dailyCap: 80 });
  assert.deepEqual([s.eventSendSettings.minGapSeconds, s.eventSendSettings.maxGapSeconds, s.eventSendSettings.dailyCap], [15, 30, 80]);
  assert.throws(() => set({ minGapSeconds: 9, maxGapSeconds: 30, dailyCap: 80 }), /entre 10 e 300/);
  assert.throws(() => set({ minGapSeconds: 40, maxGapSeconds: 30, dailyCap: 80 }), /intervalo máximo/);
  assert.throws(() => set({ minGapSeconds: 20, maxGapSeconds: 30, dailyCap: 1001 }), /entre 1 e 1000/);
});

test('A list above 1.000 contacts is refused', () => {
  const { s, run } = setup();
  for (let n = 0; n < 1001; n++) s.contacts.push({ id: `m${n}`, name: `C${n}`, phone: `55119${String(70000000 + n)}`, tags: ['lead'] });
  assert.match(run('event-message-preview', ids.privado).problem, /1\.000 contatos/);
});

test('Copies and old workspaces start without deliveries', () => {
  const { s, id, run } = setup();
  run('event-message-schedule', ids.grupo);
  const copyId = execute(s, { type: 'event-plan-duplicate', id }), copy = s.eventPlans.find(row => row.id === copyId);
  assert.deepEqual([copy.deliveries || {}, copy.groups.base.length], [{}, 2]);
  assert.deepEqual(copy.plan.items[1].targets, { tags: ['Lead', 'Aluna'], excludeTags: ['cliente'] });
  const old = blank(); delete old.eventSends; delete old.eventSendSettings;
  hydrateWorkspace(old);
  assert.deepEqual(old.eventSends, []);
  assert.deepEqual([old.eventSendSettings.minGapSeconds, old.eventSendSettings.maxGapSeconds, old.eventSendSettings.dailyCap], [20, 60, 150]);
});

test('The queue is read-only for the browser and scheduling needs conversations too', () => {
  const marketing = { modules: ['marketing'] }, both = { modules: ['marketing', 'conversations'] };
  for (const type of ['event-message-preview', 'event-message-schedule', 'event-message-cancel', 'event-message-retry', 'event-groups-save', 'event-send-settings']) {
    assert.doesNotThrow(() => requireWorkspaceCommand(both, { type }), type);
    assert.throws(() => requireWorkspaceCommand(marketing, { type }), /permissão/, type);
  }
  for (const command of [{ type: 'event-send-take' }, { type: 'event-send-result' }, { type: 'save', key: 'eventSends' }, { type: 'delete', key: 'eventSends' }]) {
    assert.throws(() => requireWorkspaceCommand({ modules: null }, command), /Unknown operation/, JSON.stringify(command));
  }
  const { s, run } = setup();
  run('event-message-schedule', ids.grupo);
  assert.throws(() => execute(s, { type: 'save', key: 'eventSends', id: '', data: {} }), /Unknown record/);
  for (const row of s.eventSends) row.dueAt = '2099-12-01T13:00:00.000Z';
  s.eventSends[0].status = 'failed';
  assert.equal(workspaceView(both, s).state.eventSends.length, 1);
  assert.equal(workspaceView(marketing, s).state.eventSends.length, 0);
});
