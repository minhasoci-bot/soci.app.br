// Formulários de lead dos anúncios: Google Ads (lead form com webhook) e Facebook/Instagram (Lead Ads).
//
// Google: o anunciante cola, no formulário de lead do Google Ads, a URL /api/google-leads/<subconta> e a chave
// gerada em Marketing → Rastreamento; o Google manda cada lead em JSON com essa chave (google_key).
// Meta: as páginas conectadas no Social Planner mandam o evento "leadgen" pelo mesmo webhook do Messenger
// (/api/meta/webhook); o servidor busca os campos do lead com o token da página.
// Os dois viram um contato (achado por e-mail ou telefone), uma nota com as respostas e o gatilho próprio.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { tagsChanged } from './contact-tags.mjs';
import { trackingOf } from './tracking.mjs';

export const leadFormCollections = ['adFormLeads'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const digits = value => String(value || '').replace(/\D/g, '');

/** 'tracking-google-lead-key': a new key for the Google Ads lead form webhook (the old one stops working). */
export function newGoogleLeadKey(s) {
  const t = trackingOf(s);
  t.googleLeadKey = randomBytes(18).toString('base64url');
  return t.googleLeadKey;
}

/** Does the key Google sent match this sub-account's? */
export function googleLeadKeyValid(s, key) {
  const expected = Buffer.from(String(trackingOf(s).googleLeadKey || ''));
  const given = Buffer.from(String(key || ''));
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

/** The answers of a Google Ads lead (user_column_data), by column id (FULL_NAME, EMAIL…) or column name. */
export function googleLeadFields(body) {
  const fields = {};
  for (const row of Array.isArray(body?.user_column_data) ? body.user_column_data.slice(0, 60) : []) {
    const key = str(row?.column_id, 60) || str(row?.column_name, 60);
    if (key) fields[key] = str(row?.string_value, 1000);
  }
  return fields;
}

/** The answers of a Meta lead (field_data: [{ name, values: [] }]). */
export function metaLeadFields(lead) {
  const fields = {};
  for (const row of Array.isArray(lead?.field_data) ? lead.field_data.slice(0, 60) : []) {
    const key = str(row?.name, 60);
    if (key) fields[key] = (Array.isArray(row.values) ? row.values : []).map(value => str(value, 1000)).filter(Boolean).join(', ');
  }
  return fields;
}

// Name, e-mail, phone and company, whatever the network calls them.
function contactInfo(fields) {
  const get = (...names) => { for (const name of names) { const hit = Object.entries(fields).find(([key]) => key.toLowerCase() === name); if (hit?.[1]) return hit[1]; } return ''; };
  const email = get('email', 'work_email').toLowerCase();
  const name = get('full_name', 'name') || [get('first_name'), get('last_name')].filter(Boolean).join(' ');
  return { name: name.slice(0, 120), email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 254) : '',
    phone: get('phone_number', 'phone', 'work_phone', 'work_phone_number').slice(0, 40), company: get('company_name', 'company').slice(0, 120) };
}

/**
 * 'ad-form-lead' (server only): one lead from a Google Ads or Meta lead form. The same lead never enters twice.
 * Returns the contact id ('' for a repeated lead).
 */
export function adFormLead(s, d, { add, run, now }) {
  const network = d.network === 'google' ? 'google' : d.network === 'meta' ? 'meta' : fail('Rede inválida.');
  const leadId = str(d.leadId, 120) || fail('Lead sem identificador.');
  const seen = s.adFormLeads ??= [];
  if (seen.some(row => row.network === network && row.leadId === leadId)) return '';
  const fields = Object.fromEntries(Object.entries(d.fields && typeof d.fields === 'object' ? d.fields : {}).slice(0, 60).map(([key, value]) => [str(key, 60), str(value, 1000)]).filter(([key]) => key));
  const info = contactInfo(fields);
  if (!info.email && !info.phone && !info.name) fail('O lead chegou sem nome, e-mail ou telefone.');
  const label = network === 'google' ? 'Lead do Google Ads' : 'Lead do Facebook';
  let contact = (info.email && s.contacts.find(row => (row.email || '').toLowerCase() === info.email))
    || (info.phone && s.contacts.find(row => digits(row.phone) && digits(row.phone).slice(-10) === digits(info.phone).slice(-10)));
  if (!contact) {
    contact = add(s, 'contacts', { name: info.name || info.email || info.phone, email: info.email, phone: info.phone, company: info.company, tags: [label, ...(d.test ? ['Lead de teste'] : [])], notes: '', source: label, custom: {} });
    run(s, 'Contact created', { contactId: contact.id });
  } else {
    for (const key of ['email', 'phone', 'company']) if (!contact[key] && info[key]) contact[key] = info[key];
    if (!(contact.tags || []).includes(label)) { const before = contact.tags || []; contact.tags = [...before, label]; tagsChanged(s, contact, before, run); }
    contact.updated = now();
  }
  const form = str(d.formName, 160) || str(d.formId, 80);
  const lines = [`${label}${form ? ` · ${form}` : ''}${d.campaign ? ` · campanha ${str(d.campaign, 160)}` : ''}${d.test ? ' (teste)' : ''}`, ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`)];
  add(s, 'messages', { contactId: contact.id, body: lines.join('\n').slice(0, 5000), channel: 'Note', direction: 'Inbound', read: false, starred: false, origin: 'lead-form' });
  seen.push({ network, leadId, contactId: contact.id, at: now() });
  if (seen.length > 2000) seen.splice(0, seen.length - 2000);
  run(s, network === 'google' ? 'google_lead_form' : 'meta_lead_form', { contactId: contact.id, formId: str(d.formId, 80), form, campaign: str(d.campaign, 160),
    campaignId: str(d.campaignId, 80), test: d.test ? 'yes' : 'no', leadId });
  return contact.id;
}
