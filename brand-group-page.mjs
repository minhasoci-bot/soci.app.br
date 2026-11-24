// Public page of a brand group report (/marcas/<token>): server-rendered, read-only, no scripts.
import { brandGroupHtml, groupWords } from './ui/brand-group-data.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function brandGroupPage(data, { lang = 'pt', path = '', agency = {} } = {}) {
  const w = groupWords(lang), locale = lang === 'es' ? 'es-419' : 'pt-BR';
  const day = iso => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: agency.timezone || 'America/Sao_Paulo' }).format(new Date(iso));
  const accent = /^#[0-9a-f]{6}$/i.test(agency.primary || '') ? agency.primary : '#d62976';
  const brand = agency.name || '';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(data.name)}${brand ? ` · ${esc(brand)}` : ''}</title>
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/brand-groups.css"></head>
<body><main class="bg-page" style="--bg-accent:${accent}">
<header class="bg-page-head"><div>${agency.logo && /^https:\/\//.test(agency.logo) ? `<img class="bg-logo" src="${esc(agency.logo)}" alt="${esc(brand)}">` : brand ? `<p class="dim">${esc(brand)}</p>` : ''}
<h1>${esc(data.name)}</h1><p class="dim">${esc(w.periods[data.period] || '')} · ${esc(day(data.from))} – ${esc(day(data.to))} · ${esc(w.brands(data.brands.length))}</p></div>
<nav class="bg-lang" aria-label="Idioma"><a href="${esc(path)}?lang=pt" ${lang === 'pt' ? 'aria-current="true"' : ''}>PT</a><a href="${esc(path)}?lang=es" ${lang === 'es' ? 'aria-current="true"' : ''}>ES</a></nav></header>
<section class="bg-report">${brandGroupHtml(data, { lang })}</section></main></body></html>`;
}
