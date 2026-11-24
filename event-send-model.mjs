// Envio das mensagens do Planejador de eventos pelo WhatsApp: o que vai para a fila, quando e para quem.
// Uma linha de eventSends por destino e por parte da mensagem. O andamento de cada mensagem fica em event.deliveries,
// fora do plano, para a fila nunca disputar a revisão com quem está editando.
// Regra acima de todas: nunca enviar a mesma mensagem duas vezes, nem a quem pediu para não receber.
import { randomUUID } from 'node:crypto';
import { canMessage } from './preference-model.mjs';
import { clockIn, dayIn } from './scheduling-model.mjs';
import { messageParts, partsProblem, renderPart } from './ui/event-message-parts.js';

export const eventSendCollections = ['eventSends'];
const CONTACT_LIMIT = 1000, GROUP_LIMIT = 20, TAG_LIMIT = 100, QUEUE_LIMIT = 5000, HISTORY_LIMIT = 5000;
const PART_GAP = 3000, MINUTE = 60_000, DAY = 86_400_000, LEASE = 5 * MINUTE;
const RETRY_MINUTES = [1, 5, 15];
export const GROUP_JID = /^\d[\d-]{5,40}@g\.us$/;
const channelsSent = ['grupos', 'privado'];
const unconfirmedText = 'Envio não confirmado. Confira no WhatsApp antes de reenviar.';

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

const labels = value => {
  const list = [...new Set((Array.isArray(value) ? value : []).map(tag => str(tag, 48)).filter(Boolean))];
  return list.length > TAG_LIMIT ? fail(`Use até ${TAG_LIMIT} etiquetas em cada lista.`) : list;
};
export const eventTargets = value => ({ tags: labels(value?.tags), excludeTags: labels(value?.excludeTags) });

const eventOf = (s, id) => s.eventPlans.find(row => row.id === id) || fail('Evento não encontrado.', 404);
const itemOf = (event, id) => event.plan.items.find(row => row.id === id && row.kind === 'message') || fail('Mensagem não encontrada.', 404);
const rowsOf = (s, event, item) => s.eventSends.filter(row => row.eventId === event.id && row.itemId === item.id);
export const deliveryActive = delivery => ['scheduled', 'sending'].includes(delivery?.state);
const waitingRow = row => row.status === 'queued' || row.status === 'sending';
const targetKey = row => `${row.eventId}|${row.itemId}|${row.contactId || row.to}`;

export function contactPhone(contact) {
  const phone = digits(contact?.phone);
  return phone.length >= 10 && phone.length <= 15 ? phone : '';
}
// O mesmo número com e sem o 55 é a mesma pessoa.
const phoneKey = phone => phone.length === 10 || phone.length === 11 ? `55${phone}` : phone;
/** Números de quem pediu para não receber, em qualquer cadastro: o descadastro é da pessoa, não do registro. */
const optedOutPhones = s => new Set(s.contacts.filter(contact => !canMessage(contact, 'WhatsApp')).map(contact => phoneKey(contactPhone(contact))).filter(Boolean));

function contactsFor(s, targets) {
  const { tags, excludeTags } = eventTargets(targets), wanted = new Set(tags.map(lower)), unwanted = new Set(excludeTags.map(lower));
  const rows = [], seen = new Set(), optedOut = optedOutPhones(s), skipped = { dnd: 0, noPhone: 0, duplicate: 0 };
  for (const contact of s.contacts) {
    const own = (contact.tags || []).map(lower);
    if (!own.some(tag => wanted.has(tag)) || own.some(tag => unwanted.has(tag))) continue;
    const to = contactPhone(contact), key = phoneKey(to);
    if (!canMessage(contact, 'WhatsApp') || optedOut.has(key)) skipped.dnd++;
    else if (!to) skipped.noPhone++;
    else if (seen.has(key)) skipped.duplicate++;
    else { seen.add(key); rows.push({ target: 'contact', to, contactId: contact.id, name: str(contact.name, 120) }); }
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
  if (event.status === 'arquivado') return 'O evento está arquivado.';
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
function endOf(s, rows, parts, start, privado) {
  if (!privado) return start + Math.max(0, rows * parts - 1) * PART_GAP;
  const { minGapSeconds, maxGapSeconds, dailyCap } = eventSendSettingsOf(s);
  const ahead = s.eventSends.filter(row => row.target === 'contact' && row.status === 'queued' && !row.part && Date.parse(row.dueAt) <= start).length;
  const last = ahead + rows - 1, perDay = Math.max(1, Math.floor(dailyCap / parts)), days = Math.floor(last / perDay);
  return start + days * DAY + (last - days * perDay) * (minGapSeconds + maxGapSeconds) / 2 * 1000 + PART_GAP * (parts - 1);
}

/** Conta as linhas da mensagem e guarda o andamento. Termina quando nada mais espera. */
export function settleDelivery(s, event, item, at) {
  const delivery = event.deliveries?.[item.id];
  if (!deliveryActive(delivery) && delivery?.state !== 'canceled') return false;
  const rows = rowsOf(s, event, item).filter(row => row.status !== 'canceled'), count = status => rows.filter(row => row.status === status).length;
  Object.assign(delivery, {
    total: rows.length, sent: count('sent'), failed: count('failed'), skipped: count('skipped'),
    late: rows.filter(row => row.status === 'sent' && Date.parse(row.sentAt) - Math.max(Date.parse(row.dueAt), Date.parse(row.created)) > 3_600_000).length
  });
  if (delivery.state === 'canceled') return false;
  if (rows.some(waitingRow)) { if (delivery.sent + delivery.failed + delivery.skipped + count('sending')) delivery.state = 'sending'; return false; }
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
// Histórico: sai primeiro o que não serve mais, depois o mais antigo das mensagens encerradas. Fica sempre o que ainda vai
// sair e, nas canceladas, quem já recebeu: é o que impede um reagendamento de repetir a mensagem.
function trim(s) {
  const excess = s.eventSends.length - HISTORY_LIMIT;
  if (excess <= 0) return;
  const deliveries = new Map(s.eventPlans.flatMap(event => event.plan.items.map(item => [`${event.id}|${item.id}`, event.deliveries?.[item.id]])));
  const rank = row => {
    if (waitingRow(row)) return 0;
    const delivery = deliveries.get(`${row.eventId}|${row.itemId}`);
    if (row.status === 'canceled' || !delivery) return 2;
    return delivery.state === 'done' ? 1 : 0;
  };
  const done = s.eventSends.map(row => ({ row, rank: rank(row) })).filter(entry => entry.rank);
  done.sort((a, b) => b.rank - a.rank || (a.row.sentAt || a.row.created || '').localeCompare(b.row.sentAt || b.row.created || ''));
  const drop = new Set(done.slice(0, excess).map(entry => entry.row));
  if (drop.size) s.eventSends = s.eventSends.filter(row => !drop.has(row));
}

function schedule(s, event, item, { instant, emit, at }) {
  const current = event.deliveries?.[item.id];
  if (deliveryActive(current)) fail('Esta mensagem já está agendada.', 409);
  if (current?.state === 'done' && current.sent) fail('Esta mensagem já foi enviada. Crie outra para enviar de novo.', 409);
  const parts = messageParts(item.notes), { rows } = destinations(s, event, item), problem = problemOf(event, item, parts, rows);
  if (problem) fail(problem);
  // O que saiu, está saindo ou pode ter saído não volta à fila; o resto das tentativas antigas dá lugar às novas.
  const memory = new Set();
  for (const row of rowsOf(s, event, item)) if (row.status === 'sent' || waitingRow(row) || row.unconfirmed) memory.add(`${row.contactId || row.to}|${row.part}`).add(`${phoneKey(row.to)}|${row.part}`);
  const batch = randomUUID(), dueAt = iso(instant(item.date, item.time)), created = iso(at), added = [];
  for (const row of rows) for (let part = 0; part < parts.length; part++) {
    if (memory.has(`${row.contactId || row.to}|${part}`) || memory.has(`${phoneKey(row.to)}|${part}`)) continue;
    added.push({ id: randomUUID(), eventId: event.id, itemId: item.id, batch, ...row, part, parts: parts.length, dueAt, status: 'queued', attempts: 0, notBefore: '', error: '', unconfirmed: false, startedAt: '', sentAt: '', created });
  }
  if (!added.length) fail('Todos os destinos já receberam esta mensagem.', 409);
  if (s.eventSends.filter(waitingRow).length + added.length > QUEUE_LIMIT) fail('A fila desta subconta está cheia (até 5.000 envios agendados). Espere parte deles sair ou divida por etiquetas.', 409);
  s.eventSends = s.eventSends.filter(row => row.eventId !== event.id || row.itemId !== item.id || row.status === 'sent' || waitingRow(row) || row.unconfirmed);
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
function cancelQueued(s, event, item) {
  for (const row of rowsOf(s, event, item)) if (row.status === 'queued') row.status = 'canceled';
}
function cancelDelivery(s, event, item, at) {
  cancelQueued(s, event, item);
  event.deliveries[item.id].state = 'canceled';
  settleDelivery(s, event, item, at);
}
function cancel(s, event, item, { emit, at }) {
  const delivery = event.deliveries?.[item.id];
  if (!deliveryActive(delivery)) fail('Esta mensagem não está agendada.', 409);
  cancelDelivery(s, event, item, at);
  setStatus(event, item, 'pronto', emit);
  return { sent: delivery.sent };
}
function retry(s, event, item, include, { emit, at }) {
  const delivery = event.deliveries?.[item.id], all = rowsOf(s, event, item);
  if (delivery?.state === 'canceled') fail('O envio foi cancelado. Agende de novo.', 409);
  const covered = new Set(all.filter(row => row.status === 'sent' || waitingRow(row)).map(row => `${targetKey(row)}|${row.part}`));
  const failed = all.filter(row => row.status === 'failed' && (include === 'all' || !row.unconfirmed) && !covered.has(`${targetKey(row)}|${row.part}`));
  const failedTargets = new Set(failed.map(targetKey));
  const again = [...failed, ...all.filter(row => row.status === 'skipped' && row.blocked && failedTargets.has(targetKey(row)))];
  if (!delivery || !again.length) fail('Não há falhas para reenviar.', 409);
  for (const row of again) Object.assign(row, { status: 'queued', attempts: 0, notBefore: '', error: '', unconfirmed: false, blocked: false, startedAt: '' });
  delivery.state = 'sending';
  settleDelivery(s, event, item, at);
  setStatus(event, item, 'agendado', emit);
  return { total: again.length };
}
function preview(s, event, item, { instant, at }) {
  const parts = messageParts(item.notes), { rows, skipped } = destinations(s, event, item), problem = problemOf(event, item, parts, rows);
  const dueAt = item.date && item.time ? instant(item.date, item.time) : 0;
  return {
    parts, recipients: rows.length, sample: rows.slice(0, 5).map(row => row.name), skipped, problem,
    dueAt: dueAt ? iso(dueAt) : '', endsAt: dueAt && rows.length && parts.length ? iso(endOf(s, rows.length, parts.length, Math.max(dueAt, at), item.channel === 'privado')) : ''
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
  const next = { base: list(data.base), evento: list(data.evento) }, jids = groups => (groups || []).map(group => group.jid).sort().join();
  for (const name of Object.keys(next)) {
    if (jids(next[name]) === jids(event.groups?.[name])) continue;
    const busy = event.plan.items.find(item => item.channel === 'grupos' && item.audience === name && deliveryActive(event.deliveries?.[item.id]));
    if (busy) fail(`Há mensagem agendada para estes grupos: “${busy.title}”. Cancele o envio antes de trocar.`, 409);
  }
  event.groups = next;
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
/** O que a tela usa: falhas, o que ficou de fora e o que já devia ter saído. O resto da fila fica no servidor. */
export function eventSendsView(rows, at = Date.now()) {
  return (rows || []).filter(row => ['failed', 'skipped', 'sending'].includes(row.status) || (row.status === 'queued' && Date.parse(row.dueAt) <= at))
    .map(({ id, eventId, itemId, contactId, name, to, target, part, status, dueAt, error, unconfirmed, blocked }) => ({ id, eventId, itemId, contactId, name, to, target, part, status, dueAt, error, unconfirmed, blocked }));
}
function homeOf(s, row) {
  const event = s.eventPlans.find(entry => entry.id === row.eventId), item = event?.plan.items.find(entry => entry.id === row.itemId);
  return event && item ? { event, item, delivery: event.deliveries?.[item.id] } : null;
}
function finish(s, row, emit, at) {
  const home = homeOf(s, row);
  if (!home || !settleDelivery(s, home.event, home.item, at)) return;
  const { event, item, delivery } = home;
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
  const key = targetKey(row);
  for (const next of s.eventSends) if (next.status === 'queued' && next.part > row.part && targetKey(next) === key) Object.assign(next, { status: 'skipped', blocked: true, error: 'A parte anterior não foi enviada.' });
  const home = homeOf(s, row);
  if (home) {
    const payload = { ...itemPayload(home.event, home.item), name: row.name, target: row.target, error: row.error, unconfirmed };
    emit('custom_event', { event: 'event_message_failed', contactId: row.contactId, ...payload, payload });
  }
  finish(s, row, emit, at);
}
function skipTarget(s, row, error, emit, at) {
  const key = targetKey(row);
  for (const entry of s.eventSends) if (entry.status === 'queued' && targetKey(entry) === key) Object.assign(entry, { status: 'skipped', error });
  finish(s, row, emit, at);
}

/** Reserva a próxima mensagem. Quem reserva é o único que envia; sem resultado em 5 minutos, vira "não confirmado". */
function take(s, { at, random, zone, instant, emit }) {
  const settings = eventSendSettingsOf(s), today = dayIn(at, zone);
  if (settings.day !== today) Object.assign(settings, { day: today, sentToday: 0 });
  for (const row of s.eventSends) if (row.status === 'sending' && Date.parse(row.startedAt) < at - LEASE) failRow(s, row, unconfirmedText, { unconfirmed: true, emit, at });
  const active = new Set(s.eventPlans.flatMap(event => Object.entries(event.deliveries || {}).filter(([, delivery]) => deliveryActive(delivery)).map(([itemId]) => `${event.id}|${itemId}`)));
  const firstPart = new Map(), due = [];
  let soonest = Infinity;
  for (const row of s.eventSends) {
    if (!waitingRow(row)) continue;
    if (row.status === 'queued' && !active.has(`${row.eventId}|${row.itemId}`)) { row.status = 'canceled'; continue; }
    const key = targetKey(row);
    if (!(firstPart.get(key) <= row.part)) firstPart.set(key, row.part);
    if (row.status !== 'queued') continue;
    const ready = Math.max(Date.parse(row.dueAt), Date.parse(row.notBefore) || 0);
    if (ready > at) soonest = Math.min(soonest, ready); else due.push({ row, order: due.length, dueAt: Date.parse(row.dueAt) });
  }
  due.sort((a, b) => a.dueAt - b.dueAt || a.order - b.order);
  // Teto do dia: o resto volta no dia seguinte, no horário que a mensagem tinha. Nunca de madrugada.
  const tomorrow = iso(Date.parse(`${today}T12:00:00Z`) + DAY).slice(0, 10), resumes = new Map();
  let optedOut = null;
  for (const { row, dueAt } of due) {
    if (row.status !== 'queued' || firstPart.get(targetKey(row)) < row.part) continue;
    let ready = 0;
    if (row.target === 'group') ready = Date.parse(settings.nextGroupAt) || 0;
    else if (!row.part) {
      if (settings.sentToday >= settings.dailyCap) {
        if (!resumes.has(dueAt)) resumes.set(dueAt, iso(instant(tomorrow, clockIn(dueAt, zone))));
        row.notBefore = resumes.get(dueAt);
        soonest = Math.min(soonest, Date.parse(row.notBefore));
        continue;
      }
      ready = Date.parse(settings.nextPrivateAt) || 0;
    }
    if (ready > at) { soonest = Math.min(soonest, ready); continue; }
    const { event, item } = homeOf(s, row);
    const contact = row.contactId ? s.contacts.find(entry => entry.id === row.contactId) : null;
    if (row.target === 'contact') {
      optedOut ??= optedOutPhones(s);
      const phone = contactPhone(contact);
      const reason = !contact ? 'O contato foi apagado.' : !phone ? 'O contato está sem telefone.' : !canMessage(contact, 'WhatsApp') || optedOut.has(phoneKey(phone)) ? 'O contato pediu para não receber mensagens.' : '';
      if (reason) { skipTarget(s, row, reason, emit, at); continue; }
      row.to = phone;
    }
    const parts = messageParts(item.notes), problem = partsProblem(parts, item.channel) || (parts[row.part] ? '' : 'A mensagem mudou depois de agendada.');
    const part = problem ? null : renderPart(parts[row.part], contact);
    if (!part || (part.kind === 'text' && !part.text)) { failRow(s, row, problem || 'Sem o nome, a mensagem fica vazia para este contato.', { emit, at }); continue; }
    Object.assign(row, { status: 'sending', startedAt: iso(at), attempts: row.attempts + 1 });
    if (row.target === 'group') settings.nextGroupAt = iso(at + PART_GAP);
    else {
      row.text = part.text;
      settings.sentToday++;
      if (!row.part) settings.nextPrivateAt = iso(at + Math.round((settings.minGapSeconds + (settings.maxGapSeconds - settings.minGapSeconds) * random) * 1000));
    }
    settleDelivery(s, event, item, at);
    return { row: { id: row.id, to: row.to, target: row.target, part }, contact: contact ? { id: contact.id, name: contact.name } : null, waitMs: 0 };
  }
  return { row: null, contact: null, waitMs: Number.isFinite(soonest) ? Math.max(0, soonest - at) : null };
}

function result(s, data, { at, add, emit, zone }) {
  const row = s.eventSends.find(entry => entry.id === data.id);
  const late = row?.status === 'failed' && row.unconfirmed && data.outcome === 'sent';
  if (!row || (row.status !== 'sending' && !late)) return false;
  const settings = eventSendSettingsOf(s), text = row.text, home = homeOf(s, row);
  delete row.text;
  if (data.outcome === 'sent') {
    Object.assign(row, { status: 'sent', sentAt: iso(at) });
    // A linha enviada só serve de memória: guarda o mínimo.
    for (const key of ['batch', 'name', 'parts', 'attempts', 'notBefore', 'error', 'unconfirmed', 'blocked', 'startedAt']) delete row[key];
    const key = targetKey(row);
    for (const next of s.eventSends) if (next.status === 'queued' && next.part === row.part + 1 && targetKey(next) === key) next.notBefore = iso(at + PART_GAP);
    if (row.contactId && text && s.contacts.some(entry => entry.id === row.contactId)) add(s, 'messages', { contactId: row.contactId, body: text, subject: '', channel: 'WhatsApp', direction: 'Outbound', read: true, starred: false, origin: 'event', eventId: row.eventId });
    if (late && home?.delivery?.state === 'done') {
      home.delivery.sent++; home.delivery.failed = Math.max(0, home.delivery.failed - 1);
      setStatus(home.event, home.item, 'enviado', emit);
    }
    finish(s, row, emit, at);
    return true;
  }
  const again = data.outcome === 'waiting' || (data.outcome === 'retry' && row.attempts <= RETRY_MINUTES.length);
  if (!again) { failRow(s, row, data.outcome === 'unconfirmed' ? unconfirmedText : data.error, { unconfirmed: data.outcome === 'unconfirmed', emit, at }); return true; }
  // Não saiu: devolve a vaga do dia. Se cancelaram no meio do caminho, não volta para a fila.
  if (row.target === 'contact' && settings.day === dayIn(at, zone)) settings.sentToday = Math.max(0, settings.sentToday - 1);
  const wait = data.outcome === 'waiting' ? 2 : RETRY_MINUTES[row.attempts - 1];
  Object.assign(row, { status: deliveryActive(home?.delivery) ? 'queued' : 'canceled', attempts: data.outcome === 'waiting' ? row.attempts - 1 : row.attempts, notBefore: iso(at + wait * MINUTE), error: str(data.error, 200), startedAt: '' });
  if (home) settleDelivery(s, home.event, home.item, at);
  return true;
}

/** Antes de salvar o plano: mensagem agendada mantém o status da fila e não muda de destino nem de formato. */
export function guardDeliveries(prior, items) {
  for (const item of items) {
    const delivery = prior?.deliveries?.[item.id];
    if (!delivery) continue;
    if (delivery.state === 'done' && delivery.sent) { item.status = 'enviado'; continue; }
    if (!deliveryActive(delivery)) { if (item.status === 'agendado') item.status = 'pronto'; continue; }
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
/** Depois de salvar: a fila acompanha a nova data, esvazia o que foi apagado e para se o evento foi arquivado. */
export function eventSendsAfterSave(s, prior, event, { instant, at = Date.now() }) {
  if (!prior) return;
  for (const [itemId, delivery] of Object.entries(event.deliveries || {})) {
    const item = event.plan.items.find(row => row.id === itemId), before = prior.plan.items.find(row => row.id === itemId);
    if (!item) { cancelQueued(s, event, { id: itemId }); delete event.deliveries[itemId]; continue; }
    if (!deliveryActive(delivery)) continue;
    if (event.status === 'arquivado') { cancelDelivery(s, event, item, at); item.status = 'pronto'; continue; }
    if (before && before.date === item.date && before.time === item.time) continue;
    delivery.dueAt = iso(instant(item.date, item.time));
    for (const row of rowsOf(s, event, item)) if (row.status === 'queued') Object.assign(row, { dueAt: delivery.dueAt, notBefore: '' });
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
  if (type === 'event-send-take') return take(s, { at: when, random: Number.isFinite(data.random) ? data.random : Math.random(), zone, instant, emit });
  if (type === 'event-send-result') return result(s, data, { at: when, add, emit, zone });
  if (type === 'event-send-settings') return saveSettings(s, data);
  const event = eventOf(s, id);
  if (type === 'event-groups-save') return saveGroups(event, data);
  const item = itemOf(event, data.itemId);
  if (type === 'event-message-preview') return preview(s, event, item, { instant, at: when });
  if (type === 'event-message-schedule') return schedule(s, event, item, { instant, emit, at });
  if (type === 'event-message-cancel') return cancel(s, event, item, { emit, at });
  if (type === 'event-message-retry') return retry(s, event, item, data.include === 'all' ? 'all' : 'failed', { emit, at });
  return fail('Unknown operation.');
}
