// Envio das mensagens do Planejador de eventos pelo WhatsApp: o que vai para a fila, quando e para quem.
// Uma linha de eventSends por destino e por parte da mensagem. O andamento de cada mensagem fica em event.deliveries,
// fora do plano, para a fila nunca disputar a revisão com quem está editando.
import { randomUUID } from 'node:crypto';
import { messageParts, partsProblem } from './ui/event-message-parts.js';

export const eventSendCollections = ['eventSends'];
const CONTACT_LIMIT = 1000, GROUP_LIMIT = 20, PART_GAP = 3000;
export const GROUP_JID = /^\d[\d-]{5,40}@g\.us$/;
const channelsSent = ['grupos', 'privado'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const iso = at => new Date(at).toISOString();
const digits = value => String(value || '').replace(/\D/g, '');
const lower = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
const whole = (value, min, max) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fail(`Informe um número entre ${min} e ${max}.`);
};

export const eventSendDefaults = () => ({ minGapSeconds: 20, maxGapSeconds: 60, dailyCap: 150, nextPrivateAt: '', nextGroupAt: '', day: '', sentToday: 0 });
export function eventSendSettingsOf(s) {
  s.eventSendSettings = { ...eventSendDefaults(), ...s.eventSendSettings };
  return s.eventSendSettings;
}

const labels = value => [...new Set((Array.isArray(value) ? value : []).map(tag => str(tag, 48)).filter(Boolean))].slice(0, 20);
export const eventTargets = value => ({ tags: labels(value?.tags), excludeTags: labels(value?.excludeTags) });

const eventOf = (s, id) => s.eventPlans.find(row => row.id === id) || fail('Evento não encontrado.', 404);
const itemOf = (event, id) => event.plan.items.find(row => row.id === id && row.kind === 'message') || fail('Mensagem não encontrada.', 404);
const rowsOf = (s, event, item) => s.eventSends.filter(row => row.eventId === event.id && row.itemId === item.id);
export const deliveryActive = delivery => ['scheduled', 'sending'].includes(delivery?.state);

export function contactPhone(contact) {
  const phone = digits(contact?.phone);
  return phone.length >= 10 && phone.length <= 15 ? phone : '';
}
function contactsFor(s, targets) {
  const { tags, excludeTags } = eventTargets(targets), wanted = new Set(tags.map(lower)), unwanted = new Set(excludeTags.map(lower));
  const rows = [], seen = new Set(), skipped = { dnd: 0, noPhone: 0, duplicate: 0 };
  for (const contact of s.contacts) {
    const own = (contact.tags || []).map(lower);
    if (!own.some(tag => wanted.has(tag)) || own.some(tag => unwanted.has(tag))) continue;
    const to = contactPhone(contact);
    if (contact.dnd) skipped.dnd++;
    else if (!to) skipped.noPhone++;
    else if (seen.has(to)) skipped.duplicate++;
    else { seen.add(to); rows.push({ target: 'contact', to, contactId: contact.id, name: str(contact.name, 120) }); }
  }
  return { rows, skipped };
}
function destinations(s, event, item) {
  if (item.channel === 'privado') return contactsFor(s, item.targets);
  const groups = event.groups?.[item.audience] || [];
  return { rows: groups.map(group => ({ target: 'group', to: group.jid, contactId: '', name: group.name })), skipped: { dnd: 0, noPhone: 0, duplicate: 0 } };
}
function problemOf(event, item, parts, rows) {
  if (!channelsSent.includes(item.channel)) return 'Só mensagens de WhatsApp podem ser agendadas.';
  if (!item.date || !item.time) return 'Preencha data e horário para agendar.';
  const copy = partsProblem(parts, item.channel);
  if (copy) return copy;
  if (item.channel === 'grupos') {
    if (!item.audience) return 'Escolha os grupos de destino da mensagem.';
    return rows.length ? '' : 'Escolha os grupos em “Grupos do evento”.';
  }
  if (!eventTargets(item.targets).tags.length) return 'Escolha pelo menos uma etiqueta de contatos.';
  if (!rows.length) return 'Nenhum contato com telefone atende a estas etiquetas.';
  return rows.length > CONTACT_LIMIT ? 'Cada mensagem pode ir para até 1.000 contatos. Divida por etiquetas.' : '';
}
function endOf(s, rows, parts, dueAt, privado) {
  const step = PART_GAP * Math.max(0, parts - 1);
  if (!privado) return dueAt + Math.max(0, rows * parts - 1) * PART_GAP;
  const { minGapSeconds, maxGapSeconds, dailyCap } = eventSendSettingsOf(s);
  const ahead = s.eventSends.filter(row => row.target === 'contact' && row.status === 'queued' && Date.parse(row.dueAt) <= dueAt).length;
  const before = ahead + Math.max(0, rows - 1), days = Math.floor((ahead + rows * parts - 1) / dailyCap);
  return dueAt + days * 86_400_000 + (before * (minGapSeconds + maxGapSeconds) / 2 * 1000 + step) / (days + 1);
}

/** Conta as linhas da mensagem e guarda o andamento. Termina quando nada mais espera. */
export function settleDelivery(s, event, item, at) {
  const delivery = event.deliveries?.[item.id];
  if (!delivery) return false;
  const rows = rowsOf(s, event, item).filter(row => row.status !== 'canceled'), count = status => rows.filter(row => row.status === status).length;
  Object.assign(delivery, {
    total: rows.length, sent: count('sent'), failed: count('failed'), skipped: count('skipped'),
    late: rows.filter(row => row.status === 'sent' && Date.parse(row.sentAt) - Date.parse(row.dueAt) > 3_600_000).length
  });
  if (!deliveryActive(delivery)) return false;
  if (count('queued') + count('sending')) { if (delivery.sent + delivery.failed + delivery.skipped + count('sending')) delivery.state = 'sending'; return false; }
  Object.assign(delivery, { state: 'done', doneAt: iso(at) });
  return true;
}

function schedule(s, event, item, { instant, emit, at }) {
  if (deliveryActive(event.deliveries?.[item.id])) fail('Esta mensagem já está agendada.', 409);
  if (event.deliveries?.[item.id]?.state === 'done') fail('Esta mensagem já foi enviada. Crie outra para enviar de novo.', 409);
  const parts = messageParts(item.notes), { rows } = destinations(s, event, item), problem = problemOf(event, item, parts, rows);
  if (problem) fail(problem);
  const sent = new Set(rowsOf(s, event, item).filter(row => ['sent', 'sending'].includes(row.status) || row.unconfirmed).map(row => `${row.to}|${row.part}`));
  const batch = randomUUID(), dueAt = iso(instant(item.date, item.time)), created = iso(at), added = [];
  for (const row of rows) for (let part = 0; part < parts.length; part++) {
    if (sent.has(`${row.to}|${part}`)) continue;
    added.push({ id: randomUUID(), eventId: event.id, itemId: item.id, batch, ...row, part, parts: parts.length, dueAt, status: 'queued', attempts: 0, notBefore: '', error: '', unconfirmed: false, startedAt: '', sentAt: '', providerId: '', created });
  }
  if (!added.length) fail('Todos os destinos já receberam esta mensagem.', 409);
  s.eventSends.push(...added);
  event.deliveries = { ...event.deliveries, [item.id]: { batch, state: 'scheduled', total: added.length, sent: 0, failed: 0, skipped: 0, late: 0, dueAt, doneAt: '' } };
  item.status = 'agendado';
  settleDelivery(s, event, item, at);
  const payload = { eventId: event.id, eventTitle: event.title, itemId: item.id, code: item.code || '', title: item.title, channel: item.channel, total: added.length, dueAt };
  emit('custom_event', { event: 'event_message_scheduled', ...payload, payload });
  return { total: added.length };
}

/** Tira da fila o que ainda não saiu. */
export function cancelQueued(s, event, item) {
  let count = 0;
  for (const row of rowsOf(s, event, item)) if (row.status === 'queued') { row.status = 'canceled'; count++; }
  return count;
}
function cancel(s, event, item, at) {
  const delivery = event.deliveries?.[item.id];
  if (!deliveryActive(delivery)) fail('Esta mensagem não está agendada.', 409);
  cancelQueued(s, event, item);
  delivery.state = 'canceled';
  item.status = 'pronto';
  settleDelivery(s, event, item, at);
  return { sent: delivery.sent };
}
function retry(s, event, item, include, at) {
  const delivery = event.deliveries?.[item.id];
  const rows = rowsOf(s, event, item).filter(row => row.status === 'failed' ? include === 'all' || !row.unconfirmed : row.status === 'skipped' && row.blocked);
  const failedTo = new Set(rows.filter(row => row.status === 'failed').map(row => row.to));
  const again = rows.filter(row => row.status === 'failed' || failedTo.has(row.to));
  if (!delivery || !again.length) fail('Não há falhas para reenviar.', 409);
  for (const row of again) Object.assign(row, { status: 'queued', attempts: 0, notBefore: '', error: '', unconfirmed: false, blocked: false, startedAt: '' });
  delivery.state = 'sending';
  item.status = 'agendado';
  settleDelivery(s, event, item, at);
  return { total: again.length };
}
function preview(s, event, item, { instant }) {
  const parts = messageParts(item.notes), { rows, skipped } = destinations(s, event, item), problem = problemOf(event, item, parts, rows);
  const dueAt = item.date && item.time ? instant(item.date, item.time) : 0;
  return {
    parts, recipients: rows.length, sample: rows.slice(0, 5).map(row => row.name), skipped, problem,
    dueAt: dueAt ? iso(dueAt) : '', endsAt: dueAt && rows.length ? iso(endOf(s, rows.length, parts.length, dueAt, item.channel === 'privado')) : ''
  };
}

function saveGroups(event, data) {
  const list = value => {
    const rows = new Map();
    for (const row of Array.isArray(value) ? value : []) {
      const jid = str(row?.jid, 80);
      if (!GROUP_JID.test(jid)) fail('Grupo inválido. Atualize a lista e escolha de novo.');
      rows.set(jid, { jid, name: str(row.name, 120) || 'Grupo sem nome' });
    }
    if (rows.size > GROUP_LIMIT) fail('Escolha até 20 grupos em cada lista.');
    return [...rows.values()];
  };
  event.groups = { base: list(data.base), evento: list(data.evento) };
  return event.id;
}
function saveSettings(s, data) {
  const settings = eventSendSettingsOf(s);
  const minGapSeconds = whole(data.minGapSeconds, 10, 300), maxGapSeconds = whole(data.maxGapSeconds, 10, 300);
  if (maxGapSeconds < minGapSeconds) fail('O intervalo máximo precisa ser igual ou maior que o mínimo.');
  Object.assign(settings, { minGapSeconds, maxGapSeconds, dailyCap: whole(data.dailyCap, 1, 1000) });
  return settings.dailyCap;
}

export function eventSendCommand(s, command, { instant, emit, at = Date.now() }) {
  const { type, id, data = {} } = command;
  if (type === 'event-send-settings') return saveSettings(s, data);
  const event = eventOf(s, id);
  if (type === 'event-groups-save') return saveGroups(event, data);
  const item = itemOf(event, data.itemId);
  if (type === 'event-message-preview') return preview(s, event, item, { instant });
  if (type === 'event-message-schedule') return schedule(s, event, item, { instant, emit, at });
  if (type === 'event-message-cancel') return cancel(s, event, item, at);
  if (type === 'event-message-retry') return retry(s, event, item, data.include === 'all' ? 'all' : 'failed', at);
  return fail('Unknown operation.');
}
