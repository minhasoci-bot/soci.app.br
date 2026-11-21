// Orçamentos (Pagamentos): statuses and the HTML of an estimate, shared by the server (public page) and the
// app (preview and read-only view). No inline styles, so it also runs under the public page's strict CSP.
import { productsHtml } from './document-render.js';

export const estimateStatuses = [['draft', 'Rascunho', ''], ['sent', 'Enviado', 'blue'], ['accepted', 'Aceito', 'green'], ['declined', 'Recusado', 'red'],
  ['invoiced', 'Faturado', 'green'], ['expired', 'Vencido', 'gold']];
export const estimateTabs = [['all', 'Todos'], ['draft', 'Rascunho'], ['sent', 'Enviado'], ['accepted', 'Aceito'], ['declined', 'Recusado'], ['invoiced', 'Faturado']];

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '';
const paragraphs = text => String(text || '').split(/\n{2,}/).map(part => `<p>${esc(part).replace(/\n/g, '<br>')}</p>`).join('');

/** An estimate as the client sees it: company, number and dates, client, items, total, notes and terms. */
export function renderEstimate(est, { company = '', contact = null, logo = '', selectable = false } = {}) {
  return `<article class="dc-sheet preview es-sheet">
    <header class="es-head">${logo ? `<img class="dc-logo" src="${esc(logo)}" alt="">` : ''}<div><p class="es-company">${esc(company)}</p><h1>${esc(est.title)}</h1></div>
      <dl class="es-meta"><div><dt>Orçamento</dt><dd>${esc(est.number)}</dd></div><div><dt>Emissão</dt><dd>${esc(day(est.issueDate))}</dd></div>
        ${est.expiresAt ? `<div><dt>Válido até</dt><dd>${esc(day(est.expiresAt))}</dd></div>` : ''}</dl></header>
    ${contact ? `<section class="es-client"><h2>Para</h2><p><b>${esc(contact.name)}</b>${contact.company ? `<br>${esc(contact.company)}` : ''}${contact.email ? `<br>${esc(contact.email)}` : ''}</p></section>` : ''}
    <section class="es-items">${productsHtml({ items: est.items || [] }, selectable) || '<p class="dc-placeholder">Nenhum item.</p>'}</section>
    ${est.notes ? `<section class="es-notes"><h2>Observações</h2>${paragraphs(est.notes)}</section>` : ''}
    ${est.terms ? `<section class="es-notes"><h2>Condições</h2>${paragraphs(est.terms)}</section>` : ''}</article>`;
}
