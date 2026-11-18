// QR Codes: dynamic codes that point to /q/<workspace>/<id>, so the destination can change after printing
// and every scan is counted (total, unique per day, by day and device).
import { createHash } from 'node:crypto';

export const qrCollections = ['qrCodes'];
export const qrTypes = ['url', 'form', 'store', 'blog', 'webinar', 'whatsapp', 'phone', 'email', 'sms'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const hex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback;
const digits = value => String(value || '').replace(/\D/g, '');

export const qrFields = {
  qrCodes: (s, d) => {
    const type = qrTypes.includes(d.type) ? d.type : 'url';
    const row = { name: str(d.name, 80) || fail('Dê um nome ao QR Code.'), type, active: d.active !== false, fg: hex(d.fg, '#101828'), bg: hex(d.bg, '#ffffff'),
      url: '', targetId: '', phone: '', email: '', subject: '', message: '' };
    if (type === 'url') { row.url = str(d.url, 1000); if (!/^https?:\/\/[^\s"'<>]+$/i.test(row.url)) fail('Use um endereço que comece com https://'); }
    if (['form', 'store', 'blog', 'webinar'].includes(type)) {
      const key = { form: 'forms', store: 'stores', blog: 'blogs', webinar: 'webinars' }[type];
      row.targetId = str(d.targetId, 40);
      if (!s[key]?.some(item => item.id === row.targetId)) fail('Escolha para onde o QR Code leva.');
    }
    if (['whatsapp', 'phone', 'sms'].includes(type)) { row.phone = str(d.phone, 30); if (digits(row.phone).length < 10) fail('Informe o telefone com DDD (e DDI para WhatsApp).'); }
    if (type === 'email') { row.email = str(d.email, 160).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) fail('Use um e-mail válido.'); row.subject = str(d.subject, 120); }
    if (['whatsapp', 'sms', 'email'].includes(type)) row.message = str(d.message, 500);
    return row;
  }
};

// Where a scan goes. Internal targets resolve to their public pages; missing ones return ''.
export function qrTarget(s, qr, { base, workspace }) {
  const path = { form: `/form/${workspace}/${qr.targetId}`, store: `/loja/${workspace}/${qr.targetId}`, blog: `/b/${workspace}/${qr.targetId}`, webinar: `/w/${workspace}/${qr.targetId}` }[qr.type];
  if (path) {
    const key = { form: 'forms', store: 'stores', blog: 'blogs', webinar: 'webinars' }[qr.type];
    return s[key]?.some(item => item.id === qr.targetId && item.active) ? base + path : '';
  }
  const text = encodeURIComponent(qr.message || '');
  if (qr.type === 'whatsapp') return `https://wa.me/${digits(qr.phone)}${qr.message ? `?text=${text}` : ''}`;
  if (qr.type === 'phone') return `tel:+${digits(qr.phone)}`;
  if (qr.type === 'sms') return `sms:+${digits(qr.phone)}${qr.message ? `?body=${text}` : ''}`;
  if (qr.type === 'email') return `mailto:${qr.email}?${new URLSearchParams({ ...(qr.subject ? { subject: qr.subject } : {}), ...(qr.message ? { body: qr.message } : {}) }).toString().replace(/\+/g, '%20')}`;
  return qr.url;
}

// One scan: total, per day, unique visitors per day (a hash of address and browser, never stored raw), devices.
export function qrScan(s, id, { visitor = '', device = 'Outro' } = {}) {
  const qr = s.qrCodes.find(row => row.id === id);
  if (!qr) fail('QR Code não encontrado.', 404);
  const day = new Date().toISOString().slice(0, 10);
  const key = createHash('sha256').update(`${qr.id}:${day}:${visitor}`).digest('hex').slice(0, 16);
  const seen = qr.seen?.day === day ? qr.seen : { day, keys: [] };
  const fresh = !seen.keys.includes(key);
  if (fresh && seen.keys.length < 5000) seen.keys.push(key);
  qr.seen = seen;
  const byDay = { ...(qr.byDay || {}) };
  byDay[day] = { scans: (byDay[day]?.scans || 0) + 1, unique: (byDay[day]?.unique || 0) + (fresh ? 1 : 0) };
  qr.byDay = Object.fromEntries(Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-180));
  qr.devices = { ...(qr.devices || {}), [device]: (qr.devices?.[device] || 0) + 1 };
  qr.scans = (qr.scans || 0) + 1;
  qr.unique = (qr.unique || 0) + (fresh ? 1 : 0);
  qr.lastScan = new Date().toISOString();
  return qr.scans;
}

export const deviceOf = agent => /iPad|Tablet/i.test(agent) ? 'Tablet' : /iPhone|Android.+Mobile|Mobile/i.test(agent) ? 'Celular' : /Windows|Macintosh|Linux|CrOS/i.test(agent) ? 'Computador' : 'Outro';
