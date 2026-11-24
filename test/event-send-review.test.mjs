// Achados da revisão da Fase 2: cada teste falhava antes da correção.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blank, execute } from '../model.mjs';
import { workspaceView } from '../authorization.mjs';
import { messageParts, renderPart } from '../ui/event-message-parts.js';
import { slaRecords } from '../ui/conversation-sla.js';

const ids = { base: '3c4ad2e7-7ec3-4b15-a35c-155e081bd240', privado: '6ccf69dd-f808-4258-b12c-9d5de1f06c88', outra: '8a1a03c8-1837-4c22-90f1-73512e20d11c' };
const G = n => ({ jid: `12036300000000000${n}@g.us`, name: `Grupo ${n}` });
const START = Date.parse('2026-12-01T13:00:00.000Z'), SEC = 1000, MIN = 60 * SEC;

function setup({ contacts = 3, notes = 'Oi', time = '10:00', schedule = true, tags = ['lead'], excludeTags = [] } = {}) {
  const s = blank(); s.profile.timezone = 'America/Sao_Paulo';
  for (let n = 1; n <= contacts; n++) s.contacts.push({ id: `c${n}`, created: '2026-01-01T00:00:00.000Z', name: `Pessoa${n}`, phone: `55119${String(70000000 + n)}`, email: '', tags: ['lead'], custom: {} });
  const item = (key, data) => ({ id: ids[key], kind: 'message', title: key, status: 'pronto', date: '2026-12-01', time, notes, ...data });
  const id = execute(s, { type: 'save', key: 'eventPlans', id: '', data: { title: 'Aula', eventDate: '2026-12-10', plan: { brief: {}, items: [
    item('base', { channel: 'grupos', audience: 'base' }), item('privado', { channel: 'privado', targets: { tags, excludeTags } }), item('outra', { channel: 'privado', targets: { tags, excludeTags } })] } } });
  execute(s, { type: 'event-groups-save', id, data: { base: [G(1), G(2)], evento: [] } });
  const app = {
    s, id, now: START, event: () => s.eventPlans[0], item: key => s.eventPlans[0].plan.items.find(row => row.id === ids[key]), delivery: key => s.eventPlans[0].deliveries?.[ids[key]],
    run: (type, key = 'privado', data = {}) => execute(s, { type, id, data: { itemId: ids[key], ...data } }),
    take: () => execute(s, { type: 'event-send-take', data: { at: new Date(app.now).toISOString(), random: 0 } }),
    result: (row, outcome, error = 'x') => execute(s, { type: 'event-send-result', data: { id: row.id, outcome, error, at: new Date(app.now).toISOString() } }),
    save: data => execute(s, { type: 'save', key: 'eventPlans', id, data }),
    // Esvazia a fila como o executor faria; devolve para quem saiu, em ordem.
    drain: (outcome = () => 'sent') => { const out = []; for (let n = 0; n < 500; n++) { const { row, waitMs } = app.take(); if (!row) { if (waitMs === null || waitMs > 3 * 60 * MIN) break; app.now += Math.max(1, waitMs); continue; } const o = outcome(row); if (o === 'sent') out.push(row.to); app.result(row, o); } return out; }
  };
  if (schedule) app.run('event-message-schedule');
  return app;
}
const phone = n => `55119${String(70000000 + n)}`;

test('C1: who turned WhatsApp off in the preference page never receives', () => {
  const app = setup({ schedule: false });
  app.s.contacts[0].optOut = { whatsapp: true };
  const preview = app.run('event-message-preview');
  assert.deepEqual([preview.recipients, preview.skipped.dnd], [2, 1]);
  app.run('event-message-schedule');
  app.s.contacts[1].optOut = { whatsapp: true };
  assert.deepEqual(app.drain(), [phone(3)]);
});

test('C2: cancel, reschedule and "Reenviar falhas" never repeat a message', () => {
  const app = setup();
  app.result(app.take().row, 'failed');
  app.run('event-message-cancel'); app.run('event-message-schedule');
  assert.deepEqual(app.drain().sort(), [phone(1), phone(2), phone(3)]);
  assert.deepEqual([app.delivery('privado').sent, app.delivery('privado').failed, app.delivery('privado').total], [3, 0, 3]);
  assert.throws(() => app.run('event-message-retry', 'privado', { include: 'all' }), /Não há falhas/);
});

test('C3: a cancelled message does not come back, nor twice after rescheduling', () => {
  for (const outcome of ['retry', 'waiting']) {
    const app = setup({ contacts: 1 }), { row } = app.take();
    app.run('event-message-cancel'); app.result(row, outcome);
    app.now += 60 * MIN;
    assert.equal(app.take().row, null, outcome);
    app.run('event-message-schedule');
    assert.deepEqual(app.drain(), [phone(1)], outcome);
  }
  const app = setup({ contacts: 1 }), { row } = app.take();
  app.run('event-message-cancel');
  assert.throws(() => app.run('event-message-schedule'), /já receberam/);
  app.result(row, 'sent');
  assert.equal(app.drain().length, 0);
});

test('I1: rescheduling remembers who received, even after trimming or a new phone', () => {
  const app = setup();
  app.result(app.take().row, 'sent'); app.run('event-message-cancel');
  for (let n = 0; n < 5200; n++) app.s.eventSends.push({ ...app.s.eventSends[0], id: `v${n}`, itemId: 'antigo', contactId: `x${n}`, to: `5521${n}`, status: 'sent' });
  app.run('event-message-schedule', 'outra');
  app.run('event-message-cancel', 'outra');
  app.run('event-message-schedule');
  assert.deepEqual(app.drain().sort(), [phone(2), phone(3)]);
  const moved = setup({ contacts: 1 });
  moved.s.contacts[0].phone = '5521999998888';
  assert.deepEqual(moved.drain(), ['5521999998888']);
  assert.throws(() => moved.run('event-message-schedule'), /já foi enviada/);
  const half = setup({ contacts: 2 });
  half.s.contacts[0].phone = '5521999998888';
  half.result(half.take().row, 'sent'); half.run('event-message-cancel'); half.run('event-message-schedule');
  assert.deepEqual(half.drain(), [phone(2)]);
});

test('I2: a tab opened before everything left does not undo "Enviado"', () => {
  const app = setup({ contacts: 1, schedule: false }), stale = structuredClone(app.event().plan), revision = app.event().revision;
  app.run('event-message-schedule'); app.drain();
  stale.brief.goal = 'x';
  app.save({ plan: stale, revision });
  assert.equal(app.item('privado').status, 'enviado');
});

test('I3: what passes the daily cap resumes the next day at the planned time, and the preview says so', () => {
  const app = setup({ contacts: 5, time: '19:00', schedule: false });
  execute(app.s, { type: 'event-send-settings', data: { minGapSeconds: 10, maxGapSeconds: 10, dailyCap: 3 } });
  const preview = app.run('event-message-preview', 'privado', { at: '2026-11-25T12:00:00.000Z' });
  assert.equal(preview.endsAt, '2026-12-02T22:00:10.000Z', '2 no dia seguinte, a partir das 19:00');
  app.run('event-message-schedule');
  app.now = Date.parse('2026-12-01T22:00:00.000Z');
  const left = [];
  for (let n = 0; n < 60; n++) { const { row, waitMs } = app.take(); if (row) { left.push(new Date(app.now).toISOString().slice(0, 16)); app.result(row, 'sent'); } else { if (waitMs === null) break; app.now += Math.max(1, waitMs); } }
  assert.deepEqual(left, ['2026-12-01T22:00', '2026-12-01T22:00', '2026-12-01T22:00', '2026-12-02T22:00', '2026-12-02T22:00']);
});

test('I4: the queue has a limit and reserving stays fast', () => {
  const app = setup({ contacts: 1000, notes: '## a\nUm\n## b\nDois\n## c\nTrês', schedule: false });
  app.run('event-message-schedule');
  assert.throws(() => app.run('event-message-schedule', 'outra'), /fila desta subconta está cheia/);
  app.take();
  const begin = performance.now();
  for (let n = 0; n < 20; n++) { app.now += 100 * SEC; app.result(app.take().row, 'sent'); }
  assert.ok((performance.now() - begin) / 20 < 60, `${((performance.now() - begin) / 20).toFixed(0)} ms por envio`);
});

test('I4: the browser gets only what the screen uses', () => {
  const app = setup({ contacts: 3 });
  const view = modules => workspaceView({ modules }, app.s).state.eventSends;
  assert.equal(view(null).length, 0, 'fila de dezembro ainda não venceu');
  Object.assign(app.s.eventSends[0], { status: 'sent' }); Object.assign(app.s.eventSends[1], { status: 'failed', error: 'x' });
  app.s.eventSends[2].dueAt = '2020-01-01T00:00:00.000Z'; app.s.eventSends[2].text = 'segredo';
  assert.deepEqual(view(null).map(row => row.status), ['failed', 'queued']);
  assert.equal(JSON.stringify(view(null)).includes('segredo'), false);
  assert.equal(app.s.eventSends.length, 3, 'o estado do servidor não muda');
});

test('I5: a phone that opted out in one contact is not reached through another', () => {
  const app = setup({ contacts: 2, schedule: false });
  app.s.contacts.push({ ...app.s.contacts[0], id: 'gemeo', name: 'Outro cadastro', phone: phone(1).slice(2), tags: [], dnd: true });
  assert.equal(app.run('event-message-preview').recipients, 1);
  app.run('event-message-schedule');
  app.s.contacts.push({ ...app.s.contacts[1], id: 'gemeo2', tags: [], optOut: { whatsapp: true } });
  assert.deepEqual(app.drain(), []);
});

test('I5: the same phone written with and without the country code is one recipient', () => {
  const app = setup({ contacts: 1, schedule: false });
  app.s.contacts.push({ ...app.s.contacts[0], id: 'dup', phone: phone(1).slice(2) });
  assert.deepEqual([app.run('event-message-preview').recipients, app.run('event-message-preview').skipped.duplicate], [1, 1]);
});

test('I6: names and phones of the queue need conversations too', () => {
  const app = setup(); app.s.eventSends[0].status = 'failed';
  assert.equal(workspaceView({ modules: ['marketing'] }, app.s).state.eventSends.length, 0);
  assert.equal(workspaceView({ modules: ['conversations'] }, app.s).state.eventSends.length, 0);
  assert.equal(workspaceView({ modules: ['marketing', 'conversations'] }, app.s).state.eventSends.length, 1);
});

test('I7: archiving the event stops what is queued', () => {
  const app = setup();
  app.save({ status: 'arquivado' });
  assert.deepEqual([app.delivery('privado').state, app.item('privado').status], ['canceled', 'pronto']);
  app.now += 60 * MIN;
  assert.equal(app.take().row, null);
});

test('I7: groups of a scheduled message cannot be swapped behind its back', () => {
  const app = setup({ schedule: false }); app.run('event-message-schedule', 'base');
  const swap = data => execute(app.s, { type: 'event-groups-save', id: app.id, data });
  assert.throws(() => swap({ base: [G(3)], evento: [] }), /agendada para estes grupos.*base/);
  assert.doesNotThrow(() => swap({ base: [G(1), G(2)], evento: [G(3)] }));
  app.run('event-message-cancel', 'base');
  assert.doesNotThrow(() => swap({ base: [G(3)], evento: [] }));
});

test('I8: a broadcast does not answer a customer for the SLA', () => {
  const at = n => '2026-12-01T10:0' + n + ':00.000Z', states = origin => slaRecords({ conversationSla: { enabled: true, startedAt: '2026-11-01T00:00:00.000Z', mode: 'common', common: { soon: 10, overdue: 20 }, automation: 'none', workflows: [] }, messages: [
    { id: 'a', contactId: 'c', channel: 'WhatsApp', direction: 'Inbound', created: at(0), origin: '' }, { id: 'b', contactId: 'c', channel: 'WhatsApp', direction: 'Outbound', created: at(5), origin }] }, Date.parse('2026-12-02T10:00:00.000Z')).map(row => row.state);
  assert.deepEqual(states('event'), states('internal'));
  assert.notDeepEqual(states('human'), states('internal'));
  assert.match(readFileSync(new URL('../ui/conversation-analytics.js', import.meta.url), 'utf8'), /event: 'Evento'/);
});

test('Tags beyond the limit are refused, never dropped in silence', () => {
  const tags = Array.from({ length: 21 }, (_, n) => `t${n}`);
  const app = setup({ contacts: 1, schedule: false, excludeTags: [...tags.slice(0, 20), 'lead'] });
  assert.match(app.run('event-message-preview').problem, /Nenhum contato/, 'a 21ª etiqueta de exclusão vale');
  assert.throws(() => setup({ tags: Array.from({ length: 101 }, (_, n) => `t${n}`) }), /100 etiquetas/);
});

test('A cancelled message is not resumed by "Reenviar"', () => {
  const app = setup();
  app.result(app.take().row, 'failed'); app.run('event-message-cancel');
  assert.throws(() => app.run('event-message-retry'), /Agende de novo/);
});

test('When nobody could receive, the message can be scheduled again', () => {
  const app = setup({ contacts: 1 });
  app.s.contacts[0].phone = ''; app.drain();
  app.s.contacts[0].phone = phone(1);
  app.run('event-message-schedule');
  assert.deepEqual(app.drain(), [phone(1)]);
});

test('Changing the time zone does not move scheduled messages', () => {
  const app = setup(), due = app.delivery('privado').dueAt;
  app.s.profile.timezone = 'America/Manaus';
  app.save({ title: 'Outro nome' });
  assert.equal(app.delivery('privado').dueAt, due);
});

test('Copy edge cases', () => {
  assert.deepEqual(messageParts('## Enquetes da semana\n- a\n- b'), [{ kind: 'text', text: '- a\n- b' }]);
  assert.equal(renderPart({ kind: 'text', text: 'Oi, *{{contact.first_name}}*! Vem?' }, { name: '' }).text, 'Oi! Vem?');
  const app = setup({ contacts: 1, notes: '{{contact.first_name}}' });
  app.s.contacts[0].name = ' ';
  assert.equal(app.take().row, null);
  assert.equal(app.delivery('privado').failed, 1);
});

test('Cards and tools fit a phone', () => {
  const css = readFileSync(new URL('../ui/event-planner.css', import.meta.url), 'utf8');
  assert.match(css, /\.ep-list \{[^}]*grid-template-columns:minmax\(0, 1fr\)/);
  assert.match(css, /\.ep-item-side \{[^}]*flex-wrap:wrap/);
});

test('C3: both layers stop a cancelled message on their own', () => {
  for (const outcome of ['retry', 'waiting']) {
    const app = setup({ contacts: 1 }), { row } = app.take();
    app.run('event-message-cancel'); app.result(row, outcome);
    assert.equal(app.s.eventSends[0].status, 'canceled', 'quem grava o resultado não devolve para a fila');
  }
  const app = setup({ contacts: 1 });
  app.delivery('privado').state = 'canceled';
  assert.equal(app.take().row, null, 'quem reserva confere a entrega');
  assert.equal(app.s.eventSends[0].status, 'canceled');
});

test('I1: trimming keeps who received a cancelled message even when only finished history could go', () => {
  const app = setup();
  app.result(app.take().row, 'sent'); app.run('event-message-cancel');
  app.event().deliveries[ids.outra] = { state: 'done', sent: 5200, total: 5200, failed: 0, skipped: 0 };
  const [received] = app.s.eventSends;
  for (let n = 0; n < 5200; n++) app.s.eventSends.push({ ...received, id: `h${n}`, itemId: ids.outra, contactId: `h${n}`, to: `5531${n}`, sentAt: '2026-12-02T00:00:00.000Z' });
  app.run('event-message-schedule');
  assert.ok(app.s.eventSends.length <= 5000);
  assert.ok(app.s.eventSends.includes(received));
});
