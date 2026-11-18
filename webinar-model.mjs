// Webinars: sessions, public registration, the watch room (attendance) and reminders. Reminders are written
// to the contact's conversation when they fall due, by the same per-minute scheduler that publishes social posts.
import { randomBytes } from 'node:crypto';

export const webinarCollections = ['webinars', 'webinarRegistrations'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const mail = value => { const v = str(value, 160).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Use um e-mail válido.'); return v; };
const url = (value, label) => { const v = str(value, 600); if (v && !/^https:\/\/[^\s"'<>]+$/i.test(v)) fail(`${label} precisa ser um endereço https://`); return v; };
const digits = value => String(value || '').replace(/\D/g, '');
const tagList = value => [...new Set((Array.isArray(value) ? value : str(value, 400).split(',')).map(tag => str(tag, 48)).filter(Boolean))].slice(0, 20);
const id = () => randomBytes(6).toString('hex');

export const defaultReminders = () => [
  { id: id(), minutes: 1440, channel: 'Email', body: 'Oi, {{nome}}! Amanhã tem “{{webinar}}”, {{data}}. Seu link de acesso: {{link}}' },
  { id: id(), minutes: 60, channel: 'Email', body: '{{nome}}, “{{webinar}}” começa em 1 hora ({{data}}). Entre por aqui: {{link}}' },
  { id: id(), minutes: 10, channel: 'WhatsApp', body: 'Estamos começando em 10 minutos! Link: {{link}}' }
];

export const webinarFields = {
  webinars: (s, d) => {
    const sessions = (Array.isArray(d.sessions) ? d.sessions : []).slice(0, 30).map(raw => {
      const t = Date.parse(raw?.start);
      if (Number.isNaN(t)) fail('Use uma data e hora válidas em cada sessão.');
      const duration = Math.round(Number(raw.duration) || 60);
      if (duration < 10 || duration > 480) fail('A duração de cada sessão vai de 10 a 480 minutos.');
      return { id: /^[0-9a-f]{12}$/.test(raw.id || '') ? raw.id : id(), start: new Date(t).toISOString(), duration };
    }).sort((a, b) => a.start.localeCompare(b.start));
    const reminders = (Array.isArray(d.reminders) ? d.reminders : []).slice(0, 6).map(raw => {
      const minutes = Math.round(Number(raw?.minutes));
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 10080) fail('Cada lembrete vai de 0 a 10.080 minutos (7 dias) antes.');
      return { id: /^[0-9a-f]{12}$/.test(raw.id || '') ? raw.id : id(), minutes, channel: ['Email', 'SMS', 'WhatsApp'].includes(raw.channel) ? raw.channel : 'Email', body: str(raw.body, 600) || fail('Escreva a mensagem de cada lembrete.') };
    });
    return { name: str(d.name, 120) || fail('Dê um nome ao webinar.'), description: str(d.description, 2000), host: str(d.host, 80), active: Boolean(d.active),
      color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color.toLowerCase() : '#155eef', sessions, joinUrl: url(d.joinUrl, 'O link da transmissão'), replayUrl: url(d.replayUrl, 'O link da gravação'),
      openBefore: Math.max(0, Math.min(60, Math.round(Number(d.openBefore ?? 15)))), addTags: tagList(d.addTags), reminders, requirePhone: Boolean(d.requirePhone), thanks: str(d.thanks, 400) };
  }
};

export function webinarBeforeDelete(s, key, rowId) {
  if (key === 'webinars') s.webinarRegistrations = s.webinarRegistrations.filter(row => row.webinarId !== rowId);
}

export const sessionEnd = session => Date.parse(session.start) + session.duration * 60000;
export const openSessions = (webinar, at = Date.now()) => webinar.sessions.filter(session => sessionEnd(session) > at);

export function webinarCommand(s, command, { add, run, now }) {
  const { type, id: rowId, data: d = {} } = command;
  if (type === 'webinar-reminders') return dueReminders(s, d.at ? Date.parse(d.at) : Date.now(), { add, d });
  const webinar = s.webinars.find(row => row.id === rowId);
  if (!webinar?.active) fail('Este webinar não está com inscrições abertas.', 404);
  if (type === 'webinar-register') {
    const session = openSessions(webinar).find(row => row.id === d.sessionId) || (openSessions(webinar).length === 1 ? openSessions(webinar)[0] : null);
    if (!session) fail(openSessions(webinar).length ? 'Escolha uma das sessões.' : 'Não há sessões abertas para inscrição.');
    const name = str(d.name, 120) || fail('Informe seu nome.'), email = mail(d.email) || fail('Informe seu e-mail.'), phone = str(d.phone, 48);
    if (webinar.requirePhone && !phone) fail('Informe seu WhatsApp.');
    if (phone && !/^[+()\d\s.-]{8,24}$/.test(phone)) fail('Use um telefone válido.');
    let contact = s.contacts.find(row => row.email === email) || (phone && s.contacts.find(row => digits(row.phone) && digits(row.phone) === digits(phone)));
    if (!contact) { contact = add(s, 'contacts', { name, email, phone, tags: webinar.addTags, company: '', notes: '', custom: {} }); run(s, 'Contact created', { contactId: contact.id }); }
    else { if (!contact.phone && phone) contact.phone = phone; if (webinar.addTags.length) contact.tags = [...new Set([...(contact.tags || []), ...webinar.addTags])].slice(0, 20); contact.updated = now(); }
    const existing = s.webinarRegistrations.find(row => row.webinarId === webinar.id && row.contactId === contact.id);
    if (existing) { existing.sessionId = session.id; existing.sent = {}; existing.updated = now(); return existing.id; }
    const registration = add(s, 'webinarRegistrations', { webinarId: webinar.id, sessionId: session.id, contactId: contact.id, name, email, phone, token: randomBytes(18).toString('hex'), sent: {}, attendedAt: '' });
    if (s.webinarRegistrations.length > 50000) s.webinarRegistrations.splice(0, s.webinarRegistrations.length - 50000);
    return registration.id;
  }
  if (type === 'webinar-attend') {
    const registration = s.webinarRegistrations.find(row => row.webinarId === webinar.id && row.token === d.token);
    if (!registration) fail('Inscrição não encontrada.', 404);
    registration.attendedAt ||= now();
    return registration.id;
  }
  fail('Unknown webinar command.');
}

const fill = (body, values) => body.replace(/\{\{(nome|webinar|data|link)\}\}/g, (_, key) => values[key] ?? '');
const when = (iso, zone) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date(iso));

// Writes every reminder that fell due (and that the session has not ended) to the contact's conversation, once,
// and returns them so the server can also deliver the WhatsApp ones when the sub-account has WhatsApp connected.
export function dueReminders(s, at, { add, d = {} }) {
  const sent = [];
  const base = str(d.base, 200), workspace = str(d.workspace, 60), zone = s.profile?.timezone || 'America/Sao_Paulo';
  for (const registration of s.webinarRegistrations) {
    const webinar = s.webinars.find(row => row.id === registration.webinarId);
    const session = webinar?.sessions.find(row => row.id === registration.sessionId);
    if (!webinar?.active || !session || sessionEnd(session) <= at) continue;
    const start = Date.parse(session.start);
    for (const reminder of webinar.reminders) {
      const due = start - reminder.minutes * 60000;
      if (due > at || registration.sent?.[reminder.id] || due < Date.parse(registration.created) - 60000) continue;
      const link = `${base}/w/${workspace}/${webinar.id}/sala?t=${registration.token}`;
      add(s, 'messages', { contactId: registration.contactId, body: fill(reminder.body, { nome: registration.name.split(' ')[0], webinar: webinar.name, data: when(session.start, zone), link }),
        subject: reminder.channel === 'Email' ? `Lembrete: ${webinar.name}` : '', channel: reminder.channel, direction: 'Outbound', read: true, starred: false, origin: 'workflow', webinarId: webinar.id });
      registration.sent = { ...(registration.sent || {}), [reminder.id]: new Date(at).toISOString() };
      sent.push({ channel: reminder.channel, phone: registration.phone, contactId: registration.contactId, body: fill(reminder.body, { nome: registration.name.split(' ')[0], webinar: webinar.name, data: when(session.start, zone), link }) });
    }
  }
  return sent;
}
