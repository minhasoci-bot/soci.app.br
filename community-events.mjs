// Community events: dates inside a community, free or with a paid ticket (an invoice charged by AbacatePay,
// like the offers). The place, the live stream and the recordings are shown only to who is attending.
// The event itself lives in the workspace (`communityEvents`); who is attending lives in the community document.
import { videoEmbed } from './course-model.mjs';

export const communityEventCollections = ['communityEvents'];
export const eventRecurrences = ['none', 'weekly', 'monthly'];
export const LIVE_OPENS_BEFORE = 15 * 60000;
export const REMINDER_BEFORE = 24 * 3600000;

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const mail = value => { const email = str(value, 254).toLowerCase(); return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) ? email : ''; };
const https = (value, label) => { const link = str(value, 600); if (link && !/^https:\/\/[^\s"'<>]+$/i.test(link)) fail(`${label} precisa começar com https://.`); return link; };
const DAY = 86400000;
const recordingId = () => Math.random().toString(36).slice(2, 12);

export const communityEventFields = {
  communityEvents: (s, d) => {
    const prior = d.id ? s.communityEvents.find(row => row.id === d.id) : null;
    const pick = key => d[key] === undefined ? prior?.[key] : d[key];
    const communityId = str(pick('communityId'), 60);
    if (!s.communities.some(row => row.id === communityId)) fail('Escolha uma comunidade desta subconta.');
    const start = Date.parse(pick('start')), end = Date.parse(pick('end'));
    if (Number.isNaN(start) || Number.isNaN(end)) fail('Informe o início e o fim do evento.');
    if (end <= start) fail('O fim do evento precisa ser depois do início.');
    if (end - start > 7 * DAY) fail('Um evento dura no máximo 7 dias.');
    const recurrence = eventRecurrences.includes(pick('recurrence')) ? pick('recurrence') : 'none';
    const occurrences = recurrence === 'none' ? 1 : Math.round(Number(pick('occurrences')) || 4);
    if (occurrences < 1 || occurrences > 52) fail('Repita o evento de 1 a 52 vezes.');
    const access = pick('access') === 'paid' ? 'paid' : 'free';
    const price = access === 'free' ? 0 : Math.round(Number(pick('price')) * 100) / 100;
    if (access === 'paid' && !(price >= 1 && price <= 1e6)) fail('Ingressos pagos custam a partir de R$ 1,00.');
    const capacity = Math.round(Number(pick('capacity')) || 0);
    if (capacity < 0 || capacity > 100000) fail('O limite de participantes vai de 0 (sem limite) a 100.000.');
    const locationType = pick('locationType') === 'address' ? 'address' : 'online';
    const location = locationType === 'online' ? https(pick('location'), 'O link do evento') : str(pick('location'), 300);
    const coverFileId = str(pick('coverFileId'), 60);
    if (coverFileId && !s.files.some(file => file.id === coverFileId && file.data.startsWith('data:image/'))) fail('A miniatura precisa ser uma imagem da Mídia Drive.');
    const recordingsInput = Array.isArray(pick('recordings')) ? pick('recordings') : [];
    if (recordingsInput.length > 10) fail('Adicione até 10 gravações por evento.');
    const recordings = recordingsInput.map(row => ({ id: /^[a-z0-9]{6,20}$/.test(row?.id || '') ? row.id : recordingId(),
      title: str(row?.title, 120) || 'Gravação', url: https(row?.url, 'O link da gravação') || fail('Informe o link de cada gravação.') }));
    return {
      communityId, title: str(pick('title'), 120) || fail('Dê um título ao evento.'), description: str(pick('description'), 1000),
      color: /^#[0-9a-f]{6}$/i.test(pick('color') || '') ? pick('color').toLowerCase() : '#155eef',
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), recurrence, occurrences,
      locationType, location, liveUrl: https(pick('liveUrl'), 'O link da transmissão'), coverFileId,
      access, price, capacity, reminder: pick('reminder') === undefined ? true : Boolean(pick('reminder')),
      hideAttendees: Boolean(pick('hideAttendees')), recordings, status: pick('status') === 'draft' ? 'draft' : 'published'
    };
  }
};

// Deleting a community takes its events with it.
export function communityEventBeforeDelete(s, key, id) {
  if (key === 'communities') s.communityEvents = (s.communityEvents || []).filter(row => row.communityId !== id);
}

/** Every date of the event (one, or the weekly/monthly repetitions), keeping the event's length. */
export function occurrences(event) {
  const first = Date.parse(event.start), length = Date.parse(event.end) - first;
  const count = event.recurrence === 'none' ? 1 : event.occurrences || 1;
  const out = [];
  for (let index = 0; index < count; index++) {
    let at = first;
    if (event.recurrence === 'weekly') at = first + index * 7 * DAY;
    if (event.recurrence === 'monthly') {
      const date = new Date(first), day = date.getUTCDate();
      date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + index);
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, last));
      at = date.getTime();
    }
    out.push({ index, start: new Date(at).toISOString(), end: new Date(at + length).toISOString() });
  }
  return out;
}
/** The date happening now or the next one; null when every date has ended. */
export const nextOccurrence = (event, at = Date.now()) => occurrences(event).find(row => Date.parse(row.end) > at) || null;

export const eventPrice = event => event.access === 'paid' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(event.price) : 'Gratuito';

/** The live stream as a player (YouTube, Vimeo, Loom) or, for Meet, Zoom and others, a link to open. */
export const liveEmbed = url => url ? videoEmbed(url) : '';

/**
 * What one viewer sees of an event. `attending` (or staff) unlocks the place, the live stream and, for paid
 * events, the recordings; free events show their recordings to every active member.
 */
export function eventView(state, event, record = {}, { viewer = '', staff = false, member = false, live = null, names = new Map(), at = Date.now() } = {}) {
  const attendees = Object.entries(record.attendees || {});
  const going = attendees.filter(([, row]) => row.status === 'going');
  const mine = record.attendees?.[viewer] || null;
  const attending = staff || mine?.status === 'going';
  const next = nextOccurrence(event, at);
  const shown = next || occurrences(event).at(-1);
  const isLive = live?.eventId === event.id;
  const joinOpen = attending && (isLive || (next && Date.parse(next.start) - LIVE_OPENS_BEFORE <= at && at < Date.parse(next.end)));
  const cover = event.coverFileId && state.files.find(file => file.id === event.coverFileId && file.data.startsWith('data:image/'))?.data;
  const seeRecordings = attending || (event.access === 'free' && member);
  return {
    id: event.id, title: event.title, description: event.description, color: event.color, cover: cover || '',
    start: shown.start, end: shown.end, recurrence: event.recurrence, upcoming: occurrences(event).filter(row => Date.parse(row.end) > at).slice(0, 5),
    past: !next, live: isLive, access: event.access, price: event.price, priceLabel: eventPrice(event), status: event.status,
    capacity: event.capacity, going: going.length, full: Boolean(event.capacity) && going.length >= event.capacity,
    myStatus: mine?.status || null, attending,
    attendees: event.hideAttendees && !staff ? [] : going.map(([id]) => names.get(id) || 'Membro').slice(0, 50),
    locationType: event.locationType, location: attending ? event.location : '',
    liveUrl: joinOpen ? event.liveUrl || (event.locationType === 'online' ? event.location : '') : '',
    liveEmbed: joinOpen ? liveEmbed(event.liveUrl) : '',
    recordings: seeRecordings ? event.recordings.map(row => ({ ...row, embed: videoEmbed(row.url) })) : [], recordingCount: event.recordings.length
  };
}

// ---- Workspace side: the ticket invoice, the "joined" trigger and the reminder messages -----------------
export function communityEventCommand(s, command, { add, run, now }) {
  const { type, id, data: d = {} } = command;
  if (type === 'community-event-ticket') {
    const event = s.communityEvents.find(row => row.id === id && row.status === 'published' && row.access === 'paid') || fail('Este evento não vende ingressos.', 404);
    const email = mail(d.email) || fail('O seu acesso ao portal não tem um e-mail válido.');
    const contact = contactFor(s, { email, name: d.name, contactId: d.contactId }, { add, run });
    const invoice = add(s, 'invoices', { title: `Ingresso: ${event.title}`, contactId: contact.id, value: event.price, due: now().slice(0, 10), status: 'Open' });
    invoice.eventTicket = { eventId: event.id, communityId: event.communityId, memberId: str(d.memberId, 60) };
    return invoice.id;
  }
  if (type === 'community-event-joined') {
    const event = s.communityEvents.find(row => row.id === id) || fail('Evento não encontrado.', 404);
    const email = mail(d.email);
    if (!email && !d.contactId) return '';
    const contact = contactFor(s, { email, name: d.name, contactId: d.contactId }, { add, run });
    run(s, 'community_event_registered', { contactId: contact.id, eventId: event.id, communityId: event.communityId, paid: d.paid ? 'yes' : 'no', title: event.title });
    return contact.id;
  }
  if (type === 'community-event-reminders') {
    const zone = s.profile?.timezone || 'America/Sao_Paulo';
    let written = 0;
    for (const item of Array.isArray(d.items) ? d.items.slice(0, 500) : []) {
      const event = s.communityEvents.find(row => row.id === item.eventId);
      const email = mail(item.email);
      if (!event || !email) continue;
      const contact = contactFor(s, { email, name: item.name, contactId: item.contactId }, { add, run });
      const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: zone, timeZoneName: 'short' }).format(new Date(item.start));
      const first = (str(item.name, 120) || contact.name || '').split(' ')[0];
      add(s, 'messages', { contactId: contact.id, channel: 'Email', direction: 'Outbound', read: true, starred: false, origin: 'workflow', subject: `Amanhã: ${event.title}`,
        body: `Oi${first ? `, ${first}` : ''}! Lembrete: “${event.title}” é ${date}.${item.link ? ` Entre pelo portal: ${item.link}` : ''}` });
      written++;
    }
    return written;
  }
  fail('Comando de evento desconhecido.');
}

function contactFor(s, { email, name, contactId }, { add, run }) {
  let contact = (contactId && s.contacts.find(row => row.id === contactId)) || (email && s.contacts.find(row => (row.email || '').toLowerCase() === email));
  if (!contact) {
    contact = add(s, 'contacts', { name: str(name, 120) || email, email, phone: '', tags: ['comunidade'], company: '', notes: '', custom: {} });
    run(s, 'Contact created', { contactId: contact.id });
  }
  return contact;
}
