// Reputation: the review link of a sub-account (public page with stars and a comment), personal links sent
// to contacts by WhatsApp, e-mail or SMS, and their status (sent → opened → reviewed).
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const reputationCollections = ['reviewRequests'];
export const reviewChannels = [['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['SMS', 'SMS']];
export const reviewTones = [['cordial', 'Cordial'], ['formal', 'Formal'], ['descontraido', 'Descontraído'], ['empatico', 'Empático']];

export const reputationDefaults = () => ({
  title: 'Como foi a sua experiência?',
  intro: 'Sua opinião ajuda a gente a melhorar e ajuda outras pessoas a nos conhecer.',
  googleUrl: '', facebookUrl: '', otherUrl: '', otherLabel: '',
  whatsapp: 'Oi, {{contact.first_name}}! Obrigado por escolher a {{workspace.name}}. Pode contar como foi? Leva menos de um minuto: {{review.link}}',
  sms: '{{workspace.name}}: oi, {{contact.first_name}}! Conte como foi a sua experiência: {{review.link}}',
  emailSubject: 'Como foi a sua experiência com a {{workspace.name}}?',
  email: 'Oi, {{contact.first_name}}!\n\nObrigado por escolher a {{workspace.name}}. Sua opinião ajuda a gente a melhorar.\n\nAvalie em menos de um minuto: {{review.link}}\n\nUm abraço,\nEquipe {{workspace.name}}',
  replyTone: 'cordial', signature: '', origin: ''
});

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clip = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
const url = (value, label) => {
  const text = clip(value, 500);
  if (text && !/^https:\/\/[^\s]+$/i.test(text)) fail(`${label}: use um endereço que comece com https://`);
  return text;
};
const origin = value => { try { const parsed = new URL(String(value || '')); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.origin : ''; } catch { return ''; } };

export const reviewTokenHash = token => /^[0-9a-f]{48}$/.test(token || '') ? createHash('sha256').update(token).digest('hex') : '';
export const reviewPath = (workspace, token = '') => `/avaliar/${workspace}${token ? `/${token}` : ''}`;

export function reputationOf(s) {
  s.reputation = { ...reputationDefaults(), ...(s.reputation || {}) };
  s.reviewRequests ??= [];
  return s.reputation;
}

export function saveReputation(s, d) {
  const current = reputationOf(s);
  const text = (key, limit, label) => {
    const value = clip(d[key], limit);
    if (!value) fail(`Preencha ${label}.`);
    return value;
  };
  for (const key of ['whatsapp', 'sms', 'email']) {
    if (d[key] !== undefined && !String(d[key]).includes('{{review.link}}')) fail('As mensagens precisam ter {{review.link}}, que vira o link de avaliação de cada contato.');
  }
  Object.assign(current, {
    title: text('title', 120, 'o título da página'), intro: clip(d.intro, 400),
    googleUrl: url(d.googleUrl, 'Link do Google'), facebookUrl: url(d.facebookUrl, 'Link do Facebook'),
    otherUrl: url(d.otherUrl, 'Outro site'), otherLabel: clip(d.otherLabel, 40),
    whatsapp: text('whatsapp', 1000, 'a mensagem de WhatsApp'), sms: text('sms', 320, 'a mensagem de SMS'),
    emailSubject: text('emailSubject', 200, 'o assunto do e-mail'), email: text('email', 4000, 'o texto do e-mail'),
    replyTone: reviewTones.some(([id]) => id === d.replyTone) ? d.replyTone : 'cordial', signature: clip(d.signature, 120),
    origin: origin(d.origin) || current.origin
  });
  if (current.otherUrl && !current.otherLabel) fail('Dê um nome ao outro site de avaliações.');
  return current;
}

const fill = (template, values) => String(template || '').replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (match, key) => (Object.hasOwn(values, key) ? values[key] : match));

// One personal link for a contact; the token only travels in the link, the record keeps its hash.
export function createReviewRequest(s, workspace, contact, channel, { source = 'manual', runId = '', origin: from = '' } = {}) {
  const settings = reputationOf(s);
  const token = randomBytes(24).toString('hex');
  const path = reviewPath(workspace, token);
  const base = origin(from) || settings.origin;
  const at = new Date().toISOString();
  const request = { id: randomUUID(), contactId: contact.id, channel, source, runId, tokenHash: reviewTokenHash(token), status: 'sent', sent: at, opened: '', reviewed: '', reviewId: '', created: at };
  s.reviewRequests.unshift(request);
  if (s.reviewRequests.length > 3000) s.reviewRequests.length = 3000;
  const link = `${base}${path}`;
  const values = {
    'contact.first_name': String(contact.name || '').split(/\s+/)[0] || '', 'contact.name': contact.name || '',
    'workspace.name': s.profile?.name || '', 'review.link': link
  };
  return { request, path, link, values, fill: template => fill(template, values) };
}

// Requests sent from the reputation screen. Returns what was sent and why the rest was skipped.
export function sendReviewRequests(s, workspace, d, { add, outbox }) {
  const settings = reputationOf(s);
  const channel = reviewChannels.some(([id]) => id === d.channel) ? d.channel : fail('Escolha o canal do pedido.');
  const ids = [...new Set(Array.isArray(d.contactIds) ? d.contactIds : [])].slice(0, 200);
  if (!ids.length) fail('Escolha pelo menos um contato.');
  if (d.origin) settings.origin = origin(d.origin) || settings.origin;
  const recent = Date.now() - 7 * 864e5;
  const sent = [], skipped = [];
  for (const id of ids) {
    const contact = s.contacts.find(row => row.id === id);
    if (!contact) continue;
    const name = contact.name || contact.email || contact.phone || 'Contato';
    if (contact.dnd) { skipped.push(`${name}: não perturbe`); continue; }
    if (channel === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email || '')) { skipped.push(`${name}: sem e-mail`); continue; }
    if (channel !== 'Email' && !contact.phone) { skipped.push(`${name}: sem telefone`); continue; }
    if (!d.force && s.reviewRequests.some(row => row.contactId === id && Date.parse(row.sent) > recent)) { skipped.push(`${name}: já recebeu um pedido nos últimos 7 dias`); continue; }
    const made = createReviewRequest(s, workspace, contact, channel, { source: 'manual', origin: d.origin });
    deliver(s, made, contact, channel, settings, { add, outbox });
    sent.push(made.request.id);
  }
  return { sent: sent.length, skipped };
}

export function deliver(s, made, contact, channel, settings, { add, outbox, runId = '', workflowId = '' }) {
  const body = made.fill(channel === 'WhatsApp' ? settings.whatsapp : channel === 'SMS' ? settings.sms : settings.email).slice(0, 5000);
  const subject = channel === 'Email' ? made.fill(settings.emailSubject).slice(0, 240) : '';
  add(s, 'messages', { contactId: contact.id, body, subject, channel, direction: 'Outbound', read: true, starred: false, origin: runId ? 'workflow' : 'reputation', ...(workflowId && { workflowId }) });
  if (channel === 'WhatsApp') outbox(s, { kind: 'whatsapp', runId, phone: contact.phone, body, path: made.path, origin: settings.origin });
  if (channel === 'Email') outbox(s, { kind: 'review-email', runId, requestId: made.request.id, email: contact.email, subject, body, path: made.path, origin: settings.origin });
  return body;
}

export function openReviewRequest(s, tokenHash) {
  const request = (s.reviewRequests || []).find(row => row.tokenHash === tokenHash);
  if (!request) return null;
  if (request.status === 'sent') { request.status = 'opened'; request.opened = new Date().toISOString(); }
  return request;
}

// A review sent from the public page. With a personal link it is tied to the contact and the request.
export function submitReview(s, d, { add, emit }) {
  if (clip(d.website, 200)) return { ok: true }; // honeypot: bots fill the hidden field
  const score = Number(d.score);
  if (![1, 2, 3, 4, 5].includes(score)) fail('Escolha de 1 a 5 estrelas.');
  const text = clip(d.text, 2500);
  let request = null, contact = null;
  if (d.tokenHash) {
    request = s.reviewRequests?.find(row => row.tokenHash === d.tokenHash) || fail('Este link de avaliação não é válido.', 404);
    if (request.status === 'reviewed') fail('Você já enviou a sua avaliação. Obrigado!', 409);
    contact = s.contacts.find(row => row.id === request.contactId) || null;
  }
  const author = clip(d.name, 80) || contact?.name || 'Cliente';
  const row = add(s, 'reviews', { author, score, text: text || '(sem comentário)', reply: '', source: 'Link de avaliação', contactId: contact?.id || '', requestId: request?.id || '' });
  if (request) Object.assign(request, { status: 'reviewed', reviewed: new Date().toISOString(), reviewId: row.id, opened: request.opened || new Date().toISOString() });
  emit(s, 'review_received', { contactId: contact?.id || '', score });
  return { ok: true, score };
}

export function reputationStats(s) {
  const reviews = s.reviews || [], requests = s.reviewRequests || [];
  const distribution = [5, 4, 3, 2, 1].map(score => [score, reviews.filter(row => Number(row.score) === score).length]);
  const average = reviews.length ? reviews.reduce((sum, row) => sum + Number(row.score || 0), 0) / reviews.length : 0;
  const count = status => requests.filter(row => status.includes(row.status)).length;
  return {
    total: reviews.length, average, distribution, pending: reviews.filter(row => !row.reply).length,
    requests: requests.length, opened: count(['opened', 'reviewed']), reviewed: count(['reviewed']),
    conversion: requests.length ? Math.round(count(['reviewed']) / requests.length * 100) : 0
  };
}

// Google reviews into the workspace: new ones are added (and fire the review trigger after the first
// sync, so connecting an old profile does not run workflows for years of reviews), known ones refreshed.
export function importGoogleReviews(s, d, { add, emit }) {
  const settings = reputationOf(s);
  const first = !settings.googleSyncedAt;
  const list = Array.isArray(d.reviews) ? d.reviews.slice(0, 200) : [];
  let added = 0, updated = 0;
  for (const item of list) {
    const googleName = clip(item.googleName, 300);
    const score = Number(item.score);
    if (!googleName || ![1, 2, 3, 4, 5].includes(score)) continue;
    const values = { author: clip(item.author, 80) || 'Cliente do Google', score, text: clip(item.text, 2500) || '(sem comentário)', reply: clip(item.reply, 2500) };
    const known = s.reviews.find(row => row.googleName === googleName);
    if (known) {
      if (known.score !== values.score || known.text !== values.text || (known.reply || '') !== values.reply || known.author !== values.author) { Object.assign(known, values, { updated: new Date().toISOString() }); updated++; }
      continue;
    }
    const row = add(s, 'reviews', { ...values, source: 'Google', googleName, contactId: '', ...(item.created && !Number.isNaN(Date.parse(item.created)) && { created: new Date(item.created).toISOString() }) });
    added++;
    if (!first) emit(s, 'review_received', { contactId: '', score: row.score });
  }
  settings.googleSyncedAt = new Date().toISOString();
  return { added, updated, first };
}

export function saveListing(s, d, directories) {
  s.listings ??= {};
  const id = directories.some(([key]) => key === d.id) ? d.id : fail('Diretório desconhecido.');
  const status = ['unchecked', 'ok', 'divergent', 'missing'].includes(d.status) ? d.status : 'unchecked';
  const href = url(d.url, 'Endereço do perfil');
  s.listings[id] = { url: href, status, note: clip(d.note, 200), checked: new Date().toISOString() };
  return s.listings[id];
}
