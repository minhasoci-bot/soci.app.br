// Tickets (6b.1): a helpdesk tied to Conversas. A ticket has a number, a contact, a status, a priority, an
// owner, a category and SLA due times (first response and resolution, by priority). Team replies go out as
// messages on the conversation's channel; internal notes stay on the ticket; a new customer message reopens it.
import { ticketPriorities, ticketStatuses } from './ui/ticket-data.js';

export const ticketCollections = ['tickets'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const HOUR = 3600000;
const open = ticket => !['resolved', 'closed'].includes(ticket.status);

export const ticketDefaults = () => ({ categories: ['Dúvida', 'Problema técnico', 'Financeiro', 'Pedido'], autoFromInbound: false,
  sla: { low: { first: 24, resolve: 120 }, medium: { first: 8, resolve: 48 }, high: { first: 2, resolve: 24 }, urgent: { first: 1, resolve: 8 } } });
export const ticketSettingsOf = s => { s.ticketSettings = { ...ticketDefaults(), ...(s.ticketSettings || {}) }; return s.ticketSettings; };

/** 'ticket-settings': categories, SLA hours per priority and auto-create on new conversations. */
export function saveTicketSettings(s, d) {
  const t = ticketSettingsOf(s);
  if (d.categories !== undefined) t.categories = [...new Set((Array.isArray(d.categories) ? d.categories : String(d.categories).split(/[\n,]/)).map(v => str(v, 40)).filter(Boolean))].slice(0, 30);
  if (d.autoFromInbound !== undefined) t.autoFromInbound = Boolean(d.autoFromInbound);
  if (d.sla) for (const [key] of ticketPriorities) {
    const row = d.sla[key]; if (!row) continue;
    const first = Number(row.first), resolve = Number(row.resolve);
    if (!(first > 0 && first <= 720 && resolve > 0 && resolve <= 2160)) fail('Os prazos de SLA vão de 1 a 720 horas (resposta) e até 2.160 horas (resolução).');
    if (resolve < first) fail('O prazo de resolução não pode ser menor que o de primeira resposta.');
    t.sla[key] = { first, resolve };
  }
  return t;
}

const event = (ticket, kind, text, by = '') => { ticket.events = [...(ticket.events || []), { at: new Date().toISOString(), kind, text: str(text, 5000), by: str(by, 80) }].slice(-300); };

function create(s, d, { add, run }, source = 'manual') {
  const contact = s.contacts.find(row => row.id === d.contactId) || fail('Escolha o contato do ticket.', 404);
  const settings = ticketSettingsOf(s);
  const priority = ticketPriorities.some(([key]) => key === d.priority) ? d.priority : 'medium';
  const at = Date.now(), sla = settings.sla[priority];
  const number = (s.tickets || []).reduce((max, row) => Math.max(max, row.number || 1000), 1000) + 1;
  const ticket = add(s, 'tickets', { number, subject: str(d.subject, 160) || fail('Escreva o assunto do ticket.'), description: str(d.description, 5000), contactId: contact.id,
    status: 'open', priority, assignee: str(d.assignee, 120), category: settings.categories.includes(d.category) ? d.category : '', channel: str(d.channel, 30), source,
    dueFirstResponse: new Date(at + sla.first * HOUR).toISOString(), dueResolution: new Date(at + sla.resolve * HOUR).toISOString(), firstResponseAt: '', resolvedAt: '', closedAt: '', events: [] });
  event(ticket, 'created', d.description || ticket.subject, d.by);
  run(s, 'ticket_created', { contactId: contact.id, ticketId: ticket.id, priority, category: ticket.category, title: ticket.subject, number });
  return ticket;
}

function setStatus(s, ticket, status, by, run) {
  if (ticket.status === status) return;
  const before = ticket.status;
  ticket.status = status;
  if (status === 'resolved') ticket.resolvedAt = new Date().toISOString();
  if (status === 'closed') ticket.closedAt ||= new Date().toISOString();
  if (['open', 'pending', 'waiting'].includes(status)) { ticket.resolvedAt = ''; ticket.closedAt = ''; }
  event(ticket, 'status', `${ticketStatuses.find(([k]) => k === before)?.[1] || before} → ${ticketStatuses.find(([k]) => k === status)?.[1] || status}`, by);
  run(s, 'ticket_status_changed', { contactId: ticket.contactId, ticketId: ticket.id, status, previous: before, priority: ticket.priority, title: ticket.subject, number: ticket.number });
}

export function ticketCommand(s, command, { add, run, actor = '' }) {
  const { type, id, data: d = {} } = command;
  if (type === 'ticket-settings') return saveTicketSettings(s, d) && 'ok';
  if (type === 'ticket-create') return create(s, { ...d, by: actor }, { add, run }).id;
  const ticket = (s.tickets || []).find(row => row.id === id) || fail('Ticket não encontrado.', 404);
  const by = str(d.by, 80) || actor;
  if (type === 'ticket-update') {
    if (d.subject !== undefined) ticket.subject = str(d.subject, 160) || fail('Escreva o assunto do ticket.');
    if (d.priority !== undefined && d.priority !== ticket.priority) {
      if (!ticketPriorities.some(([key]) => key === d.priority)) fail('Prioridade inválida.');
      const sla = ticketSettingsOf(s).sla[d.priority], created = Date.parse(ticket.created);
      event(ticket, 'priority', `Prioridade: ${ticketPriorities.find(([k]) => k === d.priority)[1]}`, by);
      Object.assign(ticket, { priority: d.priority, dueFirstResponse: new Date(created + sla.first * HOUR).toISOString(), dueResolution: new Date(created + sla.resolve * HOUR).toISOString() });
    }
    if (d.assignee !== undefined && str(d.assignee, 120) !== ticket.assignee) { ticket.assignee = str(d.assignee, 120); event(ticket, 'assign', ticket.assignee ? `Responsável: ${ticket.assignee}` : 'Sem responsável', by); }
    if (d.category !== undefined) ticket.category = ticketSettingsOf(s).categories.includes(d.category) ? d.category : '';
    if (d.status !== undefined) {
      if (!ticketStatuses.some(([key]) => key === d.status)) fail('Situação inválida.');
      setStatus(s, ticket, d.status, by, run);
    }
    return ticket.id;
  }
  if (type === 'ticket-note') { event(ticket, 'note', str(d.text, 5000) || fail('Escreva a nota.'), by); return ticket.id; }
  if (type === 'ticket-reply') {
    const body = str(d.body, 5000) || fail('Escreva a resposta.');
    const channel = str(d.channel, 30) || ticket.channel || 'Email';
    const contact = s.contacts.find(row => row.id === ticket.contactId);
    if (channel === 'Email' && !contact?.email) fail('O contato não tem e-mail. Escolha outro canal.');
    add(s, 'messages', { contactId: ticket.contactId, channel, direction: 'Outbound', read: true, starred: false, origin: 'human', ticketId: ticket.id,
      subject: channel === 'Email' ? `[#${ticket.number}] ${ticket.subject}` : '', body });
    ticket.firstResponseAt ||= new Date().toISOString();
    event(ticket, 'reply', body, by);
    if (d.status && ticketStatuses.some(([key]) => key === d.status)) setStatus(s, ticket, d.status, by, run);
    else if (ticket.status === 'open') setStatus(s, ticket, 'waiting', by, run);
    return ticket.id;
  }
  fail('Comando de ticket desconhecido.');
}

/** Every event: a customer message lands on their open ticket (reopening it) or opens one when set to. */
export function ticketInbound(s, type, ctx, { add, run }) {
  if (type !== 'customer_replied' || !ctx.contactId) return;
  const mine = (s.tickets || []).filter(row => row.contactId === ctx.contactId).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const current = mine.find(open) || (mine[0] && mine[0].status === 'resolved' ? mine[0] : null);
  if (current) {
    event(current, 'customer', ctx.body || 'Nova mensagem do cliente', 'Cliente');
    if (current.status !== 'open') setStatus(s, current, 'open', 'Cliente', run);
    return;
  }
  if (!ticketSettingsOf(s).autoFromInbound) return;
  const body = String(ctx.body || '').trim();
  create(s, { contactId: ctx.contactId, subject: body.split('\n')[0].slice(0, 80) || 'Nova conversa', description: body, channel: ctx.channel || '', by: 'Automático' }, { add, run }, 'inbound');
}

/** The workflow actions: open a ticket for the contact, or change their latest open ticket. */
export function ticketWorkflow(s, contact, action, config, { add, run }) {
  if (action === 'create_ticket') return create(s, { contactId: contact.id, subject: config.subject, description: config.description, priority: config.priority, category: config.category, by: 'Automação' }, { add, run }, 'workflow');
  const ticket = (s.tickets || []).filter(row => row.contactId === contact.id && open(row)).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
  if (!ticket) return null;
  setStatus(s, ticket, config.status, 'Automação', run);
  return ticket;
}
