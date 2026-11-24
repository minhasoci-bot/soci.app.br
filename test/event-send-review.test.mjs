// Achados da revisão da Fase 2: cada teste falhava antes da correção.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blank, execute } from '../model.mjs';
import { requireRecordEffects, workspaceView } from '../authorization.mjs';
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
  for (const row of app.s.eventSends) row.dueAt = '2099-12-01T13:00:00.000Z';
  assert.equal(view(null).length, 0, 'o que ainda não venceu fica no servidor');
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
  for (const row of app.s.eventSends) row.dueAt = '2099-12-01T13:00:00.000Z';
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

// Revisão 2
const twin = (app, n, data) => app.s.contacts.push({ ...app.s.contacts[n - 1], id: 'gemeo' + n, name: 'Gêmeo', ...data });

test('R2: a phone corrected after scheduling does not receive twice', () => {
  const app = setup({ contacts: 2 });
  app.s.contacts[0].phone = phone(2);
  assert.deepEqual(app.drain(), [phone(2)]);
  assert.deepEqual([app.delivery('privado').state, app.delivery('privado').sent, app.delivery('privado').skipped], ['done', 1, 1]);
  const later = setup({ contacts: 2 });
  later.result(later.take().row, 'sent');
  later.s.contacts[1].phone = phone(1).slice(2);
  assert.deepEqual(later.drain(), [], 'quem já recebeu não recebe pelo outro cadastro');
});

test('R2: contacts merged after scheduling receive once, with every part', () => {
  const app = setup({ contacts: 2, notes: '## a\nUm\n## b\nDois' });
  for (const row of app.s.eventSends) row.contactId = 'c1';
  app.s.contacts.pop();
  const parts = [];
  for (let n = 0; n < 50; n++) { const { row, waitMs } = app.take(); if (row) { parts.push(row.part.text); app.result(row, 'sent'); } else { if (waitMs === null) break; app.now += Math.max(1, waitMs); } }
  assert.deepEqual(parts, ['Um', 'Dois']);
});

test('R2: a duplicate waits for the twin that is leaving, and follows it when it may have arrived', () => {
  const app = setup({ contacts: 2, notes: '## a\nUm\n## b\nDois' });
  app.s.contacts[1].phone = phone(1);
  const { row } = app.take(); app.now += MIN;
  assert.equal(app.take().row, null, 'o mesmo número já está em envio');
  app.result(row, 'unconfirmed');
  assert.deepEqual(app.drain(), []);
  const failed = setup({ contacts: 2 });
  failed.s.contacts[1].phone = phone(1);
  failed.result(failed.take().row, 'failed');
  assert.deepEqual(failed.drain(), [phone(1)], 'a falha certa não impede o outro cadastro');
});

test('R2: Brazilian numbers with and without the ninth digit are one person', () => {
  const app = setup({ contacts: 1, schedule: false });
  app.s.contacts[0].phone = '5531987654321';
  twin(app, 1, { phone: '553187654321' });
  assert.deepEqual([app.run('event-message-preview').recipients, app.run('event-message-preview').skipped.duplicate], [1, 1]);
  app.s.contacts[1].tags = []; app.s.contacts[1].dnd = true;
  assert.equal(app.run('event-message-preview').recipients, 0, 'o descadastro vale para as duas formas');
  app.s.contacts[1].dnd = false; app.s.contacts[1].tags = ['lead']; app.s.contacts[1].phone = '031987654321';
  assert.equal(app.run('event-message-preview').recipients, 1);
  // Fixo e celular que só se parecem são pessoas diferentes.
  app.s.contacts[0].phone = '5511951234567'; app.s.contacts[1].phone = '551151234567';
  assert.equal(app.run('event-message-preview').recipients, 2);
});

test('R2: what keeps waiting does not hold the line for the rest', () => {
  const app = setup({ contacts: 3, schedule: false });
  app.run('event-message-schedule', 'base'); app.run('event-message-schedule');
  const groups = new Set(), people = new Set();
  for (let minute = 0; minute < 12; minute++) {
    const { row } = app.take();
    if (row) { (row.to.includes('@') ? groups : people).add(row.to); app.result(row, row.to.includes('@') ? 'waiting' : 'sent'); }
    app.now += MIN;
  }
  assert.equal(people.size, 3);
  assert.equal(groups.size, 2);
});

test('R2: only an explicit "send now" moves a scheduled message into the past', () => {
  const app = setup({ contacts: 1, schedule: false }), plan = date => { const next = structuredClone(app.event().plan); next.items[1].date = date; return next; };
  app.save({ plan: plan('2099-12-01') });
  const stale = plan('2020-01-01'), revision = app.event().revision;
  app.run('event-message-schedule');
  for (const data of [{ plan: stale, revision }, { plan: stale, revision, sendNow: ids.outra }]) assert.throws(() => app.save(data), error => error.status === 409 && /sairia agora/.test(error.message));
  assert.equal(app.delivery('privado').dueAt, '2099-12-01T13:00:00.000Z');
  app.save({ plan: plan('2099-11-01') });
  app.save({ plan: plan('2020-01-01'), sendNow: ids.privado });
  assert.equal(app.delivery('privado').dueAt, '2020-01-01T13:00:00.000Z');
  assert.equal(app.event().sendNow, undefined, 'a confirmação não fica gravada');
  assert.doesNotThrow(() => app.save({ plan: plan('2020-01-02') }), 'já estava saindo');
});

test('R2: changing what is scheduled needs conversations, like scheduling', () => {
  const app = setup({ contacts: 1 });
  const check = (modules, command) => requireRecordEffects({ modules }, app.s, { key: 'eventPlans', id: app.id, ...command });
  const plan = change => { const next = structuredClone(app.event().plan); change(next.items); return { type: 'save', data: { plan: next } }; };
  const refused = [plan(items => { items[1].date = '2026-12-02'; }), plan(items => { items[1].time = '11:00'; }), plan(items => { items[1].notes = 'Outro'; }), plan(items => { items.splice(1, 1); }), { type: 'save', data: { status: 'arquivado' } }, { type: 'delete' }];
  for (const command of refused) {
    assert.throws(() => check(['marketing'], command), /permissão/);
    assert.doesNotThrow(() => check(['marketing', 'conversations'], command));
  }
  for (const command of [{ type: 'save', data: { title: 'Outro' } }, plan(items => { items[1].title = 'Outro'; }), plan(items => { items[0].notes = 'Outro'; }), { type: 'save', id: '', data: { title: 'Novo' } }]) assert.doesNotThrow(() => check(['marketing'], command));
  app.run('event-message-cancel');
  for (const command of refused) assert.doesNotThrow(() => check(['marketing'], command));
});

test('R2: "Reenviar" checks again what scheduling checks', () => {
  const failed = () => { const app = setup({ contacts: 2 }); app.drain(row => row.to === phone(1) ? 'failed' : 'sent'); return app; };
  const archived = failed(); archived.event().status = 'arquivado';
  assert.throws(() => archived.run('event-message-retry'), /arquivado/);
  const left = failed(); left.item('privado').targets = { tags: ['lead'], excludeTags: ['fora'] }; left.s.contacts[0].tags.push('fora');
  assert.throws(() => left.run('event-message-retry'), /não faz mais parte/);
  const swapped = failed(); Object.assign(swapped.item('privado'), { channel: 'grupos', audience: 'base' });
  assert.throws(() => swapped.run('event-message-retry'), /não faz mais parte/);
  const groups = setup({ schedule: false }); groups.run('event-message-schedule', 'base'); groups.drain(row => row.to === G(1).jid ? 'sent' : 'failed');
  execute(groups.s, { type: 'event-groups-save', id: groups.id, data: { base: [G(3)], evento: [] } });
  assert.throws(() => groups.run('event-message-retry', 'base'), /não faz mais parte/);
  const two = setup({ contacts: 3 }); two.drain(row => row.to === phone(3) ? 'sent' : 'failed'); two.s.contacts[0].tags = [];
  assert.deepEqual(two.run('event-message-retry'), { total: 1, dropped: 1 });
  assert.deepEqual(two.drain(), [phone(2)]);
  const fine = failed();
  assert.deepEqual(fine.run('event-message-retry'), { total: 1, dropped: 0 });
});

test('R2: what comes back to the queue follows the new date', () => {
  const app = setup({ contacts: 1 }), { row } = app.take(), plan = structuredClone(app.event().plan);
  plan.items[1].date = '2099-12-08';
  app.save({ plan }); app.result(row, 'retry');
  app.now += 60 * MIN;
  assert.equal(app.take().row, null);
  assert.equal(app.s.eventSends[0].dueAt, '2099-12-08T13:00:00.000Z');
});

test('R2: a late confirmation counts even after "Reenviar tudo", and frees the next parts', () => {
  const app = setup({ contacts: 1 }), { row } = app.take();
  app.result(row, 'unconfirmed'); app.run('event-message-retry', 'privado', { include: 'all' }); app.result(row, 'sent');
  assert.deepEqual(app.drain(), []);
  assert.equal(app.delivery('privado').sent, 1);
  const parts = setup({ contacts: 1, notes: '## a\nUm\n## b\nDois' }), first = parts.take().row;
  parts.result(first, 'unconfirmed');
  assert.equal(parts.delivery('privado').state, 'done');
  parts.result(first, 'sent');
  assert.deepEqual([parts.drain().length, parts.delivery('privado').sent, parts.item('privado').status], [1, 2, 'enviado']);
});

test('R2: a bigger daily cap releases what was held for tomorrow', () => {
  const app = setup({ contacts: 4 }), pace = dailyCap => execute(app.s, { type: 'event-send-settings', data: { minGapSeconds: 10, maxGapSeconds: 10, dailyCap } });
  pace(2); assert.equal(app.drain().length, 2);
  pace(100);
  assert.equal(app.drain().length, 2);
  assert.ok(app.now < START + 60 * MIN, 'no mesmo dia');
});

test('R2: a sent message turned into a task keeps a task status', () => {
  const app = setup({ contacts: 1 }); app.drain();
  const plan = structuredClone(app.event().plan);
  plan.items[1] = { id: ids.privado, kind: 'task', title: 'Agora tarefa', status: 'pendente', date: '', notes: '' };
  app.save({ plan });
  assert.equal(app.item('privado').status, 'pendente');
});

test('R2: "Reenviar tudo" does not run ahead of a new date', () => {
  const app = setup({ contacts: 2, time: '10:00' });
  app.result(app.take().row, 'unconfirmed'); app.run('event-message-cancel');
  const plan = structuredClone(app.event().plan); plan.items[1].date = '2099-12-08';
  app.save({ plan }); app.run('event-message-schedule'); app.run('event-message-retry', 'privado', { include: 'all' });
  app.now += 60 * MIN;
  assert.equal(app.take().row, null);
});
