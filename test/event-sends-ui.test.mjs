import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { pageShell, utabs } from '../ui/screens.js';
import { deliveryView, failuresBody, groupsDialogBody, scheduleDialogBody, sendBanner, settingsDialogBody } from '../ui/event-sends.js';
import { eventView, itemDialogBody, itemFromValues } from '../ui/event-planner.js';

const ids = { grupo: '3c4ad2e7-7ec3-4b15-a35c-155e081bd240', privado: '6ccf69dd-f808-4258-b12c-9d5de1f06c88', email: '8a1a03c8-1837-4c22-90f1-73512e20d11c' };
const GROUP = { jid: '120363000000000001@g.us', name: 'Alunas <b>' };
const helpers = { pageShell, utabs, marketingTabs: [['events', 'Eventos']] };
const NOW = Date.parse('2026-12-01T13:00:00.000Z');

function setup() {
  const s = blank(); s.profile.timezone = 'America/Sao_Paulo';
  for (let n = 1; n <= 3; n++) execute(s, { type: 'save', key: 'contacts', id: '', data: { name: n === 1 ? 'Ana <i>' : `P${n}`, phone: `551198888000${n}`, tags: ['Lead', `t${n}`] } });
  const item = (key, data) => ({ id: ids[key], kind: 'message', title: key, status: 'pronto', date: '2026-12-01', time: '10:00', notes: 'Oi', ...data });
  const id = execute(s, { type: 'save', key: 'eventPlans', id: '', data: { title: 'A', eventDate: '2026-12-10', plan: { brief: {}, items: [
    item('grupo', { channel: 'grupos', audience: 'base' }), item('privado', { channel: 'privado', targets: { tags: ['Lead'], excludeTags: ['t3'] } }), item('email', { channel: 'email' })] } } });
  execute(s, { type: 'event-groups-save', id, data: { base: [GROUP], evento: [] } });
  const app = { s, c: { s, agency: { users: [] }, workspace: 'w', access: { modules: null } }, event: () => s.eventPlans[0], item: key => s.eventPlans[0].plan.items.find(row => row.id === ids[key]), run: (type, key, data = {}) => execute(s, { type, id, data: { itemId: ids[key], ...data } }) };
  app.view = key => deliveryView(app.c, app.event(), app.item(key));
  return app;
}

test('WhatsApp messages can be scheduled; other channels cannot', () => {
  const app = setup();
  assert.match(app.view('grupo'), /data-ep-schedule="3c4ad2e7[^"]*"[^>]*>[\s\S]*Agendar envio/);
  assert.match(app.view('privado'), /Agendar envio/);
  assert.equal(app.view('email'), '');
  app.c.access = { modules: ['marketing'] };
  assert.equal(app.view('grupo'), '', 'sem o módulo de conversas não agenda');
});

test('A scheduled message shows when it leaves and can be cancelled', () => {
  const app = setup(); app.run('event-message-schedule', 'grupo');
  const html = app.view('grupo');
  assert.match(html, /Agendada para 1 de dez\. de 2026, 10:00/);
  assert.match(html, /data-ep-cancel-send/);
  assert.doesNotMatch(html, /Agendar envio/);
});

test('Progress, failures and delay are visible while it runs and after', () => {
  const app = setup(); app.run('event-message-schedule', 'privado');
  Object.assign(app.event().deliveries[ids.privado], { state: 'sending', total: 40, sent: 32, failed: 2, late: 1, skipped: 0 });
  assert.match(app.view('privado'), /32 de 40 enviadas · 2 falhas · 1 com atraso/);
  Object.assign(app.event().deliveries[ids.privado], { state: 'done', total: 40, sent: 37, failed: 2, skipped: 1 });
  const done = app.view('privado');
  assert.match(done, /37 de 40 enviadas · 2 falhas · 1 fora da lista/);
  assert.match(done, /data-ep-failures/);
  assert.doesNotMatch(done, /Agendar envio|data-ep-cancel-send/);
  Object.assign(app.event().deliveries[ids.privado], { state: 'canceled', sent: 3 });
  assert.match(app.view('privado'), /Envio cancelado · 3 já tinham saído[\s\S]*Agendar envio/);
});

test('An old "Agendado" without a queue is not mistaken for a scheduled send', () => {
  const app = setup(); app.item('grupo').status = 'agendado';
  assert.match(app.view('grupo'), /Sem envio programado/);
  assert.match(app.view('grupo'), /Agendar envio/);
});

test('Only the queue sets "Agendado" on WhatsApp messages', () => {
  const app = setup();
  const select = key => eventView(app.c, app.event(), helpers, 'messages').match(new RegExp(`<select[^>]*data-ep-item-status="${ids[key]}"[^>]*>[\\s\\S]*?</select>`))[0];
  assert.doesNotMatch(select('grupo'), /value="agendado"/);
  assert.doesNotMatch(select('privado'), /value="agendado"/);
  assert.match(select('email'), /value="agendado"/);
  assert.doesNotMatch(itemDialogBody(app.c, app.event(), 'message', app.item('grupo')), /name="status"[\s\S]*value="agendado"[\s\S]*<\/select>[\s\S]*name="date"/);
  app.run('event-message-schedule', 'grupo');
  assert.match(select('grupo'), /disabled/);
  assert.match(select('grupo'), /value="agendado" selected/);
});

test('The preview shows exactly what leaves, to whom and when', () => {
  const preview = { parts: [{ kind: 'text', text: 'Oi *gente* <x>' }, { kind: 'poll', question: 'Vai?', options: ['Sim', 'Não'] }], recipients: 2, sample: ['Ana <i>', 'P2'], skipped: { dnd: 1, noPhone: 2, duplicate: 0 }, dueAt: '2026-12-01T13:30:00.000Z', endsAt: '2026-12-01T13:31:20.000Z', problem: '' };
  const item = { id: ids.privado, title: 'Privado', channel: 'privado' }, html = scheduleDialogBody({ id: 'e' }, item, preview, { now: NOW, zone: 'America/Sao_Paulo' });
  assert.match(html, /Oi <strong>gente<\/strong> &lt;x&gt;/);
  assert.match(html, /Vai\?[\s\S]*Sim[\s\S]*Não/);
  assert.match(html, /2 contatos[\s\S]*Ana &lt;i&gt;/);
  assert.match(html, /1 com “não perturbe” · 2 sem telefone/);
  assert.match(html, /01\/12\/2026, 10:30[\s\S]*10:31/);
  assert.match(html, />Agendar envio</);
  assert.match(scheduleDialogBody({ id: 'e' }, item, { ...preview, dueAt: '2026-12-01T12:00:00.000Z' }, { now: NOW, zone: 'America/Sao_Paulo' }), />Enviar agora</);
  const blocked = scheduleDialogBody({ id: 'e' }, item, { ...preview, problem: 'Preencha os marcadores: [link].' }, { now: NOW, zone: 'America/Sao_Paulo' });
  assert.match(blocked, /Preencha os marcadores: \[link\]\./);
  assert.match(blocked, /class="primary"[^>]*disabled/);
});

test('Groups keep the chosen ones even if they left the number, and explain a disconnected one', () => {
  const event = { id: 'e', groups: { base: [GROUP], evento: [] } };
  const html = groupsDialogBody(event, { reason: '', groups: [{ jid: '120363000000000002@g.us', name: 'Novo', size: 7 }] });
  assert.match(html, /name="base" value="120363000000000001@g\.us"[^>]*checked[\s\S]*Alunas &lt;b&gt;[\s\S]*não encontrado/);
  assert.match(html, /name="evento" value="120363000000000002@g\.us"/);
  assert.match(html, /7 participantes/);
  const off = groupsDialogBody(event, { reason: 'not-connected', groups: [] });
  assert.match(off, /WhatsApp não está conectado[\s\S]*href="#settings\/whatsapp"/);
  assert.match(groupsDialogBody(event, { reason: 'unsupported', groups: [] }), /não lista grupos/);
});

test('Pace settings start from the saved values', () => {
  const html = settingsDialogBody({ minGapSeconds: 25, maxGapSeconds: 50, dailyCap: 90 });
  assert.match(html, /name="minGapSeconds"[^>]*value="25"[^>]*min="10"[^>]*max="300"/);
  assert.match(html, /name="dailyCap"[^>]*value="90"[^>]*min="1"[^>]*max="1000"/);
});

test('Failures list the reason and separate what was not confirmed', () => {
  const app = setup(); app.run('event-message-schedule', 'privado');
  Object.assign(app.s.eventSends[0], { status: 'failed', error: 'não tem <WhatsApp>' });
  Object.assign(app.s.eventSends[1], { status: 'failed', unconfirmed: true, error: 'Envio não confirmado.' });
  const html = failuresBody(app.c, app.event(), app.item('privado'));
  assert.match(html, /Ana &lt;i&gt;[\s\S]*não tem &lt;WhatsApp&gt;/);
  assert.match(html, /data-ep-retry="failed"[^>]*>[\s\S]*Reenviar 1 falha</);
  assert.match(html, /data-ep-retry="all"[^>]*>[\s\S]*incluindo 1 não confirmada/);
});

test('The banner warns about a disconnected number and a late queue', () => {
  const app = setup(); app.run('event-message-schedule', 'privado');
  assert.equal(sendBanner(app.c, NOW - 60_000), '');
  for (const row of app.s.eventSends) row.error = 'WhatsApp desconectado.';
  assert.match(sendBanner(app.c, NOW + 60_000), /WhatsApp desconectado[\s\S]*href="#settings\/whatsapp"/);
  for (const row of app.s.eventSends) row.error = '';
  app.s.eventSends.push(...Array.from({ length: 10 }, (_, n) => ({ ...app.s.eventSends[0], id: `q${n}` })));
  assert.match(sendBanner(app.c, NOW + 120_000), /12 mensagens aguardando · previsão de término \d\d:\d\d/);
});

test('Private messages choose contacts by tag and keep the choice', () => {
  const app = setup(), dialog = itemDialogBody(app.c, app.event(), 'message', app.item('privado'));
  assert.match(dialog, /<div data-ep-targets>/);
  assert.match(dialog, /name="targetTag" value="Lead" checked/);
  assert.match(dialog, /name="excludeTag" value="t3" checked/);
  assert.match(dialog, /name="targetTag" value="t1"\s*>/);
  assert.match(itemDialogBody(app.c, app.event(), 'message', app.item('grupo')), /<div data-ep-targets hidden>/);
  const row = itemFromValues('message', { title: 'x', channel: 'privado', notes: '', targets: { tags: ['Lead'], excludeTags: [] } }, app.item('privado'), []);
  assert.deepEqual(row.targets, { tags: ['Lead'], excludeTags: [] });
});

test('Integrations count the WhatsApp sends and list the new events', () => {
  const app = setup(); app.run('event-message-schedule', 'grupo');
  const html = eventView(app.c, app.event(), helpers, 'integrations');
  for (const name of ['event_message_scheduled', 'event_message_sent', 'event_message_failed', 'event_item_status_changed']) assert.match(html, new RegExp(name));
  assert.match(html, /WhatsApp<\/span><b>0\/1<\/b>/);
});

test('The messages section offers groups and pace only to who can send', () => {
  const app = setup();
  assert.match(eventView(app.c, app.event(), helpers, 'messages'), /data-ep-groups[\s\S]*data-ep-pace/);
  app.c.access = { modules: ['marketing'] };
  assert.doesNotMatch(eventView(app.c, app.event(), helpers, 'messages'), /data-ep-groups/);
});
