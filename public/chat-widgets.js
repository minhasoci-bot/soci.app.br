// Sites → Chat: library of chat widgets, the editor with a live preview, install code and insights.
import { icon } from './icons.js';
import { h, pageShell, utabs } from './screens.js';
import { siteTabs } from './forms.js';
import { chatCss, chatDefaults, chatPanel, chatTypes, fieldModes } from './chat-widget-data.js';

export const chatTabs = ['chat-widget', 'chat-insights', 'chat'];
const cw = { id: '', rev: '', draft: null, dirty: false, section: 'setup', panel: 'look', range: 30 };
let env = null;
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const typeName = type => chatTypes.find(([id]) => id === type)?.[1] || type;
const snippet = (c, widget) => `<script src="${location.origin}/chat/${c.workspace}/${widget.id}/widget.js" async></script>`;
const demoUrl = (c, widget) => `/chat/${c.workspace}/${widget.id}/demo`;

function stats(c, widget, days) {
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const sessions = (c.s.chatSessions || []).filter(row => (!widget || row.widgetId === widget.id) && row.created.slice(0, 10) >= since);
  const ids = new Set((widget ? [widget] : c.s.chatWidgets || []).map(row => row.id));
  const received = c.s.messages.filter(m => m.widgetId && ids.has(m.widgetId) && m.created.slice(0, 10) >= since).length;
  const answered = sessions.filter(session => c.s.messages.some(m => m.contactId === session.contactId && m.direction === 'Outbound' && m.created >= session.created)).length;
  return { sessions, received, answered };
}

function shell(c, body, cta = '') {
  return pageShell({ title: 'Sites', desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.', cta, className: 'sites-page cw-page',
    tabs: { key: 'sites', label: 'Seções de sites', current: 'chat-widget', items: siteTabs },
    content: utabs({ key: 'sites-chat-sub', nested: true, label: 'Chat', current: c.tab,
      items: [{ value: 'chat-widget', label: 'Biblioteca', href: '#sites/chat-widget' }, { value: 'chat-insights', label: 'Insights', href: '#sites/chat-insights' }], content: body }) });
}

function listView(c) {
  const widgets = [...(c.s.chatWidgets || [])].sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const button = `<button class="primary" data-cw-new>${icon('plus', 16)} Novo chat</button>`;
  const rows = widgets.map(widget => {
    const count = (c.s.chatSessions || []).filter(row => row.widgetId === widget.id).length;
    return `<tr><td><a class="site-name" href="#sites/chat/${widget.id}">${icon('chat', 16)}<span>${h(widget.name)}</span></a></td><td>${h(typeName(widget.type))}</td><td>${count}</td>
      <td>${when(widget.updated || widget.created)}</td><td>${widget.active ? badge('Publicado', 'green') : badge('Rascunho')}</td>
      <td class="site-row-actions">${widget.active ? `<a class="icon-btn" href="${demoUrl(c, widget)}" target="_blank" rel="noopener" title="Testar numa página de demonstração" aria-label="Testar ${h(widget.name)}">${icon('external', 15)}</a>` : ''}<a class="secondary site-open" href="#sites/chat/${widget.id}">Editar</a></td></tr>`;
  }).join('');
  return shell(c, rows ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Conversas</th><th scope="col">Atualizado</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="surface empty site-empty">${icon('chat', 26)}<strong>Nenhum chat ainda</strong><p>Coloque uma bolha de chat no seu site. As mensagens chegam em Conversas e as respostas voltam para o visitante.</p>${button}</div>`, button);
}

function insightsBlock(c, widget) {
  const { sessions, received, answered } = stats(c, widget, cw.range);
  const rate = sessions.length ? `${Math.round(answered / sessions.length * 100)}%` : '—';
  return `<div class="fm-range" role="group" aria-label="Período">${[7, 30, 90].map(days => `<button class="${cw.range === days ? 'selected' : ''}" aria-pressed="${cw.range === days}" data-cw-range="${days}">${days} dias</button>`).join('')}</div>
    <div class="metrics three"><div class="surface metric"><span>Conversas iniciadas</span><b>${sessions.length}</b></div><div class="surface metric"><span>Mensagens recebidas</span><b>${received}</b></div><div class="surface metric"><span>Conversas respondidas</span><b>${rate}</b></div></div>
    ${sessions.length ? `<div class="surface table-shell"><table class="site-table"><caption class="sr-only">Conversas recentes</caption><thead><tr><th scope="col">Início</th><th scope="col">Contato</th>${widget ? '' : '<th scope="col">Chat</th>'}<th scope="col">Mensagens</th><th scope="col">Página</th><th scope="col"><span class="sr-only">Abrir</span></th></tr></thead><tbody>
      ${[...sessions].reverse().slice(0, 50).map(session => { const contact = c.s.contacts.find(row => row.id === session.contactId); return `<tr><td>${when(session.created)}</td><td>${h(contact?.name || '—')}</td>${widget ? '' : `<td>${h(c.s.chatWidgets.find(row => row.id === session.widgetId)?.name || '—')}</td>`}<td>${session.messages}</td><td class="cw-page-cell">${h(session.page || '—')}</td><td><a class="text-link" href="#conversations" data-cw-thread="${session.contactId}">Abrir conversa</a></td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="surface empty"><strong>Nenhuma conversa no período</strong><p>Instale o chat e teste pela página de demonstração.</p></div>'}`;
}

/* ───────── Editor ───────── */

function loadDraft(c) {
  const widget = (c.s.chatWidgets || []).find(row => row.id === c.studio.project);
  if (!widget) return null;
  if (cw.id !== widget.id || (!cw.dirty && cw.rev !== (widget.updated || widget.created))) {
    if (cw.id !== widget.id) Object.assign(cw, { section: 'setup', panel: 'look' });
    Object.assign(cw, { id: widget.id, rev: widget.updated || widget.created, dirty: false, draft: { ...chatDefaults(), ...structuredClone(widget) } });
  }
  return widget;
}

const input = (key, label, value, extra = '') => `<label>${label}<input data-cw-set="${key}" value="${h(value)}"${extra}></label>`;
const area = (key, label, value, max) => `<label>${label}<textarea data-cw-set="${key}" rows="3" maxlength="${max}">${h(value)}</textarea></label>`;
const segment = (key, label, value, options) => `<fieldset class="cw-segment"><legend>${label}</legend>${options.map(([id, text]) => `<label><input type="radio" name="cw-${key}" data-cw-set="${key}" value="${id}"${value === id ? ' checked' : ''}> ${text}</label>`).join('')}</fieldset>`;

function settingsPanel() {
  const d = cw.draft;
  const tabsHtml = [['look', 'Tipo e aparência'], ['texts', 'Mensagens'], ['contact', 'Contato']].map(([id, label]) => `<button role="tab" aria-selected="${cw.panel === id}" data-cw-panel="${id}">${label}</button>`).join('');
  const body = cw.panel === 'texts' ? `
      ${input('prompt', 'Convite da bolha', d.prompt, ' maxlength="140" placeholder="Olá! Posso ajudar?"')}
      <label>Mostrar o convite após (segundos)<input type="number" min="0" max="120" data-cw-set="promptDelay" value="${d.promptDelay}"><small class="dim">0 desliga o convite.</small></label>
      ${area('welcome', 'Mensagem de boas-vindas', d.welcome, 400)}
      ${d.type === 'sms' ? area('thanks', 'Mensagem de agradecimento', d.thanks, 300) : ''}
      ${area('legal', 'Aviso legal', d.legal, 300)}`
    : cw.panel === 'contact' ? `
      <p class="dim">O contato é criado (ou encontrado) pelo e-mail ou telefone. Peça pelo menos um dos dois.</p>
      ${segment('askName', 'Nome', d.askName, fieldModes)}${segment('askEmail', 'E-mail', d.askEmail, fieldModes)}${segment('askPhone', 'Telefone', d.askPhone, fieldModes)}
      ${input('tags', 'Tags para adicionar ao contato', (d.tags || []).join(', '), ' maxlength="400" placeholder="chat-site"')}`
    : `
      ${input('name', 'Nome interno', d.name, ' maxlength="80"')}
      <fieldset class="cw-types"><legend>Tipo</legend>${chatTypes.map(([id, label, text]) => `<label class="fm-template"><input type="radio" name="cw-type" data-cw-set="type" value="${id}"${d.type === id ? ' checked' : ''}><span><b>${label}</b><small>${text}</small></span></label>`).join('')}</fieldset>
      <label>Cor<span class="fb-color"><input type="color" data-cw-set="color" value="${h(d.color)}"><code>${h(d.color)}</code></span></label>
      ${segment('position', 'Posição', d.position, [['right', 'Direita'], ['left', 'Esquerda']])}
      ${input('heading', 'Título', d.heading, ' maxlength="60"')}${input('subheading', 'Subtítulo', d.subheading, ' maxlength="120"')}${input('agentName', 'Nome de quem responde', d.agentName, ' maxlength="40"')}`;
  return `<aside class="surface cw-settings" aria-label="Configurações do chat"><div class="fb-palette-tabs cw-tabs" role="tablist">${tabsHtml}</div><div class="cw-settings-body">${body}</div></aside>`;
}

const previewDoc = d => `<!doctype html><html><head><meta charset="utf-8"><style>${chatCss(d.color)}</style></head><body>${chatPanel(d, { preview: true })}</body></html>`;
function previewHtml() {
  const d = cw.draft;
  return `<section class="cw-preview" aria-label="Prévia do chat" style="--cw:${h(d.color)}"><div class="cw-site ${d.position === 'left' ? 'left' : ''}">
    <div class="cw-site-lines" aria-hidden="true"><i></i><i></i><i></i></div>
    <iframe class="cw-frame" title="Prévia do painel do chat" sandbox="" srcdoc="${h(previewDoc(d))}"></iframe>
    ${d.prompt && d.promptDelay ? `<p class="cw-prompt" data-cw-prompt>${h(d.prompt)}</p>` : ''}
    <span class="cw-bubble" aria-hidden="true">${icon('chat', 26)}</span></div>
    <p class="dim cw-preview-note">Prévia com as alterações ainda não salvas. Para conversar de verdade, publique e use “Testar”.</p></section>`;
}

function installHtml(c, widget) {
  if (!widget.active) return `<div class="surface empty fb-integrate-off">${icon('lock', 24)}<strong>Publique o chat para instalar</strong><p>O código funciona depois de publicar. Enquanto for rascunho, o script não mostra nada.</p><button class="primary" data-cw-publish="on">Publicar chat</button></div>`;
  const code = snippet(c, widget);
  return `<div class="fb-settings"><section class="surface padded"><h2>${icon('site', 16)} Instalar no seu site</h2><p class="dim">Cole o código antes do fechamento de <code>&lt;/body&gt;</code> em todas as páginas onde o chat deve aparecer.</p>
      <textarea readonly rows="3" class="fb-code" aria-label="Código do chat">${h(code)}</textarea><div class="inline-gap"><button class="secondary" data-cw-copy="${h(code)}">Copiar código</button></div></section>
    <section class="surface padded"><h2>${icon('external', 16)} Testar</h2><p class="dim">Abre uma página de demonstração com o chat instalado. As mensagens chegam em Conversas, no canal “Chat ao vivo”.</p>
      <div class="inline-gap"><a class="primary" href="${demoUrl(c, widget)}" target="_blank" rel="noopener">Abrir página de teste</a><a class="secondary" href="#conversations">Ir para Conversas</a></div></section></div>`;
}

function editorView(c) {
  const widget = loadDraft(c);
  if (!widget) return `<div class="page sites-page"><div class="surface empty"><strong>Chat não encontrado</strong><p>Pode ter sido excluído.</p><a class="primary" href="#sites/chat-widget">Voltar aos chats</a></div></div>`;
  const d = cw.draft;
  const sections = [['setup', 'Configurar'], ['install', 'Instalar'], ['insights', 'Insights']];
  const body = cw.section === 'install' ? installHtml(c, widget) : cw.section === 'insights' ? `<div class="fb-results">${insightsBlock(c, widget)}</div>` : `<div class="cw-edit">${settingsPanel()}${previewHtml()}</div>`;
  return `<div class="fb dw-workspace cw-editor"><header class="fb-top dw-header"><a class="secondary fb-back" href="#sites/chat-widget">${icon('left', 15)} Chats</a>
      <div class="fb-title"><h1>${h(d.name)}</h1>${widget.active ? badge('Publicado', 'green') : badge('Rascunho')}${cw.dirty ? badge('Alterações não salvas', 'blue') : ''}</div>
      <div class="fb-top-actions">${widget.active ? `<a class="secondary" href="${demoUrl(c, widget)}" target="_blank" rel="noopener">${icon('external', 14)} Testar</a>` : ''}
        <button class="secondary" data-cw-publish="${widget.active ? 'off' : 'on'}">${widget.active ? 'Despublicar' : 'Publicar'}</button>
        <button class="primary" data-cw-save${cw.dirty ? '' : ' disabled'}>Salvar</button><button class="icon-btn" data-cw-delete aria-label="Excluir chat" title="Excluir chat">${icon('trash', 16)}</button></div></header>
    <nav class="fb-sections" aria-label="Seções do chat">${sections.map(([id, label]) => `<button class="${cw.section === id ? 'selected' : ''}" aria-current="${cw.section === id ? 'page' : 'false'}" data-cw-section="${id}">${label}</button>`).join('')}</nav>${body}</div>`;
}

export function chatScreen(c) {
  if (c.tab === 'chat') return editorView(c);
  if (c.tab === 'chat-insights') return shell(c, insightsBlock(c, null));
  return listView(c);
}

/* ───────── Ações ───────── */

function dialog(title, body, label, onSubmit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" class="site-dialog fm-dialog" aria-labelledby="cw-title"><header><div><h2 id="cw-title">${h(title)}</h2></div><button class="icon-btn" type="button" aria-label="Fechar" data-cw-close>${icon('close', 17)}</button></header>
    <form><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-cw-close>Cancelar</button><button class="primary">${h(label)}</button></footer></form></dialog>`;
  const el = document.getElementById('dialog');
  el.showModal(); el.querySelector('input:not([type=radio])')?.focus();
  el.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = el.querySelector('.form-status'), button = el.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try { await onSubmit(Object.fromEntries(new FormData(event.target))); close(); } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
const close = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };

export function installChat(environment) {
  env = environment;
  const { c, mutate, flash, render } = env;
  const inEditor = () => c.view === 'sites' && c.tab === 'chat';
  const current = () => (c.s.chatWidgets || []).find(row => row.id === cw.id);
  const touch = () => {
    if (cw.dirty) return;
    cw.dirty = true;
    const save = document.querySelector('[data-cw-save]'); if (save) save.disabled = false;
    document.querySelector('.cw-editor .fb-title')?.insertAdjacentHTML('beforeend', badge('Alterações não salvas', 'blue'));
  };
  let pending = 0;
  const repaint = () => { clearTimeout(pending); pending = setTimeout(() => { const box = document.querySelector('.cw-preview'); if (box) box.outerHTML = previewHtml(); }, 120); };
  const save = async (extra = {}) => { await mutate({ type: 'save', key: 'chatWidgets', id: cw.id, data: { ...cw.draft, ...extra } }); cw.dirty = false; cw.rev = ''; };

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-cw-new],[data-cw-close],[data-cw-range],[data-cw-panel],[data-cw-section],[data-cw-save],[data-cw-publish],[data-cw-delete],[data-cw-copy],[data-cw-thread]');
    if (!target || !(c.view === 'sites' || target.closest('#overlay'))) return;
    const d = target.dataset;
    try {
      if ('cwClose' in d) { close(); return; }
      if ('cwNew' in d) {
        dialog('Novo chat', `<label>Nome<input name="name" required maxlength="80" placeholder="Ex. Chat do site"></label>
          <fieldset class="fm-templates"><legend>Tipo</legend>${chatTypes.map(([id, label, text], index) => `<label class="fm-template"><input type="radio" name="type" value="${id}"${index ? '' : ' checked'}><span><b>${label}</b><small>${text}</small></span></label>`).join('')}</fieldset>`,
          'Criar chat', async data => {
            const id = await mutate({ type: 'save', key: 'chatWidgets', data: { ...chatDefaults(data.name?.trim() || 'Chat do site'), type: data.type } });
            Object.assign(cw, { id: '' });
            location.hash = `#sites/chat/${id}`; flash('Chat criado. Ajuste a aparência e publique.');
          });
        return;
      }
      if (d.cwRange) { cw.range = Number(d.cwRange); render(); return; }
      if (d.cwThread) { event.preventDefault(); c.thread = d.cwThread; location.hash = '#conversations'; return; }
      if (!inEditor()) return;
      if (d.cwPanel) { cw.panel = d.cwPanel; render(); document.querySelector(`[data-cw-panel="${d.cwPanel}"]`)?.focus(); return; }
      if (d.cwSection) { cw.section = d.cwSection; render(); return; }
      if (d.cwCopy) { await navigator.clipboard.writeText(d.cwCopy); flash('Código copiado.'); return; }
      if ('cwSave' in d) { target.disabled = true; await save(); render(); flash('Chat salvo.'); return; }
      if (d.cwPublish) { target.disabled = true; await save({ active: d.cwPublish === 'on' }); render(); flash(d.cwPublish === 'on' ? 'Chat publicado.' : 'Chat fora do ar.'); return; }
      if ('cwDelete' in d) {
        const widget = current();
        dialog('Excluir chat?', `<p>“${h(widget.name)}” deixa de aparecer nos sites onde foi instalado. As conversas já recebidas continuam em Conversas.</p>`, 'Excluir', async () => {
          await mutate({ type: 'delete', key: 'chatWidgets', id: widget.id });
          Object.assign(cw, { id: '', dirty: false, draft: null });
          location.hash = '#sites/chat-widget'; flash('Chat excluído.');
        });
      }
    } catch (error) { flash(error.message, true); render(); }
  });

  document.addEventListener('input', event => {
    const el = event.target;
    if (!inEditor() || !cw.draft || !el.dataset?.cwSet) return;
    const key = el.dataset.cwSet;
    cw.draft[key] = key === 'tags' ? el.value.split(',').map(tag => tag.trim()).filter(Boolean) : key === 'promptDelay' ? Number(el.value) : el.value;
    if (key === 'color') el.nextElementSibling.textContent = el.value;
    if (key === 'name') document.querySelector('.cw-editor .fb-title h1').textContent = el.value;
    touch();
    if (key === 'type') { render(); document.querySelector(`[data-cw-set="type"][value="${el.value}"]`)?.focus(); return; }
    repaint();
  });

  let last = location.hash;
  addEventListener('hashchange', () => {
    const was = last; last = location.hash;
    if (!cw.dirty || !was.startsWith(`#sites/chat/${cw.id}`) || location.hash.startsWith(`#sites/chat/${cw.id}`)) return;
    if (confirm('Descartar as alterações não salvas deste chat?')) { cw.dirty = false; cw.rev = ''; cw.id = ''; return; }
    last = was; history.replaceState(null, '', was); dispatchEvent(new HashChangeEvent('hashchange'));
  }, true);
}
