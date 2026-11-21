// Faturas: the HTML of an invoice as the client sees it, shared by the server (public page /fatura) and the
// app (template and recurring invoice previews). No inline styles, so it runs under the public page's CSP.
import { productsHtml } from './document-render.js';
import { itemsSummary } from './document-data.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '';
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const paragraphs = text => String(text || '').split(/\n{2,}/).map(part => `<p>${esc(part).replace(/\n/g, '<br>')}</p>`).join('');
const sum = items => itemsSummary(items).total;

/**
 * An invoice: company, number and dates, client, items (or a single line when the value was edited by hand
 * and no longer matches the items), notes and terms.
 */
export function renderInvoice(inv, { company = '', contact = null, logo = '', label = 'Fatura', receiptTitle = 'Recibo' } = {}) {
  const items = (inv.items || []).map(item => ({ ...item, optional: false, selected: true }));
  const value = Number(inv.value ?? sum(items)) || 0;
  const list = items.length && Math.abs(sum(items) - value) < 0.005 ? items : [{ id: 'total', name: inv.title || label, qty: 1, price: value, discount: 0 }];
  return `<article class="dc-sheet preview es-sheet">
    <header class="es-head">${logo ? `<img class="dc-logo" src="${esc(logo)}" alt="">` : ''}<div><p class="es-company">${esc(company)}</p><h1>${esc(inv.title || label)}</h1></div>
      <dl class="es-meta">${inv.number ? `<div><dt>${esc(label)}</dt><dd>${esc(inv.number)}</dd></div>` : ''}${inv.issueDate ? `<div><dt>Emissão</dt><dd>${esc(day(inv.issueDate))}</dd></div>` : ''}
        ${inv.due ? `<div><dt>Vencimento</dt><dd>${esc(day(inv.due))}</dd></div>` : ''}</dl></header>
    ${contact ? `<section class="es-client"><h2>Para</h2><p><b>${esc(contact.name)}</b>${contact.company ? `<br>${esc(contact.company)}` : ''}${contact.email ? `<br>${esc(contact.email)}` : ''}</p></section>` : ''}
    <section class="es-items">${value > 0 || items.length ? productsHtml({ items: list }, false) : '<p class="dc-placeholder">Nenhum item.</p>'}</section>
    ${inv.notes ? `<section class="es-notes"><h2>Observações</h2>${paragraphs(inv.notes)}</section>` : ''}
    ${inv.terms ? `<section class="es-notes"><h2>Condições</h2>${paragraphs(inv.terms)}</section>` : ''}
    ${inv.status === 'Paid' ? `<p class="ds-paid">${inv.receiptNumber ? `${esc(receiptTitle)} ${esc(inv.receiptNumber)} · ` : ''}Paga${inv.paidAt ? ` em ${esc(day(inv.paidAt))}` : ''} · ${esc(brl(value))}</p>` : ''}</article>`;
}
