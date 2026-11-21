// Central de preferências (6b.4): each contact chooses the channels (e-mail, SMS, WhatsApp) and the topics
// (Novidades, Promoções…) they want, on a public page with their own link, or leaves everything. Sends check it:
// e-mail campaigns (by topic), sequences and the workflow send actions.
import { randomBytes } from 'node:crypto';

export const preferenceChannels = [['email', 'E-mail'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const keyOf = channel => ({ Email: 'email', SMS: 'sms', WhatsApp: 'whatsapp' })[channel] || String(channel || '').toLowerCase();

export const preferenceDefaults = () => ({ title: 'Suas preferências de comunicação', intro: 'Escolha como e sobre o que você quer receber nossas mensagens.',
  topics: [{ id: 'novidades', name: 'Novidades', description: 'Lançamentos e conteúdos novos.' }, { id: 'promocoes', name: 'Promoções', description: 'Ofertas e descontos.' }] });
export const preferencesOf = s => { s.preferences = { ...preferenceDefaults(), ...(s.preferences || {}) }; return s.preferences; };

/** May this contact get a message on this channel (and about this topic)? */
export function canMessage(contact, channel, topicId = '') {
  if (!contact || contact.dnd) return false;
  const key = keyOf(channel);
  if (key === 'email' && contact.emailUnsubscribed) return false;
  if (contact.optOut?.[key]) return false;
  if (topicId && contact.topics?.[topicId] === false) return false;
  return true;
}

export function savePreferenceSettings(s, d) {
  const p = preferencesOf(s);
  if (d.title !== undefined) p.title = str(d.title, 120) || preferenceDefaults().title;
  if (d.intro !== undefined) p.intro = str(d.intro, 400);
  if (d.topics !== undefined) {
    const rows = Array.isArray(d.topics) ? d.topics : [];
    if (rows.length > 20) fail('Use até 20 assuntos.');
    p.topics = rows.map(row => {
      const name = str(row?.name, 60) || fail('Dê um nome a cada assunto.');
      const id = /^[a-z0-9-]{2,40}$/.test(row?.id || '') ? row.id : name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || randomBytes(3).toString('hex');
      return { id, name, description: str(row?.description, 160) };
    });
    if (new Set(p.topics.map(t => t.id)).size !== p.topics.length) fail('Há assuntos repetidos.');
  }
  return p;
}

/** The contact's private link token (created the first time it is needed). */
export const preferenceToken = contact => (contact.prefToken ||= randomBytes(16).toString('hex'));
const byToken = (s, token) => /^[0-9a-f]{32}$/.test(token || '') ? s.contacts.find(c => c.prefToken === token) : null;

/** What the public page shows for one token. */
export function preferenceView(s, token) {
  const contact = byToken(s, token);
  if (!contact) return null;
  const p = preferencesOf(s);
  return { business: s.profile?.name || '', title: p.title, intro: p.intro, name: (contact.name || '').split(' ')[0], email: contact.email || '', phone: contact.phone || '',
    all: Boolean(contact.dnd), channels: preferenceChannels.map(([key, label]) => ({ key, label, on: !(contact.optOut?.[key] || (key === 'email' && contact.emailUnsubscribed)), available: key === 'email' ? Boolean(contact.email) : Boolean(contact.phone) })),
    topics: p.topics.map(t => ({ ...t, on: contact.topics?.[t.id] !== false })) };
}

export function preferenceCommand(s, command, { run, now }) {
  const { type, data: d = {} } = command;
  if (type === 'preferences-settings') return savePreferenceSettings(s, d) && 'ok';
  if (type === 'preferences-link') {
    const contact = s.contacts.find(c => c.id === d.contactId) || fail('Contato não encontrado.', 404);
    return preferenceToken(contact);
  }
  if (type === 'preferences-save') {
    const contact = byToken(s, str(d.token, 32)) || fail('Link de preferências inválido.', 404);
    const before = JSON.stringify([contact.optOut, contact.topics, contact.dnd, contact.emailUnsubscribed]);
    const all = Boolean(d.all);
    contact.optOut = Object.fromEntries(preferenceChannels.map(([key]) => [key, all || !(Array.isArray(d.channels) && d.channels.includes(key))]));
    contact.topics = Object.fromEntries(preferencesOf(s).topics.map(t => [t.id, Array.isArray(d.topics) && d.topics.includes(t.id)]));
    if (Boolean(contact.dnd) !== all) { contact.dnd = all; run(s, 'contact_dnd', { contactId: contact.id, state: all ? 'on' : 'off' }); }
    const emailOff = contact.optOut.email;
    if (emailOff && !contact.emailUnsubscribed) Object.assign(contact, { emailUnsubscribed: true, emailUnsubscribedAt: now() });
    if (!emailOff && contact.emailUnsubscribed) Object.assign(contact, { emailUnsubscribed: false, emailUnsubscribedAt: '' });
    contact.preferencesUpdated = now(); contact.updated = now();
    if (JSON.stringify([contact.optOut, contact.topics, contact.dnd, contact.emailUnsubscribed]) !== before) run(s, 'preferences_changed', { contactId: contact.id, all: all ? 'yes' : 'no' });
    return contact.id;
  }
  fail('Comando de preferências desconhecido.');
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const preferenceCsp = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

/** The public preference page (a plain HTML form, no script). */
export function preferencePage(view, { saved = false } = {}) {
  const check = (name, value, on, label, hint = '', disabled = false) => `<label class="row${disabled ? ' off' : ''}"><input type="checkbox" name="${name}" value="${esc(value)}"${on && !disabled ? ' checked' : ''}${disabled ? ' disabled' : ''}><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(view.title)}</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f5f8;color:#1e1821;padding:24px 16px}main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e1e9;border-radius:16px;padding:28px;display:grid;gap:16px}
h1{margin:0;font-size:24px}p{margin:0;color:#5d5560}fieldset{border:0;margin:0;padding:0;display:grid;gap:8px}legend{font-weight:700;margin-bottom:6px}
.row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #e8e1e9;border-radius:10px;cursor:pointer}.row input{margin-top:4px;width:18px;height:18px}.row small{display:block;color:#7a727d}.off{opacity:.55;cursor:default}
.all{border-color:#f4b4ae;background:#fff7f6}button{font:600 15px system-ui,sans-serif;background:#b71889;color:#fff;border:0;border-radius:10px;padding:12px 18px;cursor:pointer}.ok{background:#ecf8f0;border:1px solid #3aa66a;border-radius:10px;padding:10px 12px;color:#146c2e}</style></head>
<body><main><p>${esc(view.business)}</p><h1>${esc(view.title)}</h1>${view.intro ? `<p>${esc(view.intro)}</p>` : ''}${view.name ? `<p>Olá, ${esc(view.name)}.</p>` : ''}
${saved ? '<p class="ok" role="status">Preferências salvas.</p>' : ''}
<form method="post"><fieldset><legend>Canais</legend>${view.channels.map(ch => check('channels', ch.key, ch.on, ch.label, ch.available ? '' : 'Não temos este contato cadastrado.', !ch.available)).join('')}</fieldset>
${view.topics.length ? `<fieldset><legend>Assuntos</legend>${view.topics.map(t => check('topics', t.id, t.on, t.name, t.description)).join('')}</fieldset>` : ''}
<fieldset><legend>Ou</legend><label class="row all"><input type="checkbox" name="all" value="1"${view.all ? ' checked' : ''}><span><b>Não quero receber nenhuma mensagem</b><small>Sai de todos os canais e assuntos. Você ainda pode receber respostas de atendimentos que abrir.</small></span></label></fieldset>
<button type="submit">Salvar preferências</button></form></main></body></html>`;
}
