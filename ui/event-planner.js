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
const ui = { workspace: '', selectedId: '', section: 'strategy', phase: 'all', status: 'all' };

function reset(workspace) {
  if (ui.workspace === workspace) return;
  ui.workspace = workspace; ui.selectedId = ''; ui.section = 'strategy'; ui.phase = 'all'; ui.status = 'all';
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

function gallery(c, pageShell, marketingTabs) {
  const events = [...(c.s.eventPlans || [])].sort((a, b) => (a.eventDate || '9999').localeCompare(b.eventDate || '9999') || a.title.localeCompare(b.title, 'pt-BR'));
  const cards = events.map(event => {
    const progress = eventProgress(event), total = progress.tasks.length, percent = total ? Math.round(progress.done / total * 100) : 0;
    return `<article class="ep-card surface" data-ep-open="${h(event.id)}" tabindex="0" role="button" aria-label="Abrir ${h(event.title)}"><div class="ep-card-top"><div><span class="ep-card-kicker">${h(dateLabel(event.eventDate))}</span><h2>${h(event.title)}</h2></div>${statusPill(event.status, eventStatusLabel(event.status))}</div><div class="ep-progress" aria-label="${progress.done} de ${total} tarefas concluídas"><span style="width:${percent}%"></span></div><div class="ep-card-stats"><span><b>${progress.done}/${total}</b> tarefas</span><span><b>${progress.sent}/${progress.messages.length}</b> envios</span><span><b>${progress.ready}/${progress.links.length}</b> links</span></div><div class="ep-card-foot"><span>${percent}% concluído</span><span>${i('right', 16)}</span></div></article>`;
  }).join('');
  return pageShell({ title: 'Planejador de eventos', desc: 'Organize estratégia, operação e comunicação de cada lançamento desta subconta.', className: 'ep', cta: primary(`${i('plus', 16)} Novo evento`, 'type="button" data-ep-new'), tabs: { key: 'marketing', items: marketingTabs, current: 'events', label: 'Seções de marketing' }, content: `<section class="ep-intro surface"><div><span class="ep-eyebrow">Da intenção à conversão</span><h2>Todos os pontos críticos de um evento, em um só plano.</h2><p>Comece em branco ou use o modelo de lançamento para já ter cronograma, mensagens, roteiro e links essenciais.</p></div><button class="secondary" data-ep-new data-ep-starter="template">Usar modelo de lançamento</button></section><section class="ep-gallery" aria-label="Eventos planejados">${cards || `<div class="ep-empty surface"><span>${i('calendar', 26)}</span><h2>Seu primeiro evento começa aqui</h2><p>Crie um plano para alinhar captação, conteúdo, operação e vendas antes de abrir as inscrições.</p>${primary(`${i('plus', 16)} Criar evento`, 'type="button" data-ep-new data-ep-starter="template"')}</div>`}</section>` });
}

function hero(event) {
  const p = eventProgress(event);
  return `<section class="ep-hero"><div class="ep-hero-copy"><button class="ep-back" data-ep-back>${i('left', 15)} Todos os eventos</button><div class="ep-hero-title"><div><span class="ep-eyebrow">${h(dateLabel(event.eventDate))}</span><h1>${h(event.title)}</h1></div>${statusPill(event.status, eventStatusLabel(event.status))}</div><div class="ep-hero-actions"><button class="secondary" data-ep-edit="${h(event.id)}">${i('edit', 15)} Editar evento</button><button class="secondary" data-ep-duplicate="${h(event.id)}">${i('copy', 15)} Duplicar</button><button class="secondary" data-ep-delete="${h(event.id)}">${i('trash', 15)} Excluir</button></div></div><dl class="ep-kpis"><div><dt>Tarefas</dt><dd>${p.done}<small>/${p.tasks.length}</small></dd><span>concluídas</span></div><div><dt>Comunicação</dt><dd>${p.sent}<small>/${p.messages.length}</small></dd><span>enviadas</span></div><div><dt>Roteiro</dt><dd>${Math.floor(p.minutes / 60)}h${String(p.minutes % 60).padStart(2, '0')}</dd><span>previstas</span></div><div><dt>Links</dt><dd>${p.ready}<small>/${p.links.length}</small></dd><span>validados</span></div></dl></section>`;
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

function detail(c, pageShell, marketingTabs, event) {
  const sections = [['strategy', 'Estratégia', 'target'], ['tasks', 'Tarefas', 'check-square'], ['messages', 'Comunicação', 'send'], ['agenda', 'Roteiro do dia', 'list'], ['links', 'Links', 'link']].map(([value, label, icon]) => ({ value, label, icon, attrs: `data-ep-section="${value}" aria-pressed="${ui.section === value}"` }));
  const content = { strategy: briefView, tasks: tasksView, messages: messagesView, agenda: agendaView, links: linksView }[ui.section](event);
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
function eventDialog(c, dialog, id = '', starter = 'blank') {
  const row = id ? c.s.eventPlans.find(event => event.id === id) : null, today = new Date().toISOString().slice(0, 10);
  dialog(row ? 'Editar evento' : 'Novo evento', `<form data-ep-form="event" data-id="${h(id)}"><div class="field-grid">${field('Nome do evento', 'title', row?.title || '', { required: true, placeholder: 'Ex.: Masterclass de lançamento' })}${field('Data do evento', 'eventDate', row?.eventDate || today, { type: 'date' })}</div>${field('Status', 'status', row?.status || 'planejado', { type: 'select', options: eventPlanStatuses })}${row ? '' : `<label class="check"><input type="checkbox" name="template" ${starter === 'template' ? 'checked' : ''}> Começar com o modelo de lançamento</label><p class="dim">O modelo cria tarefas, calendário de comunicação, roteiro do dia e links essenciais.</p>`}<p class="form-status" role="alert"></p><footer class="ep-form-foot"><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">${row ? 'Salvar alterações' : 'Criar evento'}</button></footer></form>`, { description: row ? 'Atualize as informações gerais sem perder o plano existente.' : 'Cada evento fica restrito à subconta atual.' });
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
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-ep-open],[data-ep-back],[data-ep-new],[data-ep-edit],[data-ep-duplicate],[data-ep-delete],[data-ep-section],[data-ep-edit-brief],[data-ep-item-new],[data-ep-item-edit],[data-ep-item-delete],[data-ep-copy]');
    if (!target) return;
    const data = target.dataset;
    try {
      if (data.epOpen) { ui.selectedId = data.epOpen; ui.section = 'strategy'; ui.phase = 'all'; ui.status = 'all'; render(); return; }
      if (data.epBack !== undefined) { ui.selectedId = ''; render(); return; }
      if (data.epNew !== undefined) { eventDialog(c, dialog, '', data.epStarter || 'blank'); return; }
      if (data.epEdit) { eventDialog(c, dialog, data.epEdit); return; }
      if (data.epDuplicate) { const id = await mutate({ type: 'event-plan-duplicate', id: data.epDuplicate }); ui.selectedId = id; ui.section = 'strategy'; render(); flash('Evento duplicado como novo plano.'); return; }
      if (data.epDelete) { const row = c.s.eventPlans.find(item => item.id === data.epDelete); if (!row || !confirm(`Excluir “${row.title}” e todo o seu plano?`)) return; await mutate({ type: 'delete', key: 'eventPlans', id: row.id }); ui.selectedId = ''; render(); flash('Evento excluído.'); return; }
      if (data.epSection) { ui.section = data.epSection; ui.phase = 'all'; ui.status = 'all'; render(); return; }
      if (data.epEditBrief) { const plan = c.s.eventPlans.find(item => item.id === data.epEditBrief); if (plan) briefDialog(dialog, plan); return; }
      if (data.epItemNew) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); if (plan) itemDialog(dialog, plan, data.epItemNew); return; }
      if (data.epItemEdit) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); const row = planOf(plan).items.find(item => item.id === data.epItemEdit); if (plan && row) itemDialog(dialog, plan, row.kind, row); return; }
      if (data.epItemDelete) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); if (!plan || !confirm('Excluir este item do plano?')) return; await mutate(savePlan(plan, planData => { planData.items = planData.items.filter(item => item.id !== data.epItemDelete); })); close(); render(); flash('Item excluído.'); return; }
      if (data.epCopy) { const plan = c.s.eventPlans.find(item => item.id === data.epEvent); const row = planOf(plan).items.find(item => item.id === data.epCopy); await copyText(row?.notes); flash('Texto copiado.'); }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('keydown', event => { const card = event.target.closest?.('[data-ep-open]'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); card.click(); } });
  document.addEventListener('change', async event => {
    const field = event.target;
    try {
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
        const existing = form.dataset.id ? c.s.eventPlans.find(row => row.id === form.dataset.id) : null, eventDate = valueOf(form, 'eventDate');
        const plan = existing ? planOf(existing) : (form.elements.template?.checked ? launchEventPlan(eventDate) : blankEventPlan());
        const id = await mutate({ type: 'save', key: 'eventPlans', id: existing?.id || '', data: { title: valueOf(form, 'title'), eventDate, status: valueOf(form, 'status'), plan } });
        ui.selectedId = id; ui.section = 'strategy'; close(); render(); flash(existing ? 'Evento atualizado.' : 'Evento criado.');
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
