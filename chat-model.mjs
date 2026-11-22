// Chat widget records and the visitor commands. A visitor's session points to the contact the chat
// created or matched; its messages live in `messages` (channel "Live chat") so they show up in Conversas.
import { chatDefaults } from './ui/chat-widget-data.js';

export const chatCollections = ['chatWidgets', 'chatSessions'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const one = (value, options, fallback) => options.includes(value) ? value : fallback;
const mail = value => { const v = str(value, 160).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Use um e-mail válido.'); return v; };
const digits = value => String(value || '').replace(/\D/g, '');
const tagList = value => [...new Set((Array.isArray(value) ? value : str(value, 400).split(',')).map(tag => str(tag, 48)).filter(Boolean))].slice(0, 20);
const modes = ['off', 'optional', 'required'];

export const chatFields = {
  chatWidgets: (s, d) => {
    const base = chatDefaults();
    const row = {
      name: str(d.name, 80) || fail('Dê um nome ao chat.'), type: one(d.type, ['live', 'sms'], 'live'), active: Boolean(d.active),
      color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color.toLowerCase() : base.color, position: one(d.position, ['left', 'right'], 'right'),
      agentName: str(d.agentName, 40) || base.agentName, heading: str(d.heading, 60) || base.heading, subheading: str(d.subheading, 120),
      prompt: str(d.prompt, 140), promptDelay: Math.max(0, Math.min(120, Math.round(Number(d.promptDelay) || 0))),
      welcome: str(d.welcome, 400), thanks: str(d.thanks, 300) || base.thanks, legal: str(d.legal, 300),
      askName: one(d.askName, modes, 'required'), askEmail: one(d.askEmail, modes, 'required'), askPhone: one(d.askPhone, modes, 'optional'), tags: tagList(d.tags)
    };
    if (row.askEmail === 'off' && row.askPhone === 'off') fail('Peça pelo menos e-mail ou telefone: é com eles que o contato é criado.');
    return row;
  }
};

export function chatBeforeDelete(s, key, id) {
  if (key === 'chatWidgets') s.chatSessions = s.chatSessions.filter(session => session.widgetId !== id);
}

const findSession = (s, widgetId, tokenHash) => {
  const session = tokenHash && s.chatSessions.find(item => item.widgetId === widgetId && item.tokenHash === tokenHash);
  if (!session || !s.contacts.some(contact => contact.id === session.contactId)) fail('Conversa encerrada. Comece de novo.', 401);
  return session;
};

// The messages a visitor may see: the chat channel, from their own session on.
export function chatHistory(s, widgetId, tokenHash) {
  const session = findSession(s, widgetId, tokenHash);
  return s.messages.filter(message => message.contactId === session.contactId && message.channel === 'Live chat' && message.created >= session.created)
    .slice(-100).map(({ id, body, direction, created, buttons }) => ({ id, body, direction, created, ...(direction !== 'Inbound' && Array.isArray(buttons) && buttons.length ? { buttons: buttons.slice(0, 6) } : {}) }));
}

export function chatCommand(s, command, { add, now, run }) {
  const { type, id, data: d = {} } = command;
  const widget = s.chatWidgets.find(item => item.id === id);
  if (!widget?.active) fail('Este chat não está disponível.', 404);
  if (type === 'chat-start') {
    const name = str(d.name, 120), email = widget.askEmail === 'off' ? '' : mail(d.email), phone = widget.askPhone === 'off' ? '' : str(d.phone, 48);
    if (widget.askName === 'required' && !name) fail('Informe seu nome.');
    if (widget.askEmail === 'required' && !email) fail('Informe seu e-mail.');
    if (widget.askPhone === 'required' && !phone) fail('Informe seu telefone.');
    if (phone && !/^[+()\d\s.-]{8,24}$/.test(phone)) fail('Use um telefone válido.');
    if (!email && !phone) fail('Informe um e-mail ou telefone para respondermos.');
    const body = str(d.body, 2000) || fail('Escreva sua mensagem.');
    if (!/^[0-9a-f]{64}$/.test(d.tokenHash || '')) fail('Sessão inválida.');
    let contact = (email && s.contacts.find(item => item.email === email)) || (phone && s.contacts.find(item => digits(item.phone) && digits(item.phone) === digits(phone)));
    if (!contact) {
      contact = add(s, 'contacts', { name: name || email || phone, email, phone, tags: widget.tags, company: '', notes: '', custom: {} });
      run(s, 'Contact created', { contactId: contact.id });
    } else {
      if (!contact.phone && phone) contact.phone = phone;
      if (!contact.email && email) contact.email = email;
      if (widget.tags.length) contact.tags = [...new Set([...(contact.tags || []), ...widget.tags])].slice(0, 20);
      contact.updated = now();
    }
    const session = add(s, 'chatSessions', { widgetId: widget.id, contactId: contact.id, tokenHash: d.tokenHash, page: str(d.page, 300), last: now(), messages: 1 });
    if (s.chatSessions.length > 5000) s.chatSessions.splice(0, s.chatSessions.length - 5000);
    const channel = widget.type === 'live' ? 'Live chat' : phone ? 'SMS' : 'Email';
    add(s, 'messages', { contactId: contact.id, body, subject: channel === 'Email' ? `Mensagem pelo chat: ${widget.name}` : '', channel, direction: 'Inbound', read: false, starred: false, origin: 'human', widgetId: widget.id });
    run(s, 'chat_started', { contactId: contact.id, widgetId: widget.id });
    run(s, 'Customer replied', { contactId: contact.id, channel, body });
    return session.id;
  }
  if (type === 'chat-send') {
    if (widget.type !== 'live') fail('Este chat não recebe novas mensagens. Aguarde nosso contato.', 409);
    const session = findSession(s, widget.id, d.tokenHash);
    if (session.messages >= 300) fail('Esta conversa atingiu o limite de mensagens. Aguarde nossa resposta.', 429);
    const body = str(d.body, 2000) || fail('Escreva sua mensagem.');
    session.messages += 1; session.last = now();
    const message = add(s, 'messages', { contactId: session.contactId, body, subject: '', channel: 'Live chat', direction: 'Inbound', read: false, starred: false, origin: 'human', widgetId: widget.id });
    run(s, 'Customer replied', { contactId: session.contactId, channel: 'Live chat', body });
    return message.id;
  }
  fail('Unknown chat command.');
}
