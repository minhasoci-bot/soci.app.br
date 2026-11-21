import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { slaState } from '../ui/ticket-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Tickets: numbers, SLA by priority, replies through the channel, notes and status changes', () => {
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [] });
  const semEmail = save(s, 'contacts', { name: 'Bia', phone: '11999990000', tags: [] });
  assert.throws(() => execute(s, { type: 'ticket-create', data: { contactId: ana } }), /assunto/);
  const first = execute(s, { type: 'ticket-create', data: { contactId: ana, subject: 'Pedido atrasado', priority: 'urgent', category: 'Pedido' }, actor: 'Carla' });
  const second = execute(s, { type: 'ticket-create', data: { contactId: semEmail, subject: 'Dúvida' } });
  const t = s.tickets.find(row => row.id === first);
  assert.deepEqual([t.number, s.tickets.find(row => row.id === second).number, t.status, t.priority, t.category], [1001, 1002, 'open', 'urgent', 'Pedido']);
  assert.equal(Date.parse(t.dueFirstResponse) - Date.parse(t.created) <= 3600000 + 1000, true, 'urgent: first response within 1 hour');
  execute(s, { type: 'ticket-note', id: first, data: { text: 'Cliente VIP' }, actor: 'Carla' });
  execute(s, { type: 'ticket-reply', id: first, data: { body: 'Estamos verificando!', channel: 'Email' }, actor: 'Carla' });
  const reply = s.messages.find(row => row.ticketId === first);
  assert.deepEqual([reply.channel, reply.direction, reply.subject], ['Email', 'Outbound', '[#1001] Pedido atrasado']);
  assert.ok(t.firstResponseAt);
  assert.equal(t.status, 'waiting', 'a reply waits for the customer');
  assert.throws(() => execute(s, { type: 'ticket-reply', id: second, data: { body: 'Oi', channel: 'Email' } }), /não tem e-mail/);
  execute(s, { type: 'ticket-update', id: first, data: { priority: 'low', assignee: 'Diego', status: 'resolved' } });
  assert.deepEqual([t.priority, t.assignee, t.status, Boolean(t.resolvedAt)], ['low', 'Diego', 'resolved', true]);
  assert.deepEqual(t.events.map(e => e.kind), ['created', 'note', 'reply', 'status', 'priority', 'assign', 'status']);
  assert.equal(slaState(t), '', 'resolved tickets have no SLA alert');
  assert.equal(slaState({ status: 'open', created: new Date(Date.now() - 5 * 3600000).toISOString(), dueFirstResponse: new Date(Date.now() - 3600000).toISOString() }), 'late');
});

test('A customer message reopens their ticket; with auto-create a new conversation opens one; workflows react', () => {
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [] });
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [] });
  const created = save(s, 'workflows', { name: 'Avisa urgente', active: true, triggers: [{ type: 'ticket_created', config: { priority: 'urgent' } }], steps: [{ type: 'internal_notification', config: { body: 'Ticket #{{trigger.number}}' } }] });
  const reopened = save(s, 'workflows', { name: 'Reaberto', active: true, triggers: [{ type: 'ticket_status_changed', config: { status: 'open' } }], steps: [{ type: 'internal_notification', config: { body: 'reaberto' } }] });
  const id = execute(s, { type: 'ticket-create', data: { contactId: ana, subject: 'Erro no login', priority: 'urgent' } });
  execute(s, { type: 'ticket-update', id, data: { status: 'resolved' } });
  execute(s, { type: 'message', data: { contactId: ana, channel: 'Email', direction: 'Inbound', body: 'Voltou a dar erro' } });
  const t = s.tickets.find(row => row.id === id);
  assert.equal(t.status, 'open');
  assert.equal(t.events.at(-2).kind, 'customer');
  assert.equal(s.runs.filter(row => row.workflowId === created).length, 1);
  assert.equal(s.runs.filter(row => row.workflowId === reopened).length, 1);
  execute(s, { type: 'message', data: { contactId: bia, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi, quero ajuda' } });
  assert.equal(s.tickets.filter(row => row.contactId === bia).length, 0, 'auto-create is off by default');
  execute(s, { type: 'ticket-settings', data: { autoFromInbound: true, categories: 'Suporte\nVendas', sla: { medium: { first: 4, resolve: 24 } } } });
  assert.throws(() => execute(s, { type: 'ticket-settings', data: { sla: { low: { first: 10, resolve: 5 } } } }), /resolução/);
  execute(s, { type: 'message', data: { contactId: bia, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi, quero ajuda\nmeu pedido não chegou' } });
  const auto = s.tickets.find(row => row.contactId === bia);
  assert.deepEqual([auto.subject, auto.channel, auto.source, s.ticketSettings.categories], ['Oi, quero ajuda', 'WhatsApp', 'inbound', ['Suporte', 'Vendas']]);
  save(s, 'workflows', { name: 'Abre e fecha', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'suporte' } }],
    steps: [{ type: 'create_ticket', config: { subject: 'Acompanhar {{contact.first_name}}', priority: 'high' } }, { type: 'update_ticket', config: { status: 'pending' } }] });
  const contact = s.contacts.find(row => row.id === ana);
  execute(s, { type: 'ticket-update', id, data: { status: 'closed' } });
  save(s, 'contacts', { ...contact, tags: ['suporte'] }, ana);
  for (let i = 0; i < 4; i++) execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + i * 1000).toISOString() } });
  const made = s.tickets.find(row => row.contactId === ana && row.source === 'workflow');
  assert.deepEqual([made.subject, made.priority, made.status], ['Acompanhar Ana', 'high', 'pending']);
});
