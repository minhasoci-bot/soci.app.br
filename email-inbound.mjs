// E-mail recebido: a caixa de entrada das subcontas pela Resend (recebimento de e-mails).
//
// Cada subconta tem o endereço conversas+<subconta>@INBOUND_EMAIL_DOMAIN (o domínio com o MX apontado para a
// Resend). Os e-mails da equipe e dos fluxos saem com esse Reply-To, então as respostas dos contatos voltam
// para Conversas. A Resend chama POST /api/email/inbound (evento email.received), assinado pelo Svix com
// RESEND_INBOUND_SECRET; quando o corpo não vem no evento, ele é lido pela API com RESEND_API_KEY.
import { createHmac, timingSafeEqual } from 'node:crypto';

const clip = (value, limit) => String(value ?? '').trim().slice(0, limit);
const domain = () => String(process.env.INBOUND_EMAIL_DOMAIN || '').trim().toLowerCase().replace(/^@/, '');

/** The sub-account's inbound address ('' when receiving is not configured). */
export const inboundAddress = workspace => domain() && /^[\w-]{1,60}$/.test(workspace) ? `conversas+${workspace}@${domain()}` : '';

/** The sub-account an inbound address belongs to ('' for any other address). */
export function inboundWorkspace(addresses) {
  const host = domain();
  if (!host) return '';
  for (const raw of [].concat(addresses || [])) {
    const address = String(raw).match(/<([^>]+)>/)?.[1] || String(raw);
    const match = address.trim().toLowerCase().match(/^conversas\+([\w-]{1,60})@(.+)$/);
    if (match && match[2] === host) return match[1];
  }
  return '';
}

/** Svix signature (Resend webhooks): HMAC-SHA256 of "id.timestamp.body" with the whsec_ secret, within 5 minutes. */
export function svixValid(raw, headers, secret, now = Date.now()) {
  const id = headers['svix-id'], timestamp = headers['svix-timestamp'], signatures = String(headers['svix-signature'] || '');
  if (!secret || !id || !timestamp || !signatures) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64'));
  return signatures.split(' ').some(entry => {
    const [, value = ''] = entry.split(',');
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** "Ana Lima <ana@x.com>" → { email, name }. */
export function sender(value) {
  const raw = String(value?.email ? `${value.name || ''} <${value.email}>` : value || '');
  const email = (raw.match(/<([^>]+)>/)?.[1] || raw).trim().toLowerCase();
  const name = raw.includes('<') ? raw.slice(0, raw.indexOf('<')).replace(/["']/g, '').trim() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email: email.slice(0, 254), name: clip(name, 120) } : null;
}

/** The reply itself, without the quoted conversation below it. */
export function replyText(text, html = '') {
  let body = String(text || '');
  if (!body.trim() && html) body = String(html).replace(/<(br|\/p|\/div)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.findIndex(line => /^>/.test(line.trim()) || /^(Em|On|El) .+(escreveu|wrote|escribió):\s*$/i.test(line.trim()) || /^-{2,}\s*(Mensagem original|Original Message)/i.test(line.trim()));
  return clip((cut > 0 ? lines.slice(0, cut) : lines).join('\n').replace(/\n{3,}/g, '\n\n'), 5000);
}

/** The e-mail of a Resend "email.received" event, reading the body by the API when the event does not carry it. */
export async function inboundEmail(event, { key = process.env.RESEND_API_KEY, request = fetch } = {}) {
  if (event?.type !== 'email.received' || !event.data) return null;
  let data = event.data;
  if (!data.text && !data.html && data.email_id && key) {
    const response = await request(`https://api.resend.com/emails/receiving/${encodeURIComponent(data.email_id)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (response?.ok) data = { ...data, ...(await response.json().catch(() => ({}))) };
  }
  const from = sender(data.from);
  if (!from) return null;
  return { id: clip(data.email_id || data.id || data.message_id, 200), from, to: [].concat(data.to || []), subject: clip(data.subject, 240), body: replyText(data.text, data.html) };
}
