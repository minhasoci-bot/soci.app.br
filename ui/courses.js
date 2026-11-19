// Courses admin: the product list (Cursos tab) and the course builder (modules, lessons, details).
import { icon } from './icons.js';
import { h, fmt, pageShell, search } from './screens.js';
import { portalTabs } from './client-portal.js';
import { tr } from './i18n.js';

const kinds = [['text','Texto','note'],['video','Vídeo','play'],['file','Arquivo','paperclip']];
const sorts = [['newest','Mais recentes'],['oldest','Mais antigos'],['az','Nome: A a Z'],['za','Nome: Z a A']];
const statuses = [['all','Todos'],['published','Publicados'],['draft','Rascunhos']];
const list = { sort: 'newest', status: 'all' };
const drafts = new Map();
const newId = () => crypto.randomUUID();

// Mirrors course-model.mjs: older single-lesson courses open as one module.
export function outline(course) {
  if (Array.isArray(course.modules) && course.modules.length) return course.modules;
  return [{ id: `${course.id}-m1`, title: 'Módulo 1', lessons: [{ id: `${course.id}-l1`, title: course.lesson || course.name || 'Aula 1',
    kind: 'text', body: course.body || '', videoUrl: '', fileId: '', dripDays: 0 }] }];
}
const lessons = course => outline(course).flatMap(module => module.lessons);
const coverOf = (c, course) => c.s.files.find(file => file.id === course.coverFileId && file.data.startsWith('data:image/'))?.data || '';
const builderId = () => location.hash.split('/')[1] === 'course' ? decodeURIComponent(location.hash.split('/')[2] || '') : '';
const shell = (c, content, cta = '') => pageShell({ title: 'Assinaturas', desc: 'Gerencie o portal do cliente, permissões de acesso e cursos deste workspace.',
  className: 'cp-admin', cta, tabs: { key: 'memberships', items: portalTabs(), current: 'courses', label: 'Seções de assinaturas' }, content });
const status = course => course.active ? '<span class="badge green">Publicado</span>' : '<span class="badge">Rascunho</span>';

function productList(c) {
  const query = (c.query || '').trim().toLocaleLowerCase('pt-BR');
  const rows = c.s.courses.filter(course => (list.status === 'all' || (list.status === 'published') === Boolean(course.active))
    && (!query || `${course.name} ${course.description || ''}`.toLocaleLowerCase('pt-BR').includes(query)));
  const stamp = course => course.updated || course.created || '';
  rows.sort((a, b) => list.sort === 'az' ? a.name.localeCompare(b.name, 'pt-BR') : list.sort === 'za' ? b.name.localeCompare(a.name, 'pt-BR')
    : list.sort === 'oldest' ? stamp(a).localeCompare(stamp(b)) : stamp(b).localeCompare(stamp(a)));
  const select = (name, options, value, label) => `<label class="co-select"><span class="sr-only">${label}</span><select data-co-filter="${name}" aria-label="${label}">
    ${options.map(([v, text]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  return shell(c, `<div class="cp-section-title"><div><h2>Cursos</h2><p>Crie cursos com módulos e aulas e libere o acesso no portal do cliente.</p></div>
      <button type="button" class="primary" data-co="create">${icon('plus',16)} Criar curso</button></div>
    <div class="co-toolbar">${search(c.query,'Buscar cursos')}${select('sort',sorts,list.sort,'Ordenar por')}${select('status',statuses,list.status,'Situação')}
      <span class="co-count">${c.s.courses.length} ${c.s.courses.length === 1 ? 'curso' : 'cursos'}</span></div>
    ${rows.length ? `<div class="co-grid">${rows.map(course => {
      const modules = outline(course), count = lessons(course).length, cover = coverOf(c, course);
      return `<article class="co-card">
        <a class="co-cover" href="#memberships/course/${encodeURIComponent(course.id)}" aria-label="Editar ${h(course.name)}">${cover ? `<img src="${h(cover)}" alt="">` : `<span>${icon('book',30)}</span>`}</a>
        <div class="co-card-body"><div class="co-card-top">${status(course)}
          <details class="co-menu"><summary class="icon-btn" aria-label="Ações de ${h(course.name)}" title="Ações">${icon('dots',17)}</summary>
            <div class="co-menu-list" role="menu">
              <button type="button" role="menuitem" data-co="publish" data-id="${h(course.id)}">${icon(course.active ? 'lock' : 'check',15)} ${course.active ? 'Voltar para rascunho' : 'Publicar'}</button>
              <button type="button" role="menuitem" data-co="duplicate" data-id="${h(course.id)}">${icon('copy',15)} Duplicar</button>
              <button type="button" role="menuitem" class="danger-text" data-co="delete" data-id="${h(course.id)}">${icon('trash',15)} Excluir</button></div></details></div>
          <h3><a href="#memberships/course/${encodeURIComponent(course.id)}">${h(course.name)}</a></h3>
          ${course.description ? `<p>${h(course.description)}</p>` : ''}
          <small>${modules.length} ${modules.length === 1 ? 'módulo' : 'módulos'} · ${count} ${count === 1 ? 'aula' : 'aulas'} · atualizado em ${h(fmt(course.updated || course.created, c.s.profile.timezone))}</small>
          <div class="co-card-actions"><a class="secondary" href="#memberships/course/${encodeURIComponent(course.id)}">${icon('edit',15)} Editar curso</a>
          ${course.active && course.portalOnly === false ? `<a class="text-link" href="/course/${encodeURIComponent(c.workspace)}/${encodeURIComponent(course.id)}" target="_blank" rel="noopener">${icon('external',14)} Aula pública</a>` : ''}</div></div></article>`;
    }).join('')}</div>` : `<div class="co-empty">${icon('book',28)}<strong>${query || list.status !== 'all' ? 'Nenhum curso encontrado' : 'Crie seu primeiro curso'}</strong>
      <p>${query || list.status !== 'all' ? 'Tente outra busca ou outro filtro.' : 'Organize o conteúdo em módulos e aulas com vídeo, texto ou arquivos da Mídia Drive.'}</p>
      ${query || list.status !== 'all' ? '' : `<button type="button" class="primary" data-co="create">${icon('plus',16)} Criar curso</button>`}</div>`}`);
}

function draftOf(c, id) {
  const course = c.s.courses.find(row => row.id === id);
  if (!course) return null;
  const stamp = course.updated || course.created || '';
  let entry = drafts.get(id);
  if (!entry || (!entry.dirty && entry.stamp !== stamp)) {
    entry = { stamp, dirty: false, sel: entry?.sel || { type: 'details' }, draft: {
      name: course.name, description: course.description || '', coverFileId: course.coverFileId || '', active: Boolean(course.active),
      portalOnly: course.portalOnly !== false, modules: structuredClone(outline(course)) } };
    drafts.set(id, entry);
  }
  return entry;
}

const findModule = (draft, id) => draft.modules.find(module => module.id === id);
const findLesson = (draft, id) => { for (const module of draft.modules) { const lesson = module.lessons.find(row => row.id === id); if (lesson) return { module, lesson }; } return {}; };

function editorPanel(c, entry) {
  const { draft, sel } = entry;
  if (sel.type === 'module') {
    const module = findModule(draft, sel.id);
    if (module) return `<h2>Módulo</h2><label>Título do módulo<input data-co-set="module.title" value="${h(module.title)}" maxlength="160" required></label>
      <p class="co-hint">${module.lessons.length} ${module.lessons.length === 1 ? 'aula' : 'aulas'} neste módulo.</p>
      <div class="co-panel-actions"><button type="button" class="secondary" data-co="add-lesson" data-id="${h(module.id)}">${icon('plus',15)} Adicionar aula</button>
      <button type="button" class="danger plain" data-co="remove-module" data-id="${h(module.id)}">${icon('trash',15)} Excluir módulo</button></div>`;
  }
  if (sel.type === 'lesson') {
    const { lesson } = findLesson(draft, sel.id);
    if (lesson) {
      const files = c.s.files.filter(file => !file.trashedAt);
      return `<h2>Aula</h2><label>Título da aula<input data-co-set="lesson.title" value="${h(lesson.title)}" maxlength="160" required></label>
        <fieldset class="co-kinds"><legend>Tipo de aula</legend>${kinds.map(([value, label, glyph]) => `<label><input type="radio" name="co-kind" data-co-set="lesson.kind" value="${value}" ${lesson.kind === value ? 'checked' : ''}><span>${icon(glyph,15)} ${label}</span></label>`).join('')}</fieldset>
        ${lesson.kind === 'video' ? `<label>Link do vídeo<input type="url" data-co-set="lesson.videoUrl" value="${h(lesson.videoUrl || '')}" placeholder="https://youtu.be/…" maxlength="500"></label>
          <p class="co-hint">YouTube, Vimeo e Loom aparecem com o player deles. Links diretos para .mp4 ou .webm tocam no próprio portal.</p>` : ''}
        ${lesson.kind === 'file' ? `<label>Arquivo da Mídia Drive<select data-co-set="lesson.fileId"><option value="">Escolha um arquivo</option>
          ${files.map(file => `<option value="${h(file.id)}" ${file.id === lesson.fileId ? 'selected' : ''}>${h(file.name)}</option>`).join('')}</select></label>
          ${files.length ? '' : '<p class="co-hint">Envie o material na <a class="text-link" href="#media">Mídia Drive</a> primeiro.</p>'}` : ''}
        <label>${lesson.kind === 'text' ? 'Conteúdo da aula' : 'Texto de apoio (opcional)'}<textarea data-co-set="lesson.body" rows="${lesson.kind === 'text' ? 12 : 5}" maxlength="20000">${h(lesson.body || '')}</textarea></label>
        <label class="co-drip">Liberar <input type="number" min="0" max="365" step="1" data-co-set="lesson.dripDays" value="${Number(lesson.dripDays || 0)}"> dias depois que o aluno recebe acesso ao curso</label>
        <p class="co-hint">Use 0 para liberar imediatamente.</p>
        <div class="co-panel-actions"><button type="button" class="danger plain" data-co="remove-lesson" data-id="${h(lesson.id)}">${icon('trash',15)} Excluir aula</button></div>`;
    }
  }
  const images = c.s.files.filter(file => file.data.startsWith('data:image/') && !file.trashedAt);
  const cover = images.find(file => file.id === draft.coverFileId)?.data;
  return `<h2>Detalhes do curso</h2><label>Nome do curso<input data-co-set="course.name" value="${h(draft.name)}" maxlength="160" required></label>
    <label>Descrição<textarea data-co-set="course.description" rows="4" maxlength="2500">${h(draft.description)}</textarea></label>
    <div class="co-cover-field"><span class="co-cover-preview">${cover ? `<img src="${h(cover)}" alt="">` : icon('book',24)}</span>
      <label>Capa (imagem da Mídia Drive)<select data-co-set="course.coverFileId"><option value="">Sem capa</option>
        ${images.map(file => `<option value="${h(file.id)}" ${file.id === draft.coverFileId ? 'selected' : ''}>${h(file.name)}</option>`).join('')}</select></label></div>
    <fieldset class="co-kinds"><legend>Situação</legend>
      <label><input type="radio" name="co-status" data-co-set="course.active" value="" ${draft.active ? '' : 'checked'}><span>Rascunho</span></label>
      <label><input type="radio" name="co-status" data-co-set="course.active" value="1" ${draft.active ? 'checked' : ''}><span>Publicado</span></label></fieldset>
    <p class="co-hint">Cursos publicados aparecem no portal para os clientes com acesso. Libere o acesso na aba <a class="text-link" href="#memberships/portal-members">Clientes</a>.</p>
    <label class="cp-checkbox co-check"><input type="checkbox" data-co-set="course.public" ${draft.portalOnly ? '' : 'checked'}>
      <span>Também mostrar a primeira aula em uma página pública<small>Útil como aula gratuita de apresentação.</small></span></label>`;
}

function outlinePanel(entry) {
  const { draft, sel } = entry;
  const current = (type, id) => sel.type === type && (type === 'details' || sel.id === id) ? 'aria-current="true"' : '';
  const kindIcon = kind => kinds.find(([value]) => value === kind)?.[2] || 'note';
  return `<button type="button" class="co-node co-details" data-co="select" data-type="details" ${current('details')}>${icon('gear',15)} Detalhes do curso</button>
    ${draft.modules.map((module, m) => `<section class="co-module">
      <div class="co-module-head"><button type="button" class="co-node" data-co="select" data-type="module" data-id="${h(module.id)}" ${current('module', module.id)}>
        <span class="co-index">${m + 1}</span><strong>${h(module.title || 'Módulo sem título')}</strong></button>
        <span class="co-move"><button type="button" class="icon-btn" data-co="module-up" data-id="${h(module.id)}" aria-label="Subir módulo ${h(module.title)}" ${m ? '' : 'disabled'}>${icon('chevron',14)}</button>
        <button type="button" class="icon-btn co-down" data-co="module-down" data-id="${h(module.id)}" aria-label="Descer módulo ${h(module.title)}" ${m < draft.modules.length - 1 ? '' : 'disabled'}>${icon('chevron',14)}</button></span></div>
      <ol>${module.lessons.map((lesson, l) => `<li><button type="button" class="co-node co-lesson" data-co="select" data-type="lesson" data-id="${h(lesson.id)}" ${current('lesson', lesson.id)}>
          ${icon(kindIcon(lesson.kind),14)}<span>${h(lesson.title || 'Aula sem título')}</span>${Number(lesson.dripDays) ? `<small title="Liberada ${Number(lesson.dripDays)} dias após o acesso">${icon('clock',12)} ${Number(lesson.dripDays)}d</small>` : ''}</button>
        <span class="co-move"><button type="button" class="icon-btn" data-co="lesson-up" data-id="${h(lesson.id)}" aria-label="Subir aula ${h(lesson.title)}" ${m || l ? '' : 'disabled'}>${icon('chevron',13)}</button>
        <button type="button" class="icon-btn co-down" data-co="lesson-down" data-id="${h(lesson.id)}" aria-label="Descer aula ${h(lesson.title)}" ${m < draft.modules.length - 1 || l < module.lessons.length - 1 ? '' : 'disabled'}>${icon('chevron',13)}</button></span></li>`).join('')}</ol>
      <button type="button" class="co-add" data-co="add-lesson" data-id="${h(module.id)}">${icon('plus',14)} Aula</button></section>`).join('')}
    <button type="button" class="secondary co-add-module" data-co="add-module">${icon('plus',15)} Adicionar módulo</button>`;
}

function builder(c, id) {
  const entry = draftOf(c, id);
  if (!entry) return shell(c, `<div class="co-empty">${icon('book',28)}<strong>Curso não encontrado</strong><p>Ele pode ter sido excluído.</p>
    <a class="secondary" href="#memberships/courses">${icon('left',15)} Voltar para cursos</a></div>`);
  const total = entry.draft.modules.reduce((sum, module) => sum + module.lessons.length, 0);
  return `<div class="page cp-admin co-builder" data-co-builder="${h(id)}">
    <a class="text-link co-back" href="#memberships/courses">${icon('left',15)} Cursos</a>
    <header class="co-head"><div><h1 data-co-title>${h(entry.draft.name || 'Curso sem nome')}</h1>
      <p>${status({ active: entry.draft.active })} <span data-co-summary>${entry.draft.modules.length} ${entry.draft.modules.length === 1 ? 'módulo' : 'módulos'} · ${total} ${total === 1 ? 'aula' : 'aulas'}</span>
      <span class="co-dirty" data-co-dirty ${entry.dirty ? '' : 'hidden'}>Alterações não salvas</span></p></div>
      <div class="co-head-actions"><button type="button" class="secondary" data-co="discard" ${entry.dirty ? '' : 'hidden'}>Descartar</button>
      <button type="button" class="primary" data-co="save">${icon('check',16)} Salvar curso</button></div></header>
    <div class="co-layout"><nav class="co-outline" aria-label="Conteúdo do curso">${outlinePanel(entry)}</nav>
      <section class="co-panel" aria-live="polite">${editorPanel(c, entry)}</section></div></div>`;
}

export function coursesScreen(c) {
  const id = builderId();
  return c.tab === 'course' && id ? builder(c, id) : productList(c);
}

export function installCourses({ c, mutate, flash, dialog, close, render }) {
  const active = () => c.view === 'memberships' && ['courses', 'course'].includes(c.tab);
  const entry = () => drafts.get(builderId());
  const markDirty = () => {
    const current = entry();
    if (!current) return;
    current.dirty = true;
    document.querySelector('[data-co-dirty]')?.removeAttribute('hidden');
    document.querySelector('[data-co="discard"]')?.removeAttribute('hidden');
  };
  const repaint = focusSelector => {
    render();
    if (focusSelector) document.querySelector(focusSelector)?.focus();
  };
  const move = (rows, index, delta) => { const [row] = rows.splice(index, 1); rows.splice(index + delta, 0, row); };
  const newLesson = () => ({ id: newId(), title: 'Nova aula / Nueva lección', kind: 'text', body: '', videoUrl: '', fileId: '', dripDays: 0 });
  const confirmForm = (title, text, label, action, id) => dialog(title, `<form class="co-form" data-co-form="${action}" data-id="${h(id)}"><p>${text}</p>
    <p class="form-status" role="alert" data-co-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button>
    <button class="danger" type="submit">${label}</button></div></form>`);

  window.addEventListener('beforeunload', event => { if ([...drafts.values()].some(row => row.dirty)) event.preventDefault(); });

  document.addEventListener('click', async event => {
    if (!active()) return;
    const opened = event.target.closest('.co-menu');
    document.querySelectorAll('.co-menu[open]').forEach(menu => { if (menu !== opened) menu.open = false; });
    const control = event.target.closest('[data-co]');
    if (!control) return;
    const { co: action, id, type } = control.dataset;
    if (control.closest('.co-menu')) control.closest('.co-menu').open = false;
    const current = entry(), draft = current?.draft;
    try {
      if (action === 'create') dialog('Criar curso', `<form class="co-form" data-co-form="create">
        <label>Nome do curso<input name="name" required maxlength="160" autocomplete="off" placeholder="Ex.: Método de vendas em 30 dias"></label>
        <label>Descrição (opcional)<textarea name="description" rows="3" maxlength="2500"></textarea></label>
        <p class="form-status" role="alert" data-co-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button>
        <button class="primary" type="submit">Criar e editar</button></div></form>`);
      if (action === 'publish') {
        const course = c.s.courses.find(row => row.id === id);
        await mutate({ type: 'save', key: 'courses', id, data: { active: !course.active } });
        render(); flash(course.active ? 'Curso voltou para rascunho.' : 'Curso publicado.');
      }
      if (action === 'duplicate') {
        const course = c.s.courses.find(row => row.id === id);
        const modules = outline(course).map(module => ({ title: module.title, lessons: module.lessons.map(({ id: skip, ...lesson }) => lesson) }));
        await mutate({ type: 'save', key: 'courses', data: { name: `${course.name} (cópia)`.slice(0, 160), description: course.description, coverFileId: course.coverFileId || '',
          active: false, portalOnly: course.portalOnly !== false, modules } });
        render(); flash('Curso duplicado como rascunho.');
      }
      if (action === 'delete') confirmForm('Excluir curso', `“${h(c.s.courses.find(row => row.id === id).name)}” será excluído e sai do portal de todos os clientes. Esta ação não pode ser desfeita.`, 'Excluir curso', 'delete', id);
      if (!draft) return;
      if (action === 'select') { current.sel = { type, id }; repaint(`[data-co="select"][data-type="${type}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}`); }
      if (action === 'add-module') {
        const module = { id: newId(), title: `Módulo ${draft.modules.length + 1} / Módulo ${draft.modules.length + 1}`, lessons: [newLesson()] };
        draft.modules.push(module); current.sel = { type: 'module', id: module.id }; markDirty(); repaint('[data-co-set="module.title"]');
      }
      if (action === 'add-lesson') {
        const lesson = newLesson(); findModule(draft, id).lessons.push(lesson);
        current.sel = { type: 'lesson', id: lesson.id }; markDirty(); repaint('[data-co-set="lesson.title"]');
      }
      if (action === 'remove-module') {
        if (draft.modules.length === 1) { flash('Um curso precisa de pelo menos um módulo.', true); return; }
        draft.modules = draft.modules.filter(module => module.id !== id); current.sel = { type: 'details' }; markDirty(); repaint();
      }
      if (action === 'remove-lesson') {
        const { module } = findLesson(draft, id);
        if (draft.modules.reduce((sum, row) => sum + row.lessons.length, 0) === 1) { flash('Um curso precisa de pelo menos uma aula.', true); return; }
        module.lessons = module.lessons.filter(lesson => lesson.id !== id); current.sel = { type: 'module', id: module.id }; markDirty(); repaint();
      }
      if (action === 'module-up' || action === 'module-down') {
        const index = draft.modules.findIndex(module => module.id === id);
        move(draft.modules, index, action === 'module-up' ? -1 : 1); markDirty(); repaint(`[data-co="${action}"][data-id="${CSS.escape(id)}"]`);
      }
      if (action === 'lesson-up' || action === 'lesson-down') {
        const { module, lesson } = findLesson(draft, id), m = draft.modules.indexOf(module), l = module.lessons.indexOf(lesson);
        const up = action === 'lesson-up';
        if (up ? l > 0 : l < module.lessons.length - 1) move(module.lessons, l, up ? -1 : 1);
        else { module.lessons.splice(l, 1); const target = draft.modules[m + (up ? -1 : 1)]; up ? target.lessons.push(lesson) : target.lessons.unshift(lesson); }
        markDirty(); repaint(`[data-co="${action}"][data-id="${CSS.escape(id)}"]`);
      }
      if (action === 'discard') { drafts.delete(builderId()); render(); flash('Alterações descartadas.'); }
      if (action === 'save') {
        control.disabled = true;
        try {
          await mutate({ type: 'save', key: 'courses', id: builderId(), data: { ...draft, modules: draft.modules } });
          const saved = c.s.courses.find(row => row.id === builderId());
          drafts.set(builderId(), { ...current, dirty: false, stamp: saved.updated || saved.created || '', draft: { ...draft, modules: structuredClone(outline(saved)) } });
          render(); flash('Curso salvo.');
        } finally { control.disabled = false; }
      }
    } catch (error) { flash(error.message, true); }
  });

  const edit = event => {
    if (!active()) return;
    const el = event.target, key = el.dataset?.coSet;
    if (!key) return;
    const current = entry();
    if (!current) return;
    const [scope, field] = key.split('.');
    const { draft, sel } = current;
    if (scope === 'course') {
      if (field === 'active') draft.active = el.value === '1';
      else if (field === 'public') draft.portalOnly = !el.checked;
      else draft[field] = el.value;
      if (field === 'name') document.querySelector('[data-co-title]').textContent = el.value || 'Curso sem nome';
      if (event.type === 'change' && ['coverFileId', 'active'].includes(field)) { markDirty(); repaint(`[data-co-set="${key}"]${field === 'active' ? ':checked' : ''}`); return; }
    }
    if (scope === 'module') {
      findModule(draft, sel.id).title = el.value;
      const node = document.querySelector(`[data-co="select"][data-type="module"][data-id="${CSS.escape(sel.id)}"] strong`);
      if (node) node.textContent = el.value || 'Módulo sem título';
    }
    if (scope === 'lesson') {
      const { lesson } = findLesson(draft, sel.id);
      lesson[field] = field === 'dripDays' ? Math.max(0, Math.min(365, Math.trunc(Number(el.value) || 0))) : el.value;
      const node = document.querySelector(`[data-co="select"][data-type="lesson"][data-id="${CSS.escape(sel.id)}"] span`);
      if (node && field === 'title') node.textContent = el.value || 'Aula sem título';
      if (event.type === 'change' && ['kind', 'dripDays'].includes(field)) { markDirty(); repaint(`[data-co-set="lesson.${field}"]${field === 'kind' ? ':checked' : ''}`); return; }
    }
    markDirty();
  };
  document.addEventListener('input', edit);
  document.addEventListener('change', event => {
    if (active() && event.target.dataset?.coFilter) { list[event.target.dataset.coFilter] = event.target.value; render(); return; }
    edit(event);
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-co-form]');
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]'), error = form.querySelector('[data-co-error]');
    const data = Object.fromEntries(new FormData(form));
    submit.disabled = true;
    error.textContent = '';
    try {
      if (form.dataset.coForm === 'create') {
        const id = await mutate({ type: 'save', key: 'courses', data: { name: data.name, description: data.description, active: false,
          modules: [{ title: 'Módulo 1 / Módulo 1', lessons: [{ title: 'Aula 1 / Lección 1', kind: 'text', body: '' }] }] } });
        close(); location.hash = `#memberships/course/${encodeURIComponent(id)}`; flash('Curso criado. Monte os módulos e aulas.');
      }
      if (form.dataset.coForm === 'delete') {
        await mutate({ type: 'delete', key: 'courses', id: form.dataset.id });
        drafts.delete(form.dataset.id); close();
        if (builderId() === form.dataset.id) location.hash = '#memberships/courses'; else render();
        flash('Curso excluído.');
      }
    } catch (failure) {
      error.textContent = failure.message;
      submit.disabled = false;
    }
  });
}
