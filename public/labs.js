// Configurações → Labs (7.2): the experimental features the agency offers to this sub-account.
import { h, pageShell } from './screens.js';
import { tr } from './i18n.js';
import { labCatalog, labOffered, labOn } from './labs-data.js';

export function labsScreen(c, tabs) {
  const offered = labCatalog.filter(([key]) => labOffered(c.s, key) !== 'off');
  const shell = content => pageShell({ title: 'Configurações', desc: 'Gerencie o workspace ativo.', tabs, content });
  const intro = `<section class="surface padded"><h2>${h(tr('Recursos experimentais (Labs)'))}</h2><p class="dim">${h(tr('Funcionalidades em teste que a sua agência liberou para esta conta. Podem mudar ou sair. Ligue só as que quiser experimentar.'))}</p></section>`;
  if (!offered.length) return shell(`${intro}<section class="surface padded"><p class="dim">${h(tr('A agência ainda não liberou nenhum recurso experimental para esta conta.'))}</p></section>`);
  return shell(`${intro}<div class="lb-list">${offered.map(([key, title, text, where]) => {
    const forced = labOffered(c.s, key) === 'all', on = labOn(c.s, key);
    return `<article class="surface padded lb-item"><div><h3>${h(tr(title))}</h3><p class="dim">${h(tr(text))}</p><small class="dim">${h(tr('Onde aparece:'))} ${h(tr(where))}</small></div>
      ${forced ? `<span class="badge blue">${h(tr('Ligado pela agência'))}</span>`
        : `<label class="ag-sw"><input type="checkbox" role="switch" data-lab="${key}" ${on ? 'checked' : ''} aria-label="${h(tr(title))}"><span aria-hidden="true"></span></label>`}</article>`;
  }).join('')}</div>`);
}

export function installLabs({ c, mutate, flash, render }) {
  document.addEventListener('change', async event => {
    const el = event.target.closest('[data-lab]');
    if (!el || c.view !== 'settings' || c.tab !== 'labs') return;
    el.disabled = true;
    try {
      await mutate({ type: 'labs-toggle', data: { key: el.dataset.lab, on: el.checked } });
      flash(el.checked ? 'Recurso experimental ligado.' : 'Recurso experimental desligado.');
    } catch (error) { flash(error.message, true); }
    render();
    document.querySelector(`[data-lab="${el.dataset.lab}"]`)?.focus();
  });
}
