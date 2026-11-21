// Marketing → E-mails: templates and campaigns built with the block editor, sent to the contacts of a
// sub-account through Resend, with opens, clicks and unsubscribes tracked per recipient and an A/B test
// of the subject line (a test group gets A or B; after the wait, the rest gets the winner).
import { randomBytes } from 'node:crypto';
import { collectLinks, normalizeDesign } from './ui/email-blocks.js';

export const emailCollections = ['emailTemplates', 'emailCampaigns'];
/** Recipients live inside the workspace document, so one campaign is capped. */
export const MAX_RECIPIENTS = 2000;
const LEASE_MS = 10 * 60_000;

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const isEmail = value => /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z0-9-]{2,}$/i.test(value);
const iso = at => new Date(at).toISOString();
const token = () => randomBytes(12).toString('hex');
const origin = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.origin : ''; } catch { return ''; } };

function audienceOf(a = {}) {
  const mode = a?.mode === 'tags' ? 'tags' : 'all';
  const tags = mode === 'tags' ? [...new Set((Array.isArray(a.tags) ? a.tags : []).map(tag => str(tag, 60)).filter(Boolean))].slice(0, 30) : [];
  return { mode, tags };
}
function abOf(ab = {}) {
  return { enabled: Boolean(ab?.enabled), subjectB: str(ab?.subjectB, 200), preheaderB: str(ab?.preheaderB, 200),
    testPercent: Math.min(50, Math.max(10, Math.round(Number(ab?.testPercent) || 20))), metric: ab?.metric === 'clicks' ? 'clicks' : 'opens',
    waitHours: Math.min(72, Math.max(1, Math.round(Number(ab?.waitHours) || 4))), winner: '' };
}
const content = d => {
  const replyTo = str(d.replyTo, 160);
  if (replyTo && !isEmail(replyTo)) fail('Informe um e-mail válido em Responder para.');
  return { subject: str(d.subject, 200), preheader: str(d.preheader, 200), fromName: str(d.fromName, 80), replyTo, ...normalizeDesign(d) };
};

export const emailFields = {
  emailTemplates: (s, d) => ({ name: str(d.name, 120) || fail('Dê um nome ao modelo.'), ...content(d) }),
  emailCampaigns: (s, d) => {
    const prior = d.id ? s.emailCampaigns.find(row => row.id === d.id) : null;
    if (prior && prior.status !== 'draft') fail('Só rascunhos podem ser editados. Cancele o agendamento para mudar a campanha.', 409);
    return { name: str(d.name, 120) || fail('Dê um nome à campanha.'), ...content(d), audience: audienceOf(d.audience), ab: abOf(d.ab),
      ...(prior ? {} : { status: 'draft', recipients: [], stats: statsOf([]) }) };
  }
};

export function emailBeforeDelete(s, key, id) {
  const row = key === 'emailCampaigns' ? s.emailCampaigns.find(item => item.id === id) : null;
  if (row && ['sending', 'testing'].includes(row.status)) fail('Esta campanha está sendo enviada. Cancele o envio antes de excluir.', 409);
}

/** Contacts the audience reaches: with e-mail, not in do-not-disturb, not unsubscribed, one per address. */
export function audienceContacts(s, audience) {
  const wanted = (audience?.tags || []).map(tag => tag.toLowerCase());
  const seen = new Set(), out = [];
  for (const contact of s.contacts) {
    const email = String(contact.email || '').trim().toLowerCase();
    if (!isEmail(email) || contact.dnd || contact.emailUnsubscribed || seen.has(email)) continue;
    if (audience?.mode === 'tags' && !(contact.tags || []).some(tag => wanted.includes(String(tag).toLowerCase()))) continue;
    seen.add(email); out.push(contact);
  }
  return out;
}

export function statsOf(recipients) {
  // Variant numbers count only the test group, so the winner's later sends do not skew the comparison.
  const blank = () => ({ sent: 0, opened: 0, clicked: 0 });
  const stats = { recipients: recipients.length, sent: 0, failed: 0, pending: 0, opened: 0, clicked: 0, unsubscribed: 0, variants: { A: blank(), B: blank() } };
  for (const r of recipients) {
    if (r.st === 'sent') stats.sent++;
    else if (r.st === 'failed') stats.failed++;
    else if (['queued', 'sending', 'held'].includes(r.st)) stats.pending++;
    if (r.o) stats.opened++;
    if (r.k) stats.clicked++;
    if (r.u) stats.unsubscribed++;
    const v = stats.variants[r.v];
    if (v && r.x && r.st === 'sent') { v.sent++; if (r.o) v.opened++; if (r.k) v.clicked++; }
  }
  return stats;
}
const settle = campaign => {
  campaign.stats = statsOf(campaign.recipients);
  if (campaign.status === 'sending' && !campaign.recipients.some(r => ['queued', 'sending', 'held'].includes(r.st))) { campaign.status = 'sent'; campaign.completedAt = new Date().toISOString(); }
};
const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = randomBytes(4).readUInt32BE() % (i + 1); [list[i], list[j]] = [list[j], list[i]]; } return list; };

function start(s, campaign, at) {
  const contacts = shuffle(audienceContacts(s, campaign.audience)).slice(0, MAX_RECIPIENTS);
  const row = (contact, v, st) => ({ t: token(), c: contact.id, e: String(contact.email).trim().toLowerCase(), n: contact.name || '', v, st });
  campaign.startedAt = iso(at);
  if (campaign.ab?.enabled && contacts.length >= 4) {
    const size = Math.max(2, Math.round(contacts.length * campaign.ab.testPercent / 100) & ~1 || 2);
    campaign.recipients = contacts.map((contact, i) => i < size ? { ...row(contact, i % 2 ? 'B' : 'A', 'queued'), x: 1 } : row(contact, '', 'held'));
    campaign.status = 'testing';
    campaign.testEndsAt = iso(at + campaign.ab.waitHours * 3600_000);
  } else {
    campaign.recipients = contacts.map(contact => row(contact, 'A', 'queued'));
    campaign.status = 'sending';
  }
  settle(campaign);
}

/** A or B by the rate of the chosen metric among the delivered test e-mails; a tie keeps A. */
export function abWinner(campaign) {
  const { A, B } = statsOf(campaign.recipients).variants, key = campaign.ab.metric === 'clicks' ? 'clicked' : 'opened';
  const rate = v => v.sent ? v[key] / v.sent : 0;
  return rate(B) > rate(A) ? 'B' : 'A';
}

export function emailTick(s, at) {
  let queued = 0;
  for (const campaign of s.emailCampaigns || []) {
    if (campaign.status === 'scheduled' && Date.parse(campaign.scheduledAt) <= at) start(s, campaign, at);
    if (campaign.status === 'testing' && Date.parse(campaign.testEndsAt) <= at && !campaign.recipients.some(r => ['queued', 'sending'].includes(r.st))) {
      campaign.ab.winner = abWinner(campaign);
      for (const r of campaign.recipients) if (r.st === 'held') Object.assign(r, { st: 'queued', v: campaign.ab.winner });
      campaign.status = 'sending';
      settle(campaign);
    }
    if (['sending', 'testing'].includes(campaign.status)) queued += campaign.recipients.filter(r => r.st === 'queued' || (r.st === 'sending' && Date.parse(r.lease) < at - LEASE_MS)).length;
  }
  return queued;
}

const variantOf = (campaign, v) => v === 'B' ? { subject: campaign.ab.subjectB || campaign.subject, preheader: campaign.ab.preheaderB || campaign.preheader } : { subject: campaign.subject, preheader: campaign.preheader };

/** Leases up to `limit` queued e-mails for the server to render and send (a lease expires after 10 min). */
export function emailTake(s, at, limit = 100) {
  const items = [], campaigns = {};
  for (const campaign of s.emailCampaigns || []) {
    if (!['sending', 'testing'].includes(campaign.status)) continue;
    for (const r of campaign.recipients) {
      if (items.length >= limit) break;
      if (!(r.st === 'queued' || (r.st === 'sending' && Date.parse(r.lease) < at - LEASE_MS))) continue;
      Object.assign(r, { st: 'sending', lease: iso(at) });
      const contact = s.contacts.find(row => row.id === r.c) || { name: r.n, email: r.e };
      items.push({ campaignId: campaign.id, token: r.t, email: r.e, variant: r.v, contact: { name: contact.name || '', email: r.e, phone: contact.phone || '', company: contact.company || '' } });
      campaigns[campaign.id] ||= { name: campaign.name, fromName: campaign.fromName, replyTo: campaign.replyTo, blocks: campaign.blocks, style: campaign.style, origin: campaign.origin || '',
        A: variantOf(campaign, 'A'), B: variantOf(campaign, 'B') };
    }
    settle(campaign);
  }
  return { items, campaigns, business: s.profile?.name || '' };
}

export function emailResults(s, results, at) {
  const touched = new Set();
  for (const result of Array.isArray(results) ? results.slice(0, 1000) : []) {
    const campaign = s.emailCampaigns.find(row => row.id === result?.campaignId);
    const r = campaign?.recipients.find(row => row.t === result.token);
    if (!r || r.st !== 'sending') continue;
    Object.assign(r, result.ok ? { st: 'sent', at: iso(at) } : { st: 'failed', at: iso(at), err: str(result.error, 200) || 'falha no envio' });
    delete r.lease;
    touched.add(campaign);
  }
  for (const campaign of touched) settle(campaign);
  return touched.size;
}

/** Open pixel, click redirect and unsubscribe from the public links of one recipient. */
export function emailTrack(s, { token: t, event, index }, { run, at }) {
  if (!/^[0-9a-f]{24}$/.test(t || '')) return null;
  for (const campaign of s.emailCampaigns || []) {
    const r = campaign.recipients?.find(row => row.t === t);
    if (!r) continue;
    const fire = name => run(s, 'email_event', { contactId: r.c, campaignId: campaign.id, event: name });
    const out = { campaign: campaign.name, business: s.profile?.name || '', unsubscribed: Boolean(r.u), opened: Boolean(r.o), url: '' };
    if (event === 'info') return out;
    if (event === 'click') {
      out.url = collectLinks(campaign.blocks)[Number(index)] || '';
      if (!out.url) return out;
      r.clicks = Math.min(9999, (r.clicks || 0) + 1);
      if (!r.o) { r.o = iso(at); fire('opened'); }
      if (!r.k) { r.k = iso(at); fire('clicked'); }
    } else if (event === 'open') {
      if (r.o) return out;
      r.o = iso(at); fire('opened');
    } else if (event === 'unsubscribe') {
      if (!r.u) {
        r.u = iso(at); out.unsubscribed = true;
        const contact = s.contacts.find(row => row.id === r.c);
        if (contact && !contact.emailUnsubscribed) Object.assign(contact, { emailUnsubscribed: true, emailUnsubscribedAt: iso(at), updated: iso(at) });
        fire('unsubscribed');
      }
    } else return null;
    campaign.stats = statsOf(campaign.recipients);
    return out;
  }
  return null;
}

export function emailCommand(s, { type, id, data: d }, { run, add }) {
  const at = Date.now();
  const campaign = () => s.emailCampaigns.find(row => row.id === id) || fail('Campanha não encontrada.', 404);
  if (type === 'email-campaign-schedule') {
    const row = campaign();
    if (row.status !== 'draft') fail('Esta campanha já foi agendada ou enviada.', 409);
    if (!row.subject) fail('Escreva o assunto antes de enviar.');
    if (!row.blocks?.length) fail('Monte o e-mail antes de enviar: ele está vazio.');
    const loose = row.blocks.find(b => b.type === 'button' && b.label && !b.url);
    if (loose) fail(`O botão “${loose.label}” está sem link. Coloque o endereço ou remova o bloco.`);
    if (row.ab?.enabled && !row.ab.subjectB) fail('Escreva o assunto B do teste A/B, ou desligue o teste.');
    if (row.audience?.mode === 'tags' && !row.audience.tags.length) fail('Escolha ao menos uma tag para o público.');
    const reach = audienceContacts(s, row.audience).length;
    if (!reach) fail('Nenhum contato do público tem e-mail válido e permite receber e-mails.');
    const when = d.at ? Date.parse(d.at) : at;
    if (!Number.isFinite(when)) fail('Data de envio inválida.');
    if (when > at + 365 * 864e5) fail('Agende para no máximo um ano à frente.');
    Object.assign(row, { status: 'scheduled', scheduledAt: iso(Math.max(when, at)), origin: origin(d.origin) || row.origin || '', updated: iso(at) });
    return { scheduledAt: row.scheduledAt, reach: Math.min(reach, MAX_RECIPIENTS), capped: reach > MAX_RECIPIENTS };
  }
  if (type === 'email-campaign-cancel') {
    const row = campaign();
    if (row.status === 'scheduled') { Object.assign(row, { status: 'draft', scheduledAt: '', updated: iso(at) }); return 'draft'; }
    if (!['sending', 'testing'].includes(row.status)) fail('Só campanhas agendadas ou em envio podem ser canceladas.', 409);
    for (const r of row.recipients) if (['queued', 'held'].includes(r.st)) r.st = 'skipped';
    Object.assign(row, { status: 'cancelled', completedAt: iso(at), updated: iso(at) });
    row.stats = statsOf(row.recipients);
    return 'cancelled';
  }
  if (type === 'email-campaign-duplicate') {
    const row = campaign();
    const copy = add(s, 'emailCampaigns', { name: `${row.name} (cópia)`.slice(0, 120), subject: row.subject, preheader: row.preheader, fromName: row.fromName, replyTo: row.replyTo,
      blocks: structuredClone(row.blocks), style: { ...row.style }, audience: structuredClone(row.audience), ab: { ...row.ab, winner: '' }, status: 'draft', recipients: [], stats: statsOf([]) });
    return copy.id;
  }
  if (type === 'email-tick') return emailTick(s, d.at ? Date.parse(d.at) : at);
  if (type === 'email-take') return emailTake(s, d.at ? Date.parse(d.at) : at, Math.min(100, Math.max(1, Number(d.limit) || 100)));
  if (type === 'email-result') return emailResults(s, d.results, d.at ? Date.parse(d.at) : at);
  if (type === 'email-track') return emailTrack(s, { token: str(d.token, 24), event: d.event, index: d.index }, { run, at: d.at ? Date.parse(d.at) : at });
  fail('Unknown operation.', 400);
}
