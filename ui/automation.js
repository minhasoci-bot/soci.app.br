import { icon } from './icons.js';
import { fmt, h } from './screens.js';

const triggers = [
  ['', 'Selecione um gatilho'], ['Contact created', 'Contato criado'], ['Form submitted', 'Formulário enviado'],
  ['Opportunity stage changed', 'Etapa da oportunidade alterada'], ['Appointment booked', 'Agendamento criado'],
  ['Trigger link clicked', 'Link de rastreamento clicado']
];
const actions = {
  'Add tag': ['Adicionar tag', 'tag', 'Nome da tag'],
  'Create task': ['Criar tarefa', 'check', 'Título da tarefa'],
  'Create opportunity': ['Criar oportunidade', 'leads', 'Título da oportunidade'],
  'Log message': ['Registrar mensagem no CRM', 'chat', 'Mensagem'],
  'Manual Call': ['Ligação manual', 'phone', 'Instruções da ligação'],
  'Manual SMS': ['SMS manual', 'mail', 'Instruções do SMS']
};
const actionOptions = Object.entries(actions).map(([type, [label]]) => [type, label]);
const triggerLabels = Object.fromEntries([...triggers, ['Manual enrollment', 'Inscrição manual']]);
const statuses = [['all', 'Todos os status'], ['draft', 'Rascunho'], ['published', 'Publicado']];
const runStatuses = { Running: 'Em execução', Waiting: 'Aguardando ação', Completed: 'Concluída', Canceled: 'Cancelada' };
const records = rows => rows.map(row => [row.id, row.name]);
const folders = (s, label) => [['', label], ...records(s.workflowFolders)];
const options = (entries, value) => entries.map(([id, label]) =>
  `<option value="${h(id)}" ${id === value ? 'selected' : ''}>${h(label)}</option>`).join('') +
  (value && !entries.some(([id]) => id === value) ? `<option value="${h(value)}" selected>Referência removida</option>` : '');
const select = (name, label, entries, value = '') =>
  `<label>${label}<select name="${name}">${options(entries, value)}</select></label>`;
const field = (name, label, value, max = 100, required = true) =>
  `<label>${label}<input name="${name}" maxlength="${max}" value="${h(value)}" ${required ? 'required' : ''}></label>`;
const button = (action, label, { cls = 'secondary', glyph = '', id = '', disabled = false } = {}) =>
  `<button type="button" class="${cls}" data-wf="${action}" data-wf-id="${h(id)}" ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph, 16) : ''}${label}</button>`;
const link = (tab, label, id = '', cls = '') =>
  `<a class="${cls}" href="#automation/${tab}${id ? '/' + encodeURIComponent(id) : ''}" ${cls.includes('current') ? 'aria-current="page"' : ''}>${label}</a>`;
const tabs = (items, current) => `<nav class="wf-tabs" aria-label="Seções de automação">${items.map(([tab, label, id]) =>
  link(tab, label, id, tab === current ? 'wf-tab current' : 'wf-tab')).join('')}</nav>`;
const date = (c, value) => h(fmt(value, c.s.profile.timezone, true));
const stateBadge = active => `<span class="wf-status ${active ? 'published' : ''}">${active ? 'Publicado' : 'Rascunho'}</span>`;
const empty = (title, label = '', glyph = 'flow') =>
  `<div class="wf-empty">${icon(glyph, 24)}<strong>${title}</strong>${label ? `<p>${label}</p>` : ''}</div>`;
const problem = run => run.results?.some(result => result.endsWith(': no linked contact'));
const pending = run => ['Running', 'Waiting'].includes(run.status);
const routeTabs = [['workflows', 'Fluxos de trabalho'], ['overview', 'Visão geral'], ['logs', 'Histórico de execuções']];
const editorTabs = [['builder', 'Construtor'], ['settings', 'Configurações'], ['enrollments', 'Inscrições'], ['logs', 'Registros de execução']];
const filterText = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const listing = c => c.workflowList ??= { query: '', status: 'all', sort: 'updated', page: 0 };

function table(headings, rows) {
  return `<div class="wf-table-scroll"><table class="wf-table"><thead><tr>${headings.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function paginate(items, page, size, render) {
  const last = Math.max(0, Math.ceil(items.length / size) - 1);
  const current = Math.min(page, last);
  return render(items.slice(current * size, (current + 1) * size)) + (last ? `<div class="wf-pagination">
    <span>${current * size + 1}–${Math.min((current + 1) * size, items.length)} de ${items.length}</span>
    ${button('page', 'Anterior', { id: current - 1, disabled: current === 0 })}
    ${button('page', 'Próxima', { id: current + 1, disabled: current === last })}</div>` : '');
}

function workflowList(c, tab, id) {
  const s = c.s, filters = listing(c);
  const folder = tab === 'folder' && s.workflowFolders.find(row => row.id === id);
  const saved = tab === 'smart' && s.workflowLists.find(row => row.id === id);
  const deleted = tab === 'deleted';
  const summaryById = new Map();
  for (const run of s.runs) {
    const summary = summaryById.get(run.workflowId) || { total: 0, active: 0, review: false };
    summary.total++;
    if (pending(run)) summary.active++;
    if (problem(run)) summary.review = true;
    summaryById.set(run.workflowId, summary);
  }
  const reviewCount = s.workflows.filter(row => summaryById.get(row.id)?.review).length;
  const source = deleted ? s.deletedWorkflows : s.workflows;
  const scope = folder?.id || saved?.folderId;
  const match = (text, query) => filterText(text).includes(filterText(query));
  const matchStatus = (row, filter) => filter === 'all' || (filter === 'published') === row.active;
  const rows = source.filter(row => {
    if (scope && row.folderId !== scope) return false;
    if (tab === 'review' && !summaryById.get(row.id)?.review) return false;
    if (saved && (!matchStatus(row, saved.status) || !match(row.name, saved.query))) return false;
    if (tab === 'workflows' && row.folderId && !filters.query && filters.status === 'all') return false;
    return (deleted || matchStatus(row, filters.status)) && match(row.name, filters.query);
  }).sort((a, b) => filters.sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR')
    : String(b.deletedAt || b.updated || b.created).localeCompare(a.deletedAt || a.updated || a.created));
  const showFolders = tab === 'workflows' && !filters.query && filters.status === 'all';
  const folderCards = showFolders ? s.workflowFolders.map(row =>
    `<div class="wf-folder">${link('folder', `${icon('folder', 20)}<b>${h(row.name)}</b>`, row.id)}
    ${button('folder-menu', 'Gerenciar', { id: row.id, cls: 'wf-text' })}</div>`).join('') : '';
  const viewTabs = [['workflows', 'Todos os fluxos'], ['review', `Precisam de revisão (${reviewCount})`], ['deleted', 'Excluídos']];
  const heads = deleted ? ['Nome', 'Excluído em', '<span class="sr-only">Ações</span>'] :
    ['Nome', 'Status', 'Total de inscrições', 'Inscrições ativas', 'Última atualização', '<span class="sr-only">Ações</span>'];
  const drawRow = row => {
    if (deleted) return `<tr><td><strong>${h(row.name)}</strong></td><td>${date(c, row.deletedAt)}</td>
      <td>${button('restore', 'Restaurar', { id: row.id, glyph: 'refresh' })}</td></tr>`;
    const summary = summaryById.get(row.id);
    return `<tr><td>${link('builder', `<strong>${h(row.name)}</strong>`, row.id, 'wf-name')}
      <span class="wf-sub">${h(triggerLabels[row.trigger] || 'Gatilho pendente')}</span></td>
      <td>${stateBadge(row.active)}</td>
      <td>${link('enrollments', summary?.total || '0', row.id, 'wf-count')}</td>
      <td>${summary?.active || '0'}</td>
      <td>${date(c, row.updated || row.created)}</td>
      <td>${button('workflow-menu', 'Gerenciar', { id: row.id, cls: 'wf-text' })}</td></tr>`;
  };
  return `<section class="wf-panel">${tabs(viewTabs, folder ? 'workflows' : tab)}
    <div class="wf-toolbar"><label class="wf-search">${icon('search', 17)}
      <input data-wf-search aria-label="Buscar fluxos" placeholder="Buscar fluxos…" value="${h(filters.query)}"></label>
      ${deleted ? '' : `<select data-wf-filter="status" aria-label="Filtrar por status">${options(statuses, filters.status)}</select>`}
      <select data-wf-filter="sort" aria-label="Ordenar fluxos">${options([['updated', 'Mais recentes'], ['name', 'Nome de A a Z']], filters.sort)}</select>
      ${deleted || tab === 'review' ? '' : button('smart-edit', 'Nova lista inteligente', { glyph: 'plus' })}
    </div>
    ${folder || saved ? `<div class="wf-crumb">${link('workflows', 'Todos os fluxos')} ${icon('right', 13)}
      <strong>${h((folder || saved).name)}</strong>${saved ? button('smart-menu', 'Gerenciar lista', { id: saved.id, cls: 'wf-text' }) : ''}</div>` : ''}
    ${s.workflowLists.length && !deleted && tab !== 'review' ? `<nav class="wf-saved" aria-label="Listas inteligentes">${s.workflowLists.map(row =>
      link('smart', h(row.name), row.id, row.id === id ? 'current' : '')).join('')}</nav>` : ''}
    ${folderCards ? `<div class="wf-folders">${folderCards}</div>` : ''}
    <div data-wf-rows>${rows.length ? paginate(rows, filters.page, 15, page => table(heads, page.map(drawRow))) :
      empty(deleted ? 'Nenhum fluxo excluído' : tab === 'review' ? 'Nenhum fluxo precisa de revisão' : 'Nenhum fluxo encontrado',
        source.length ? '' : deleted || tab === 'review' ? '' : 'Crie um fluxo para automatizar tarefas do CRM.')}</div></section>`;
}

function history(c, runs, mode, showWorkflow) {
  const showSteps = mode === 'logs';
  const heads = [...(showWorkflow ? ['Fluxo'] : []), 'Contato', 'Evento', 'Status', 'Inscrito em', showSteps ? 'Ações registradas' : 'Detalhes'];
  if (!runs.length) return `<div class="wf-panel">${empty('Nenhuma inscrição registrada', '', 'clock')}</div>`;
  return `<div class="wf-panel">${paginate(runs.slice().reverse(), listing(c).page, 15, page => table(heads, page.map(run => {
    const contact = c.s.contacts.find(row => row.id === run.contactId);
    const workflow = c.s.workflows.find(row => row.id === run.workflowId);
    return `<tr>${showWorkflow ? `<td>${workflow ? link('builder', h(run.name), workflow.id) : h(run.name)}</td>` : ''}
      <td>${h(contact?.name || '—')}</td><td>${h(triggerLabels[run.event] || run.event)}</td>
      <td><span class="wf-status ${problem(run) ? 'review' : pending(run) ? '' : 'published'}">${problem(run) ? 'Revisar' : h(runStatuses[run.status] || run.status || 'Concluída')}</span></td>
      <td>${date(c, run.created)}</td><td>${button('run', showSteps ? `Ver ações (${run.results.length})` : 'Ver execução', { id: run.id, cls: 'wf-text' })}</td></tr>`;
  })))}</div>`;
}

function overview(c) {
  const { workflows, runs } = c.s;
  const metrics = [
    ['Publicados', workflows.filter(row => row.active).length, 'flow'], ['Rascunhos', workflows.filter(row => !row.active).length, 'edit'],
    ['Total de inscrições', runs.length, 'users'], ['Inscrições ativas', runs.filter(pending).length, 'clock']
  ];
  return `<div class="wf-metrics">${metrics.map(([label, value, glyph]) =>
    `<div>${icon(glyph, 19)}<span>${label}</span><strong>${value}</strong></div>`).join('')}</div>
    <h2>Execuções recentes</h2>${history(c, runs.slice(-10), 'logs', true)}`;
}

function draft(c, id) {
  const row = c.s.workflows.find(item => item.id === id);
  const folderId = c.s.workflowFolders.some(folder => folder.id === id) ? id : '';
  if (c.workflowDraft?.workspace !== c.workspace || c.workflowDraft?.key !== id) {
    c.workflowDraft = { workspace: c.workspace, key: id, row: row ? structuredClone(row) :
      { name: '', folderId, trigger: '', actions: [], active: false, allowReentry: true }, node: 'trigger', dirty: false };
  }
  return c.workflowDraft;
}

function canvas(c, editor) {
  const { row, node } = editor;
  const selected = node === 'trigger' ? null : row.actions[node];
  const add = position => `<div class="wf-connector">${button('node-add', '<span class="sr-only">Adicionar ação</span>', { id: position, glyph: 'plus', cls: 'wf-add', disabled: row.actions.length >= 10 })}</div>`;
  const card = (key, label, detail, glyph) => `<button type="button" class="wf-node ${key === node ? 'current' : ''}"
    data-wf="node" data-wf-id="${key}" aria-pressed="${key === node}">
    <span class="wf-node-icon">${icon(glyph, 19)}</span><span><strong>${label}</strong>${detail ? `<small>${h(detail)}</small>` : ''}</span>
    ${icon('right', 14)}</button>`;
  const refs = {
    'Trigger link clicked': ['linkId', 'Link de rastreamento', [['', 'Qualquer link'], ...records(c.s.triggerLinks)]],
    'Form submitted': ['formId', 'Formulário', [['', 'Qualquer formulário'], ...records(c.s.forms)]],
    'Opportunity stage changed': ['stageId', 'Etapa de destino', [['', 'Qualquer etapa'], ...c.s.stages.map(stage =>
      [stage.id, [c.s.pipelines.find(pipeline => pipeline.id === stage.pipelineId)?.name, stage.name].filter(Boolean).join(' / ')])]]
  };
  const ref = refs[row.trigger];
  const panel = selected ? `<h2>Configurar ação</h2>${select('type', 'Ação', actionOptions, selected.type)}
      ${field('value', actions[selected.type][2], selected.value, 500)}
      ${['Manual Call', 'Manual SMS'].includes(selected.type) ? field('assignee', 'Responsável', selected.assignee, 80, false) : ''}
      ${selected.type === 'Log message' ? select('channel', 'Canal do registro', [['Note', 'Nota interna'], ['Email', 'E-mail'], ['SMS', 'SMS']], selected.channel || 'Note') : ''}
      <div class="wf-node-tools">${button('node-up', 'Subir', { disabled: node === 0 })}
        ${button('node-down', 'Descer', { disabled: node === row.actions.length - 1 })}
        ${button('node-delete', 'Remover ação', { cls: 'wf-text', glyph: 'trash' })}</div>`
    : `<h2>Configurar gatilho</h2>${select('trigger', 'Evento que inicia o fluxo', triggers, row.trigger)}
      ${ref ? select(ref[0], ref[1], ref[2], row[ref[0]]) : ''}`;
  return `<div class="wf-workbench"><div class="wf-canvas">
    ${card('trigger', h(triggerLabels[row.trigger] || 'Adicionar gatilho'), row.trigger ? 'Gatilho' : '', 'bolt')}
    ${row.actions.map((step, index) => add(index) + card(index, h(actions[step.type]?.[0] || step.type), step.value, actions[step.type]?.[1] || 'flow')).join('')}
    ${add(row.actions.length)}<span class="wf-end">Fim</span></div>
    <aside class="wf-inspector" aria-label="Configuração do bloco">${panel}</aside></div>`;
}

function editorScreen(c, tab, id) {
  const live = c.s.workflows.find(row => row.id === id);
  if (!live && (tab !== 'builder' || (id && !c.s.workflowFolders.some(folder => folder.id === id)))) {
    return `<div class="wf-page">${link('workflows', 'Voltar para fluxos')}${empty('Fluxo não encontrado')}</div>`;
  }
  const editor = draft(c, id), { row } = editor;
  const top = `<div class="wf-page-head">
    <div>${link('workflows', `${icon('left', 15)} Fluxos de trabalho`, '', 'wf-back')}<h1>${live ? h(live.name) : 'Novo fluxo'}</h1></div>
    <div class="wf-head-actions"><span class="wf-sub" data-wf-unsaved ${editor.dirty ? '' : 'hidden'}>Alterações pendentes</span>${stateBadge(live?.active)}
    ${tab === 'enrollments' && live.active ? button('enroll', 'Inscrever contato', { glyph: 'plus', cls: 'primary', id }) : ''}
    ${['builder', 'settings'].includes(tab) ? button('save-draft', live?.active ? 'Salvar alterações' : 'Salvar rascunho') +
      (live?.active ? button('unpublish', 'Voltar para rascunho') : button('publish', 'Publicar', { glyph: 'check', cls: 'primary' })) : ''}</div></div>`;
  const navigation = live ? tabs(editorTabs.map(([key, label]) => [key, label, id]), tab) : '';
  const settings = `<div class="wf-panel wf-settings">
    ${select('folderId', 'Pasta', folders(c.s, 'Sem pasta'), row.folderId)}
    <label class="wf-check"><input type="checkbox" name="allowReentry" ${row.allowReentry !== false ? 'checked' : ''}>
      <span><b>Permitir nova inscrição</b><small>Contatos que já passaram pelo fluxo podem entrar de novo.</small></span></label></div>`;
  const name = field('name', 'Nome do fluxo', row.name, 240);
  return `<div class="wf-editor" data-wf-editor>${top}${navigation}
    ${['builder', 'settings'].includes(tab) ? `<div class="wf-workflow-name">${name}</div>` : ''}
    ${tab === 'builder' ? canvas(c, editor) : tab === 'settings' ? settings :
      history(c, c.s.runs.filter(run => run.workflowId === id), tab, false)}</div>`;
}

export function automationScreen(c) {
  const tab = c.tab || 'workflows', id = c.automationId;
  if (editorTabs.some(([key]) => key === tab) && (id || tab === 'builder')) return `<div class="wf-page">${editorScreen(c, tab, id)}</div>`;
  return `<div class="wf-page"><div class="wf-page-head"><div><h1>Automações</h1></div>
    <div class="wf-head-actions">${button('folder-edit', 'Criar pasta', { glyph: 'folder' })}
      ${link('builder', `${icon('plus', 17)} Criar fluxo`, tab === 'folder' ? id : '', 'primary')}</div></div>
    ${tabs(routeTabs, tab === 'overview' || tab === 'logs' ? tab : 'workflows')}
    ${tab === 'overview' ? overview(c) : tab === 'logs' ? history(c, c.s.runs, 'logs', true) : workflowList(c, tab, id)}</div>`;
}

const resultLabels = {
  'no linked contact': 'Sem contato vinculado', done: 'Concluída', 'waiting for a manual action': 'Aguardando ação manual',
  completed: 'Concluída manualmente', skipped: 'Ignorada manualmente'
};

export function installAutomation({ c, mutate, render, flash, dialog, close }) {
  const show = (tab, id = '') => {
    const hash = `#automation/${tab}${id ? '/' + encodeURIComponent(id) : ''}`;
    if (location.hash === hash) render();
    else location.hash = hash;
  };
  const modal = (title, body, operation, id = '', label = 'Salvar') => dialog(title,
    `<form class="wf-modal" data-wf-form="${operation}" data-wf-id="${h(id)}">${body}
      <p role="alert" data-wf-error hidden></p>
      <div class="wf-head-actions"><button type="button" class="secondary" data-close-dialog>Cancelar</button>
      <button class="primary" type="submit">${label}</button></div></form>`);
  const allFolders = () => folders(c.s, 'Sem pasta');
  const find = (key, id) => c.s[key].find(item => item.id === id);
  const markDirty = () => {
    c.workflowDraft.dirty = true;
    const indicator = document.querySelector('[data-wf-unsaved]');
    if (indicator) indicator.hidden = false;
  };
  const updateList = input => {
    const start = input.selectionStart, end = input.selectionEnd;
    const selector = input.matches('[data-wf-search]') ? '[data-wf-search]' : `[data-wf-filter="${input.dataset.wfFilter}"]`;
    render();
    const next = document.querySelector(selector);
    next?.focus();
    if (start != null) next?.setSelectionRange(start, end);
  };
  document.addEventListener('input', event => {
    const input = event.target;
    if (input.matches('[data-wf-search]')) {
      Object.assign(listing(c), { query: input.value, page: 0 });
      updateList(input);
    } else if (input.closest('[data-wf-editor]') && ['name', 'value', 'assignee'].includes(input.name)) {
      const editor = c.workflowDraft;
      const record = input.name === 'name' ? editor.row : editor.row.actions[editor.node];
      record[input.name] = input.value;
      if (input.name === 'value') {
        const node = document.querySelector(`.wf-node[data-wf-id="${editor.node}"] span:nth-child(2)`);
        let detail = node?.querySelector('small');
        if (!detail && node) {
          detail = document.createElement('small');
          node.append(detail);
        }
        if (detail) detail.textContent = input.value;
      }
      markDirty();
    }
  });
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-wf-filter]')) {
      Object.assign(listing(c), { [input.dataset.wfFilter]: input.value, page: 0 });
      updateList(input);
      return;
    }
    if (!input.closest('[data-wf-editor]') || !input.matches('select,input[type="checkbox"]')) return;
    const editor = c.workflowDraft;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    const record = ['type', 'channel'].includes(input.name) ? editor.row.actions[editor.node] : editor.row;
    record[input.name] = value;
    markDirty();
    if (['trigger', 'type'].includes(input.name)) {
      render();
      document.querySelector(`[data-wf-editor] select[name="${input.name}"]`)?.focus();
    }
  });

  let pendingSave = false;
  document.addEventListener('click', async event => {
    const btn = event.target.closest('button[data-wf]');
    if (!btn || c.view !== 'automation' || pendingSave) return;
    const op = btn.dataset.wf, id = btn.dataset.wfId;
    const editor = c.workflowDraft;
    const row = find('workflows', id);
    const workspace = c.workspace;
    try {
      if (op.startsWith('node')) {
        if (op === 'node') editor.node = id === 'trigger' ? id : Number(id);
        else {
          const steps = editor.row.actions, index = editor.node;
          if (op === 'node-add') {
            editor.node = Number(id);
            steps.splice(editor.node, 0, { type: 'Create task', value: '' });
          } else if (op === 'node-delete') {
            steps.splice(index, 1);
            editor.node = steps.length ? Math.min(index, steps.length - 1) : 'trigger';
          } else {
            const target = index + (op === 'node-up' ? -1 : 1);
            [steps[index], steps[target]] = [steps[target], steps[index]];
            editor.node = target;
          }
          markDirty();
        }
        render();
        document.querySelector('.wf-inspector select')?.focus();
      } else if (['save-draft', 'publish', 'unpublish'].includes(op)) {
        const record = editor.row, active = op === 'publish' || (op === 'save-draft' && Boolean(record.active));
        if (!record.name.trim()) {
          document.querySelector('[data-wf-editor] [name="name"]')?.focus();
          throw Error('Dê um nome ao fluxo antes de salvar.');
        }
        if (record.actions.some(step => !step.value.trim())) throw Error('Preencha o conteúdo de todas as ações.');
        pendingSave = true;
        btn.disabled = true;
        const key = await mutate({ type: 'save', key: 'workflows', id: record.id, data: { ...record, active } });
        if (c.workspace !== workspace) return;
        c.workflowDraft = null;
        if (c.view === 'automation' && ['builder', 'settings'].includes(c.tab) && c.automationId === editor.key) show(c.tab, key);
        flash(active ? 'Fluxo publicado.' : 'Rascunho salvo.');
      } else if (op === 'page') {
        listing(c).page = Number(id);
        render();
        document.querySelector('.wf-pagination button:not(:disabled)')?.focus();
      } else if (op === 'folder-edit') {
        modal(id ? 'Renomear pasta' : 'Criar pasta', field('name', 'Nome da pasta', find('workflowFolders', id)?.name), op, id);
      } else if (op === 'smart-edit') {
        const item = find('workflowLists', id) || { ...listing(c), folderId: c.tab === 'folder' ? c.automationId : '' };
        modal(id ? 'Editar lista inteligente' : 'Nova lista inteligente',
          field('name', 'Nome da lista', item.name) + field('query', 'Nome do fluxo contém', item.query, 200, false) +
          select('status', 'Status', statuses, item.status) + select('folderId', 'Pasta', folders(c.s, 'Todas as pastas'), item.folderId), op, id);
      } else if (op === 'folder-menu' || op === 'smart-menu' || op === 'workflow-menu') {
        const collection = op === 'folder-menu' ? 'workflowFolders' : op === 'smart-menu' ? 'workflowLists' : 'workflows';
        const item = find(collection, id);
        if (!item) return;
        const menu = collection === 'workflows' ? [
          button('move', 'Mover para uma pasta', { id, glyph: 'folder' }), button('duplicate', 'Duplicar', { id, glyph: 'plus' }),
          button('delete', 'Mover para excluídos', { id, glyph: 'trash' })
        ] : [
          button(collection === 'workflowFolders' ? 'folder-edit' : 'smart-edit', 'Editar', { id, glyph: 'edit' }),
          button(collection === 'workflowFolders' ? 'folder-delete' : 'smart-delete', 'Excluir', { id, glyph: 'trash' })
        ];
        close();
        dialog(item.name, `<div class="wf-menu">${menu.join('')}</div>`);
      } else if (op === 'move') {
        modal('Mover fluxo', select('folderId', 'Pasta de destino', allFolders(), row.folderId), op, id, 'Mover');
      } else if (op === 'delete') {
        modal('Mover fluxo para excluídos', `<p>Novas inscrições em <b>${h(row.name)}</b> serão interrompidas. Você pode restaurar o fluxo como rascunho.</p>`, op, id, 'Mover para excluídos');
      } else if (op === 'folder-delete' || op === 'smart-delete') {
        modal(op === 'folder-delete' ? 'Excluir pasta' : 'Excluir lista inteligente',
          op === 'folder-delete' ? '<p>Os fluxos desta pasta vão voltar para a lista principal.</p>' : '<p>Os fluxos continuarão disponíveis em Todos os fluxos.</p>',
          op, id, 'Excluir');
      } else if (op === 'duplicate' || op === 'restore') {
        pendingSave = true;
        btn.disabled = true;
        if (op === 'duplicate') {
          const key = await mutate({ type: 'save', key: 'workflows', data: { ...row, name: `${row.name.slice(0, 232)} (cópia)`, active: false } });
          close();
          show('builder', key);
        } else {
          await mutate({ type: 'workflow-restore', id });
          render();
        }
        flash(op === 'duplicate' ? 'Cópia criada como rascunho.' : 'Fluxo restaurado como rascunho.');
      } else if (op === 'enroll') {
        const choices = [['', 'Selecione um contato'], ...c.s.contacts.map(contact => [contact.id,
          contact.email ? `${contact.name} · ${contact.email}` : contact.name])];
        modal('Inscrever contato', select('contactId', 'Contato', choices), op, id, 'Inscrever');
      } else if (op === 'run') {
        const run = find('runs', id);
        const details = run.results.map(result => {
          const separator = result.indexOf(': ');
          if (separator === -1) return h(result === 'Contact deleted.' ? 'Contato excluído.' : result);
          const type = result.slice(0, separator), outcome = result.slice(separator + 2);
          return `<b>${h(actions[type]?.[0] || type)}</b><span>${h(resultLabels[outcome] || outcome)}</span>`;
        });
        dialog(run.name, `<div class="wf-run-details"><p>${h(triggerLabels[run.event] || run.event)} · ${date(c, run.created)}</p>
          ${details.length ? `<ol>${details.map(result => `<li>${result}</li>`).join('')}</ol>` : '<p>Nenhuma ação registrada.</p>'}</div>`);
      }
    } catch (error) {
      flash(error.message, true);
    } finally {
      pendingSave = false;
      if (btn.isConnected) btn.disabled = false;
    }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    const op = form.dataset.wfForm;
    if (!op) return;
    event.preventDefault();
    if (pendingSave) return;
    const id = form.dataset.wfId, data = Object.fromEntries(new FormData(form));
    const input = form.querySelector('button[type="submit"]'), problem = form.querySelector('[data-wf-error]');
    const commands = {
      'folder-edit': { type: 'save', key: 'workflowFolders', id, data },
      'smart-edit': { type: 'save', key: 'workflowLists', id, data },
      'folder-delete': { type: 'delete', key: 'workflowFolders', id },
      'smart-delete': { type: 'delete', key: 'workflowLists', id },
      delete: { type: 'delete', key: 'workflows', id },
      move: { type: 'workflow-move', id, data },
      enroll: { type: 'workflow-enroll', id, data }
    };
    input.disabled = pendingSave = true;
    try {
      if (op === 'enroll' && !data.contactId) throw Error('Selecione um contato.');
      const result = await mutate(commands[op]);
      if (op === 'move' && c.workflowDraft?.key === id) c.workflowDraft.row.folderId = data.folderId;
      if (op === 'delete' && c.workflowDraft?.key === id) c.workflowDraft = null;
      close();
      if (op === 'smart-edit') show('smart', result);
      else if (['smart-delete', 'folder-delete'].includes(op)) show('workflows');
      else render();
      flash(op === 'enroll' ? 'Contato inscrito no fluxo.' : 'Alteração salva.');
    } catch (error) {
      problem.hidden = false;
      problem.textContent = error.message;
    } finally {
      input.disabled = pendingSave = false;
    }
  });
}
