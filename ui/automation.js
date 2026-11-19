import { icon } from './icons.js';
import { fmt, h, pageShell, utabs } from './screens.js';

const triggers = [
  ['', 'Selecione um gatilho'],
  ['Contact created', 'Contato criado'],
  ['Form submitted', 'Formulário enviado'],
  ['Opportunity stage changed', 'Etapa da oportunidade alterada'],
  ['Appointment booked', 'Agendamento criado'],
  ['Trigger link clicked', 'Link de rastreamento clicado'],
  ['Customer replied', 'Mensagem recebida / Resposta do cliente (ManyChat)']
];
const actions = {
  'Send WhatsApp': ['Enviar WhatsApp (ManyChat)', 'chat', 'Mensagem do WhatsApp'],
  'Send SMS': ['Enviar SMS automático', 'mail', 'Mensagem do SMS'],
  'Add tag': ['Adicionar tag', 'tag', 'Nome da tag'],
  'Remove tag': ['Remover tag', 'trash', 'Nome da tag a remover'],
  'Create task': ['Criar tarefa', 'check', 'Título da tarefa'],
  'Create opportunity': ['Criar oportunidade', 'leads', 'Título da oportunidade'],
  'Log message': ['Registrar mensagem no CRM', 'chat', 'Mensagem'],
  'Manual Call': ['Ligação manual', 'phone', 'Instruções da ligação'],
  'Manual SMS': ['SMS manual', 'mail', 'Instruções do SMS']
};
const actionOptions = Object.entries(actions).map(([type, [label]]) => [type, label]);
const actionDescriptions = {
  'Send WhatsApp': 'Envia uma mensagem direta automática no WhatsApp do contato (estilo ManyChat).',
  'Send SMS': 'Envia uma mensagem SMS direta automática para o contato.',
  'Add tag': 'Aplica uma tag ao contato.',
  'Remove tag': 'Remove uma tag existente do contato.',
  'Create task': 'Cria uma tarefa vinculada ao contato.',
  'Create opportunity': 'Abre uma oportunidade para o contato.',
  'Log message': 'Registra uma nota, um e-mail ou um SMS no CRM.',
  'Manual Call': 'Pausa o fluxo até a conclusão ou dispensa da ligação.',
  'Manual SMS': 'Pausa o fluxo até a conclusão ou dispensa do SMS.'
};
const maxActions = 10;
const triggerLabels = Object.fromEntries([...triggers, ['Manual enrollment', 'Inscrição manual']]);
const statuses = [['all', 'Todos os status'], ['draft', 'Rascunho'], ['published', 'Publicado']];
const runStatuses = { Running: 'Em execução', Waiting: 'Aguardando ação', Completed: 'Concluída', Canceled: 'Cancelada' };

const workflowRecipes = [
  {
    id: 'blank',
    title: 'Iniciar do zero',
    desc: 'Comece com uma tela em branco e configure seus próprios gatilhos e ações.',
    glyph: 'flow',
    tags: ['Personalizado'],
    recipe: null
  },
  {
    id: '01_novo_lead',
    title: '01. Novo Lead - Follow Up de Não Agendamento',
    desc: 'Ao preencher formulário: aplica tag de Novo Lead, cria oportunidade e agenda follow-up imediato.',
    glyph: 'edit',
    tags: ['Gatilho: Formulário', '4 ações'],
    recipe: {
      name: '01. Novo Lead - Follow Up de Não Agendamento',
      trigger: 'Form submitted',
      actions: [
        { type: 'Add tag', value: 'Novo Lead' },
        { type: 'Create opportunity', value: 'Oportunidade - Novo Lead' },
        { type: 'Create task', value: 'Follow-up imediato de agendamento' },
        { type: 'Log message', value: 'Lead adicionado ao fluxo de agendamento', channel: 'Note' }
      ]
    }
  },
  {
    id: '02_confirmacao_agendamento',
    title: '02. Confirmação de Agendamento + Lembretes',
    desc: 'Ao marcar agendamento: aplica tag de Reunião Marcada, cria tarefa de preparação e registra nota.',
    glyph: 'clock',
    tags: ['Gatilho: Agendamento', '3 ações'],
    recipe: {
      name: '02. Confirmação de Agendamento + Lembretes',
      trigger: 'Appointment booked',
      actions: [
        { type: 'Add tag', value: 'Reunião Marcada' },
        { type: 'Create task', value: 'Preparar apresentação e material da reunião' },
        { type: 'Log message', value: 'Confirmação de agendamento enviada ao contato', channel: 'Note' }
      ]
    }
  },
  {
    id: '03_followup_nao_comparecimento',
    title: '03. Follow-up de Não Comparecimento',
    desc: 'Ao alterar para etapa No-Show: tagueia falta, agenda recontato e registra histórico.',
    glyph: 'leads',
    tags: ['Gatilho: Etapa CRM', '3 ações'],
    recipe: {
      name: '03. Follow-up de Não Comparecimento',
      trigger: 'Opportunity stage changed',
      actions: [
        { type: 'Add tag', value: 'No-Show' },
        { type: 'Create task', value: 'Recontatar lead para reagendar reunião' },
        { type: 'Log message', value: 'Tentativa de reagendamento pós-falta', channel: 'Note' }
      ]
    }
  },
  {
    id: '04_campanha_nutricao',
    title: '04. Campanha de Nutrição de Leads (Semanal)',
    desc: 'Ao cadastrar contato: tagueia nutrição semanal, registra disparo de conteúdo e tarefa de qualificação.',
    glyph: 'users',
    tags: ['Gatilho: Contato', '3 ações'],
    recipe: {
      name: '04. Campanha de Nutrição de Leads (Semanal)',
      trigger: 'Contact created',
      actions: [
        { type: 'Add tag', value: 'Nutrição Semanal' },
        { type: 'Log message', value: 'Disparo de conteúdo educativo e prova social semana 1', channel: 'Note' },
        { type: 'Create task', value: 'Verificar engajamento do lead e qualificação' }
      ]
    }
  },
  {
    id: '05_vendido',
    title: '05. Vendido',
    desc: 'Ao mover oportunidade para etapa Fechado/Ganho: aplica tag de Cliente Ativo e dispara onboarding.',
    glyph: 'bolt',
    tags: ['Gatilho: Etapa CRM', '3 ações'],
    recipe: {
      name: '05. Vendido',
      trigger: 'Opportunity stage changed',
      actions: [
        { type: 'Add tag', value: 'Cliente Ativo' },
        { type: 'Create task', value: 'Iniciar onboarding e entrega do serviço' },
        { type: 'Log message', value: 'Negócio fechado e onboarding disparado', channel: 'Note' }
      ]
    }
  },
  {
    id: 'manychat_whatsapp_keyword',
    title: 'ManyChat WhatsApp - Auto-resposta por Palavra-chave',
    desc: 'Ao receber mensagem com palavra-chave (ex: QUERO): tagueia, responde no WhatsApp, abre deal e cria tarefa.',
    glyph: 'chat',
    tags: ['Gatilho: ManyChat', '4 ações'],
    recipe: {
      name: 'ManyChat WhatsApp - Auto-resposta (QUERO)',
      trigger: 'Customer replied',
      keyword: 'QUERO',
      channel: 'WhatsApp',
      actions: [
        { type: 'Add tag', value: 'Interessado via WhatsApp' },
        { type: 'Send WhatsApp', value: 'Olá! Recebi seu interesse. Aqui está o link com os detalhes da proposta: https://soci.app' },
        { type: 'Create opportunity', value: 'Lead WhatsApp - Oferta' },
        { type: 'Create task', value: 'Acompanhar resposta no WhatsApp em até 30min' }
      ]
    }
  },
  {
    id: 'manychat_human_handoff',
    title: 'ManyChat - Transbordo para Atendente Humano',
    desc: 'Ao receber mensagem com ATENDENTE: tagueia, avisa o cliente no WhatsApp e pausa o fluxo para ligação/atendimento.',
    glyph: 'users',
    tags: ['Gatilho: ManyChat', '3 ações'],
    recipe: {
      name: 'ManyChat - Transbordo para Atendente Humano',
      trigger: 'Customer replied',
      keyword: 'ATENDENTE',
      channel: 'WhatsApp',
      actions: [
        { type: 'Add tag', value: 'Solicitou Atendente' },
        { type: 'Send WhatsApp', value: 'Perfeito! Já transferi seu atendimento para um de nossos especialistas. Aguarde um instante.' },
        { type: 'Manual Call', value: 'Atendimento prioritário solicitado via WhatsApp' }
      ]
    }
  }
];

function parseAiWorkflowPrompt(text, folderId = '') {
  const lower = filterText(text);
  let trigger = 'Contact created';
  let name = 'Fluxo Automatizado com IA';
  let keyword = '';
  let channel = '';
  const actionsList = [];

  if (lower.includes('manychat') || lower.includes('palavra') || lower.includes('respondeu') || lower.includes('mensagem recebida') || lower.includes('quando o cliente mandar') || lower.includes('quando mandar') || lower.includes('receber mensagem')) {
    trigger = 'Customer replied';
    channel = lower.includes('sms') ? 'SMS' : 'WhatsApp';
    const kwMatch = text.match(/palavra[-\s]?chave\s*["'“]?([^"'”,\.\n]+)["'”]?/i) || text.match(/["'“]([A-Z0-9_\-\s]+)["'”]/i);
    keyword = kwMatch?.[1]?.trim() || '';
    name = keyword ? `ManyChat WhatsApp (${keyword})` : 'ManyChat WhatsApp - Resposta Automática';
  } else if (lower.includes('form') || lower.includes('site') || lower.includes('captura')) {
    trigger = 'Form submitted';
    name = 'Follow-up de Formulário Recebido';
  } else if (lower.includes('agend') || lower.includes('reuni') || lower.includes('calend') || lower.includes('marcad')) {
    trigger = 'Appointment booked';
    name = 'Confirmação e Lembretes de Agendamento';
  } else if (lower.includes('link') || lower.includes('clique') || lower.includes('clicou')) {
    trigger = 'Trigger link clicked';
    name = 'Engajamento em Link de Disparo';
  } else if (lower.includes('etapa') || lower.includes('estagio') || lower.includes('pipeline') || lower.includes('oportunidade')) {
    trigger = 'Opportunity stage changed';
    name = 'Avanço de Etapa no Pipeline';
  } else {
    trigger = 'Contact created';
    name = 'Boas-vindas a Novo Lead';
  }

  if (lower.includes('enviar whatsapp') || lower.includes('mandar whatsapp') || lower.includes('mensagem de whatsapp') || trigger === 'Customer replied') {
    actionsList.push({ type: 'Send WhatsApp', value: 'Olá! Recebemos sua mensagem e já vamos te responder com todos os detalhes.' });
  }

  if (lower.includes('tag')) {
    const match = text.match(/tag\s*["'“]?([^"'”,\.\n]+)["'”]?/i);
    const tagVal = match?.[1]?.trim() || (trigger === 'Form submitted' ? 'Lead Formulário' : 'Novo Lead');
    actionsList.push({ type: 'Add tag', value: tagVal });
  } else {
    actionsList.push({ type: 'Add tag', value: trigger === 'Customer replied' ? 'Lead ManyChat' : trigger === 'Form submitted' ? 'Lead Formulário' : 'Lead Qualificado' });
  }

  if (lower.includes('oportunidade') || lower.includes('pipeline') || lower.includes('negocio') || lower.includes('deal')) {
    actionsList.push({ type: 'Create opportunity', value: 'Oportunidade - ' + name });
  }

  if (lower.includes('tarefa') || lower.includes('ligar') || lower.includes('contato') || lower.includes('retornar') || lower.includes('follow')) {
    actionsList.push({ type: 'Create task', value: 'Fazer follow-up com o lead' });
  }

  if (lower.includes('nota') || lower.includes('mensagem') || lower.includes('crm') || lower.includes('registro')) {
    actionsList.push({ type: 'Log message', value: 'Ação automática registrada no CRM via IA', channel: 'Note' });
  }

  if (lower.includes('ligacao') || lower.includes('ligação manual') || lower.includes('atendente') || lower.includes('humano')) {
    actionsList.push({ type: 'Manual Call', value: 'Realizar atendimento com o contato' });
  }

  if (actionsList.length === 0) {
    actionsList.push({ type: 'Add tag', value: 'Processado pela IA' });
    actionsList.push({ type: 'Create task', value: 'Revisar lead no CRM' });
  }

  return {
    name,
    folderId,
    trigger,
    keyword,
    channel,
    actions: actionsList.slice(0, 10),
    active: false,
    allowReentry: true
  };
}

const actionCategories = [
  { title: 'Automação ManyChat & WhatsApp', keys: ['Send WhatsApp', 'Send SMS', 'Log message'] },
  { title: 'CRM & Pipeline', keys: ['Add tag', 'Remove tag', 'Create task', 'Create opportunity'] },
  { title: 'Transbordo & Ações Manuais', keys: ['Manual Call', 'Manual SMS'] }
];
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
  const viewTabs = [['workflows', 'Todos os fluxos'], ['review', `Precisa de avaliação${reviewCount ? ` (${reviewCount})` : ''}`], ['deleted', 'Apagado(a)']];
  const heads = deleted ? ['Nome', 'Excluído em', '<span class="sr-only">Ações</span>'] :
    ['Nome', 'Status', 'Total de inscrições', 'Inscrições ativas', 'Última atualização', '<span class="sr-only">Ações</span>'];
  const drawRow = row => {
    if (deleted) return `<tr><td><strong>${h(row.name)}</strong></td><td>${date(c, row.deletedAt)}</td>
      <td>${button('restore', 'Restaurar', { id: row.id, glyph: 'refresh' })}</td></tr>`;
    const summary = summaryById.get(row.id);
    const statusToggle = `<button type="button" class="wf-toggle-btn ${row.active ? 'active' : ''}" data-wf="quick-toggle" data-wf-id="${h(row.id)}" role="switch" aria-checked="${row.active}" title="${row.active ? 'Publicado (clique para pausar)' : 'Rascunho (clique para publicar)'}"><span class="wf-toggle-track"><span class="wf-toggle-thumb"></span></span><span class="wf-toggle-text">${row.active ? 'Publicado' : 'Rascunho'}</span></button>`;
    const openGlyph = `<svg class="wf-external-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h7v7M13 3L7 9"/></svg>`;
    return `<tr><td>${link('builder', `<strong>${h(row.name)}</strong>${openGlyph}`, row.id, 'wf-name')}
      <span class="wf-sub">${h(triggerLabels[row.trigger] || 'Gatilho pendente')}</span></td>
      <td>${statusToggle}</td>
      <td>${link('enrollments', summary?.total || '0', row.id, 'wf-count')}</td>
      <td>${summary?.active || '0'}</td>
      <td>${date(c, row.updated || row.created)}</td>
      <td>${button('workflow-menu', 'Gerenciar', { id: row.id, cls: 'wf-text' })}</td></tr>`;
  };
  const body = `<div class="wf-toolbar"><label class="wf-search">${icon('search', 17)}
      <input data-wf-search aria-label="Pesquisar fluxos" placeholder="Pesquisar…" value="${h(filters.query)}"></label>
      ${deleted ? '' : `<select data-wf-filter="status" aria-label="Filtrar por status">${options(statuses, filters.status)}</select>`}
      <select data-wf-filter="sort" aria-label="Ordenar fluxos">${options([['updated', 'Mais recentes'], ['name', 'Nome de A a Z']], filters.sort)}</select>
      ${deleted || tab === 'review' ? '' : button('smart-edit', 'Nova lista inteligente', { glyph: 'plus' })}
    </div>
    ${folder || saved ? `<div class="wf-crumb">${link('workflows', 'Página inicial')} ${icon('right', 13)}
      <strong>${h((folder || saved).name)}</strong>${saved ? button('smart-menu', 'Gerenciar lista', { id: saved.id, cls: 'wf-text' }) : ''}</div>` : `<div class="wf-crumb-root">${icon('folder', 14)} <span>Página inicial</span></div>`}
    ${s.workflowLists.length && !deleted && tab !== 'review' ? `<nav class="wf-saved" aria-label="Listas inteligentes">${s.workflowLists.map(row =>
      link('smart', h(row.name), row.id, row.id === id ? 'current' : '')).join('')}</nav>` : ''}
    ${folderCards ? `<div class="wf-folders">${folderCards}</div>` : ''}
    <div data-wf-rows>${rows.length ? paginate(rows, filters.page, 15, page => table(heads, page.map(drawRow))) :
      empty(deleted ? 'Nenhum fluxo excluído' : tab === 'review' ? 'Nenhum fluxo precisa de revisão' : 'Nenhum fluxo encontrado',
        source.length ? '' : deleted || tab === 'review' ? '' : 'Crie um fluxo para automatizar tarefas do CRM.')}</div>`;
  return utabs({
    key: 'automation-list',
    nested: true,
    label: 'Filtros de fluxos',
    current: folder ? 'workflows' : tab,
    items: viewTabs.map(([k, label]) => ({ value: k, label, href: `#automation/${k}` })),
    content: body
  });
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
      { name: '', folderId, trigger: '', actions: [], active: false, allowReentry: true }, node: null, zoom: 1, panX: 0, panY: 0, dirty: false };
  }
  return c.workflowDraft;
}

function canvas(c, editor) {
  const { row, node } = editor;
  const selected = row.actions[node];
  const atLimit = row.actions.length >= maxActions;
  const control = (op, label, glyph) => button(op, `<span class="sr-only">${label}</span>`, { cls: 'wf-canvas-tool', glyph });
  const add = position => `<div class="wf-connector">${button('node-add', `<span class="sr-only">${position < row.actions.length ? `Inserir antes da ação ${position + 1}` : 'Adicionar ao fim do fluxo'}</span>`,
    { id: position, glyph: 'plus', cls: 'wf-add', disabled: atLimit })}</div>`;
  const card = (key, label, detail, glyph) => {
    const trigger = key === 'trigger';
    const configured = trigger ? Boolean(row.trigger) : Boolean(detail?.trim());
    return `<button type="button" class="wf-node ${trigger ? 'wf-node-trigger' : ''} ${key === node ? 'current' : ''}"
      data-wf="node" data-wf-id="${key}" aria-expanded="${key === node}">
      <span class="wf-node-body"><span class="wf-node-icon">${icon(glyph, 21)}</span><span class="wf-node-copy">
      <span class="wf-node-kind">${trigger ? 'Gatilho' : 'Ação'}</span><strong>${h(label)}</strong><small ${detail?.trim() ? '' : 'hidden'}>${h(detail)}</small></span></span>
      <span class="wf-node-footer"><span>${trigger ? 'Entrada' : `# ${key + 1}`}</span><span data-wf-node-status>${icon(configured ? 'check' : 'sliders', 13)} ${configured ? 'Configurado' : 'Configurar'}</span></span></button>`;
  };
  const refs = {
    'Trigger link clicked': ['linkId', 'Link de rastreamento', [['', 'Qualquer link'], ...records(c.s.triggerLinks)]],
    'Form submitted': ['formId', 'Formulário', [['', 'Qualquer formulário'], ...records(c.s.forms)]],
    'Opportunity stage changed': ['stageId', 'Etapa de destino', [['', 'Qualquer etapa'], ...c.s.stages.map(stage =>
      [stage.id, [c.s.pipelines.find(pipeline => pipeline.id === stage.pipelineId)?.name, stage.name].filter(Boolean).join(' / ')])]],
    'Customer replied': ['channel', 'Canal da mensagem', [['', 'Qualquer canal'], ['WhatsApp', 'WhatsApp'], ['SMS', 'SMS'], ['Email', 'E-mail'], ['Live chat', 'Chat']]]
  };
  const ref = refs[row.trigger];
  const panel = selected ? `${select('type', 'Ação', actionOptions, selected.type)}
      ${field('value', actions[selected.type]?.[2] || 'Conteúdo da ação', selected.value, 500)}
      ${['Manual Call', 'Manual SMS'].includes(selected.type) ? field('assignee', 'Responsável', selected.assignee, 80, false) : ''}
      ${selected.type === 'Log message' ? select('channel', 'Canal do registro', [['Note', 'Nota interna'], ['Email', 'E-mail'], ['SMS', 'SMS']], selected.channel || 'Note') : ''}
      <div class="wf-node-tools">${button('node-up', 'Mover antes', { glyph: 'left', disabled: node === 0 })}
        ${button('node-down', 'Mover depois', { glyph: 'right', disabled: node === row.actions.length - 1 })}
        ${button('node-delete', 'Remover ação', { cls: 'wf-text', glyph: 'trash' })}</div>`
    : `${select('trigger', 'Evento que inicia o fluxo', triggers, row.trigger)}
      ${ref ? select(ref[0], ref[1], ref[2], row[ref[0]]) : ''}
      ${row.trigger === 'Customer replied' ? field('keyword', 'Palavra-chave (ex: QUERO, PRECO - opcional)', row.keyword || '', 100, false) : ''}`;
  const panX = editor.panX || 0, panY = editor.panY || 0, zoom = editor.zoom || 1;
  return `<div class="wf-workbench"><div class="wf-stage" style="--wf-pan-x:${panX}px;--wf-pan-y:${panY}px;background-position:calc(50% + ${panX}px) calc(50% + ${panY}px)">
    <div class="wf-canvas" tabindex="0" role="region" aria-label="Canvas do fluxo"><div class="wf-canvas-space"><div class="wf-track" style="--wf-zoom:${zoom};--wf-pan-x:${panX}px;--wf-pan-y:${panY}px;transform:translate3d(${panX}px,${panY}px,0) scale(${zoom});transform-origin:center center">
    ${card('trigger', triggerLabels[row.trigger] || 'Adicionar gatilho', '', 'bolt')}
    ${row.actions.map((step, index) => add(index) + card(index, actions[step.type]?.[0] || step.type, step.value, actions[step.type]?.[1] || 'flow')).join('')}
    ${add(row.actions.length)}</div></div></div>
    <div class="wf-canvas-controls" role="group" aria-label="Zoom do canvas">
      ${control('zoom-in', 'Aproximar', 'plus')}${button('zoom-out', '<span aria-hidden="true">−</span><span class="sr-only">Afastar</span>', { cls: 'wf-canvas-tool' })}
      ${control('zoom-fit', 'Enquadrar fluxo', 'monitor')}
    </div>
    <div class="wf-dock">${button('node-add', 'Adicionar ação', { id: row.actions.length, glyph: 'plus', cls: 'wf-dock-add', disabled: atLimit })}
      <span>${atLimit ? 'Limite de 10 ações' : `${row.actions.length} ${row.actions.length === 1 ? 'ação' : 'ações'}`}</span>
    </div></div>
    ${node !== null ? `<aside class="wf-inspector" aria-label="Configuração do bloco"><div class="wf-inspector-head">
      <h2>${selected ? 'Configurar ação' : 'Configurar gatilho'}</h2>${control('node-close', 'Fechar configuração', 'close')}</div>${panel}</aside>` : ''}</div>`;
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
  const builderHeader = `<header class="wf-builder-header"><div class="wf-builder-bar">
    ${link('workflows', `${icon('left', 18)}<span class="sr-only">Voltar para fluxos</span>`, '', 'wf-builder-back')}
    <div class="wf-builder-title">${name}</div>
    <div class="wf-head-actions">${button('save-draft', live?.active ? 'Salvar alterações' : 'Salvar rascunho')}
      ${live?.active ? button('unpublish', 'Voltar para rascunho') : button('publish', 'Publicar', { glyph: 'check', cls: 'primary' })}</div></div>
    <div class="wf-builder-meta">${stateBadge(live?.active)}<span class="wf-sub" data-wf-unsaved ${editor.dirty ? '' : 'hidden'}>Alterações pendentes</span>${navigation}</div></header>`;
  if (tab === 'builder') return `<div class="wf-editor wf-builder" data-wf-editor>${builderHeader}${canvas(c, editor)}</div>`;
  const inner = `${['builder', 'settings'].includes(tab) ? `<div class="wf-workflow-name">${name}</div>` : ''}
    ${tab === 'settings' ? settings : history(c, c.s.runs.filter(run => run.workflowId === id), tab, false)}`;
  const cta = `<span class="wf-sub" data-wf-unsaved ${editor.dirty ? '' : 'hidden'}>Alterações pendentes</span>${stateBadge(live?.active)}
    ${tab === 'enrollments' && live.active ? button('enroll', 'Inscrever contato', { glyph: 'plus', cls: 'primary', id }) : ''}
    ${['builder', 'settings'].includes(tab) ? button('save-draft', live?.active ? 'Salvar alterações' : 'Salvar rascunho') +
      (live?.active ? button('unpublish', 'Voltar para rascunho') : button('publish', 'Publicar', { glyph: 'check', cls: 'primary' })) : ''}`;
  return pageShell({
    title: live ? h(live.name) : 'Novo fluxo',
    back: `<a class="page-back" href="#automation/workflows">${icon('left', 15)} Fluxos de trabalho</a>`,
    cta,
    className: 'wf-page',
    attrs: 'data-wf-editor',
    tabs: live ? {
      key: 'automation-editor',
      label: 'Seções do fluxo',
      current: tab,
      items: editorTabs.map(([key, label]) => ({ value: key, label, href: `#automation/${key}/${encodeURIComponent(id)}` }))
    } : null,
    content: inner
  });
}

export function automationScreen(c) {
  const tab = c.tab || 'workflows', id = c.automationId;
  if (editorTabs.some(([key]) => key === tab) && (id || tab === 'builder')) {
    if (tab === 'builder') return `<div class="page wf-page wf-builder-page">${editorScreen(c, tab, id)}</div>`;
    return editorScreen(c, tab, id);
  }
  const activeRoute = tab === 'overview' || tab === 'logs' ? tab : 'workflows';
  return pageShell({
    title: 'Lista de fluxos de trabalho',
    desc: 'Automatize processos do CRM, organize fluxos em pastas e acompanhe o histórico de execuções.',
    cta: `${button('folder-edit', 'Criar pasta', { glyph: 'folder' })}${button('ai-workflow-modal', 'Construa usando IA', { glyph: 'sparkles', cls: 'wf-btn-ai' })}${button('recipe-picker', 'Criar fluxo de trabalho', { glyph: 'plus', cls: 'primary', id: tab === 'folder' ? id : '' })}`,
    className: 'wf-page',
    tabs: {
      key: 'automation',
      label: 'Seções de automação',
      current: activeRoute,
      items: routeTabs.map(([key, label]) => ({ value: key, label, href: `#automation/${key}` }))
    },
    content: tab === 'overview' ? overview(c) : tab === 'logs' ? history(c, c.s.runs, 'logs', true) : workflowList(c, tab, id)
  });
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
  const canvasElement = () => document.querySelector('.wf-canvas');
  const renderCanvas = (focus, revealNode = false) => {
    const left = canvasElement()?.scrollLeft || 0;
    render();
    const viewport = canvasElement();
    if (!viewport) return;
    viewport.scrollLeft = left;
    if (revealNode) {
      const current = viewport.querySelector('.wf-node.current');
      if (current) {
        const card = current.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
        if (card.left < bounds.left || card.right > bounds.right) {
          viewport.scrollLeft += (card.left - bounds.left) * viewport.clientWidth / bounds.width - 24;
        }
      }
    }
    document.querySelector(focus)?.focus({ preventScroll: !revealNode });
  };
  const zoomCanvas = op => {
    const viewport = canvasElement(), track = viewport?.querySelector('.wf-track'), stage = viewport?.closest('.wf-stage');
    const editor = c.workflowDraft;
    if (!viewport || !track || !editor) return;
    if (op === 'zoom-fit') {
      editor.panX = 0;
      editor.panY = 0;
      const availWidth = viewport.clientWidth - 96;
      editor.zoom = track.offsetWidth > availWidth && track.offsetWidth > 0 ? Math.min(1, Math.max(0.25, Number((availWidth / track.offsetWidth).toFixed(2)))) : 1;
    } else {
      editor.zoom = Math.max(0.15, Math.min(2.0, Number(((editor.zoom || 1) * (op === 'zoom-in' ? 1.25 : 0.8)).toFixed(2))));
    }
    track.style.transform = `translate3d(${editor.panX || 0}px, ${editor.panY || 0}px, 0) scale(${editor.zoom || 1})`;
    track.style.setProperty('--wf-zoom', editor.zoom);
    track.style.setProperty('--wf-pan-x', `${editor.panX || 0}px`);
    track.style.setProperty('--wf-pan-y', `${editor.panY || 0}px`);
    if (stage) {
      stage.style.backgroundPosition = `calc(50% + ${editor.panX || 0}px) calc(50% + ${editor.panY || 0}px)`;
    }
  };
  const actionPicker = position => {
    dialog('Adicionar ação ao fluxo', `<div class="wf-picker" data-wf-insert="${position}">
      <label class="wf-search">${icon('search', 17)}<span class="sr-only">Buscar ação</span><input type="search" placeholder="Buscar ação..." data-wf-action-search autofocus></label>
      ${actionCategories.map(cat => `
        <div class="wf-picker-category">
          <h3 class="wf-picker-category-title">${cat.title}</h3>
          <div class="wf-picker-grid">${cat.keys.filter(type => actions[type]).map(type => {
            const [label, glyph] = actions[type];
            return button('node-insert', `<span class="wf-node-icon">${icon(glyph, 20)}</span><span><strong>${label}</strong><small>${actionDescriptions[type]}</small></span>`,
              { id: type, cls: 'wf-picker-option' });
          }).join('')}</div>
        </div>`).join('')}
      <p data-wf-no-actions hidden role="status">Nenhuma ação encontrada.</p></div>`);
    document.querySelector('[data-wf-action-search]')?.focus();
  };

  let pan = null;
  document.addEventListener('pointerdown', event => {
    const canvas = event.target.closest('.wf-canvas');
    if (!canvas) return;
    const isMiddle = event.button === 1;
    if (event.button !== 0 && !isMiddle) return;
    if (!isMiddle && event.target.closest('button, input, select, textarea, a, .wf-inspector, .wf-canvas-controls, .wf-dock')) return;
    const editor = c.workflowDraft;
    if (!editor) return;
    if (isMiddle) event.preventDefault();
    pan = {
      id: event.pointerId,
      canvas,
      startX: event.clientX,
      startY: event.clientY,
      initialPanX: editor.panX || 0,
      initialPanY: editor.panY || 0,
      track: canvas.querySelector('.wf-track'),
      stage: canvas.closest('.wf-stage')
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-panning');
  });

  document.addEventListener('pointermove', event => {
    if (!pan || pan.id !== event.pointerId) return;
    const editor = c.workflowDraft;
    if (!editor) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    editor.panX = Math.round(pan.initialPanX + dx);
    editor.panY = Math.round(pan.initialPanY + dy);
    if (pan.track) {
      pan.track.style.transform = `translate3d(${editor.panX}px, ${editor.panY}px, 0) scale(${editor.zoom || 1})`;
      pan.track.style.setProperty('--wf-pan-x', `${editor.panX}px`);
      pan.track.style.setProperty('--wf-pan-y', `${editor.panY}px`);
    }
    if (pan.stage) {
      pan.stage.style.backgroundPosition = `calc(50% + ${editor.panX}px) calc(50% + ${editor.panY}px)`;
    }
  });

  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    document.addEventListener(name, event => {
      if (!pan || pan.id !== event.pointerId) return;
      pan.canvas.classList.remove('is-panning');
      pan = null;
    });
  }

  document.addEventListener('wheel', event => {
    const canvas = event.target.closest('.wf-canvas');
    if (!canvas) return;
    const editor = c.workflowDraft;
    if (!editor) return;
    const track = canvas.querySelector('.wf-track'), stage = canvas.closest('.wf-stage');
    if (!track) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      editor.zoom = Math.max(0.15, Math.min(2.0, Number(((editor.zoom || 1) * factor).toFixed(3))));
    } else {
      editor.panX = Math.round((editor.panX || 0) - event.deltaX);
      editor.panY = Math.round((editor.panY || 0) - event.deltaY);
    }
    track.style.transform = `translate3d(${editor.panX || 0}px, ${editor.panY || 0}px, 0) scale(${editor.zoom || 1})`;
    track.style.setProperty('--wf-zoom', editor.zoom || 1);
    track.style.setProperty('--wf-pan-x', `${editor.panX || 0}px`);
    track.style.setProperty('--wf-pan-y', `${editor.panY || 0}px`);
    if (stage) {
      stage.style.backgroundPosition = `calc(50% + ${editor.panX || 0}px) calc(50% + ${editor.panY || 0}px)`;
    }
  }, { passive: false });
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
    if (input.matches('[data-wf-action-search]')) {
      const picker = input.closest('.wf-picker'), query = filterText(input.value.trim());
      let found = false;
      for (const option of picker.querySelectorAll('.wf-picker-option')) {
        option.hidden = !filterText(option.textContent).includes(query);
        found ||= !option.hidden;
      }
      for (const cat of picker.querySelectorAll('.wf-picker-category')) {
        const hasVisible = Array.from(cat.querySelectorAll('.wf-picker-option')).some(opt => !opt.hidden);
        cat.hidden = !hasVisible;
      }
      picker.querySelector('[data-wf-no-actions]').hidden = found;
    } else if (input.matches('[data-wf-search]')) {
      Object.assign(listing(c), { query: input.value, page: 0 });
      updateList(input);
    } else if (input.closest('[data-wf-editor]') && ['name', 'value', 'assignee', 'keyword'].includes(input.name)) {
      const editor = c.workflowDraft;
      const record = input.name === 'name' ? editor.row : editor.row.actions[editor.node];
      record[input.name] = input.value;
      if (input.name === 'value') {
        const node = document.querySelector(`.wf-node[data-wf-id="${editor.node}"]`);
        if (node) {
          const detail = node.querySelector('small'), configured = Boolean(input.value.trim());
          detail.textContent = input.value;
          detail.hidden = !configured;
          node.querySelector('[data-wf-node-status]').innerHTML = `${icon(configured ? 'check' : 'sliders', 13)} ${configured ? 'Configurado' : 'Configurar'}`;
        }
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
      renderCanvas(`[data-wf-editor] select[name="${input.name}"]`);
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
      if (op.startsWith('zoom-')) {
        zoomCanvas(op);
      } else if (op === 'node-add') {
        if (editor.row.actions.length < maxActions) actionPicker(Number(id));
      } else if (op.startsWith('node')) {
        if (op === 'node-close') {
          const key = editor.node;
          editor.node = null;
          renderCanvas(`.wf-node[data-wf-id="${key}"]`);
          return;
        }
        if (op === 'node') editor.node = id === 'trigger' ? id : Number(id);
        else {
          const steps = editor.row.actions, index = editor.node;
          if (op === 'node-insert') {
            if (steps.length >= maxActions || !Object.hasOwn(actions, id)) return;
            editor.node = Number(btn.closest('.wf-picker').dataset.wfInsert);
            steps.splice(editor.node, 0, { type: id, value: '' });
            close();
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
        renderCanvas(op === 'node-insert' ? '.wf-inspector input[name="value"]' : '.wf-inspector select', true);
      } else if (['save-draft', 'publish', 'unpublish'].includes(op)) {
        const record = editor.row, active = op === 'publish' || (op === 'save-draft' && Boolean(record.active));
        if (!record.name.trim()) {
          document.querySelector('[data-wf-editor] [name="name"]')?.focus();
          throw Error('Dê um nome ao fluxo antes de salvar.');
        }
        const incomplete = record.actions.findIndex(step => !step.value?.trim());
        if (incomplete !== -1) {
          if (c.tab === 'builder') {
            editor.node = incomplete;
            renderCanvas('.wf-inspector input[name="value"]', true);
          }
          throw Error('Preencha o conteúdo de todas as ações.');
        }
        pendingSave = true;
        btn.disabled = true;
        const key = await mutate({ type: 'save', key: 'workflows', id: record.id, data: { ...record, active } });
        if (c.workspace !== workspace) return;
        c.workflowDraft = null;
        if (c.view === 'automation' && ['builder', 'settings'].includes(c.tab) && c.automationId === editor.key) show(c.tab, key);
        flash(active ? 'Fluxo publicado.' : 'Rascunho salvo.');
      } else if (op === 'quick-toggle') {
        if (!row) return;
        const nextActive = !row.active;
        if (nextActive && (!row.trigger || !row.actions?.length)) {
          throw Error('Defina um gatilho e pelo menos uma ação para publicar.');
        }
        pendingSave = true;
        btn.disabled = true;
        await mutate({ type: 'save', key: 'workflows', id: row.id, data: { ...row, active: nextActive } });
        render();
        flash(nextActive ? 'Fluxo publicado.' : 'Fluxo alterado para rascunho.');
      } else if (op === 'ai-workflow-modal') {
        dialog('Construa usando IA', `<form class="wf-modal wf-ai-modal" data-wf-form="ai-workflow-form" data-wf-folder="${h(id || '')}">
          <p class="wf-ai-desc">Descreva em linguagem natural o objetivo da sua automação. A inteligência da Soci configurará o gatilho, as condições e as ações automaticamente.</p>
          <label>Instrução para a IA
            <textarea name="prompt" rows="4" placeholder="Ex: Quando um lead preencher o formulário no site, adicione a tag 'Novo Lead', crie uma oportunidade de R$ 3.000 no pipeline e agende uma ligação manual para retorno." required autofocus></textarea>
          </label>
          <div class="wf-ai-suggestions">
            <span class="wf-ai-sug-title">Sugestões rápidas:</span>
            <button type="button" class="wf-pill-btn" data-wf="ai-suggest" data-wf-prompt="Quando um lead preencher o formulário do site, aplicar a tag Novo Lead, criar oportunidade no pipeline e criar tarefa de retorno em até 15 minutos.">01. Follow-up de Novo Lead</button>
            <button type="button" class="wf-pill-btn" data-wf="ai-suggest" data-wf-prompt="Quando um agendamento for marcado no calendário, aplicar a tag Reunião Marcada e agendar tarefa de preparação da pauta.">02. Confirmação de Agendamento</button>
            <button type="button" class="wf-pill-btn" data-wf="ai-suggest" data-wf-prompt="Quando a oportunidade mudar para a etapa de Negociação, aplicar tag Etapa Avançada e agendar tarefa de acompanhamento com tomador de decisão.">03. Avanço no Pipeline</button>
          </div>
          <div class="wf-head-actions">
            <button type="button" class="secondary" data-close-dialog>Cancelar</button>
            <button class="primary wf-btn-ai-submit" type="submit">${icon('sparkles', 15)} Gerar com IA</button>
          </div>
        </form>`);
      } else if (op === 'ai-suggest') {
        const textarea = document.querySelector('.wf-ai-modal textarea[name="prompt"]');
        if (textarea) {
          textarea.value = btn.dataset.wfPrompt || '';
          textarea.focus();
        }
      } else if (op === 'recipe-picker') {
        dialog('Criar novo fluxo de automação', `<div class="wf-recipe-modal">
          <p class="wf-recipe-intro">Escolha uma receita pré-configurada baseada em fluxos de alto desempenho do HighLevel ou comece do zero.</p>
          <div class="wf-recipe-grid">${workflowRecipes.map(recipe => `
            <button type="button" class="wf-recipe-card" data-wf="apply-recipe" data-wf-id="${recipe.id}" data-wf-folder="${h(id || '')}">
              <div class="wf-recipe-header">
                <span class="wf-recipe-icon">${icon(recipe.glyph, 20)}</span>
                <div class="wf-recipe-tags">${recipe.tags.map(t => `<span class="wf-recipe-tag">${h(t)}</span>`).join('')}</div>
              </div>
              <strong>${h(recipe.title)}</strong>
              <p>${h(recipe.desc)}</p>
            </button>`).join('')}</div></div>`);
      } else if (op === 'apply-recipe') {
        const recipeItem = workflowRecipes.find(r => r.id === id);
        const folderId = btn.dataset.wfFolder || '';
        close();
        if (!recipeItem || !recipeItem.recipe) {
          show('builder', folderId);
        } else {
          c.workflowDraft = {
            workspace: c.workspace,
            key: '',
            row: {
              name: recipeItem.recipe.name,
              folderId,
              trigger: recipeItem.recipe.trigger,
              actions: structuredClone(recipeItem.recipe.actions),
              active: false,
              allowReentry: true
            },
            node: null,
            zoom: 1,
            panX: 0,
            panY: 0,
            dirty: true
          };
          show('builder');
          flash('Receita aplicada no construtor. Revise e publique quando desejar.');
        }
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
      if (op === 'ai-workflow-form') {
        const folderId = form.dataset.wfFolder || '';
        const prompt = data.prompt || '';
        if (!prompt.trim()) throw Error('Descreva o que o fluxo deve fazer.');
        const parsed = parseAiWorkflowPrompt(prompt, folderId);
        c.workflowDraft = {
          workspace: c.workspace,
          key: '',
          row: parsed,
          node: null,
          zoom: 1,
          panX: 0,
          panY: 0,
          dirty: true
        };
        close();
        show('builder');
        flash('Fluxo gerado pela IA com sucesso! Revise e publique.');
        return;
      }
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
