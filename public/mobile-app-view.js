// The agency's mobile app, drawn: the entry screen, the header, the tab bar, the "Mais" sheet and the Início screen.
// Pure HTML from plain data, shared by the app itself (mobile-shell.js), the install page (agency-mobile.mjs) and the
// preview in the agency's creator (agency-mobile.js), so the preview never drifts from the app. Painted only with the
// community theme (--cm-*); the styles are in mobile-app.css.
import { accentText, themeIsDark, themeMode, themeStyle } from './community-data.js';
import { icon } from './icons.js';
import { getLanguage, tr } from './i18n.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Where each module opens inside the platform, its name and its icon. */
export const mobileRoutes = { dashboard: 'dashboard', conversations: 'conversations', contacts: 'contacts', opportunities: 'opportunities', calendars: 'calendars', payments: 'payments', reputation: 'reputation' };
export const mobileLabels = { dashboard: 'Painel', conversations: 'Conversas', contacts: 'Contatos', opportunities: 'Oportunidades', calendars: 'Calendários', payments: 'Pagamentos', reputation: 'Avaliações' };
export const mobileIcons = { dashboard: 'grid', conversations: 'chat', contacts: 'contacts', opportunities: 'leads', calendars: 'cal', payments: 'pay', reputation: 'star' };
// The bar is narrow: the longest names get a shorter one there only.
const barLabels = { calendars: 'Agenda', opportunities: 'Negócios' };
const barLabel = item => item.key === 'conversations' && getLanguage() === 'es' ? 'Chats' : tr(barLabels[item.key] || item.label);
const homeTab = { key: 'home', label: 'Início', route: 'home', icon: 'home' };

/** The CSS variables of the app's theme in one mode ('light' | 'dark' | '' keeps the theme's own). */
export function appStyle(theme, mode = '') {
  const shown = themeMode(theme, mode);
  return `${themeStyle(shown)};--ma-link:${accentText(shown)};--ma-muted:color-mix(in srgb,var(--cm-font) 66%,var(--cm-background));color-scheme:${themeIsDark(shown) ? 'dark' : 'light'}`;
}

/** The tab bar holds four tabs (Início first, when it is on); the other modules go to the "Mais" sheet. */
export function barSplit(config, allowed = _route => true) {
  const modules = (config.modules || []).filter(module => allowed(module.route));
  const room = config.home === false ? 4 : 3;
  return { tabs: [...(config.home === false ? [] : [homeTab]), ...modules.slice(0, room)], more: modules.slice(room) };
}

const tile = (name, picture, cls = '') => `<span class="ma-tile${cls ? ` ${cls}` : ''}" aria-hidden="true">${picture ? `<img src="${h(picture)}" alt="">` : h((String(name || '').trim()[0] || 'A').toUpperCase())}</span>`;
const hue = name => [...String(name || '')].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
const initials = name => String(name || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || '').join('') || '·';
const face = name => `<span class="ma-avatar" style="--av:${hue(name)}" aria-hidden="true">${h(initials(name))}</span>`;

/** The install and sign-in screen; `installHtml` and `stepsHtml` are what depends on the phone. */
export function entryView({ name, phrase, icon: picture, cover, target = '#', installHtml = '', stepsHtml = '' }) {
  return `<main class="ma-entry"><div class="ma-entry-band">${cover ? `<img src="${h(cover)}" alt="">` : ''}</div>
    <div class="ma-entry-body">${tile(name, picture, 'ma-tile-lg')}
      <div class="ma-entry-title"><h1>${h(name)}</h1>${phrase ? `<p>${h(phrase)}</p>` : ''}</div>
      <div class="ma-entry-actions"><a class="ma-pill" href="${h(target)}">${h(tr('Entrar'))}</a>${installHtml}</div>${stepsHtml}</div></main>`;
}
/** How to put the app on the home screen, for one system. */
export const installSteps = (id, title, steps, hidden = false) => `<section class="ma-card ma-steps" id="${id}"${hidden ? ' hidden' : ''}><h2>${h(tr(title))}</h2><ol>${steps.map(step => `<li>${h(tr(step))}</li>`).join('')}</ol></section>`;
export const iosSteps = ['Toque em Compartilhar, na barra do Safari.', 'Escolha “Adicionar à Tela de Início”.'];
export const androidSteps = ['Abra o menu do Chrome, nos três pontos.', 'Toque em “Instalar app”.'];

/** The header: the app's identity, the sub-account, search, notifications and the account. */
export function headerView({ name, icon: picture, account, unread = 0, profile }) {
  const tool = (icn, label, attr, extra = '') => `<button type="button" class="ma-round" ${attr} aria-label="${h(label)}">${icon(icn, 18)}${extra}</button>`;
  return `<header class="ma-head"><span class="ma-id">${tile(name, picture)}<span class="ma-id-text"><strong>${h(name)}</strong><small>${h(account)}</small></span></span>
    ${tool('search', tr('Buscar'), 'data-act="search"')}
    ${tool('bell', unread ? `${tr('Notificações')} (${unread})` : tr('Notificações'), 'data-act="notifications"', unread ? '<i class="ma-dot"></i>' : '')}
    ${profile ? `<button type="button" class="ma-round ma-profile" ${profile.attr} aria-label="${h(profile.label)}">${profile.picture ? `<img src="${h(profile.picture)}" alt="">` : h(profile.text)}</button>` : ''}</header>`;
}

/** The tab bar; `current` is the open view. */
export function tabsView({ name, tabs, current, open = false }) {
  const tab = item => `<a href="#${h(item.route)}"${!open && item.route === current ? ' aria-current="page"' : ''}><span>${icon(item.icon, 21)}</span><b>${h(barLabel(item))}</b></a>`;
  const onTab = tabs.some(item => item.route === current);
  return `<nav class="ma-tabs" aria-label="${h(name)}">${tabs.map(tab).join('')}<button type="button" data-ma-more aria-haspopup="dialog" aria-expanded="${open}"${open || !onTab ? ' data-on' : ''}><span>${icon('menu', 21)}</span><b>${h(tr('Mais'))}</b></button></nav>`;
}

/** The "Mais" sheet. `push`: 'on' | 'off' | '' (not available). */
export function sheetView({ account, accountIcon = '', canSwitch = false, modules = [], links = [], push = 'off', dark = false, language = '', signOut = false, current = '' }) {
  const line = (icn, label, attr, end = '') => `<button type="button" class="ma-line" ${attr}>${icon(icn, 19)}<span>${h(tr(label))}</span>${end}</button>`;
  const toggle = on => `<i class="ma-switch${on ? ' on' : ''}" aria-hidden="true"></i>`;
  return `<div class="ma-veil" data-ma-veil><div class="ma-sheet" role="dialog" aria-modal="true" aria-label="${h(tr('Mais opções'))}" tabindex="-1"><div class="ma-sheet-grip" aria-hidden="true"></div>
    ${canSwitch ? `<button type="button" class="ma-card ma-account" data-act="workspaces" data-ma-close>${tile(account, accountIcon)}<span class="ma-id-text"><strong>${h(account)}</strong><small>${h(tr('Trocar de subconta'))}</small></span>${icon('updown', 18)}</button>`
      : `<div class="ma-card ma-account">${tile(account, accountIcon)}<span class="ma-id-text"><strong>${h(account)}</strong><small>${h(tr('Subconta'))}</small></span></div>`}
    ${modules.length ? `<div class="ma-grid">${modules.map(item => `<a href="#${h(item.route)}" data-ma-close${item.route === current ? ' aria-current="page"' : ''}>${icon(item.icon, 21)}<span>${h(tr(item.label))}</span></a>`).join('')}</div>` : ''}
    ${links.length ? `<div class="ma-card ma-lines">${links.map(item => `<a class="ma-line" href="${h(item.url)}" target="_blank" rel="noopener" data-ma-close>${icon('link', 19)}<span>${h(item.label)}</span>${icon('external', 16)}</a>`).join('')}</div>` : ''}
    <div class="ma-card ma-lines">${push ? line('bell', 'Notificações neste celular', `data-ma-push role="switch" aria-checked="${push === 'on'}"`, toggle(push === 'on')) : ''}
      ${line(dark ? 'sun' : 'moon', 'Modo escuro', `data-ma-mode role="switch" aria-checked="${dark}"`, toggle(dark))}
      ${language ? `<div class="ma-line">${icon('lang', 19)}<span>${h(tr('Idioma'))}</span>${language}</div>` : ''}
      ${signOut ? line('logout', 'Sair da conta', 'data-act="sign-out" data-ma-close') : ''}</div></div></div>`;
}

const greetings = { morning: 'Bom dia', afternoon: 'Boa tarde', night: 'Boa noite' };
const block = (title, action, body) => `<section class="ma-card ma-block"><header><h2>${h(tr(title))}</h2>${action}</header>${body}</section>`;
const more = (label, attr) => `<button type="button" class="ma-more" ${attr}>${h(tr(label))}</button>`;
const none = text => `<p class="ma-none">${h(tr(text))}</p>`;

/** The Início screen; `data` comes from homeData (mobile-home-data.js). */
export function homeView(data) {
  const can = key => data.blocks.includes(key);
  const chips = [can('replies') && `<button type="button" class="ma-chip" data-act="new-thread">${icon('chat', 16)}${h(tr('Nova conversa'))}</button>`,
    can('tasks') && `<button type="button" class="ma-chip" data-edit="contacts">${icon('plus', 16)}${h(tr('Contato'))}</button>`,
    can('agenda') && `<button type="button" class="ma-chip" data-edit="appointments">${icon('cal', 16)}${h(tr('Agendar'))}</button>`].filter(Boolean).join('');
  const replies = () => block('Precisa de resposta', more('Ver tudo', 'data-go="conversations"'), data.replies.length ? `<ul class="ma-list">${data.replies.map(row => `<li><button type="button" class="ma-row" data-thread="${h(row.id)}">${face(row.name)}<span class="ma-row-text"><b>${h(row.name)}</b><small>${h(row.text)}</small></span><em class="ma-tag">${h(row.ago)}</em></button></li>`).join('')}</ul>` : none('Nenhuma mensagem esperando resposta.'));
  const agenda = () => block('Hoje na agenda', more('Ver agenda', 'data-go="calendars"'), data.agenda.length ? `<ul class="ma-list">${data.agenda.map(row => `<li><button type="button" class="ma-row" data-edit="appointments" data-id="${h(row.id)}"><span class="ma-date"><small>${h(row.weekday)}</small><b>${h(row.day)}</b></span><span class="ma-row-text"><b>${h(row.title)}</b><small>${h(row.time)}${row.contact ? ` · ${h(row.contact)}` : ''}</small></span></button></li>`).join('')}</ul>` : none('Nada marcado para hoje.'));
  const tasks = () => block('Tarefas', `<a class="ma-more" href="#contacts/tasks">${h(tr('Ver tarefas'))}</a>`, data.tasks.length ? `<ul class="ma-list">${data.tasks.map(row => `<li class="ma-row"><button type="button" class="ma-check" data-task="${h(row.id)}" aria-label="${h(`${tr('Marcar como feita')}: ${row.title}`)}"></button><button type="button" class="ma-row-text" data-edit="tasks" data-id="${h(row.id)}"><b>${h(row.title)}</b>${row.contact ? `<small>${h(row.contact)}</small>` : ''}</button><em class="ma-tag${row.late ? ' ma-late' : ''}">${h(row.late ? tr('Atrasada') : tr('Hoje'))}</em></li>`).join('')}</ul>` : none('Nenhuma tarefa para hoje.'));
  const deals = () => block('Oportunidades abertas', more('Ver funil', 'data-go="opportunities"'), data.deals.count ? `<p class="ma-total"><b>${h(data.deals.value)}</b><small>${data.deals.count} ${h(tr('em andamento'))}</small></p>` : none('Nenhuma oportunidade aberta.'));
  const body = data.empty ? `<section class="ma-empty"><span>${icon('check', 20)}</span><h2>${h(tr('Tudo em dia'))}</h2><p>${h(tr('As mensagens, os agendamentos e as tarefas do dia aparecem aqui.'))}</p></section>`
    : [can('replies') && replies(), can('agenda') && agenda(), can('tasks') && tasks(), can('deals') && deals()].filter(Boolean).join('');
  return `<div class="ma-home"><h1>${h(tr(greetings[data.greeting]))}${data.name ? `, ${h(data.name)}` : ''}</h1>${chips ? `<div class="ma-chips">${chips}</div>` : ''}${body}</div>`;
}

/** Example data for the preview in the creator. */
export const sampleHome = () => ({ greeting: 'morning', name: 'Marina', blocks: ['replies', 'agenda', 'tasks', 'deals'], empty: false,
  replies: [{ id: '1', name: 'Ana Martins', text: 'Consigo remarcar para sexta?', ago: '9 min' }, { id: '2', name: 'Rafa Lima', text: 'Recebi o orçamento, obrigado', ago: '1 h' }],
  agenda: [{ id: '1', weekday: 'qua', day: '25', title: 'Avaliação inicial', time: '14:00', contact: 'Lia Costa' }],
  tasks: [{ id: '1', title: 'Enviar proposta', contact: 'Rafa Lima', late: false }], deals: { count: 6, value: 'R$ 8.400,00' } });
