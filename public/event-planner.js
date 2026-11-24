import { icon as i } from './icons.js';
import {
  blankEventPlan, briefFields, channels, eventPlanPhases, eventPlanStatuses,
  eventPlanTeams, eventStatusLabel, itemKinds, itemStatus, launchEventPlan,
  phaseLabel, teamLabel
} from './event-planner-data.js';

const h = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const same = (a, b) => String(a || '') === String(b || '');
const optionRows = (rows, value, empty = '') => `${empty ? `<option value="">${h(empty)}</option>` : ''}${rows.map(([id, label]) => `<option value="${h(id)}" ${same(id, value) ? 'selected' : ''}>${h(label)}</option>`).join('')}`;
const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Sem data';
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const planOf = event => event?.plan || blankEventPlan();
const records = (event, kind) => planOf(event).items.filter(item => item.kind === kind);
const primary = (label, attrs = '') => `<button class="primary" ${attrs}>${label}</button>`;
const ui = { workspace: '', selectedId: '', section: 'strategy', phase: 'all', status: 'all', events: 'active' };

function reset(workspace) {
  if (ui.workspace === workspace) return;
  ui.workspace = workspace; ui.selectedId = ''; ui.section = 'strategy'; ui.phase = 'all'; ui.status = 'all'; ui.events = 'active';
}
function eventProgress(event) {
  const items = planOf(event).items;
  const tasks = items.filter(row => row.kind === 'task');
  const messages = items.filter(row => row.kind === 'message');
  const links = items.filter(row => row.kind === 'link');
  const agenda = items.filter(row => row.kind === 'agenda');
  return { tasks, done: tasks.filter(row => row.status === 'feito').length, messages, sent: messages.filter(row => row.status === 'enviado').length, links, ready: links.filter(row => row.status === 'pronto').length, agenda, minutes: agenda.reduce((sum, row) => sum + numeric(row.duration), 0) };
}
function statusPill(value, label = value) { return `<span class="ep-pill ep-${h(value)}">${h(label)}</span>`; }
function dateMeta(item) { return [item.date ? dateLabel(item.date) : '', item.time || ''].filter(Boolean).join(' · ') || 'Sem prazo'; }
function filterItems(items) { return items.filter(item => (ui.phase === 'all' || item.phase === ui.phase) && (ui.status === 'all' || item.status === ui.status)); }
function emptyList(title, text, icon) { return `<div class="ep-empty-list"><span>${i(icon, 20)}</span><div><h3>${h(title)}</h3><p>${h(text)}</p></div></div>`; }

const eventBadge = { planejado: '', em_andamento: ' blue', concluido: ' green', arquivado: '' };
function statusBadge(value) { return `<span class="badge${eventBadge[value] || ''}">${h(eventStatusLabel(value))}</span>`; }
function eventCard(event) {
  const p = eventProgress(event), total = p.tasks.length, percent = total ? Math.round(p.done / total * 100) : 0, key = h(event.id);
  return `<article class="surface ep-card"><button type="button" class="ep-card-body" data-ep-open="${key}"><span class="ep-card-meta">${statusBadge(event.status)}<span>${h(event.eventDate ? dateLabel(event.eventDate) : 'Data a definir')}</span></span><strong class="ep-card-title">${h(event.title)}</strong><span class="ep-card-stats"><span>${total ? `${p.done} de ${total} ${total === 1 ? 'tarefa concluída' : 'tarefas concluídas'}` : 'Sem tarefas'}</span><span><b>${p.sent}/${p.messages.length}</b> mensagens</span><span><b>${p.ready}/${p.links.length}</b> links</span></span><span class="ep-progress" aria-hidden="true"><span style="width:${percent}%"></span></span></button><div class="ep-card-actions" role="group" aria-label="Ações para ${h(event.title)}"><button type="button" class="text-link" data-ep-manage="rename" data-id="${key}">Renomear</button><button type="button" class="text-link" data-ep-manage="duplicate" data-id="${key}">Duplicar</button><button type="button" class="danger plain" data-ep-manage="delete" data-id="${key}">Apagar</button></div></article>`;
}
function gallery(c, pageShell, marketingTabs) {
  const all = c.s.eventPlans || [];
  const events = all
    .filter(event => ui.events === 'all' || (ui.events === 'active' ? event.status !== 'arquivado' : event.status === ui.events))
    .sort((a, b) => (a.eventDate || '9999').localeCompare(b.eventDate || '9999') || a.title.localeCompare(b.title, 'pt-BR'));
  const create = primary(`${i('plus', 16)} Novo evento`, 'type="button" data-ep-new');
  const nothing = all.length
    ? `<div class="empty">${i('filter', 26)}<strong>Nenhum evento com este status</strong><p>Troque o filtro para ver os outros eventos.</p></div>`
    : `<div class="empty">${i('calendar', 26)}<strong>Nenhum evento planejado</strong><p>Crie um plano com estratégia, tarefas, mensagens, roteiro e links do lançamento.</p>${create}</div>`;
  const filter = all.length ? `<div class="ep-toolbar"><label>Status<select data-ep-status-filter>${optionRows([['active', 'Ativos'], ['all', 'Todos'], ...eventPlanStatuses], ui.events)}</select></label></div>` : '';
  return pageShell({ title: 'Planejador de eventos', desc: 'Organize estratégia, operação e comunicação de cada lançamento desta subconta.', className: 'ep', cta: create, tabs: { key: 'marketing', items: marketingTabs, current: 'events', label: 'Seções de marketing' }, content: `${filter}<section class="ep-gallery" aria-label="Eventos planejados">${events.map(eventCard).join('') || nothing}</section>` });
}

function hero(event) {
  const p = eventProgress(event);
  return `<section class="ep-hero"><div class="ep-hero-copy"><button class="ep-back" data-ep-back>${i('left', 15)} Todos os eventos</button><div class="ep-hero-title"><div><span class="ep-eyebrow">${h(dateLabel(event.eventDate))}</span><h1>${h(event.title)}</h1></div>${statusPill(event.status, eventStatusLabel(event.status))}</div><div class="ep-hero-actions"><button class="secondary" data-ep-orchestrate="${h(event.id)}">${i('flow', 15)} Orquestrar</button><button class="secondary" data-ep-edit="${h(event.id)}">${i('edit', 15)} Editar evento</button><button class="secondary" data-ep-manage="duplicate" data-id="${h(event.id)}">${i('copy', 15)} Duplicar</button><button class="secondary" data-ep-manage="delete" data-id="${h(event.id)}">${i('trash', 15)} Excluir</button></div></div><dl class="ep-kpis"><div><dt>Tarefas</dt><dd>${p.done}<small>/${p.tasks.length}</small></dd><span>concluídas</span></div><div><dt>Comunicação</dt><dd>${p.sent}<small>/${p.messages.length}</small></dd><span>enviadas</span></div><div><dt>Roteiro</dt><dd>${Math.floor(p.minutes / 60)}h${String(p.minutes % 60).padStart(2, '0')}</dd><span>previstas</span></div><div><dt>Links</dt><dd>${p.ready}<small>/${p.links.length}</small></dd><span>validados</span></div></dl></section>`;
}

function briefView(event) {
  const brief = planOf(event).brief || {}, completed = briefFields.filter(([key]) => brief[key]).length;
  return `<section class="ep-section-head"><div><span class="ep-eyebrow">Fundamentos</span><h2>Estratégia do evento</h2><p>Defina o que orienta as decisões de conteúdo, operação e vendas.</p></div><button class="secondary" data-ep-edit-brief="${h(event.id)}">${i('edit', 15)} Editar estratégia</button></section><div class="ep-brief-progress"><span>${completed}/${briefFields.length} campos definidos</span><div><i style="width:${Math.round(completed / briefFields.length * 100)}%"></i></div></div><div class="ep-brief-grid">${briefFields.map(([key, label, hint]) => `<article class="surface ep-brief"><span>${h(label)}</span><h3>${h(brief[key]) || 'Ainda não definido'}</h3><p>${h(brief[key]) ? '' : h(hint)}</p></article>`).join('')}</div>`;
}
function filterBar(kind) { return `<div class="ep-filter"><label>Fase<select data-ep-filter="phase">${optionRows([['all', 'Todas'], ...eventPlanPhases], ui.phase)}</select></label><label>Status<select data-ep-filter="status">${optionRows([['all', 'Todos'], ...itemStatus[kind]], ui.status)}</select></label></div>`; }
function itemButtons(event, item) { return `<div class="ep-row-actions"><button class="icon-btn" aria-label="Editar" title="Editar" data-ep-item-edit="${h(item.id)}" data-ep-event="${h(event.id)}">${i('edit', 15)}</button><button class="icon-btn" aria-label="Excluir" title="Excluir" data-ep-item-delete="${h(item.id)}" data-ep-event="${h(event.id)}">${i('trash', 15)}</button></div>`; }
function tasksView(event) {
  const rows = filterItems(records(event, 'task')).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title, 'pt-BR'));
  return `<section class="ep-section-head"><div><span class="ep-eyebrow">Execução</span><h2>Tarefas</h2><p>Responsáveis, prazos e entregáveis para manter o plano no ritmo.</p></div><button class="primary" data-ep-item-new="task" data-ep-event="${h(event.id)}">${i('plus', 15)} Nova tarefa</button></section>${filterBar('task')}<div class="ep-list">${rows.map(item => `<article class="surface ep-item ep-task"><div class="ep-item-main"><div class="ep-item-top"><span class="ep-checkbox ${item.status === 'feito' ? 'done' : ''}" aria-hidden="true">${item.status === 'feito' ? i('check', 14) : ''}</span><div><h3>${h(item.title)}</h3><p>${h(phaseLabel(item.phase))}${item.team ? ` · ${h(teamLabel(item.team))}` : ''}${item.owner ? ` · ${h(item.owner)}` : ''}</p></div></div>${item.notes ? `<p class="ep-note">${h(item.notes)}</p>` : ''}</div><div class="ep-item-side"><span class="ep-date">${h(dateMeta(item))}</span><select aria-label="Status da tarefa" data-ep-item-status="${h(item.id)}" data-ep-event="${h(event.id)}">${optionRows(itemStatus.task, item.status)}</select>${itemButtons(event, item)}</div></article>`).join('') || emptyList('Nenhuma tarefa nesta seleção', 'Crie tarefas para transformar a estratégia em entregas concretas.', 'check-square')}</div>`;
}
function messagesView(event) {
  const rows = filterItems(records(event, 'message')).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'pt-BR'));
  return `<section class="ep-section-head"><div><span class="ep-eyebrow">Calendário editorial</span><h2>Comunicação</h2><p>Planeje cada mensagem da campanha e acompanhe o que já foi enviado.</p></div><button class="primary" data-ep-item-new="message" data-ep-event="${h(event.id)}">${i('plus', 15)} Nova comunicação</button></section>${filterBar('message')}<div class="ep-list ep-message-list">${rows.map(item => `<article class="surface ep-item ep-message"><div class="ep-item-main"><div class="ep-item-top"><span class="ep-channel">${h((channels.find(([key]) => key === item.channel) || ['', 'Outro'])[1])}</span><div><h3>${h(item.title)}</h3><p>${h(phaseLabel(item.phase))}${item.owner ? ` · ${h(item.owner)}` : ''}</p></div></div>${item.notes ? `<pre class="ep-copy">${h(item.notes)}</pre>` : '<p class="ep-note">Sem texto definido.</p>'}</div><div class="ep-item-side"><span class="ep-date">${h(dateMeta(item))}</span><select aria-label="Status da comunicação" data-ep-item-status="${h(item.id)}" data-ep-event="${h(event.id)}">${optionRows(itemStatus.message, item.status)}</select><div class="ep-row-actions"><button class="icon-btn" aria-label="Copiar texto" title="Copiar texto" data-ep-copy="${h(item.id)}" data-ep-event="${h(event.id)}">${i('copy', 15)}</button>${itemButtons(event, item)}</div></div></article>`).join('') || emptyList('Nenhuma comunicação nesta seleção', 'Adicione os avisos, convites e follow-ups que sustentam a campanha.', 'send')}</div>`;
}
function agendaView(event) {
  const rows = filterItems(records(event, 'agenda')).sort((a, b) => numeric(a.order) - numeric(b.order) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'pt-BR'));
  const total = rows.reduce((sum, item) => sum + numeric(item.duration), 0);
  return `<section class="ep-section-head"><div><span class="ep-eyebrow">Operação ao vivo</span><h2>Roteiro do dia</h2><p>${total ? `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')} no roteiro atual.` : 'Organize a sequência do evento.'}</p></div><button class="primary" data-ep-item-new="agenda" data-ep-event="${h(event.id)}">${i('plus', 15)} Novo bloco</button></section>${filterBar('agenda')}<ol class="ep-agenda">${rows.map(item => `<li class="surface"><time>${h(item.time || '--:--')}</time><div class="ep-agenda-content"><h3>${h(item.title)}</h3><p>${numeric(item.duration)} min · ${h(teamLabel(item.team))}${item.owner ? ` · ${h(item.owner)}` : ''}</p>${item.notes ? `<p class="ep-note">${h(item.notes)}</p>` : ''}</div><div class="ep-agenda-tools"><select aria-label="Status do bloco" data-ep-item-status="${h(item.id)}" data-ep-event="${h(event.id)}">${optionRows(itemStatus.agenda, item.status)}</select>${itemButtons(event, item)}</div></li>`).join('') || emptyList('Nenhum bloco de roteiro', 'Crie a sequência do evento para que toda a equipe saiba o que acontece a cada momento.', 'list')}</ol>`;
}
function linksView(event) {
  const rows = filterItems(records(event, 'link')).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title, 'pt-BR'));
  return `<section class="ep-section-head"><div><span class="ep-eyebrow">Ativos da campanha</span><h2>Links e materiais</h2><p>Concentre URLs importantes, materiais e páginas que precisam ser revisados.</p></div><button class="primary" data-ep-item-new="link" data-ep-event="${h(event.id)}">${i('plus', 15)} Novo link</button></section>${filterBar('link')}<div class="ep-link-grid">${rows.map(item => `<article class="surface ep-link"><div class="ep-link-title"><span class="ep-link-icon">${i('link', 17)}</span><div><h3>${h(item.title)}</h3><p>${h(phaseLabel(item.phase))}${item.owner ? ` · ${h(item.owner)}` : ''}</p></div></div>${item.url ? `<a class="ep-url" href="${h(item.url)}" target="_blank" rel="noopener noreferrer">${h(item.url.replace(/^https?:\/\//, ''))} ${i('up-right', 13)}</a>` : '<p class="ep-missing">URL ainda não adicionada</p>'}${item.notes ? `<p class="ep-note">${h(item.notes)}</p>` : ''}<div class="ep-link-foot"><span>${h(dateMeta(item))}</span><div><select aria-label="Status do link" data-ep-item-status="${h(item.id)}" data-ep-event="${h(event.id)}">${optionRows(itemStatus.link, item.status)}</select>${itemButtons(event, item)}</div></div></article>`).join('') || emptyList('Nenhum link nesta seleção', 'Guarde aqui as páginas, materiais e acessos necessários para a operação.', 'link')}</div>`;
}

function integrationsView(event) {
  const binding = event.orchestration || {}, rows = Object.values(binding.items || {});
  const counts = { tasks: rows.filter(row => row.taskId).length, social: rows.filter(row => row.socialPostId).length, email: rows.filter(row => row.emailCampaignId).length, calendar: binding.appointmentId ? 1 : 0 };
  const synced = binding.syncedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(binding.syncedAt)) : 'Ainda não sincronizado';
  return `<section class="ep-section-head"><div><span class="ep-eyebrow">Execução conectada</span><h2>Automações e integrações</h2><p>Crie entregas nos módulos da Soci e publique eventos para os seus fluxos e webhooks.</p></div><button class="primary" data-ep-orchestrate="${h(event.id)}">${i('flow', 15)} Sincronizar agora</button></section><div class="ep-orch-grid"><article class="surface ep-orch-card"><span>CRM</span><b>${counts.tasks}</b><p>Tarefas vinculadas ao evento.</p></article><article class="surface ep-orch-card"><span>Calendário</span><b>${counts.calendar ? 'Ligado' : 'Pendente'}</b><p>Um compromisso com o roteiro do dia.</p></article><article class="surface ep-orch-card"><span>Social</span><b>${counts.social}</b><p>Rascunhos para comunicações no Instagram.</p></article><article class="surface ep-orch-card"><span>E-mail</span><b>${counts.email}</b><p>Campanhas em rascunho para revisão.</p></article></div><section class="surface ep-automation-guide"><div><span class="ep-eyebrow">Automação e API</span><h3>Eventos que os fluxos podem ouvir</h3><p>Configure em <a href="#automation/workflows">Automações</a> o gatilho <b>Evento personalizado</b> e conecte ações, integrações ou webhooks.</p></div><ul><li><code>event_plan_created</code></li><li><code>event_plan_updated</code></li><li><code>event_plan_status_changed</code></li><li><code>event_plan_orchestrated</code></li></ul><small>Última sincronização: ${h(synced)}. A sincronização cria somente rascunhos de Social e E-mail: a revisão e o envio continuam sob controle da equipe.</small></section>`;
}

function detail(c, pageShell, marketingTabs, event) {
  const sections = [['strategy', 'Estratégia', 'target'], ['tasks', 'Tarefas', 'check-square'], ['messages', 'Comunicação', 'send'], ['agenda', 'Roteiro do dia', 'list'], ['links', 'Links', 'link'], ['integrations', 'Integrações', 'flow']].map(([value, label, icon]) => ({ value, label, icon, attrs: `data-ep-section="${value}" aria-pressed="${ui.section === value}"` }));
  const content = { strategy: briefView, tasks: tasksView, messages: messagesView, agenda: agendaView, links: linksView, integrations: integrationsView }[ui.section](event);
  return pageShell({ title: 'Planejador de eventos', desc: 'Coordene todas as frentes deste lançamento.', className: 'ep', tabs: { key: 'marketing', items: marketingTabs, current: 'events', label: 'Seções de marketing' }, content: `${hero(event)}<section class="ep-workspace"><div class="ep-subtabs">${sections.map(item => `<button class="${item.value === ui.section ? 'active' : ''}" ${item.attrs}>${i(item.icon, 15)} ${h(item.label)}</button>`).join('')}</div><div class="ep-panel">${content}</div></section>` });
}
export function eventPlanner(c, { pageShell, marketingTabs }) {
  reset(c.workspace);
  const current = (c.s.eventPlans || []).find(item => item.id === ui.selectedId);
  if (!current) ui.selectedId = '';
  return current ? detail(c, pageShell, marketingTabs, current) : gallery(c, pageShell, marketingTabs);
}

function field(label, name, value = '', { type = 'text', required = false, placeholder = '', options = [], min = '', max = '', step = '' } = {}) {
  const attrs = `${required ? ' required' : ''}${placeholder ? ` placeholder="${h(placeholder)}"` : ''}${min !== '' ? ` min="${h(min)}"` : ''}${max !== '' ? ` max="${h(max)}"` : ''}${step !== '' ? ` step="${h(step)}"` : ''}`;
  if (type === 'textarea') return `<label>${h(label)}<textarea name="${h(name)}"${attrs}>${h(value)}</textarea></label>`;
  if (type === 'select') return `<label>${h(label)}<select name="${h(name)}"${attrs}>${optionRows(options, value)}</select></label>`;
  return `<label>${h(label)}<input name="${h(name)}" type="${h(type)}" value="${h(value)}"${attrs}></label>`;
}
const formFoot = (label, remove = '') => `<p class="form-status" role="alert"></p><footer class="ep-form-foot">${remove}<span class="spacer"></span><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">${label}</button></footer>`;
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function newEventPlan(template, eventDate) {
  if (template !== 'launch') return blankEventPlan();
  if (!validDay(eventDate)) throw Error('Informe uma data válida para montar o cronograma.');
  return launchEventPlan(eventDate);
}
export function eventDialogBody(row) {
  const starter = row ? '' : `<label>Começar com<select name="template" data-ep-template>${optionRows([['launch', 'Modelo de lançamento'], ['blank', 'Evento em branco']], 'launch')}</select></label><p class="ep-hint" data-ep-template-hint>O modelo usa essa data para montar o cronograma de tarefas, mensagens, roteiro e validação de links.</p>`;
  return `<form class="ep-form" data-ep-form="event" data-id="${h(row?.id || '')}" data-revision="${row?.revision || 0}">${field('Nome do evento', 'title', row?.title || '', { required: true, placeholder: 'Ex.: Masterclass de lançamento' })}<div class="ep-form-grid">${field('Data do evento', 'eventDate', row?.eventDate || '', { type: 'date', required: !row })}${field('Status', 'status', row?.status || 'planejado', { type: 'select', options: eventPlanStatuses })}</div>${starter}${formFoot(row ? 'Salvar alterações' : 'Criar evento')}</form>`;
}
function eventDialog(dialog, row = null) {
  dialog(row ? 'Editar evento' : 'Novo evento', eventDialogBody(row), { description: row ? 'O plano do evento não muda.' : 'Cada evento fica restrito à subconta atual.' });
}
function renameDialog(dialog, row) {
  dialog('Renomear evento', `<form class="ep-form" data-ep-form="rename" data-id="${h(row.id)}" data-revision="${row.revision || 0}">${field('Nome do evento', 'title', row.title, { required: true })}${formFoot('Renomear')}</form>`);
}
function briefDialog(dialog, event) {
  const values = planOf(event).brief || {};
  dialog('Estratégia do evento', `<form data-ep-form="brief" data-id="${h(event.id)}"><div class="ep-brief-form">${briefFields.map(([key, label, hint]) => field(label, key, values[key], { type: 'textarea', placeholder: hint })).join('')}</div><p class="form-status" role="alert"></p><footer class="ep-form-foot"><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Salvar estratégia</button></footer></form>`, { description: 'Escreva o suficiente para que qualquer pessoa do time entenda a direção do evento.' });
}
function itemDialog(dialog, event, kind, item = null) {
  const data = item || { kind, phase: kind === 'agenda' ? 'evento' : 'aquecimento', status: itemStatus[kind][0][0], team: kind === 'message' ? 'copy' : kind === 'link' ? 'dev' : 'estrategia', date: event.eventDate || '', time: '', duration: kind === 'agenda' ? 30 : '', channel: 'grupos', order: records(event, kind).length + 1, title: '', owner: '', notes: '', url: '' };
  const base = `<div class="field-grid">${field('Título', 'title', data.title, { required: true })}${field('Fase', 'phase', data.phase, { type: 'select', options: eventPlanPhases })}</div><div class="field-grid">${field('Responsável', 'owner', data.owner, { placeholder: 'Nome da pessoa' })}${field('Time', 'team', data.team, { type: 'select', options: eventPlanTeams })}</div><div class="field-grid">${field('Data', 'date', data.date, { type: 'date' })}${field('Status', 'status', data.status, { type: 'select', options: itemStatus[kind] })}</div>`;
  let content = base;
  if (kind === 'task') content += field('Notas ou critério de conclusão', 'notes', data.notes, { type: 'textarea', placeholder: 'O que precisa estar pronto?' });
  if (kind === 'message') content += `<div class="field-grid">${field('Canal', 'channel', data.channel, { type: 'select', options: channels })}${field('Horário', 'time', data.time, { type: 'time' })}</div>${field('Texto da comunicação', 'notes', data.notes, { type: 'textarea', placeholder: 'Use [variáveis] como lembrete para personalizar o texto.' })}`;
  if (kind === 'agenda') content += `<div class="field-grid">${field('Horário', 'time', data.time, { type: 'time' })}${field('Duração (minutos)', 'duration', data.duration, { type: 'number', min: 0, max: 1440, step: 1 })}</div>${field('Ordem', 'order', data.order, { type: 'number', min: 0, max: 999, step: 1 })}${field('Instruções para o bloco', 'notes', data.notes, { type: 'textarea' })}`;
  if (kind === 'link') content += `${field('URL', 'url', data.url, { type: 'url', placeholder: 'https://...' })}${field('Como usar este link', 'notes', data.notes, { type: 'textarea' })}`;
  const label = itemKinds.find(([key]) => key === kind)?.[1].toLowerCase() || 'item';
  dialog(item ? `Editar ${label}` : `Novo ${label}`, `<form data-ep-form="item" data-id="${h(event.id)}" data-kind="${h(kind)}" data-item-id="${h(item?.id || '')}">${content}<p class="form-status" role="alert"></p><footer class="ep-form-foot">${item ? `<button class="danger plain" type="button" data-ep-item-delete="${h(item.id)}" data-ep-event="${h(event.id)}">Excluir</button>` : ''}<span class="spacer"></span><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Salvar</button></footer></form>`, { description: 'As alterações ficam disponíveis apenas neste evento.' });
}
function orchestrateDialog(dialog, event) {
  dialog('Orquestrar evento', `<form data-ep-form="orchestrate" data-id="${h(event.id)}"><p class="dim">A Soci vai criar somente os registros que ainda não estão vinculados a este evento.</p><label class="check"><input type="checkbox" name="tasks" checked> Criar tarefas no CRM</label><label class="check"><input type="checkbox" name="calendar" checked> Criar compromisso no Calendário a partir do roteiro</label><label class="check"><input type="checkbox" name="social" checked> Criar rascunhos do Instagram no Social Planner</label><label class="check"><input type="checkbox" name="email" checked> Criar rascunhos de e-mail para revisão</label><p class="dim">Também será emitido o evento <code>event_plan_orchestrated</code> para fluxos e webhooks configurados em Automações.</p><p class="form-status" role="alert"></p><footer class="ep-form-foot"><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Sincronizar</button></footer></form>`, { description: 'Nenhum envio será disparado automaticamente.' });
}

function valueOf(form, key) { return form.elements[key]?.value || ''; }
function savedItem(form, previous) {
  const kind = form.dataset.kind;
  return { ...previous, id: previous?.id || crypto.randomUUID(), kind, title: valueOf(form, 'title'), phase: valueOf(form, 'phase'), owner: valueOf(form, 'owner'), team: valueOf(form, 'team'), date: valueOf(form, 'date'), status: valueOf(form, 'status'), notes: valueOf(form, 'notes'), ...(kind === 'message' ? { channel: valueOf(form, 'channel'), time: valueOf(form, 'time') } : {}), ...(kind === 'agenda' ? { time: valueOf(form, 'time'), duration: valueOf(form, 'duration'), order: valueOf(form, 'order') } : {}), ...(kind === 'link' ? { url: valueOf(form, 'url') } : {}) };
}
function savePlan(event, change) {
  const plan = structuredClone(planOf(event)); change(plan);
  return { type: 'save', key: 'eventPlans', id: event.id, data: { title: event.title, eventDate: event.eventDate, status: event.status, plan } };
}
async function copyText(text) {
  if (!text) throw Error('Esta comunicação ainda não tem texto.');
  try { await navigator.clipboard.writeText(text); return; } catch { /* fallback below */ }
  const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
}

export function installEventPlanner({ c, mutate, flash, dialog, close, render }) {
  const find = id => (c.s.eventPlans || []).find(row => row.id === id);
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-ep-open],[data-ep-back],[data-ep-new],[data-ep-edit],[data-ep-manage],[data-ep-section],[data-ep-edit-brief],[data-ep-item-new],[data-ep-item-edit],[data-ep-item-delete],[data-ep-copy],[data-ep-orchestrate]');
    if (!target) return;
    const data = target.dataset;
    try {
      if (data.epOpen) { ui.selectedId = data.epOpen; ui.section = 'strategy'; ui.phase = 'all'; ui.status = 'all'; render(); return; }
      if (data.epBack !== undefined) { ui.selectedId = ''; render(); return; }
      if (data.epNew !== undefined) { eventDialog(dialog); return; }
      if (data.epOrchestrate) { const plan = c.s.eventPlans.find(item => item.id === data.epOrchestrate); if (plan) orchestrateDialog(dialog, plan); return; }
      if (data.epEdit) { const row = find(data.epEdit); if (row) eventDialog(dialog, row); return; }
      if (data.epManage) {
        const row = find(data.id); if (!row) return;
        if (data.epManage === 'rename') { renameDialog(dialog, row); return; }
        if (data.epManage === 'duplicate') { await mutate({ type: 'event-plan-duplicate', id: row.id }); render(); flash('Evento duplicado.'); return; }
        if (!confirm(`Apagar “${row.title}” e todo o seu planejamento? Essa ação é definitiva.`)) return;
        await mutate({ type: 'delete', key: 'eventPlans', id: row.id }); ui.selectedId = ''; render(); flash('Evento apagado.'); return;
      }
      if (data.epSection) { ui.section = data.epSection; ui.phase = 'all'; ui.status = 'all'; render(); return; }
      if (data.epEditBrief) { const plan = c.s.eventPlans.find(item => item.id === data.epEditBrief); if (plan) briefDialog(dialog, plan); return; }
      if (data.epItemNew) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); if (plan) itemDialog(dialog, plan, data.epItemNew); return; }
      if (data.epItemEdit) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); const row = planOf(plan).items.find(item => item.id === data.epItemEdit); if (plan && row) itemDialog(dialog, plan, row.kind, row); return; }
      if (data.epItemDelete) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); if (!plan || !confirm('Excluir este item do plano?')) return; await mutate(savePlan(plan, planData => { planData.items = planData.items.filter(item => item.id !== data.epItemDelete); })); close(); render(); flash('Item excluído.'); return; }
      if (data.epCopy) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); const row = planOf(plan).items.find(item => item.id === data.epCopy); await copyText(row?.notes); flash('Texto copiado.'); }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('change', async event => {
    const field = event.target;
    try {
      if (field.matches('[data-ep-status-filter]')) { ui.events = field.value; render(); return; }
      if (field.matches('[data-ep-template]')) { const launch = field.value === 'launch'; field.form.elements.eventDate.required = launch; field.form.querySelector('[data-ep-template-hint]').hidden = !launch; return; }
      if (field.matches('[data-ep-filter]')) { ui[field.dataset.epFilter] = field.value; render(); return; }
      if (field.matches('[data-ep-item-status]')) { const plan = c.s.eventPlans.find(item => item.id === field.dataset.epEvent); if (!plan) return; await mutate(savePlan(plan, data => { const row = data.items.find(item => item.id === field.dataset.epItemStatus); if (row) row.status = field.value; })); render(); flash('Status atualizado.'); }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-ep-form]')) return;
    event.preventDefault(); if (form.dataset.pending) return;
    form.dataset.pending = '1'; const button = form.querySelector('.primary'), status = form.querySelector('.form-status'); button?.setAttribute('disabled', '');
    try {
      if (form.dataset.epForm === 'event') {
        const eventDate = valueOf(form, 'eventDate'), base = { title: valueOf(form, 'title'), eventDate, status: valueOf(form, 'status') };
        const editing = form.dataset.id;
        const id = await mutate({ type: 'save', key: 'eventPlans', id: editing || '', data: editing ? { ...base, revision: Number(form.dataset.revision) } : { ...base, plan: newEventPlan(valueOf(form, 'template'), eventDate) } });
        if (!editing) { ui.selectedId = id; ui.section = 'strategy'; }
        close(); render(); flash(editing ? 'Evento atualizado.' : 'Evento criado.');
      }
      if (form.dataset.epForm === 'rename') {
        await mutate({ type: 'save', key: 'eventPlans', id: form.dataset.id, data: { title: valueOf(form, 'title'), revision: Number(form.dataset.revision) } });
        close(); render(); flash('Evento renomeado.');
      }
      if (form.dataset.epForm === 'orchestrate') {
        const result = await mutate({ type: 'event-plan-orchestrate', id: form.dataset.id, data: { tasks: form.elements.tasks.checked, calendar: form.elements.calendar.checked, social: form.elements.social.checked, email: form.elements.email.checked } });
        close(); render(); flash(result && typeof result === 'object' ? 'Integrações sincronizadas.' : 'Integrações sincronizadas.');
      }
      if (form.dataset.epForm === 'brief') {
        const plan = c.s.eventPlans.find(row => row.id === form.dataset.id); if (!plan) throw Error('Evento não encontrado.');
        const values = Object.fromEntries(briefFields.map(([key]) => [key, valueOf(form, key)]));
        await mutate(savePlan(plan, data => { data.brief = values; })); close(); render(); flash('Estratégia atualizada.');
      }
      if (form.dataset.epForm === 'item') {
        const plan = c.s.eventPlans.find(row => row.id === form.dataset.id); if (!plan) throw Error('Evento não encontrado.');
        const previous = planOf(plan).items.find(item => item.id === form.dataset.itemId), row = savedItem(form, previous);
        await mutate(savePlan(plan, data => { const at = data.items.findIndex(item => item.id === row.id); if (at === -1) data.items.push(row); else data.items.splice(at, 1, row); })); close(); render(); flash(previous ? 'Item atualizado.' : 'Item criado.');
      }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); }
    finally { delete form.dataset.pending; button?.removeAttribute('disabled'); }
  });
}
