import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { eventInstant } from '../workflow-engine.mjs';
import { chatHistory } from '../chat-model.mjs';
import { actionSpec } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
function run(steps, contact = {}, s = blank()) {
  const id = save(s, 'workflows', { name: 'Utilidades', active: true, triggers: [{ type: 'contact_created' }], steps });
  const contactId = save(s, 'contacts', { name: 'Ana Lima', email: 'ana@x.test', phone: '+55 81 99999-0000', tags: [], custom: {}, ...contact });
  return { s, run: s.runs.find(row => row.workflowId === id), contactId };
}

test('"Registrar ligação" writes the call log and a Conversas entry', () => {
  assert.deepEqual(actionSpec('log_call').fields.map(field => field.key), ['direction', 'status', 'duration', 'notes', 'phone']);
  const { s, run: done, contactId } = run([{ type: 'log_call', config: { direction: 'inbound', status: 'answered', duration: 7, notes: 'Pediu orçamento, {{contact.first_name}}.' } }]);
  const [call] = s.calls;
  assert.deepEqual([call.contactId, call.direction, call.status, call.duration, call.phone, call.source], [contactId, 'inbound', 'answered', 420, '+55 81 99999-0000', 'external']);
  const message = s.messages.find(row => row.callId === call.id);
  assert.deepEqual([message.channel, message.direction, message.body], ['Call', 'Inbound', 'Ligação recebida · atendida · 7 min\nPediu orçamento, Ana.']);
  assert.match(done.results.join(' '), /Ligação recebida · atendida · 7 min/);
});

test('Event dates read people-written dates in the sub-account time zone', () => {
  assert.equal(new Date(eventInstant('2030-01-10 19:30', 'America/Sao_Paulo')).toISOString(), '2030-01-10T22:30:00.000Z');
  assert.equal(new Date(eventInstant('10/01/2030 19:30', 'America/Sao_Paulo')).toISOString(), '2030-01-10T22:30:00.000Z');
  assert.equal(new Date(eventInstant('2030-01-10', 'America/Sao_Paulo')).toISOString(), '2030-01-10T03:00:00.000Z');
  assert.equal(new Date(eventInstant('2030-01-10T19:30:00Z')).toISOString(), '2030-01-10T19:30:00.000Z');
  assert.equal(new Date(eventInstant('2030-07-10 12:00', 'Europe/Lisbon')).toISOString(), '2030-07-10T11:00:00.000Z', 'summer time');
  assert.equal(eventInstant('amanhã'), null);
  assert.equal(eventInstant('2030-13-01'), null);
  assert.equal(eventInstant('31/02/2030 25:00'), null);
});

test('"Definir data do evento" and "Aguardar em relação à data do evento" wake before or after the date', () => {
  const s = blank();
  s.profile = { ...(s.profile || {}), timezone: 'America/Sao_Paulo' };
  const { run: waiting, contactId } = run([
    { type: 'set_variable', config: { name: 'consulta', value: '10/01/2030 19:30' } },
    { type: 'set_event_date', config: { date: '{{vars.consulta}}' } },
    { type: 'wait', config: { mode: 'event_date', offset: 1, offsetUnit: 'days', direction: 'before' } },
    { type: 'add_tag', config: { tag: 'lembrete-vespera' } },
    { type: 'wait', config: { mode: 'event_date', offset: 2, offsetUnit: 'hours', direction: 'after' } },
    { type: 'add_tag', config: { tag: 'pos-consulta' } }
  ], {}, s);
  assert.equal(waiting.eventDate, '2030-01-10T22:30:00.000Z');
  assert.equal(waiting.vars.data_evento, '2030-01-10T22:30:00.000Z');
  assert.equal(waiting.wakeAt, '2030-01-09T22:30:00.000Z');
  execute(s, { type: 'workflow-tick', data: { at: '2030-01-09T22:31:00.000Z' } });
  assert.ok(s.contacts.find(row => row.id === contactId).tags.includes('lembrete-vespera'));
  assert.equal(waiting.wakeAt, '2030-01-11T00:30:00.000Z');

  const past = run([{ type: 'set_event_date', config: { date: '2020-01-01 10:00' } }, { type: 'wait', config: { mode: 'event_date', offset: 1, offsetUnit: 'days', direction: 'before' } }, { type: 'add_tag', config: { tag: 'seguiu' } }]);
  assert.equal(past.run.status, 'Completed');
  assert.match(past.run.results.join(' '), /o momento já passou/);
  const none = run([{ type: 'wait', config: { mode: 'event_date', offset: 1 } }, { type: 'add_tag', config: { tag: 'seguiu' } }]);
  assert.match(none.run.results.join(' '), /sem data do evento definida/);
  const bad = run([{ type: 'set_event_date', config: { date: 'quando der' } }]);
  assert.match(bad.run.results.join(' '), /erro: data inválida: quando der/);
});

test('A paid community event registers only as a courtesy; live chat replies carry their buttons to the visitor', () => {
  const s = blank();
  s.communityEvents = [{ id: 'ev-pago', title: 'Workshop', communityId: 'g1', access: 'paid', status: 'published' }];
  const paid = run([{ type: 'register_event', config: { eventId: 'ev-pago' } }], {}, s);
  assert.match(paid.run.results.join(' '), /evento pago/);
  s.workflowOutbox = [];
  const comp = run([{ type: 'register_event', config: { eventId: 'ev-pago', ticket: 'comp' } }], { email: 'bia@x.test', phone: '+55 81 98888-0000' }, s);
  assert.equal(s.workflowOutbox.find(row => row.action === 'register_event').comp, true);
  assert.match(comp.run.results.join(' '), /Workshop: na fila/);

  const chat = blank();
  chat.chatWidgets = [{ id: 'w1', type: 'live', name: 'Site' }];
  const contactId = save(chat, 'contacts', { name: 'Visitante', tags: [], custom: {} });
  chat.chatSessions = [{ widgetId: 'w1', tokenHash: 'h1', contactId, created: '2000-01-01T00:00:00.000Z' }];
  const id = save(chat, 'workflows', { name: 'Chat', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'chat' } }],
    steps: [{ type: 'send_live_chat', config: { body: 'Como posso ajudar?', buttons: 'Orçamento\nAtendente\n\nOrçamento' } }] });
  save(chat, 'contacts', { ...chat.contacts[0], tags: ['chat'] }, contactId);
  assert.match(chat.runs.find(row => row.workflowId === id).results.join(' '), /com 2 botão/);
  const history = chatHistory(chat, 'w1', 'h1');
  assert.deepEqual(history.at(-1).buttons, ['Orçamento', 'Atendente']);
});
