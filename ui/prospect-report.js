import { auditAreas } from './agency-data.js';
import { normalizeProspectTheme, opportunityScore, prospectSections } from './prospecting-data.js';

export const escapeProspect = value => String(value ?? '').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const h = escapeProspect;
const displayDate = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeZone:'America/Sao_Paulo'}).format(new Date(value)) : '—';
const box = (key,content) => `<section id="audit-${key}" class="pr-audit-box"><h2>${prospectSections[key]}</h2>${content}</section>`;
export function safeWebsite(value) {
  if (!value) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    if (['http:','https:'].includes(url.protocol) && !url.username && !url.password && url.hostname.includes('.')) return url.href;
  } catch { /* Invalid or incomplete URL. */ }
  return '';
}
// Prospects do Google Maps guardam só o placeId (regra do Google Maps Platform): o nome salvo é provisório
// e os dados da empresa são lidos ao vivo na hora de mostrar, sem nunca voltar para o armazenamento.
export const mapsPlaceholderName = 'Prospect do Maps';
export const isGooglePlace = placeId => typeof placeId === 'string' && Boolean(placeId) && !placeId.startsWith('osm-');
export function withPlace(business,place) {
  if (!business || !place) return business;
  const fill = (own,live) => own || live || '';
  // O endereço do Google já vem completo (com cidade e país): só entra quando o prospect não tem endereço próprio.
  const ownAddress = Boolean(business.address || business.city);
  return { ...business,
    name:business.name && business.name !== mapsPlaceholderName ? business.name : place.name || business.name,
    ...(ownAddress || !place.address ? {} : { address:place.address,city:'',region:'',postal:'',country:'' }),
    phone:fill(business.phone,place.phone), website:fill(business.website,place.website), category:fill(business.category,place.category),
    rating:Number.isFinite(business.rating) ? business.rating : Number.isFinite(place.rating) ? place.rating : null,
    reviews:business.reviews ?? place.reviews ?? null };
}
export function mapsAddress(business) {
  const street = [business.address,business.city,business.region].filter(Boolean);
  const address = [...street,...(street.length && business.country ? [business.country] : [])].join(', ');
  return address || business.placeId ? `https://www.google.com/maps/search/?${new URLSearchParams({api:'1',query:address || business.name,...(business.placeId ? {query_place_id:business.placeId} : {})})}` : '';
}

const tone = value => !Number.isFinite(value) ? '' : value >= 80 ? 'good' : value >= 50 ? 'fair' : 'poor';
const gauge = (value,label) => `<div class="pr-gauge ${tone(value)}"><b>${Number.isFinite(value) ? value : '—'}</b><span>${h(label)}</span></div>`;
const checklist = (rows = []) => `<ul class="pr-checks">${rows.map(row => `<li class="${row.ok === null ? 'na' : row.ok ? 'ok' : 'fail'}"><span aria-hidden="true">${row.ok === null ? '–' : row.ok ? '✓' : '✕'}</span>
  <span>${h(row.label)}${row.detail ? ` <small>${h(row.detail)}</small>` : ''}</span><em class="sr-only">${row.ok === null ? 'Não se aplica' : row.ok ? 'Aprovado' : 'Reprovado'}</em></li>`).join('')}</ul>`;
const refresh = '<p class="dim">Atualize a auditoria para gerar esta seção.</p>';
const stackGroups = { analytics:'Análise de dados', ads:'Rastreamento de anúncios', crm:'Automação e CRM', chat:'Atendimento', conversion:'Conversão', seo:'SEO', cms:'Plataforma do site' };

function healthBody(audit) {
  const site = audit?.website;
  if (!audit) return refresh;
  if (!site) return '<p>Nenhum site informado ou encontrado no perfil do Google.</p>';
  if (!site.reachable) return `<p>Não conseguimos acessar ${h(site.url)}${site.status ? ` (código ${h(site.status)})` : ''}. Um site fora do ar afasta clientes e prejudica o Google.</p>`;
  const health = site.health || {};
  const perf = health.performance || {};
  const parts = health.parts || {};
  return `<div class="pr-gauges">${gauge(health.score,'Nota geral')}${gauge(parts.performance,'Velocidade (40%)')}${gauge(parts.seo,'SEO on-page (20%)')}${gauge(parts.security,'Segurança (20%)')}${gauge(parts.compliance,'LGPD e consentimento (20%)')}</div>
    <p class="dim">${perf.source === 'pagespeed' ? `Velocidade pelo Google PageSpeed: celular ${perf.mobile ?? '—'}, computador ${perf.desktop ?? '—'} (celular pesa 70%)${perf.lcp ? ` · maior conteúdo em ${h(perf.lcp)} no celular` : ''}.`
      : perf.source === 'estimate' ? `Velocidade estimada pelo tempo de resposta${Number.isFinite(perf.ttfb) ? ` (${perf.ttfb} ms)` : ''}; o PageSpeed não respondeu.` : ''}</p>
    <details class="pr-check-group" open><summary>SEO on-page</summary>${checklist(health.seo)}</details>
    <details class="pr-check-group"><summary>Segurança</summary>${checklist(health.security)}${health.securityInfo?.length ? `<p class="dim">Cabeçalhos avançados (não pontuam):</p>${checklist(health.securityInfo)}` : ''}</details>
    <details class="pr-check-group"><summary>LGPD e consentimento</summary>${checklist(health.compliance)}</details>`;
}

function stackBody(audit) {
  if (!audit) return refresh;
  if (!audit.website?.reachable) return '<p>Sem site acessível para analisar as tecnologias.</p>';
  const found = audit.stack || [];
  const missing = [['ga4','Google Analytics ou Tag Manager',['ga4','gtm']],['metaPixel','Meta Pixel',['metaPixel']],['chat','Chat ou WhatsApp no site',['chatWidget','whatsapp']]]
    .filter(([, ,keys]) => !keys.some(key => found.some(item => item.key === key)));
  const groups = Object.entries(stackGroups).map(([group,label]) => [label,found.filter(item => item.group === group)]).filter(([,items]) => items.length);
  const social = audit.social || [];
  return `${groups.length ? `<dl class="pr-stack">${groups.map(([label,items]) => `<div><dt>${h(label)}</dt><dd>${items.map(item => `<span class="pr-chip">${h(item.label)}</span>`).join('')}</dd></div>`).join('')}</dl>` : '<p>Nenhuma ferramenta de marketing detectada no site.</p>'}
    ${missing.length ? `<p><strong>Oportunidades:</strong> ${missing.map(([,label]) => h(label)).join(', ')} não encontrado(s).</p>` : ''}
    <p><strong>Redes sociais no site:</strong> ${social.length ? social.map(item => `<a href="${h(safeWebsite(item.url))}" target="_blank" rel="noopener noreferrer">${h(item.label)}</a>`).join(' · ') : 'nenhum link encontrado.'}</p>`;
}

export function auditReport(report,{navigation = true} = {}) {
  const business = report.business;
  const audit = report.audit || null;
  const map = mapsAddress(business);
  const website = safeWebsite(business.website);
  const score = opportunityScore(report.signals);
  const available = Object.values(report.signals).filter(value => Number.isFinite(value)).length;
  const address = [business.address,business.city,business.region,business.postal,business.country].filter(Boolean).join(' · ');
  const sections = report.sections.filter(item => item.visible && Object.hasOwn(prospectSections,item.key));
  const bodies = {
    address:`<p>${h(address || 'Endereço indisponível.')}</p>${map ? `<a class="text-link" href="${h(map)}" target="_blank" rel="noopener noreferrer">Abrir no Maps</a>` : ''}`,
    summary:`<div class="pr-report-score"><div><b>${score === null ? '—' : `${100-score}%`}</b><span>Presença online</span></div><div><b>${score === null ? '—' : `${score}%`}</b><span>Oportunidade de melhoria</span></div></div><p class="dim">${available} de ${auditAreas.length} pilares avaliados. O índice resume os sinais disponíveis.</p>`,
    business:`<dl><div><dt>Empresa</dt><dd>${h(business.name)}</dd></div><div><dt>Nicho</dt><dd>${h(business.category || 'Não informado')}</dd></div></dl>`,
    website:(() => {
      const url = safeWebsite(audit?.website?.url) || website;
      if (!url) return '<p>Site não informado.</p>';
      const state = !audit?.website ? '' : audit.website.reachable ? `<p class="dim">Site no ar${audit.website.title ? ` · “${h(audit.website.title)}”` : ''}.</p>` : '<p class="dim">O site não respondeu durante a auditoria.</p>';
      return `<p><a href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(url)}</a></p>${state}`;
    })(),
    health:healthBody(audit),
    stack:stackBody(audit),
    listings:`${audit?.profile ? `${gauge(audit.profile.score,'Perfil completo')}${checklist(audit.profile.checks)}` : `<p>${business.placeId ? 'Empresa identificada no Google Maps.' : 'Perfil no Google ainda não verificado.'}</p>`}${map ? `<a class="text-link" href="${h(map)}" target="_blank" rel="noopener noreferrer">Consultar perfil e endereço</a>` : ''}`,
    reputation:`<p>${business.rating === null ? (audit?.reputation?.source === 'google' ? 'Nota calculada a partir das avaliações públicas no Google no momento da auditoria.' : 'Nota pública não disponível.') : `${h(business.rating)} de 5${business.reviews == null ? '' : ` · ${h(business.reviews)} avaliações`}`}</p>${Number.isFinite(audit?.reputation?.score) ? `<p><strong>Índice de reputação:</strong> ${h(audit.reputation.score)}/10 <span class="dim">(nota média e volume de avaliações)</span></p>` : ''}`,
    next:`<div class="pr-report-grades">${auditAreas.map(([key,label]) => `<div><span>${h(label)}</span>${Number.isFinite(report.signals[key]) ? `<meter min="0" max="10" value="${report.signals[key]}" aria-label="${h(label)}"></meter><b>${report.signals[key]}/10</b>` : '<small>Não avaliado</small>'}</div>`).join('')}</div>`
  };
  return `<article class="pr-audit pr-theme-${h(normalizeProspectTheme(report.brand.theme))}"><header class="pr-audit-hero"><p>${h(report.brand.title)}</p><h1>${h(business.name)}</h1><small>Gerado em ${h(displayDate(report.generated))}</small>${report.brand.intro ? `<p>${h(report.brand.intro)}</p>` : ''}</header>
    ${navigation ? `<nav aria-label="Seções do relatório">${sections.map(({key}) => `<a href="#audit-${key}">${prospectSections[key]}</a>`).join('')}</nav>` : ''}
    <div class="pr-audit-content">${sections.map(({key}) => box(key,bodies[key])).join('')}</div>${report.brand.footer ? `<footer>${h(report.brand.footer)}</footer>` : ''}</article>`;
}

const doc = (title,body,styles = '<link rel="stylesheet" href="/prospecting.css">') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title>${styles}</head><body class="pr-public">${body}</body></html>`;

export const shareReportHtml = report => doc(report.business.name,auditReport(report));
export function widgetHtml(widget, thanks = false, message = '') {
  return doc(widget.headline,`<main class="pr-public-form pr-theme-${h(normalizeProspectTheme(widget.theme))}"><h1>${h(widget.headline)}</h1>${widget.description ? `<p>${h(widget.description)}</p>` : ''}
    ${thanks ? '<p role="status">Recebemos seus dados. Obrigado!</p>' : `${message ? `<p role="alert">${h(message)}</p>` : ''}<form method="post">
      <label>Nome da empresa<input name="name" maxlength="140" required></label><label>E-mail<input type="email" name="email" maxlength="240" required></label>
      <label>Site<input name="website" maxlength="1600" inputmode="url"></label>${widget.askPhone ? '<label>Telefone<input type="tel" name="phone" maxlength="40"></label>' : ''}
      <input class="pr-trap" tabindex="-1" aria-hidden="true" name="fax" autocomplete="off"><button type="submit">${h(widget.button)}</button></form>`}</main>`);
}

export function offlineReportHtml(report) {
  return doc(report.business.name,auditReport(report),`<style>body{font-family:system-ui,sans-serif;background:#f6f8fb;color:#172639;margin:0 auto;max-width:980px;padding:20px}article{background:#fff}header,section,footer,nav{padding:14px 24px}header{background:#eef4ff}section{border-top:1px solid #dee7ee}nav{display:flex;flex-wrap:wrap;gap:10px}.pr-report-score,.pr-report-grades>div{display:flex;gap:12px}.pr-report-score>div{display:grid}h1{font-size:32px}dd{margin:0}@media print{nav{display:none}article{background:#fff}}</style>`);
}
