// Configurações → Conectores (T.2): the apps of the catalog. Connect with the app's key (checked and kept sealed on
// the server), see the webhook URL for the instant triggers, and disconnect. Their triggers and actions show up in
// the workflow editor in the "Apps · <nome>" groups.
import { icon as i } from './icons.js';
import { tr } from './i18n.js';
import { connectors } from './connectors-data.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const googleFormsScript = url => `function onFormSubmit(e) {
  var r = {};
  e.response.getItemResponses().forEach(function (item) { r[item.getItem().getTitle()] = item.getResponse(); });
  UrlFetchApp.fetch('${url}', { method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ form: FormApp.getActiveForm().getTitle(), email: e.response.getRespondentEmail(), responses: r }) });
}`;

function card(c, def, row) {
  const on = row?.connected;
  const field = f => f.kind === 'textarea'
    ? `<label>${h(tr(f.label))}<textarea name="${h(f.key)}" rows="3" ${f.required ? 'required' : ''} autocomplete="off" spellcheck="false"></textarea></label>`
    : `<label>${h(tr(f.label))}<input name="${h(f.key)}" type="${f.kind === 'password' ? 'password' : 'text'}" ${f.required ? 'required' : ''} autocomplete="off"></label>`;
  const counts = [def.triggers.length && `${def.triggers.length} ${tr(def.triggers.length > 1 ? 'gatilhos' : 'gatilho')}`, def.actions.length && `${def.actions.length} ${tr(def.actions.length > 1 ? 'ações' : 'ação')}`].filter(Boolean).join(' · ');
  return `<article class="surface padded connector-card${on ? ' is-connected' : ''}">
    <div class="inline-gap"><b>${h(def.name)}</b>${on ? `<span class="badge green">${h(tr('Conectado'))}</span>` : ''}<div class="spacer"></div><span class="dim">${h(counts)}</span></div>
    ${on && row.account ? `<p class="dim">${h(row.account)}</p>` : ''}
    <details ${on ? '' : ''}><summary>${h(tr(on ? 'Detalhes e reconectar' : def.auth.length ? 'Conectar' : 'Ativar'))}</summary>
      <p class="dim">${h(tr(def.help || ''))}</p>
      ${on && row.hookUrl ? `<div class="inline-gap"><code class="connector-hook">${h(row.hookUrl)}</code><button type="button" class="secondary" data-act="connector-copy" data-connector-value="${h(row.hookUrl)}">${i('copy', 14)} ${h(tr('Copiar URL'))}</button></div>` : ''}
      ${on && def.id === 'google_forms' && row.hookUrl ? `<p class="dim">${h(tr('Apps Script do formulário (Extensões → Apps Script), com o acionador "Ao enviar formulário":'))}</p><pre class="connector-script">${h(googleFormsScript(row.hookUrl))}</pre>` : ''}
      <form class="settings-form" data-form="connector-connect"><input type="hidden" name="connectorId" value="${h(def.id)}">${def.auth.map(field).join('')}
        <div class="inline-gap"><button class="primary">${h(tr(on ? 'Salvar e conectar de novo' : def.auth.length ? 'Conectar' : 'Gerar URL do webhook'))}</button>
        ${on ? `<button type="button" class="secondary" data-act="connector-disconnect" data-connector-id="${h(def.id)}">${h(tr('Desconectar'))}</button>` : ''}</div><p class="form-status" role="alert"></p></form>
    </details></article>`;
}

export function connectorsView(c) {
  const status = c.connectorStatus;
  if (!status) return `<div class="surface padded"><h2>${h(tr('Conectores'))}</h2><p class="dim">${h(tr('Carregando…'))}</p></div>`;
  if (status.error) return `<div class="surface padded"><h2>${h(tr('Conectores'))}</h2><p class="form-status">${h(status.error)}</p><button class="secondary" data-act="connectors-refresh">${h(tr('Tentar novamente'))}</button></div>`;
  const q = String(c.connectorQuery || '').toLowerCase();
  const shown = connectors.filter(def => !q || `${def.name} ${def.category}`.toLowerCase().includes(q));
  const categories = [...new Set(shown.map(def => def.category))];
  const connected = connectors.filter(def => status.connectors[def.id]?.connected).length;
  return `<div class="surface padded"><h2>${h(tr('Conectores'))}</h2>
    <p class="dim">${h(tr('Apps com gatilhos e ações próprios nos fluxos (grupos "Apps" no editor). As chaves ficam guardadas cifradas no servidor e nunca voltam para o navegador.'))} ${h(tr('Conectados'))}: ${connected} ${h(tr('de'))} ${connectors.length}.</p>
    <label class="search-field"><input type="search" data-connector-search value="${h(c.connectorQuery || '')}" placeholder="${h(tr('Buscar app…'))}" aria-label="${h(tr('Buscar app'))}"></label></div>
    ${categories.map(category => `<h3 class="connector-group">${h(tr(category))}</h3><div class="card-grid">${shown.filter(def => def.category === category).map(def => card(c, def, status.connectors[def.id])).join('')}</div>`).join('')}`;
}
