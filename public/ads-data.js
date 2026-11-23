// Anúncios e atribuição: shared by the server (ads-model.mjs, server.mjs) and the browser (ads.js).
// A "touch" is where a visitor came from (UTM tags, click ids, referrer and landing page). The public
// pages keep the first and the last touch in a cookie; new leads and their forms, bookings and orders
// carry them, and the reports group leads, opportunities and revenue by channel and campaign.

export const channels = [
  ['google_ads', 'Google Ads', '#4285f4'], ['meta_ads', 'Meta Ads', '#0866ff'], ['paid_other', 'Outros anúncios', '#7c3aed'],
  ['organic_search', 'Busca orgânica', '#16a34a'], ['social', 'Redes sociais', '#db2777'], ['email', 'E-mail', '#ea580c'],
  ['qr', 'QR Code', '#0891b2'], ['referral', 'Sites de referência', '#64748b'], ['direct', 'Direto', '#94a3b8']
];
export const channelName = id => channels.find(c => c[0] === id)?.[1] || 'Direto';
export const paidChannels = ['google_ads', 'meta_ads', 'paid_other'];
export const adNetworks = [['meta', 'Meta Ads', 'meta_ads'], ['google', 'Google Ads', 'google_ads']];
// Meta ad creation: [id, label, Meta objective, optimization goal] and the call-to-action buttons.
export const metaObjectives = [['traffic', 'Tráfego para o site', 'OUTCOME_TRAFFIC', 'LINK_CLICKS'], ['awareness', 'Reconhecimento (alcance)', 'OUTCOME_AWARENESS', 'REACH']];
export const metaCtas = [['LEARN_MORE', 'Saiba mais'], ['SHOP_NOW', 'Comprar agora'], ['SIGN_UP', 'Cadastre-se'], ['CONTACT_US', 'Fale conosco'], ['GET_OFFER', 'Obter oferta'], ['BOOK_NOW', 'Reservar']];
export const eventTypes = { lead: 'Novo contato', form_submission: 'Formulário enviado', booking: 'Agendamento', order: 'Pedido', webinar: 'Inscrição em webinar' };

const paidMedium = /^(cpc|ppc|cpm|cpv|paid|paid[_-]?(search|social|media)|display|ads?|sem|retargeting|remarketing)$/;
const metaSource = /^(facebook|fb|instagram|ig|meta|messenger|audience[_-]?network|an)$/;
const searchHost = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu|search\.brave)\./;
const socialHost = /(^|\.)(facebook|fb|instagram|t|x|twitter|linkedin|lnkd|tiktok|youtube|youtu|pinterest|threads|bsky|reddit|whatsapp|wa)\.(com|me|co|net|app|be|in)$/;

const clip = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);
const lower = value => clip(value).toLowerCase();

/** The channel of a touch, from its UTM tags, click ids and referrer. */
export function classify(t = {}) {
  const source = lower(t.source), medium = lower(t.medium);
  if (t.gclid || ((source === 'google' || source === 'adwords' || source === 'youtube') && paidMedium.test(medium))) return 'google_ads';
  if ((metaSource.test(source) || t.fbclid) && paidMedium.test(medium)) return 'meta_ads';
  if (paidMedium.test(medium)) return 'paid_other';
  if (medium === 'email' || source === 'newsletter' || source === 'email') return 'email';
  if (source === 'qr' || medium === 'qr' || source === 'qrcode') return 'qr';
  if (metaSource.test(source) || t.fbclid || /^(social|social[_-]?media|organic[_-]?social)$/.test(medium)) return 'social';
  if (medium === 'organic') return 'organic_search';
  const host = lower(t.referrer);
  if (host && searchHost.test(`${host}.`)) return 'organic_search';
  if (host && socialHost.test(host)) return 'social';
  return source || host ? 'referral' : 'direct';
}

/**
 * A touch from a landing URL and its referrer. Returns null when there is nothing to remember: a visit
 * without tags or click ids from the same site (or no referrer) does not replace an earlier source.
 */
export function touchFromVisit(href, referrer = '', ownHost = '', at = Date.now()) {
  let url; try { url = new URL(href, 'http://local.invalid'); } catch { return null; }
  const q = name => clip(url.searchParams.get(name));
  let refHost = '';
  try { refHost = referrer ? new URL(referrer).hostname.replace(/^www\./, '').toLowerCase() : ''; } catch { refHost = ''; }
  if (refHost && ownHost && refHost === ownHost.replace(/^www\./, '').toLowerCase()) refHost = '';
  const touch = { source: q('utm_source'), medium: q('utm_medium'), campaign: q('utm_campaign'), content: q('utm_content'), term: q('utm_term'),
    utmId: q('utm_id'), gclid: q('gclid') || q('gbraid') || q('wbraid'), fbclid: q('fbclid'), referrer: refHost.slice(0, 120),
    landing: clip(url.pathname, 200), at: new Date(at).toISOString() };
  if (!touch.source && !touch.medium && !touch.campaign && !touch.utmId && !touch.gclid && !touch.fbclid && !touch.referrer) return null;
  touch.channel = classify(touch);
  return touch;
}

/** A touch read back from storage or a cookie: known keys only, short strings, a valid channel. */
export function cleanTouch(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term', 'utmId', 'gclid', 'fbclid', 'referrer']) out[key] = clip(t[key]);
  out.landing = clip(t.landing, 200);
  out.at = Number.isFinite(Date.parse(t.at)) ? new Date(t.at).toISOString() : new Date().toISOString();
  out.channel = channels.some(c => c[0] === t.channel) ? t.channel : classify(out);
  return out;
}
export const directTouch = (at = new Date().toISOString(), landing = '') => ({ source: '', medium: '', campaign: '', content: '', term: '', utmId: '', gclid: '', fbclid: '', referrer: '', landing, at, channel: 'direct' });

// ---- Dates ---------------------------------------------------------------------------------------
const dayOf = (iso, zone) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch { return String(iso).slice(0, 10); } };
const shift = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const rangePresets = [['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['week', 'Esta semana'], ['lastweek', 'Semana passada'], ['month', 'Este mês'], ['lastmonth', 'Mês passado'], ['year', 'Este ano'], ['lastyear', 'Ano passado'], ['custom', 'Personalizado']];

/** [from, to] (YYYY-MM-DD, inclusive) of a preset on the sub-account's calendar. */
export function presetRange(preset, zone = 'UTC', now = new Date(), custom = {}) {
  const today = dayOf(now.toISOString(), zone), [y, m] = today.split('-').map(Number);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(), monday = shift(today, -((weekday + 6) % 7));
  const monthStart = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  switch (preset) {
    case '7d': return [shift(today, -6), today];
    case 'week': return [monday, today];
    case 'lastweek': return [shift(monday, -7), shift(monday, -1)];
    case 'month': return [monthStart(y, m), today];
    case 'lastmonth': { const start = m === 1 ? monthStart(y - 1, 12) : monthStart(y, m - 1); return [start, shift(monthStart(y, m), -1)]; }
    case 'year': return [`${y}-01-01`, today];
    case 'lastyear': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case 'custom': if (/^\d{4}-\d\d-\d\d$/.test(custom.from || '') && /^\d{4}-\d\d-\d\d$/.test(custom.to || '')) return custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    // falls through to 30 days when the custom dates are incomplete
    default: return [shift(today, -29), today];
  }
}
const cents = value => Math.round(value * 100) / 100;
const inside = (iso, [from, to], zone) => { if (!iso) return false; const d = dayOf(iso, zone); return d >= from && d <= to; };

// ---- Attribution ---------------------------------------------------------------------------------
export const touchOf = (contact, model = 'last') => cleanTouch(contact?.attribution?.[model] || contact?.attribution?.first) || directTouch(contact?.created);
const campaignLabel = t => t.campaign || t.utmId || '';

/**
 * Leads, opportunities and revenue grouped by channel and campaign. `model` picks the first or the
 * last touch of each contact. Revenue is the paid invoices of the period.
 */
export function attributionReport(s, { model = 'last', range, zone = 'UTC' }) {
  const contacts = new Map((s.contacts || []).map(c => [c.id, c]));
  const names = new Map((s.adCampaigns || []).map(c => [String(c.id), c.name])); // utm ids shown by campaign name
  const groups = new Map();
  const row = (contact) => {
    const t = touchOf(contact, model), key = `${t.channel}|${campaignLabel(t).toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { channel: t.channel, label: channelName(t.channel), source: t.source || t.referrer || '', campaign: names.get(campaignLabel(t)) || names.get(t.utmId) || campaignLabel(t), leads: 0, opportunities: 0, pipeline: 0, won: 0, wonValue: 0, sales: 0, revenue: 0 });
    return groups.get(key);
  };
  for (const c of s.contacts || []) if (inside(c.created, range, zone)) row(c).leads++;
  for (const o of s.opportunities || []) {
    const c = contacts.get(o.contactId); if (!c) continue;
    if (inside(o.created, range, zone)) { const g = row(c); g.opportunities++; g.pipeline += Number(o.value) || 0; }
    if (o.status === 'Won' && inside(o.statusChangedAt || o.updated || o.created, range, zone)) { const g = row(c); g.won++; g.wonValue += Number(o.value) || 0; }
  }
  for (const i of s.invoices || []) {
    if (i.status !== 'Paid') continue;
    const c = contacts.get(i.contactId); if (!c || !inside(i.paidAt || i.updated || i.created, range, zone)) continue;
    const g = row(c); g.sales++; g.revenue += Number(i.value) || 0;
  }
  const rows = [...groups.values()].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads || a.label.localeCompare(b.label));
  const total = rows.reduce((t, r) => { for (const k of ['leads', 'opportunities', 'pipeline', 'won', 'wonValue', 'sales', 'revenue']) t[k] += r[k]; return t; }, { leads: 0, opportunities: 0, pipeline: 0, won: 0, wonValue: 0, sales: 0, revenue: 0 });
  const byChannel = channels.map(([id, label, color]) => ({ id, label, color, ...rows.filter(r => r.channel === id).reduce((t, r) => ({ leads: t.leads + r.leads, revenue: t.revenue + r.revenue, won: t.won + r.won, opportunities: t.opportunities + r.opportunities }), { leads: 0, revenue: 0, won: 0, opportunities: 0 }) }))
    .filter(c => c.leads || c.revenue || c.won || c.opportunities);
  return { rows, total, byChannel };
}

/** Does a touch belong to this ad campaign? Matched by the utm_id or utm_campaign (id or name). */
export function touchMatches(t, campaign) {
  if (!t) return false;
  const id = String(campaign.id), name = String(campaign.name || '').toLowerCase();
  return t.utmId === id || t.campaign === id || (Boolean(name) && t.campaign.toLowerCase() === name);
}

/**
 * The Google Ads / Meta Ads report: spend, clicks and impressions from the network, leads, sales and
 * revenue from the CRM. `fee` (%) is the agency's management fee, added to the cost.
 */
export function campaignReport(s, network, { range, zone = 'UTC', fee = 0, model = 'last' }) {
  const channel = adNetworks.find(n => n[0] === network)?.[2];
  const campaigns = (s.adCampaigns || []).filter(c => c.network === network);
  const stats = (s.adStats || []).filter(r => r.network === network && r.date >= range[0] && r.date <= range[1]);
  const mult = 1 + Math.max(0, Number(fee) || 0) / 100;
  const contacts = (s.contacts || []).map(c => ({ c, t: touchOf(c, model) })).filter(x => x.t.channel === channel);
  const paid = (s.invoices || []).filter(i => i.status === 'Paid' && inside(i.paidAt || i.updated || i.created, range, zone));
  const crm = matcher => {
    const mine = contacts.filter(x => matcher(x.t)), ids = new Set(mine.map(x => x.c.id));
    const sales = paid.filter(i => ids.has(i.contactId));
    return { leads: mine.filter(x => inside(x.c.created, range, zone)).length, sales: sales.length, revenue: sales.reduce((n, i) => n + (Number(i.value) || 0), 0) };
  };
  const rows = campaigns.map(camp => {
    const mine = stats.filter(r => r.campaignId === String(camp.id));
    const spend = mine.reduce((n, r) => n + (Number(r.spend) || 0), 0);
    return { id: camp.id, name: camp.name, status: camp.status, budget: camp.budget, spend: cents(spend), cost: cents(spend * mult),
      clicks: mine.reduce((n, r) => n + (Number(r.clicks) || 0), 0), impressions: mine.reduce((n, r) => n + (Number(r.impressions) || 0), 0),
      platformLeads: mine.reduce((n, r) => n + (Number(r.leads) || 0), 0), ...crm(t => touchMatches(t, camp)) };
  });
  const unmatched = crm(t => !campaigns.some(camp => touchMatches(t, camp)));
  if (unmatched.leads || unmatched.sales) rows.push({ id: '', name: 'Sem campanha identificada', status: '', spend: 0, cost: 0, clicks: 0, impressions: 0, platformLeads: 0, ...unmatched });
  const total = rows.reduce((t, r) => { for (const k of ['spend', 'cost', 'clicks', 'impressions', 'platformLeads', 'leads', 'sales', 'revenue']) t[k] += r[k]; return t; }, { spend: 0, cost: 0, clicks: 0, impressions: 0, platformLeads: 0, leads: 0, sales: 0, revenue: 0 });
  for (const k of ['spend', 'cost', 'revenue']) total[k] = cents(total[k]);
  const days = [];
  for (let d = range[0], n = 0; d <= range[1] && n < 400; d = shift(d, 1), n++) {
    const today = stats.filter(r => r.date === d);
    days.push({ date: d, cost: cents(today.reduce((x, r) => x + (Number(r.spend) || 0), 0) * mult), clicks: today.reduce((x, r) => x + (Number(r.clicks) || 0), 0) });
  }
  return { rows: rows.map(derived), total: derived(total), days };
}
/** CPC, CTR, ROI, CPS, CPL and average revenue of a report row (null when the base is zero). */
export function derived(r) {
  const per = (a, b) => b ? a / b : null;
  return { ...r, cpc: per(r.cost, r.clicks), ctr: per(r.clicks, r.impressions), roi: r.cost ? (r.revenue - r.cost) / r.cost : null, cps: per(r.cost, r.sales), cpl: per(r.cost, r.leads), avgRevenue: per(r.revenue, r.sales) };
}

/** The session events table as CSV (Excel-friendly: semicolons and a BOM). */
export function eventsCsv(s, events) {
  const name = id => (s.contacts || []).find(c => c.id === id)?.name || '';
  const cell = v => /[;"\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
  const head = ['Evento', 'Canal', 'Contato', 'Campanha', 'UTM source', 'UTM medium', 'UTM content', 'UTM term', 'Referência', 'Página', 'Valor', 'Data'];
  return '﻿' + [head, ...events.map(e => [eventTypes[e.type] || e.type, channelName(e.channel), name(e.contactId), e.campaign, e.source, e.medium, e.content, e.term, e.referrer, e.landing, e.value || '', e.created])]
    .map(r => r.map(cell).join(';')).join('\r\n');
}
