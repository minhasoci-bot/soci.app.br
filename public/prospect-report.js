import { auditAreas } from './agency-data.js';
import { opportunityScore, prospectSections } from './prospecting-data.js';

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
export function mapsAddress(business) {
  const street = [business.address,business.city,business.region].filter(Boolean);
  const address = [...street,...(street.length && business.country ? [business.country] : [])].join(', ');
  return address || business.placeId ? `https://www.google.com/maps/search/?${new URLSearchParams({api:'1',query:address || business.name,...(business.placeId ? {query_place_id:business.placeId} : {})})}` : '';
}

export function auditReport(report,{navigation = true} = {}) {
  const business = report.business;
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
    website:`<p>${website ? `<a href="${h(website)}" target="_blank" rel="noopener noreferrer">${h(website)}</a>` : 'Site não informado.'}</p>`,
    listings:`<p>${business.placeId ? 'Empresa identificada no Google Maps.' : 'Perfil no Google ainda não verificado.'}</p>${map ? `<a class="text-link" href="${h(map)}" target="_blank" rel="noopener noreferrer">Consultar perfil e endereço</a>` : ''}`,
    reputation:`<p>${business.rating === null ? 'Nota pública não disponível.' : `${h(business.rating)} de 5${business.reviews == null ? '' : ` · ${h(business.reviews)} avaliações`}`}</p>`,
    next:`<div class="pr-report-grades">${auditAreas.map(([key,label]) => `<div><span>${h(label)}</span>${Number.isFinite(report.signals[key]) ? `<meter min="0" max="10" value="${report.signals[key]}" aria-label="${h(label)}"></meter><b>${report.signals[key]}/10</b>` : '<small>Não avaliado</small>'}</div>`).join('')}</div>`
  };
  return `<article class="pr-audit pr-theme-${h(report.brand.theme)}"><header class="pr-audit-hero"><p>${h(report.brand.title)}</p><h1>${h(business.name)}</h1><small>Gerado em ${h(displayDate(report.generated))}</small>${report.brand.intro ? `<p>${h(report.brand.intro)}</p>` : ''}</header>
    ${navigation ? `<nav aria-label="Seções do relatório">${sections.map(({key}) => `<a href="#audit-${key}">${prospectSections[key]}</a>`).join('')}</nav>` : ''}
    <div class="pr-audit-content">${sections.map(({key}) => box(key,bodies[key])).join('')}</div>${report.brand.footer ? `<footer>${h(report.brand.footer)}</footer>` : ''}</article>`;
}

const doc = (title,body,styles = '<link rel="stylesheet" href="/prospecting.css">') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title>${styles}</head><body class="pr-public">${body}</body></html>`;

export const shareReportHtml = report => doc(report.business.name,auditReport(report));
export function widgetHtml(widget, thanks = false, message = '') {
  return doc(widget.headline,`<main class="pr-public-form pr-theme-${h(widget.theme)}"><h1>${h(widget.headline)}</h1>${widget.description ? `<p>${h(widget.description)}</p>` : ''}
    ${thanks ? '<p role="status">Recebemos seus dados. Obrigado!</p>' : `${message ? `<p role="alert">${h(message)}</p>` : ''}<form method="post">
      <label>Nome da empresa<input name="name" maxlength="140" required></label><label>E-mail<input type="email" name="email" maxlength="240" required></label>
      <label>Site<input name="website" maxlength="1600" inputmode="url"></label>${widget.askPhone ? '<label>Telefone<input type="tel" name="phone" maxlength="40"></label>' : ''}
      <input class="pr-trap" tabindex="-1" aria-hidden="true" name="fax" autocomplete="off"><button type="submit">${h(widget.button)}</button></form>`}</main>`);
}

export function offlineReportHtml(report) {
  return doc(report.business.name,auditReport(report),`<style>body{font-family:system-ui,sans-serif;background:#f6f8fb;color:#172639;margin:0 auto;max-width:980px;padding:20px}article{background:#fff}header,section,footer,nav{padding:14px 24px}header{background:#eef4ff}section{border-top:1px solid #dee7ee}nav{display:flex;flex-wrap:wrap;gap:10px}.pr-report-score,.pr-report-grades>div{display:flex;gap:12px}.pr-report-score>div{display:grid}h1{font-size:32px}dd{margin:0}@media print{nav{display:none}article{background:#fff}}</style>`);
}
