// soci sidebar, shared by the sub-account and agency shells.
// Collapsed it is a 64px icon rail with tooltips; expanded it adds labels and section headings.
import { icon as i } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const initials = s => String(s || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'G';

// Panel glyph: the inner rail grows when the menu is open and the chevron turns to point where it will go.
const panelIcon = `<svg class="panel-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3.5"/><rect class="pi-rail" x="6" y="7" width="4" height="10" rx="1.4" fill="currentColor" stroke="none"/><path class="pi-chev" d="M15.5 9.5 13 12l2.5 2.5"/></svg>`;

const item = ({ href, label, icon, current, external }) =>
  `<a class="nav-link${current ? ' current' : ''}" href="${esc(href)}" data-tip="${esc(label)}" aria-label="${esc(label)}"${current ? ' aria-current="page"' : ''}${external ? ' target="_blank" rel="noopener"' : ''}>${i(icon, 18)}<span class="side-text">${esc(label)}</span>${external ? `<span class="side-ext">${i('external', 13)}</span>` : ''}</a>`;

/**
 * @param {object} o
 * @param {string} o.label        aria-label of the aside
 * @param {string} o.home         href of the logo
 * @param {string} o.brand        brand name
 * @param {string} o.mark         logo markup (svg or img)
 * @param {{name:string, caption:string, attr:string, tip:string, logo?:string}} o.account
 * @param {string} o.toggle     data attribute of the collapse/expand action
 * @param {boolean} o.open      whether the sidebar is expanded
 * @param {{title:string, items:object[]}[]} o.groups
 * @param {object[]} o.footer
 */
export function sidebar(o) {
  const groups = o.groups.filter(g => g.items.length).map(g =>
    `<div class="side-group" role="group" aria-label="${esc(g.title)}"><p class="side-label" aria-hidden="true"><span class="side-text">${esc(g.title)}</span></p>${g.items.map(item).join('')}</div>`).join('');
  const action = o.open ? 'Recolher menu' : 'Expandir menu';
  const toggle = `<button type="button" class="side-toggle" ${o.toggle} aria-expanded="${o.open}" aria-label="${action}" aria-keyshortcuts="Control+B" data-tip="${action} · Ctrl B">${panelIcon}</button>`;
  const avatar = o.account.logo
    ? `<span class="side-avatar side-avatar-logo"><img src="${esc(o.account.logo)}" alt=""></span>`
    : `<span class="side-avatar">${esc(initials(o.account.name))}</span>`;
  return `<aside class="sidebar g-side" aria-label="${esc(o.label)}">
    <div class="side-head"><a class="logo" href="${esc(o.home)}" aria-label="${esc(o.brand)}">${o.mark}<span class="side-text side-word">${esc(o.brand)}</span></a>${toggle}</div>
    <button class="side-account" ${o.account.attr} data-tip="${esc(o.account.tip)}" aria-label="${esc(o.account.tip)}: ${esc(o.account.name)}">${avatar}<span class="side-text side-account-text"><b>${esc(o.account.name)}</b><small>${esc(o.account.caption)}</small></span><span class="side-text side-updown">${i('updown', 15)}</span></button>
    <nav class="side-nav" aria-label="Módulos">${groups}</nav>
    <div class="side-foot">${o.footer.map(item).join('')}</div>
  </aside>`;
}
