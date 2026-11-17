// soci header, shared by the sub-account and agency shells.
// Left: breadcrumb. Right: global search (Ctrl K), quick actions, one grouped toolbar,
// the theme toggle and the profile. The sidebar toggle lives in the sidebar itself.
import { icon as i } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const themeToggle = () =>
  `<button type="button" class="theme-toggle" data-theme-toggle data-tip="Alternar tema" data-tip-pos="bottom" aria-label="Alternar entre tema claro e escuro"><span class="tt-sun">${i('sun', 17)}</span><span class="tt-moon">${i('moon', 17)}</span></button>`;

/**
 * @param {object} o
 * @param {{label:string, href?:string}[]} o.crumbs
 * @param {string} [o.search]  attribute that opens search
 * @param {string} [o.quick]   attribute that opens quick actions
 * @param {{icon:string,label:string,attr:string,dot?:boolean}[]} [o.tools]
 * @param {string} [o.extra]   extra markup placed before the toolbar
 * @param {{text:string,label:string,attr:string,picture?:string}} [o.profile]
 */
export function topbar(o) {
  const crumbs = o.crumbs.filter(c => c.label).map((c, k, all) => k === all.length - 1
    ? `<span class="crumb-current" aria-current="page">${esc(c.label)}</span>`
    : `${c.href ? `<a class="crumb" href="${esc(c.href)}">${esc(c.label)}</a>` : `<span class="crumb">${esc(c.label)}</span>`}<span class="crumb-sep" aria-hidden="true">/</span>`).join('');
  const tools = (o.tools || []).map(t => `<button type="button" class="tool-btn" ${t.attr} data-tip="${esc(t.label)}" data-tip-pos="bottom" aria-label="${esc(t.label)}">${i(t.icon, 17)}${t.dot ? '<span class="tool-dot" aria-hidden="true"></span>' : ''}</button>`).join('');
  return `<header class="topbar g-top">
    <nav class="crumbs" aria-label="Você está em">${crumbs}</nav>
    <div class="spacer"></div>
    ${o.search ? `<button type="button" class="top-search" ${o.search} aria-label="Buscar no workspace" aria-keyshortcuts="Control+K">${i('search', 15)}<span>Buscar módulos e contatos…</span><kbd>Ctrl K</kbd></button>` : ''}
    ${o.quick ? `<button type="button" class="top-quick" ${o.quick} data-tip="Ações rápidas" data-tip-pos="bottom" aria-label="Ações rápidas">${i('bolt', 16)}</button>` : ''}
    ${o.extra || ''}
    ${tools ? `<div class="tool-group" role="group" aria-label="Ferramentas">${tools}</div>` : ''}
    ${themeToggle()}
    ${o.profile ? `<button type="button" class="avatar avatar-pink top-profile" ${o.profile.attr} data-tip="${esc(o.profile.label)}" data-tip-pos="bottom" aria-label="${esc(o.profile.label)}">${o.profile.picture ? `<img src="${esc(o.profile.picture)}" alt="">` : esc(o.profile.text)}</button>` : ''}
  </header>`;
}
