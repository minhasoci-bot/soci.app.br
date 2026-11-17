import { icon } from './icons.js';
import { h } from './screens.js';
import { studioTemplates, studioThemes } from './studio-data.js';

const templateName = key => studioTemplates.find(template => template[0] === key)?.[1] || 'Projeto';
const projectLink = (id,label) => `<a href="#studio/project/${id}" data-studio-open="${id}">${h(label)}</a>`;

function tile(c, project) {
  const pages = project.pages?.length || 1;
  return `<article class="studio-tile"><a class="studio-thumb theme-${project.theme}" href="#studio/project/${project.id}" data-studio-open="${project.id}" aria-label="Abrir ${h(project.name)}"><i></i><i></i><i></i></a>
    <div class="studio-tile-label"><div><h3>${projectLink(project.id,project.name)}</h3><p>${h(templateName(project.template))} · ${pages} página${pages === 1 ? '' : 's'}${project.publishedAt ? ' · <span class="studio-live">Publicado</span>' : ''}</p></div>
    <button class="icon-btn ${project.starred ? 'studio-selected-star' : ''}" data-studio-star="${project.id}" aria-label="${project.starred ? 'Remover dos favoritos' : 'Favoritar'} ${h(project.name)}" aria-pressed="${Boolean(project.starred)}">${icon('star',17)}</button></div></article>`;
}

function studioSections(view) {
  return `<nav class="studio-home-tabs" aria-label="Seções do AI Studio">${[['recent','Recentes'],['projects','Meus projetos'],['starred','Favoritos'],['templates','Modelos']].map(([id,label]) =>
    `<a href="#studio/${id}" ${view === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function home(c) {
  const view = c.tab || 'templates';
  const projects = [...c.s.studioProjects].sort((a,b) => String(b.viewedAt || b.created).localeCompare(a.viewedAt || a.created));
  const selected = studioTemplates.find(item => item[0] === c.studio.template);
  const prompt = `<section class="studio-hero"><div class="studio-hero-inner"><h1>Crie seu site</h1>
    <form class="studio-prompt" data-form="studio-create">
      <textarea name="brief" placeholder="Descreva o que você quer criar…" aria-label="Descreva o que você quer criar" required maxlength="4000">${h(c.studio.brief)}</textarea>
      <div class="studio-compose-actions"><label><span class="sr-only">Modelo</span><select name="template">${studioTemplates.map(([id,title]) =>
        `<option value="${id}" ${id === c.studio.template ? 'selected' : ''}>${h(title)}</option>`).join('')}</select></label>
        <div class="spacer"></div>${c.features?.studioAI ? `<button class="secondary" name="engine" value="starter">Usar modelo</button><button class="primary" name="engine" value="model">${icon('spark',16)} Gerar</button>` :
          `<button class="studio-create primary" name="engine" value="starter" aria-label="Criar a partir de um modelo" title="Criar a partir de um modelo">${icon('arrow',19)}</button>`}</div>
      ${c.features?.studioAI ? `<label class="studio-reference">${icon('external',14)}<span class="sr-only">Site de referência (opcional)</span><input name="reference" type="url" maxlength="500" placeholder="Site de referência para o layout (opcional), https://…" autocomplete="off"></label>` : '<p class="dim"><a class="text-link" href="#agency/settings/openai">Conecte sua chave da OpenAI</a> para gerar páginas com IA.</p>'}
      <p class="form-status" role="alert"></p></form>
    ${selected ? `<p class="studio-mode">${c.features?.studioAI ? 'Modelo' : 'Modelo local'} · ${h(selected[1])}</p>` : ''}</div></section>`;
  let main;
  if (view === 'templates') {
    main = `<div class="studio-tiles">${studioTemplates.map(([id,title,description],index) => `<button class="studio-tile studio-template" type="button" data-studio-template="${id}">
      <div class="studio-thumb theme-${studioThemes[index%studioThemes.length]}"><i></i><i></i><i></i></div>
      <div class="studio-tile-label"><div><h3>${h(title)}</h3><p>${h(description)}</p></div></div></button>`).join('')}</div>`;
  } else {
    const visible = projects.filter(project => (view !== 'starred' || project.starred) &&
      (!c.query || `${project.name} ${templateName(project.template)}`.toLowerCase().includes(c.query.toLowerCase())));
    main = `<label class="studio-search"><span class="sr-only">Buscar projetos</span><input id="page-search" value="${h(c.query)}" placeholder="Buscar projetos…"></label>` +
      (visible.length ? `<div class="studio-tiles">${visible.slice(0,view === 'recent' ? 12 : 60).map(project => tile(c,project)).join('')}</div>` :
        `<div class="studio-empty">${icon(view === 'starred' ? 'star' : 'folder',26)} <p>${view === 'starred' ? 'Nenhum projeto favorito' : 'Nenhum projeto encontrado'}</p></div>`);
  }
  return prompt + `<section class="studio-library">${studioSections(view)}${main}</section>`;
}

function workspaceRail(c) {
  const recent = c.s.studioProjects.slice().sort((a,b) => String(b.viewedAt).localeCompare(a.viewedAt)).slice(0,5);
  return `<aside class="studio-rail"><a href="#studio" class="studio-workspace"><span>${h(c.s.profile.name.charAt(0).toUpperCase())}</span><strong>${h(c.s.profile.name)}</strong></a>
    <nav aria-label="AI Studio"><a href="#studio" ${!c.tab || c.tab === 'templates' ? 'aria-current="page"' : ''}>${icon('grid',16)} Início</a>
      <p>Projetos</p><a href="#studio/projects" ${c.tab === 'projects' ? 'aria-current="page"' : ''}>${icon('folder',16)} Todos os projetos</a>
      <a href="#studio/starred" ${c.tab === 'starred' ? 'aria-current="page"' : ''}>${icon('star',16)} Favoritos</a>
      <p>Recentes</p>${recent.length ? recent.map(project => projectLink(project.id,project.name)).join('') : '<small>Nenhum projeto recente</small>'}</nav></aside>`;
}

function projectSections(project) {
  return `<div class="studio-preview theme-${h(project.theme)}"><div class="studio-preview-top"><div>${h(project.name)}</div><small>${h(templateName(project.template))}</small></div>
    <div class="studio-preview-hero"><h2>${h(project.headline)}</h2>${project.summary ? `<p>${h(project.summary)}</p>` : ''}</div>
    <div class="studio-preview-blocks">${project.blocks.map(item => `<section><h3>${h(item.title)}</h3>${item.body ? `<p>${h(item.body)}</p>` : ''}</section>`).join('')}</div></div>`;
}

export function exportStudioProject(project) {
  const colors = { indigo:'#eef0ff', forest:'#e7f5ee', amber:'#fff4dc', rose:'#fcebf0' };
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(project.name)}</title>
    <style>body{margin:0;font-family:system-ui,sans-serif;color:#182140;background:#f7f8fb}small{color:#596889}.studio-preview-top{display:flex;justify-content:space-between;gap:1em;padding:1.1rem;border-bottom:1px solid #e1e5f0;background:white}.studio-preview-hero{padding:clamp(2rem,8vw,6rem);background:${colors[project.theme]};text-align:center}.studio-preview-hero h2{font-size:clamp(2rem,6vw,4rem);margin:0}.studio-preview-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:2rem auto;max-width:1100px;padding:1rem}.studio-preview-blocks section{background:white;border-radius:12px;padding:1.5rem;box-shadow:0 1px 3px #0001}p{white-space:pre-wrap;overflow-wrap:anywhere}</style>
    <main>${projectSections(project)}</main></html>`;
}

export function studioBlock(item = { title:'', body:'' }) {
  return `<section class="studio-block"><label>Section title<input name="blockTitle" value="${h(item.title)}" required maxlength="100"></label>
    <label>Section content<textarea name="blockBody" maxlength="2200">${h(item.body)}</textarea></label>
    <button class="secondary" type="button" data-studio-remove-block>Remove section</button></section>`;
}

// ---- Site editor ---------------------------------------------------------------
// Pages are real HTML documents served by /studio-preview with a CSP that blocks scripts.
// Visual editing runs on the same-origin preview.

let env = null;
let selected = null, dirty = false;
const S = () => {
  const st = env.c.studio;
  st.log ??= []; st.device ??= 'desktop'; st.panel ??= 'ai'; st.visual ??= false; st.code ??= false;
  return st;
};
const devices = [['desktop','Desktop','monitor'],['tablet','Tablet','grid'],['mobile','Celular','mobile']];
const fmt = iso => iso ? new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(iso)) : '';

function pagesColumn(doc, page) {
  return `<aside class="sx-pages" aria-label="Páginas"><h2>Páginas</h2><ul>${doc.pages.map(item => `<li class="${item.id === page.id ? 'current' : ''}">
    <button class="sx-page" data-studio-page="${item.id}" aria-current="${item.id === page.id}">${icon('site',15)}<span>${h(item.name)}</span><small>/${item.slug === 'index' ? '' : h(item.slug)}</small></button>
    <span class="sx-page-tools"><button class="icon-btn" data-studio-rename-page="${item.id}" aria-label="Renomear ${h(item.name)}">${icon('edit',14)}</button>${item.slug === 'index' ? '' :
      `<button class="icon-btn" data-studio-delete-page="${item.id}" aria-label="Excluir ${h(item.name)}">${icon('trash',14)}</button>`}</span></li>`).join('')}</ul>
    <button class="secondary" data-studio-add-page ${doc.pages.length >= 8 ? 'disabled' : ''}>${icon('plus',15)} Adicionar página</button></aside>`;
}

function aiPanel(c) {
  const log = S().log.filter(item => item.project === S().project);
  return `<div class="sx-selection" id="sx-selection">${selectionHtml()}</div>
    <div class="sx-log" aria-live="polite">${log.length ? log.map(item => `<p class="sx-you">${h(item.ask)}</p><p class="sx-ai">${h(item.reply)}</p>`).join('') :
      `<p class="dim">Descreva uma alteração. Para editar uma parte específica, selecione um elemento no modo de edição visual.</p>`}</div>
    ${c.features?.studioAI ? `<form class="sx-ask" data-studio-form="revise"><label class="sr-only" for="sx-instruction">Alteração desejada</label><textarea id="sx-instruction" name="instruction" required maxlength="2000" placeholder="Peça à IA uma alteração nesta página…"></textarea>
      <p class="form-status" role="alert"></p><button class="primary">${icon('spark',15)} Aplicar com IA</button></form>`
      : '<p class="dim"><a class="text-link" href="#agency/settings/openai">Conecte sua chave da OpenAI</a> para aplicar alterações com IA. A edição visual e o código continuam disponíveis.</p>'}`;
}
function versionsPanel(doc) {
  return `<ol class="sx-versions">${doc.versions.map((version, index) => `<li><div><b>${h(version.label)}</b><small>${fmt(version.at)}${index === 0 ? ' · atual' : ''}</small></div>
    ${index === 0 ? '' : `<button class="secondary" data-studio-restore="${version.id}">Restaurar</button>`}</li>`).join('')}</ol>`;
}
function publishPanel(c, project, doc) {
  const live = `/s/${c.workspace}/${project.id}`;
  const leads = project.formId ? c.s.submissions.filter(item => item.formId === project.formId).length : 0;
  const stale = doc.published && doc.published.rev !== doc.rev;
  return `<div class="sx-publish"><p>${doc.published ? `<span class="badge green">Publicado</span> ${fmt(doc.published.at)}` : '<span class="badge">Rascunho</span>'}${stale ? ' <span class="badge gold">Alterações pendentes</span>' : ''}</p>
    <div class="inline-gap">${doc.published ? `<button class="primary" data-studio-publish="on" ${stale ? '' : 'disabled'}>Atualizar site</button><button class="secondary" data-studio-publish="off">Despublicar</button>`
      : '<button class="primary" data-studio-publish="on">Publicar</button>'}</div>
    ${doc.published ? `<label class="sx-live">Endereço do site<span><input readonly value="${h(location.origin + live)}" aria-label="Endereço do site"><a class="secondary" href="${live}" target="_blank" rel="noopener">${icon('external',14)} Abrir</a></span></label>` : ''}
    <p><b>${leads}</b> lead${leads === 1 ? '' : 's'} deste site. ${project.formId ? '<a class="text-link" href="#sites/submissions">Ver envios</a>' : 'Ao publicar, um formulário em Sites passa a receber os leads.'}</p>
    <p class="dim">Os envios do formulário criam contatos e acionam os fluxos com o gatilho “Formulário enviado”.</p></div>`;
}

function canvas(c, project, doc, page) {
  const st = S();
  if (st.code) return `<form class="sx-code" data-studio-form="code"><label class="sr-only" for="sx-code">HTML de ${h(page.name)}</label>
    <textarea id="sx-code" name="html" spellcheck="false" autocomplete="off">${h(page.html)}</textarea>
    <div class="inline-gap"><button class="primary">Aplicar código</button><span class="dim">Scripts e manipuladores de eventos são removidos ao salvar.</span></div><p class="form-status" role="alert"></p></form>`;
  return `${st.visual ? `<div class="sx-visualbar" role="status"><span>Clique para selecionar um elemento. Dê um clique duplo para editar o texto.</span><div class="spacer"></div>
      <button class="secondary" data-studio-discard disabled>Descartar</button><button class="primary" data-studio-save-visual disabled>Salvar alterações</button></div>` : ''}
    <div class="sx-frame-wrap device-${st.device}"><iframe id="studio-frame" title="Prévia de ${h(page.name)}" sandbox="allow-same-origin"
      src="/studio-preview/${c.workspace}/${project.id}/${page.id}?r=${doc.rev}"></iframe></div>`;
}

function editor(c, project) {
  const st = S();
  const doc = st.docFor === project.id ? st.doc : null;
  if (!doc) { queueMicrotask(() => env?.loadDoc(project.id)); return `<section class="studio-editor"><p class="dim">Abrindo ${h(project.name)}…</p></section>`; }
  const page = doc.pages.find(item => item.id === st.page) || doc.pages[0];
  st.page = page.id;
  const panel = st.panel || 'ai';
  return `<section class="studio-editor sx"><div class="studio-editor-head"><a href="#studio/projects" class="secondary">${icon('left',15)} Projetos</a>
    <h1>${h(project.name)}</h1>
    <div class="sx-devices" role="group" aria-label="Tamanho da prévia">${devices.map(([id,label,ico]) => `<button class="icon-btn" data-studio-device="${id}" aria-pressed="${st.device === id}" aria-label="${label}" title="${label}">${icon(ico,16)}</button>`).join('')}</div>
    <div class="spacer"></div>
    <button class="secondary" data-studio-visual aria-pressed="${st.visual}">${icon('edit',15)} Edição visual</button>
    <button class="secondary" data-studio-code aria-pressed="${st.code}">${icon('list',15)} Código</button>
    <button class="secondary" data-studio-star="${project.id}" aria-pressed="${Boolean(project.starred)}">${icon('star',16)} ${project.starred ? 'Favorito' : 'Favoritar'}</button>
    <button class="secondary" data-studio-download>${icon('download',16)} Exportar HTML</button></div>
    <div class="sx-columns">${pagesColumn(doc,page)}<div class="sx-canvas">${canvas(c,project,doc,page)}</div>
    <aside class="sx-panel"><div class="sx-tabs" role="tablist">${[['ai','IA'],['versions','Versões'],['publish','Publicação']].map(([id,label]) =>
      `<button role="tab" data-studio-panel="${id}" aria-selected="${panel === id}">${label}</button>`).join('')}</div>
      <div class="sx-panel-body">${panel === 'versions' ? versionsPanel(doc) : panel === 'publish' ? publishPanel(c,project,doc) : aiPanel(c)}</div></aside></div></section>`;
}

export function studio(c) {
  const project = c.tab === 'project' && c.s.studioProjects.find(item => item.id === c.studio.project);
  return `<div class="studio-shell"><section class="studio-main">${project ? editor(c,project) : home(c)}</section></div>`;
}

// ---- Editor behaviour -------------------------------------------------------------

const frame = () => document.getElementById('studio-frame');
const editStyle = '[data-go-hover]{outline:2px dashed #a00070!important;outline-offset:2px}[data-go-selected]{outline:3px solid #a00070!important;outline-offset:2px}[contenteditable]{cursor:text}';
function clean(node) {
  node.querySelectorAll('#go-edit-style').forEach(item => item.remove());
  for (const item of [node, ...node.querySelectorAll('[data-go-hover],[data-go-selected],[data-go-ready],[contenteditable]')]) {
    for (const name of ['data-go-hover','data-go-selected','data-go-ready','contenteditable']) item.removeAttribute?.(name);
  }
  return node;
}
const serialize = () => `<!doctype html>\n${clean(frame().contentDocument.documentElement.cloneNode(true)).outerHTML}`;
function selectionHtml() {
  if (!selected?.isConnected) return '';
  const text = selected.textContent.replace(/\s+/g,' ').trim().slice(0,70);
  return `<div class="sx-chip"><span><b>&lt;${h(selected.tagName.toLowerCase())}&gt;</b> ${h(text || 'elemento')}</span>
    <span class="inline-gap"><button class="secondary" data-studio-edit-text>Editar texto</button><button class="secondary" data-studio-remove-el>Excluir</button><button class="icon-btn" data-studio-unselect aria-label="Limpar seleção">${icon('close',14)}</button></span></div>`;
}
const showSelection = () => { const box = document.getElementById('sx-selection'); if (box) box.innerHTML = selectionHtml(); };
function select(element) {
  selected?.removeAttribute('data-go-selected');
  selected = element && !['HTML','BODY','HEAD'].includes(element.tagName) ? element : null;
  selected?.setAttribute('data-go-selected','');
  showSelection();
}
function setDirty(value) {
  dirty = value;
  for (const button of document.querySelectorAll('[data-studio-save-visual],[data-studio-discard]')) button.disabled = !value;
}
const preparedDocs = new WeakSet();
function prepareFrame() {
  const doc = frame()?.contentDocument;
  if (!doc?.body || preparedDocs.has(doc)) return;
  preparedDocs.add(doc);
  selected = null; setDirty(false); showSelection();
  doc.addEventListener('submit', event => event.preventDefault(), true);
  doc.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (link || event.target.closest('button,form')) event.preventDefault();
    if (!S().visual) {
      const slug = link?.getAttribute('href')?.match(/^page:([a-z0-9-]+)$/)?.[1];
      const target = slug && S().doc.pages.find(item => item.slug === slug);
      if (target) { S().page = target.id; env.render(); }
      return;
    }
    if (event.target.isContentEditable) return;
    select(event.target);
  }, true);
  if (!S().visual) return;
  const style = doc.createElement('style'); style.id = 'go-edit-style'; style.textContent = editStyle; doc.head.append(style);
  doc.addEventListener('mouseover', event => { if (event.target !== doc.body) event.target.setAttribute('data-go-hover',''); });
  doc.addEventListener('mouseout', event => event.target.removeAttribute?.('data-go-hover'));
  doc.addEventListener('dblclick', event => { event.preventDefault(); editText(event.target); });
  doc.addEventListener('input', () => setDirty(true));
}
function editText(element) {
  if (!element || ['HTML','BODY'].includes(element.tagName)) return;
  select(element);
  element.setAttribute('contenteditable','true');
  element.focus();
}
export function afterStudioRender() {
  const iframe = frame();
  if (!iframe) return;
  iframe.addEventListener('load', prepareFrame);
  if (iframe.contentDocument?.readyState === 'complete' && iframe.contentDocument.URL !== 'about:blank') prepareFrame();
}

function blocked() {
  if (!dirty) return false;
  env.flash('Salve ou descarte as alterações visuais primeiro.', true);
  return true;
}
function modal(title, body, form, submit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(title)}</h2></div><button class="icon-btn" aria-label="Close dialog" data-close-dialog>${icon('close',17)}</button></header>
    <form data-studio-form="${form}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-close-dialog>Cancel</button><button class="primary">${h(submit)}</button></footer></form></dialog>`;
  const dialog = document.getElementById('dialog'); dialog.showModal();
  dialog.addEventListener('cancel', event => { event.preventDefault(); overlay.innerHTML = ''; });
  let downTarget = null; dialog.addEventListener('mousedown', ev => { downTarget = ev.target; });
  dialog.addEventListener('click', ev => {
    if (ev.target === dialog && downTarget === dialog) {
      const r = dialog.getBoundingClientRect();
      if (ev.clientY < r.top || ev.clientY > r.bottom || ev.clientX < r.left || ev.clientX > r.right) closeModal();
    }
  });
  dialog.querySelector('input,textarea')?.focus();
}
const closeModal = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };

export function installStudio(environment) {
  env = environment;
  const { c, api, url, flash, render } = env;
  const currentPage = () => S().doc.pages.find(item => item.id === S().page);
  async function call(op, body) {
    const result = await api(url(`/api/studio/${op}`), { id: S().project, ...body });
    c.s = result.state; c.m = result.metrics;
    Object.assign(S(), { doc: result.doc, docFor: S().project });
    return result.result;
  }
  env.loadDoc = async projectId => {
    if (S().loading === projectId) return;
    S().loading = projectId;
    try {
      const { doc } = await api(`${url('/api/studio/doc')}&id=${encodeURIComponent(projectId)}`);
      if (S().project !== projectId) return;
      Object.assign(S(), { doc, docFor: projectId, page: doc.pages.some(item => item.id === S().page) ? S().page : doc.pages[0].id, visual: false, code: false });
      render();
    } catch (error) { flash(error.message, true); }
    finally { S().loading = ''; }
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || !button.closest('.sx, #dialog')) return;
    const d = button.dataset;
    try {
      if (d.studioDevice) { S().device = d.studioDevice; for (const b of document.querySelectorAll('[data-studio-device]')) b.setAttribute('aria-pressed', String(b === button));
        document.querySelector('.sx-frame-wrap')?.setAttribute('class', `sx-frame-wrap device-${d.studioDevice}`); return; }
      if ('studioVisual' in d) { if (blocked()) return; S().visual = !S().visual; S().code = false; render(); return; }
      if ('studioCode' in d) { if (blocked()) return; S().code = !S().code; S().visual = false; render(); return; }
      if (d.studioPanel) { S().panel = d.studioPanel; if (S().visual) { document.querySelectorAll('[data-studio-panel]').forEach(b => b.setAttribute('aria-selected', String(b === button)));
        document.querySelector('.sx-panel-body').innerHTML = d.studioPanel === 'versions' ? versionsPanel(S().doc) : d.studioPanel === 'publish' ? publishPanel(c, c.s.studioProjects.find(p => p.id === S().project), S().doc) : aiPanel(c); return; }
        render(); return; }
      if (d.studioPage) { if (blocked()) return; S().page = d.studioPage; render(); return; }
      if ('studioAddPage' in d) { if (blocked()) return;
        modal('Adicionar página', `<label>Nome da página<input name="name" required maxlength="60" placeholder="Sobre nós"></label><label>O que a página deve conter?<textarea name="description" maxlength="1500"></textarea></label>${c.features?.studioAI ? '<label class="check"><input type="checkbox" name="ai" checked> Gerar com IA no mesmo estilo da página inicial</label>' : ''}`, 'add-page', 'Adicionar página'); return; }
      if (d.studioRenamePage) { const page = S().doc.pages.find(item => item.id === d.studioRenamePage);
        modal('Renomear página', `<input type="hidden" name="pageId" value="${page.id}"><label>Nome da página<input name="name" required maxlength="60" value="${h(page.name)}"></label>`, 'rename-page', 'Renomear'); return; }
      if (d.studioDeletePage) { const page = S().doc.pages.find(item => item.id === d.studioDeletePage);
        modal('Excluir página?', `<input type="hidden" name="pageId" value="${page.id}"><p>“${h(page.name)}” será removida. Você pode restaurá-la em Versões.</p>`, 'delete-page', 'Excluir'); return; }
      if (d.studioRestore) { if (blocked()) return; await call('restore', { versionId: d.studioRestore }); render(); flash('Versão restaurada.'); return; }
      if (d.studioPublish) { if (blocked()) return; button.disabled = true; await call('publish', { publish: d.studioPublish === 'on' }); render(); flash(d.studioPublish === 'on' ? 'Site publicado.' : 'Site despublicado.'); return; }
      if ('studioDownload' in d) {
        const page = currentPage();
        const html = page.html.replace(/(href\s*=\s*["'])page:([a-z0-9-]+)(["'])/gi, (_, a, slug, b) => `${a}${slug}.html${b}`);
        const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); link.download = `${page.slug}.html`; link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000); return;
      }
      if ('studioEditText' in d) { editText(selected); return; }
      if ('studioRemoveEl' in d) { selected?.remove(); select(null); setDirty(true); return; }
      if ('studioUnselect' in d) { select(null); return; }
      if ('studioDiscard' in d) { setDirty(false); render(); return; }
      if ('studioSaveVisual' in d) { button.disabled = true; await call('save', { pageId: S().page, html: serialize(), label: 'Edição visual' }); setDirty(false); render(); flash('Alterações salvas.'); return; }
    } catch (error) { flash(error.message, true); render(); }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    const name = form.dataset?.studioForm;
    if (!name) return;
    event.preventDefault();
    if (form.dataset.pending) return;
    form.dataset.pending = '1';
    const status = form.querySelector('.form-status'), buttons = [...form.querySelectorAll('button')], data = Object.fromEntries(new FormData(form));
    buttons.forEach(b => { b.disabled = true; });
    if (status) status.textContent = '';
    try {
      if (name === 'revise') {
        const instruction = data.instruction.trim();
        const selection = selected?.isConnected ? clean(selected.cloneNode(true)).outerHTML : '';
        if (dirty) await call('save', { pageId: S().page, html: serialize(), label: 'Edição visual' });
        if (status) { status.classList.add('pending'); status.textContent = 'Aplicando a alteração…'; }
        const result = await call('revise', { pageId: S().page, instruction, selection });
        S().log.push({ project: S().project, ask: instruction, reply: result?.change || 'Concluído.' });
        setDirty(false); render(); flash('Página atualizada.');
      } else if (name === 'code') {
        await call('save', { pageId: S().page, html: data.html, label: 'Edição de código' }); render(); flash('Código aplicado.');
      } else if (name === 'add-page') {
        if (status && data.ai) { status.classList.add('pending'); status.textContent = 'Gerando a página…'; }
        const pageId = await call('page', { action: 'add', name: data.name, description: data.description, ai: Boolean(data.ai) });
        S().page = pageId; closeModal(); render(); flash('Página adicionada.');
      } else if (name === 'rename-page') {
        await call('page', { action: 'rename', pageId: data.pageId, name: data.name }); closeModal(); render(); flash('Página renomeada.');
      } else if (name === 'delete-page') {
        await call('page', { action: 'delete', pageId: data.pageId }); S().page = ''; closeModal(); render(); flash('Página excluída.');
      }
    } catch (error) {
      if (status) { status.classList.remove('pending'); status.textContent = error.message; } else flash(error.message, true);
    } finally {
      delete form.dataset.pending;
      if (form.isConnected) buttons.forEach(b => { b.disabled = false; });
    }
  });
  window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault(); });
}
