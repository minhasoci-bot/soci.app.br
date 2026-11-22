// Configurações → Apps (7.3): the apps the agency published for this sub-account, what each one does,
// installing and removing them, and the latest deliveries to the installed apps.
import { icon as i } from './icons.js';
import { tr } from './i18n.js';
import { h, pageShell } from './screens.js';
import { allTriggers } from './workflow-data.js';
import { appApiScopes, appMenuUrl } from './app-studio-data.js';

const state = { filter: 'all', busy: '' };
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';
const eventLabel = type => allTriggers.find(t => t.type === type)?.label || type;
const scopeLabel = scope => appApiScopes.find(([key]) => key === scope)?.[1] || scope;

function abilities(app) {
  const rows = [
    ...app.events.map(type => `${tr('Recebe o evento')} “${tr(eventLabel(type))}”`),
    ...app.actions.map(item => `${tr('Ação nos workflows:')} ${item.label}${item.description ? ` · ${item.description}` : ''}`),
    ...app.triggers.map(item => `${tr('Gatilho nos workflows:')} ${item.label}${item.description ? ` · ${item.description}` : ''}`),
    ...app.scopes.map(scope => `${tr('API:')} ${tr(scopeLabel(scope))}`),
    ...(app.menu ? [`${tr('Link no menu:')} ${app.menu.label}`] : [])
  ];
  return rows.length ? `<ul class="mk-abilities">${rows.map(row => `<li>${h(row)}</li>`).join('')}</ul>` : '';
}

export function appsScreen(c, tabs) {
  const catalog = c.agency?.apps || [], installed = c.s.appInstalls || [];
  const shell = content => pageShell({ title: 'Configurações', desc: 'Gerencie o workspace ativo.', tabs, content });
  const manage = c.access?.modules === null || c.access?.modules?.includes('settings');
  const list = state.filter === 'installed' ? catalog.filter(app => installed.some(row => row.appId === app.id)) : catalog;
  const card = app => {
    const mine = installed.find(row => row.appId === app.id);
    const busy = state.busy === app.id;
    const button = mine
      ? `${mine.menu ? `<a class="secondary" href="${h(appMenuUrl(mine.menu.url, c.workspace))}" target="_blank" rel="noopener">${i('external', 14)} ${h(mine.menu.label)}</a>` : ''}${manage ? `<button class="danger plain" data-mk="uninstall" data-id="${h(mine.installId)}" data-app="${h(app.id)}" ${busy ? 'disabled' : ''}>${h(tr(busy ? 'Desinstalando…' : 'Desinstalar'))}</button>` : ''}`
      : manage ? `<button class="primary" data-mk="install" data-app="${h(app.id)}" ${busy ? 'disabled' : ''}>${i('plus', 14)} ${h(tr(busy ? 'Instalando…' : 'Instalar'))}</button>` : '';
    return `<article class="surface padded mk-card"><header><span class="mk-icon" aria-hidden="true">${h(app.name.slice(0, 1).toUpperCase())}</span><div><h3>${h(app.name)}</h3><small class="dim">${h(tr(app.category))}${mine ? ` · <span class="badge green">${h(tr('Instalado'))}</span>` : ''}</small></div></header>
      ${app.tagline ? `<p>${h(app.tagline)}</p>` : ''}${app.description ? `<details><summary>${h(tr('Descrição'))}</summary><p class="dim">${h(app.description)}</p></details>` : ''}
      ${abilities(app)}${app.website ? `<a class="text-link" href="${h(app.website)}" target="_blank" rel="noopener">${h(tr('Site do desenvolvedor'))}</a>` : ''}
      <div class="inline-gap mk-actions">${button}</div></article>`;
  };
  const log = (c.s.appLog || []).slice(0, 20);
  return shell(`<section class="surface padded"><h2>${h(tr('Marketplace de apps'))}</h2><p class="dim">${h(tr('Apps que a sua agência publicou para esta conta. Ao instalar, o app passa a receber os dados descritos no cartão e pode ganhar ações e gatilhos nos seus workflows.'))}</p>
      <div class="inline-gap mk-filters" role="group" aria-label="${h(tr('Filtro'))}">${[['all', 'Todos os apps'], ['installed', 'Instalados']].map(([key, label]) => `<button class="${state.filter === key ? 'primary' : 'secondary'}" data-mk="filter" data-filter="${key}" aria-pressed="${state.filter === key}">${h(tr(label))}${key === 'installed' ? ` (${installed.length})` : ''}</button>`).join('')}</div></section>
    ${list.length ? `<div class="mk-grid">${list.map(card).join('')}</div>` : `<section class="surface padded"><p class="dim">${h(tr(state.filter === 'installed' ? 'Nenhum app instalado.' : 'A agência ainda não publicou apps para esta conta.'))}</p></section>`}
    ${log.length && manage ? `<section class="surface padded"><h2>${h(tr('Últimas entregas aos apps'))}</h2><div class="table-shell"><table><thead><tr><th scope="col">${h(tr('Quando'))}</th><th scope="col">App</th><th scope="col">${h(tr('O que aconteceu'))}</th></tr></thead><tbody>${log.map(row => `<tr><td>${h(when(row.at))}</td><td>${h(row.app)}</td><td>${h(row.text)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`);
}

export function installAppMarketplace({ c, api, url, flash, render }) {
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-mk]');
    if (!el || c.view !== 'settings' || c.tab !== 'apps') return;
    const kind = el.dataset.mk;
    if (kind === 'filter') { state.filter = el.dataset.filter; render(); return; }
    const app = (c.agency?.apps || []).find(row => row.id === el.dataset.app);
    if (kind === 'uninstall' && !window.confirm(`${tr('Desinstalar')} ${app?.name || 'o app'}? ${tr('O token do app deixa de valer e as ações dele nos workflows param.')}`)) return;
    state.busy = el.dataset.app; render();
    try {
      const workspace = c.workspace;
      const result = await api(url(`/api/apps/${kind}`), kind === 'install' ? { appId: el.dataset.app } : { installId: el.dataset.id });
      if (workspace === c.workspace) { c.s = result.state; if (c.agency?.apps) for (const row of c.agency.apps) if (row.id === el.dataset.app) row.installed = kind === 'install'; }
      flash(kind === 'install' ? `${app?.name || 'App'} ${tr('instalado.')}${result.delivery && !/^enviado/.test(result.delivery) && result.delivery !== 'sem webhook' ? ` ${tr('O aviso ao app falhou:')} ${result.delivery}` : ''}` : `${app?.name || 'App'} ${tr('desinstalado.')}`);
    } catch (error) { flash(error.message, true); }
    state.busy = ''; render();
  });
}
