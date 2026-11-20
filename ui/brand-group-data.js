// Brand groups: one report that consolidates several sub-accounts (the brands an agency manages for a
// client or a holding). Pure functions shared by the server (data and the public page) and the agency
// view (rendering). Nothing here reads the network or the DOM.

export const groupPeriods = { '7': 'Últimos 7 dias', '30': 'Últimos 30 dias', '90': 'Últimos 90 dias' };
export const groupShareDays = [7, 30, 90, 0];
const DAY = 86_400_000;
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const at = value => { const t = Date.parse(value || ''); return Number.isFinite(t) ? t : NaN; };
const within = (value, from, to) => { const t = at(value); return t >= from && t < to; };

// Counts of a period and the value of money metrics. Sales use the closing date when the opportunity
// has one; paid invoices use their last update, which is when they were marked as paid.
export const countKeys = ['published', 'scheduled', 'review', 'failed', 'networks', 'contacts', 'inbound'];
export const moneyKeys = ['wonValue', 'paid', 'openValue'];
export function brandMetrics(s, from, to, now = to) {
  const posts = s.socialPosts || [], opportunities = s.opportunities || [];
  return {
    published: posts.filter(p => p.status === 'published' && within(p.publishedAt, from, to)).length,
    scheduled: posts.filter(p => p.status === 'scheduled' && at(p.scheduleDate) >= now).length,
    review: posts.filter(p => p.status === 'in_review').length,
    failed: posts.filter(p => p.status === 'failed' && within(p.publishedAt || p.updated, from, to)).length,
    networks: (s.socialAccounts || []).filter(a => a.status === 'connected').length,
    contacts: (s.contacts || []).filter(c => within(c.created, from, to)).length,
    inbound: (s.messages || []).filter(m => m.direction === 'Inbound' && within(m.created, from, to)).length,
    wonValue: opportunities.filter(o => o.status === 'Won' && within(o.closeDate ? `${o.closeDate}T12:00:00Z` : o.updated || o.created, from, to)).reduce((n, o) => n + (Number(o.value) || 0), 0),
    paid: (s.invoices || []).filter(i => i.status === 'Paid' && within(i.updated || i.created, from, to)).reduce((n, i) => n + (Number(i.value) || 0), 0),
    openValue: opportunities.filter(o => o.status === 'Open').reduce((n, o) => n + (Number(o.value) || 0), 0),
    currency: s.profile?.currency || 'BRL'
  };
}

/**
 * Consolidated report of a group. `workspaces` are { id, name, state } the reader may see; brands of
 * the group that are missing (deleted or hidden) are only counted. Money is totalled per currency.
 */
export function brandGroupData(group, workspaces, now = Date.now()) {
  const days = Number(groupPeriods[group.period] ? group.period : '30');
  const to = now, from = now - days * DAY, before = from - days * DAY;
  const brands = group.accountIds.map(id => workspaces.find(w => w.id === id)).filter(Boolean).map(w => ({
    id: w.id, name: w.name || w.state.profile?.name || 'Subconta', current: brandMetrics(w.state, from, to, now), previous: brandMetrics(w.state, before, from, now)
  })).sort((a, b) => b.current.published - a.current.published || a.name.localeCompare(b.name));
  const sum = key => brands.reduce((n, b) => n + b.current[key], 0), sumBefore = key => brands.reduce((n, b) => n + b.previous[key], 0);
  const money = key => brands.reduce((out, b) => ({ ...out, [b.current.currency]: (out[b.current.currency] || 0) + b.current[key] }), {});
  const moneyBefore = key => brands.reduce((out, b) => ({ ...out, [b.previous.currency]: (out[b.previous.currency] || 0) + b.previous[key] }), {});
  return {
    name: group.name, period: String(days), from: new Date(from).toISOString(), to: new Date(to).toISOString(), brands,
    missing: group.accountIds.length - brands.length,
    totals: Object.fromEntries(countKeys.map(key => [key, sum(key)])), previous: Object.fromEntries(countKeys.map(key => [key, sumBefore(key)])),
    money: Object.fromEntries(moneyKeys.map(key => [key, money(key)])), moneyPrevious: Object.fromEntries(moneyKeys.map(key => [key, moneyBefore(key)]))
  };
}

const words = {
  pt: {
    published: 'Posts publicados', scheduled: 'Posts agendados', review: 'Aguardando aprovação', failed: 'Falhas de publicação', networks: 'Redes conectadas',
    contacts: 'Novos contatos', inbound: 'Mensagens recebidas', wonValue: 'Vendas ganhas', paid: 'Faturas pagas', openValue: 'Em negociação',
    brand: 'Marca', share: 'Participação nos posts', brands: n => `${n} marca${n === 1 ? '' : 's'}`, vs: 'vs. período anterior', none: 'sem base de comparação',
    missing: n => `${n} subconta${n === 1 ? '' : 's'} do grupo não ${n === 1 ? 'está' : 'estão'} mais disponíve${n === 1 ? 'l' : 'is'}.`, empty: 'Este grupo não tem marcas disponíveis.',
    social: 'Redes sociais', business: 'Atendimento e vendas', ranking: 'Comparativo por marca', upcoming: 'próximos', now: 'agora', periods: { 7: 'Últimos 7 dias', 30: 'Últimos 30 dias', 90: 'Últimos 90 dias' }
  },
  es: {
    published: 'Publicaciones publicadas', scheduled: 'Publicaciones programadas', review: 'Esperando aprobación', failed: 'Fallas de publicación', networks: 'Redes conectadas',
    contacts: 'Nuevos contactos', inbound: 'Mensajes recibidos', wonValue: 'Ventas ganadas', paid: 'Facturas pagadas', openValue: 'En negociación',
    brand: 'Marca', share: 'Participación en publicaciones', brands: n => `${n} marca${n === 1 ? '' : 's'}`, vs: 'vs. período anterior', none: 'sin base de comparación',
    missing: n => `${n} subcuenta${n === 1 ? '' : 's'} del grupo ya no ${n === 1 ? 'está disponible' : 'están disponibles'}.`, empty: 'Este grupo no tiene marcas disponibles.',
    social: 'Redes sociales', business: 'Atención y ventas', ranking: 'Comparativo por marca', upcoming: 'próximas', now: 'ahora', periods: { 7: 'Últimos 7 días', 30: 'Últimos 30 días', 90: 'Últimos 90 días' }
  }
};
export const groupWords = lang => words[lang] || words.pt;

const locale = lang => lang === 'es' ? 'es-419' : 'pt-BR';
const number = (value, lang) => new Intl.NumberFormat(locale(lang)).format(value);
const currency = (amounts, lang) => {
  const parts = Object.entries(amounts).filter(([, v]) => v);
  if (!parts.length) return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: Object.keys(amounts)[0] || 'BRL', maximumFractionDigits: 0 }).format(0);
  return parts.map(([code, v]) => { try { return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(v); } catch { return `${code} ${number(Math.round(v), lang)}`; } }).join(' · ');
};
const delta = (now, before, w) => {
  if (!before) return now ? `<small class="bg-delta">${w.none}</small>` : '';
  const pct = Math.round((now - before) / before * 100);
  return `<small class="bg-delta ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}">${pct > 0 ? '+' : ''}${pct}% ${w.vs}</small>`;
};
const total = values => Object.values(values).reduce((n, v) => n + v, 0);

/** The report body (cards and comparison table), used in the agency view and on the public page. */
export function brandGroupHtml(data, { lang = 'pt' } = {}) {
  const w = groupWords(lang);
  if (!data.brands.length) return `<p class="bg-empty">${esc(w.empty)}</p>`;
  const card = (key, value, compare = '') => `<div class="bg-card"><span>${esc(w[key])}</span><b>${value}</b>${compare}</div>`;
  const count = (key, compare = true) => card(key, number(data.totals[key], lang), compare ? delta(data.totals[key], data.previous[key], w) : '');
  const cash = (key, compare = true) => card(key, esc(currency(data.money[key], lang)), compare && Object.keys(data.money[key]).length <= 1 ? delta(total(data.money[key]), total(data.moneyPrevious[key]), w) : '');
  const posts = data.totals.published;
  const row = b => `<tr><th scope="row">${esc(b.name)}</th><td>${number(b.current.published, lang)}</td><td>${number(b.current.scheduled, lang)}</td><td>${number(b.current.review, lang)}</td>
    <td>${b.current.failed ? `<span class="bg-bad">${number(b.current.failed, lang)}</span>` : '0'}</td><td>${number(b.current.contacts, lang)}</td><td>${number(b.current.inbound, lang)}</td>
    <td>${esc(currency({ [b.current.currency]: b.current.wonValue }, lang))}</td><td>${esc(currency({ [b.current.currency]: b.current.paid }, lang))}</td>
    <td class="bg-share-cell"><span class="bg-bar"><span data-w="${posts ? Math.round(b.current.published / posts * 100) : 0}" style="width:${posts ? Math.round(b.current.published / posts * 100) : 0}%"></span></span>${posts ? Math.round(b.current.published / posts * 100) : 0}%</td></tr>`;
  return `${data.missing ? `<p class="bg-note">${esc(w.missing(data.missing))}</p>` : ''}
    <h3 class="bg-section">${esc(w.social)}</h3><div class="bg-cards">${count('published')}${count('scheduled', false)}${count('review', false)}${count('failed')}${count('networks', false)}</div>
    <h3 class="bg-section">${esc(w.business)}</h3><div class="bg-cards">${count('contacts')}${count('inbound')}${cash('wonValue')}${cash('paid')}${cash('openValue', false)}</div>
    <h3 class="bg-section">${esc(w.ranking)}</h3><div class="bg-table-wrap"><table class="bg-table"><thead><tr><th scope="col">${esc(w.brand)}</th><th scope="col">${esc(w.published)}</th><th scope="col">${esc(w.scheduled)}</th>
    <th scope="col">${esc(w.review)}</th><th scope="col">${esc(w.failed)}</th><th scope="col">${esc(w.contacts)}</th><th scope="col">${esc(w.inbound)}</th><th scope="col">${esc(w.wonValue)}</th><th scope="col">${esc(w.paid)}</th><th scope="col">${esc(w.share)}</th></tr></thead>
    <tbody>${data.brands.map(row).join('')}</tbody></table></div>`;
}

/** CSV with one line per brand (spreadsheet-safe: formulas are neutralised). */
export function brandGroupCsv(data) {
  const w = groupWords('pt'), cell = value => { const s = String(value ?? ''); return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`; };
  const head = [w.brand, ...countKeys.map(k => w[k]), ...moneyKeys.map(k => w[k]), 'Moeda'];
  const rows = data.brands.map(b => [b.name, ...countKeys.map(k => b.current[k]), ...moneyKeys.map(k => b.current[k]), b.current.currency]);
  return '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}
