// Envio das mensagens do Planejador de eventos pelo WhatsApp: o que vai para a fila, quando e para quem.
// Uma linha de eventSends por destino e por parte da mensagem. O andamento de cada mensagem fica em event.deliveries,
// fora do plano, para a fila nunca disputar a revisão com quem está editando.
import { randomUUID } from 'node:crypto';
import { dayIn } from './scheduling-model.mjs';
import { messageParts, partsProblem, renderPart } from './ui/event-message-parts.js';

export const eventSendCollections = ['eventSends'];
const CONTACT_LIMIT = 1000, GROUP_LIMIT = 20, HISTORY_LIMIT = 5000, PART_GAP = 3000, MINUTE = 60_000, LEASE = 5 * MINUTE;
const RETRY_MINUTES = [1, 5, 15];
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
  if (!deliveryActive(delivery) && delivery?.state !== 'canceled') return false;
  const rows = rowsOf(s, event, item).filter(row => row.status !== 'canceled'), count = status => rows.filter(row => row.status === status).length;
  Object.assign(delivery, {
    total: rows.length, sent: count('sent'), failed: count('failed'), skipped: count('skipped'),
    late: rows.filter(row => row.status === 'sent' && Date.parse(row.sentAt) - Date.parse(row.dueAt) > 3_600_000).length
  });
  if (delivery.state === 'canceled') return false;
  if (count('queued') + count('sending')) { if (delivery.sent + delivery.failed + delivery.skipped + count('sending')) delivery.state = 'sending'; return false; }
  Object.assign(delivery, { state: 'done', doneAt: iso(at) });
  return true;
}

const itemPayload = (event, item) => ({ eventId: event.id, eventTitle: event.title, itemId: item.id, kind: item.kind, code: item.code || '', title: item.title, channel: item.channel || '' });
export function itemStatusChanged(event, item, previousStatus, emit) {
  const payload = { ...itemPayload(event, item), status: item.status, previousStatus };
  emit('custom_event', { event: 'event_item_status_changed', ...payload, payload });
}
// O andamento muda o status da mensagem sem mexer na revisão: quem está editando não recebe conflito por isso.
function setStatus(event, item, status, emit) {
  const previous = item.status;
  if (previous === status) return;
  item.status = status;
  itemStatusChanged(event, item, previous, emit);
}
// Histórico das mensagens encerradas: sai o mais antigo. O que ainda vai sair fica sempre.
function trim(s) {
  const excess = s.eventSends.length - HISTORY_LIMIT;
  if (excess <= 0) return;
  const events = new Map(s.eventPlans.map(event => [event.id, event]));
  const done = s.eventSends.filter(row => !['queued', 'sending'].includes(row.status) && !deliveryActive(events.get(row.eventId)?.deliveries?.[row.itemId]));
  done.sort((a, b) => (a.sentAt || a.created).localeCompare(b.sentAt || b.created));
  const drop = new Set(done.slice(0, excess));
  if (drop.size) s.eventSends = s.eventSends.filter(row => !drop.has(row));
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
  settleDelivery(s, event, item, at);
  setStatus(event, item, 'agendado', emit);
  trim(s);
  const payload = { ...itemPayload(event, item), total: added.length, dueAt };
  emit('custom_event', { event: 'event_message_scheduled', ...payload, payload });
  return { total: added.length };
}

/** Tira da fila o que ainda não saiu. */
export function cancelQueued(s, event, item) {
  let count = 0;
  for (const row of rowsOf(s, event, item)) if (row.status === 'queued') { row.status = 'canceled'; count++; }
  return count;
}
function cancel(s, event, item, { emit, at }) {
  const delivery = event.deliveries?.[item.id];
  if (!deliveryActive(delivery)) fail('Esta mensagem não está agendada.', 409);
  cancelQueued(s, event, item);
  delivery.state = 'canceled';
  settleDelivery(s, event, item, at);
  setStatus(event, item, 'pronto', emit);
  return { sent: delivery.sent };
}
function retry(s, event, item, include, { emit, at }) {
  const delivery = event.deliveries?.[item.id];
  const rows = rowsOf(s, event, item).filter(row => row.status === 'failed' ? include === 'all' || !row.unconfirmed : row.status === 'skipped' && row.blocked);
  const failedTo = new Set(rows.filter(row => row.status === 'failed').map(row => row.to));
  const again = rows.filter(row => row.status === 'failed' || failedTo.has(row.to));
  if (!delivery || !again.length) fail('Não há falhas para reenviar.', 409);
  for (const row of again) Object.assign(row, { status: 'queued', attempts: 0, notBefore: '', error: '', unconfirmed: false, blocked: false, startedAt: '' });
  delivery.state = 'sending';
  settleDelivery(s, event, item, at);
  setStatus(event, item, 'agendado', emit);
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

/** Há mensagem para sair (ou presa em envio) agora? Evita gravar o estado de quem não tem nada. */
export function eventSendDue(s, at) {
  return (s.eventSends || []).some(row => row.status === 'queued' ? Date.parse(row.dueAt) <= at && !(Date.parse(row.notBefore) > at) : row.status === 'sending' && Date.parse(row.startedAt) < at - LEASE);
}
const sameTarget = (a, b) => a.itemId === b.itemId && a.eventId === b.eventId && (a.contactId ? a.contactId === b.contactId : a.to === b.to);
const homeOf = (s, row) => {
  const event = s.eventPlans.find(entry => entry.id === row.eventId), item = event?.plan.items.find(entry => entry.id === row.itemId);
  return event && item ? { event, item } : null;
};
function finish(s, row, emit, at) {
  const home = homeOf(s, row);
  if (!home || !settleDelivery(s, home.event, home.item, at)) return;
  const { event, item } = home, delivery = event.deliveries[item.id];
  setStatus(event, item, delivery.sent ? 'enviado' : 'pronto', emit);
  if (delivery.sent && !delivery.reported) {
    delivery.reported = true;
    const payload = { ...itemPayload(event, item), total: delivery.total, sent: delivery.sent, failed: delivery.failed, skipped: delivery.skipped };
    emit('custom_event', { event: 'event_message_sent', ...payload, payload });
  }
  trim(s);
}
function failRow(s, row, error, { unconfirmed = false, emit, at }) {
  delete row.text;
  Object.assign(row, { status: 'failed', error: str(error, 200) || 'Falha no envio.', unconfirmed });
  for (const next of s.eventSends) if (next.status === 'queued' && next.part > row.part && sameTarget(next, row)) Object.assign(next, { status: 'skipped', blocked: true, error: 'A parte anterior não foi enviada.' });
  const home = homeOf(s, row);
  if (home) {
    const payload = { ...itemPayload(home.event, home.item), name: row.name, target: row.target, error: row.error, unconfirmed };
    emit('custom_event', { event: 'event_message_failed', contactId: row.contactId, ...payload, payload });
  }
  finish(s, row, emit, at);
}
function skipTarget(s, row, error, emit, at) {
  for (const entry of s.eventSends) if (entry.status === 'queued' && sameTarget(entry, row)) Object.assign(entry, { status: 'skipped', error });
  finish(s, row, emit, at);
}
const unconfirmedText = 'Envio não confirmado. Confira no WhatsApp antes de reenviar.';

/** Reserva a próxima mensagem. Quem reserva é o único que envia; sem resultado em 5 minutos, vira "não confirmado". */
function take(s, { at, random, zone, emit }) {
  const settings = eventSendSettingsOf(s), today = dayIn(at, zone);
  if (settings.day !== today) Object.assign(settings, { day: today, sentToday: 0 });
  for (const row of s.eventSends) if (row.status === 'sending' && Date.parse(row.startedAt) < at - LEASE) failRow(s, row, unconfirmedText, { unconfirmed: true, emit, at });
  const queue = s.eventSends.filter(row => row.status === 'queued').map((row, order) => ({ row, order, due: Date.parse(row.dueAt) })).sort((a, b) => a.due - b.due || a.order - b.order);
  let soonest = Infinity;
  for (const { row, due } of queue) {
    if (row.status !== 'queued') continue;
    const waits = [due, Date.parse(row.notBefore) || 0];
    if (row.part && s.eventSends.some(entry => entry.part < row.part && sameTarget(entry, row) && ['queued', 'sending'].includes(entry.status))) continue;
    if (row.target === 'group') waits.push(Date.parse(settings.nextGroupAt) || 0);
    else if (!row.part) {
      waits.push(Date.parse(settings.nextPrivateAt) || 0);
      if (settings.sentToday >= settings.dailyCap) waits.push(at + 10 * MINUTE);
    }
    const ready = Math.max(...waits);
    if (ready > at) { soonest = Math.min(soonest, ready); continue; }
    const home = homeOf(s, row);
    if (!home) { row.status = 'canceled'; continue; }
    const contact = row.contactId ? s.contacts.find(entry => entry.id === row.contactId) : null;
    if (row.target === 'contact') {
      const reason = !contact ? 'O contato foi apagado.' : contact.dnd ? 'O contato pediu para não receber mensagens.' : contactPhone(contact) ? '' : 'O contato está sem telefone.';
      if (reason) { skipTarget(s, row, reason, emit, at); continue; }
    }
    const parts = messageParts(home.item.notes), problem = partsProblem(parts, home.item.channel) || (parts[row.part] ? '' : 'A mensagem mudou depois de agendada.');
    if (problem) { failRow(s, row, problem, { emit, at }); continue; }
    const part = renderPart(parts[row.part], contact);
    Object.assign(row, { status: 'sending', startedAt: iso(at), attempts: row.attempts + 1 });
    if (row.target === 'group') settings.nextGroupAt = iso(at + PART_GAP);
    else {
      row.text = part.text;
      settings.sentToday++;
      if (!row.part) settings.nextPrivateAt = iso(at + Math.round((settings.minGapSeconds + (settings.maxGapSeconds - settings.minGapSeconds) * random) * 1000));
    }
    settleDelivery(s, home.event, home.item, at);
    return { row: { id: row.id, to: row.target === 'group' ? row.to : contactPhone(contact), target: row.target, part }, contact: contact ? { id: contact.id, name: contact.name } : null, waitMs: 0 };
  }
  return { row: null, contact: null, waitMs: Number.isFinite(soonest) ? soonest - at : null };
}

function result(s, data, { at, add, emit, zone }) {
  const row = s.eventSends.find(entry => entry.id === data.id);
  const late = row?.status === 'failed' && row.unconfirmed && data.outcome === 'sent';
  if (!row || (row.status !== 'sending' && !late)) return false;
  const settings = eventSendSettingsOf(s), text = row.text;
  if (data.outcome === 'sent') {
    delete row.text;
    Object.assign(row, { status: 'sent', sentAt: iso(at), providerId: str(data.providerId, 80), error: '', unconfirmed: false });
    for (const next of s.eventSends) if (next.status === 'queued' && next.part === row.part + 1 && sameTarget(next, row)) next.notBefore = iso(at + PART_GAP);
    if (row.contactId && text && s.contacts.some(entry => entry.id === row.contactId)) add(s, 'messages', { contactId: row.contactId, body: text, subject: '', channel: 'WhatsApp', direction: 'Outbound', read: true, starred: false, origin: 'event', eventId: row.eventId });
    const home = homeOf(s, row), delivery = home?.event.deliveries?.[row.itemId];
    if (late && delivery?.state === 'done') {
      delivery.sent++; delivery.failed = Math.max(0, delivery.failed - 1);
      setStatus(home.event, home.item, 'enviado', emit);
    }
    finish(s, row, emit, at);
    return true;
  }
  if (data.outcome === 'waiting') {
    delete row.text;
    if (row.target === 'contact' && settings.day === dayIn(at, zone)) settings.sentToday = Math.max(0, settings.sentToday - 1);
    Object.assign(row, { status: 'queued', attempts: row.attempts - 1, notBefore: iso(at + 2 * MINUTE), error: str(data.error, 200), startedAt: '' });
  } else if (data.outcome === 'retry' && row.attempts <= RETRY_MINUTES.length) {
    delete row.text;
    Object.assign(row, { status: 'queued', notBefore: iso(at + RETRY_MINUTES[row.attempts - 1] * MINUTE), error: str(data.error, 200), startedAt: '' });
  } else failRow(s, row, data.outcome === 'unconfirmed' ? unconfirmedText : data.error, { unconfirmed: data.outcome === 'unconfirmed', emit, at });
  return true;
}

/** Antes de salvar o plano: mensagem agendada mantém o status da fila e não muda de destino nem de formato. */
export function guardDeliveries(prior, items) {
  for (const item of items) {
    const delivery = prior?.deliveries?.[item.id];
    if (!delivery) continue;
    if (!deliveryActive(delivery)) {
      if (item.status === 'agendado') item.status = delivery.state === 'done' && delivery.sent ? 'enviado' : 'pronto';
      continue;
    }
    const before = prior.plan.items.find(row => row.id === item.id);
    if (before) {
      const parts = messageParts(item.notes), fixed = row => JSON.stringify([row.channel, row.audience || '', eventTargets(row.targets)]);
      const problem = partsProblem(parts, item.channel);
      if (fixed(item) !== fixed(before) || !item.date || !item.time || parts.length !== messageParts(before.notes).length) fail(`Cancele o envio de “${before.title}” antes de mudar o destino, apagar a data ou mudar a quantidade de mensagens.`);
      if (problem) fail(`“${before.title}” está agendada. ${problem}`);
    }
    item.status = 'agendado';
  }
}
/** Depois de salvar: a fila acompanha a nova data e esvazia o que foi apagado. */
export function eventSendsAfterSave(s, prior, event, { instant }) {
  if (!prior) return;
  for (const [itemId, delivery] of Object.entries(event.deliveries || {})) {
    const item = event.plan.items.find(row => row.id === itemId);
    if (!item) { cancelQueued(s, event, { id: itemId }); delete event.deliveries[itemId]; continue; }
    if (!deliveryActive(delivery)) continue;
    const dueAt = iso(instant(item.date, item.time));
    if (dueAt === delivery.dueAt) continue;
    delivery.dueAt = dueAt;
    for (const row of rowsOf(s, event, item)) if (row.status === 'queued') row.dueAt = dueAt;
  }
}
export function eventSendsBeforeDelete(s, key, id) {
  if (key !== 'eventPlans') return;
  for (const row of s.eventSends) if (row.eventId === id && row.status === 'queued') row.status = 'canceled';
}

export function eventSendCommand(s, command, { instant, emit, add, zone, at = Date.now() }) {
  const { type, id, data = {} } = command;
  // Internos do servidor: não entram em commandModules, então o navegador não os alcança.
  const when = data.at ? Date.parse(data.at) : at;
  if (type === 'event-send-take') return take(s, { at: when, random: Number.isFinite(data.random) ? data.random : Math.random(), zone, emit });
  if (type === 'event-send-result') return result(s, data, { at: when, add, emit, zone });
  if (type === 'event-send-settings') return saveSettings(s, data);
  const event = eventOf(s, id);
  if (type === 'event-groups-save') return saveGroups(event, data);
  const item = itemOf(event, data.itemId);
  if (type === 'event-message-preview') return preview(s, event, item, { instant });
  if (type === 'event-message-schedule') return schedule(s, event, item, { instant, emit, at });
  if (type === 'event-message-cancel') return cancel(s, event, item, { emit, at });
  if (type === 'event-message-retry') return retry(s, event, item, data.include === 'all' ? 'all' : 'failed', { emit, at });
  return fail('Unknown operation.');
}
