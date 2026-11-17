import { icon } from './icons.js';
import { h, money, fmt } from './screens.js';
import { tr } from './i18n.js';
import { conversionTotals, dashboardPeriods, dateFields, dateMatches, effectiveWidget, priorDates, resolveDates,
  salesTotals, scopedDeals, sourceTotals, stageTotals, statusTotals, widgets } from './dashboard-data.js';

const barColors = ['blue','green','red','gray'];
const pct = value => `${Number(value.toFixed(1))}%`;
const integer = value => new Intl.NumberFormat('en').format(value);
const formatMoney = (c,value) => value === 0 ? `${new Intl.NumberFormat('pt-BR',{style:'currency',currency:c.s.profile.currency,maximumFractionDigits:0}).format(0).replace(/\s/g,'')}` : money(value,c.s.profile.currency);
const glyph = (id,label,ico) => `<button class="dash-tool dash-square" type="button" data-dash-act="${id}" aria-label="${label}" title="${label}">${icon(ico,17)}</button>`;
const tool = (id,label,ico = '') => `<button class="dash-tool" type="button" data-dash-act="${id}">${ico ? icon(ico,16) : ''}${label}</button>`;

export function selectMarkup(label, attr, selected, choices, blank = '') {
  return `<label class="dash-select"><span class="sr-only">${h(label)}</span><select ${attr}>${blank ? `<option value="">${h(blank)}</option>` : ''}${choices.map(([value,name]) =>
    `<option value="${h(value)}" ${selected === value ? 'selected' : ''}>${h(name)}</option>`).join('')}</select>${icon('chevron',13)}</label>`;
}

export function activeDashboard(c) {
  return c.s.dashboards.find(board => board.id === c.dash.id) || c.s.dashboards[0];
}

export function dashboardRange(c) {
  return resolveDates(c.dash.range,c.s.profile.timezone);
}

function emptyMessage(label = 'No data found', mark = 'search', link = '') {
  return `<div class="dash-empty"><span>${icon(mark,19)}</span><p>${h(label)}</p>${link}</div>`;
}

function meters(rows, c, amount, max = Math.max(1,...rows.map(amount))) {
  return `<div class="dash-meters">${rows.map((row,index) => `<div class="dash-meter tone-${barColors[index%4]}">
    <div><span>${h(row.status || row.name)}</span><strong>${h(c(row))}</strong></div>
    <meter min="0" max="${max}" value="${amount(row)}" aria-label="${h(row.status || row.name)}"></meter></div>`).join('')}</div>`;
}

function moneyOrNumber(c, value, useMoney) { return useMoney ? formatMoney(c,value) : integer(value); }

function metricStatus(c, widget, deals, previous) {
  if (!deals.length) return emptyMessage();
  const isValue = widget.kind === 'value';
  const key = isValue ? 'value' : 'count';
  const total = deals.reduce((sum,record) => sum + (isValue ? record.value : 1),0);
  const change = previous && total - previous.reduce((sum,record) => sum + (isValue ? record.value : 1),0);
  return `<div class="dash-status-total"><b>${moneyOrNumber(c,total,isValue)}</b>${change === null ? '' : `<small>${change > 0 ? '+' : ''}${moneyOrNumber(c,change,isValue)} vs previous</small>`}</div>` +
    meters(statusTotals(deals),row => moneyOrNumber(c,row[key],isValue),row => row[key]);
}

function conversion(c, deals, previous) {
  const value = conversionTotals(deals);
  const delta = previous ? value.rate - conversionTotals(previous).rate : null;
  return `<div class="dash-conversion"><div class="dash-gauge"><canvas width="240" height="240" data-dash-gauge="${value.rate}" aria-hidden="true"></canvas><b>${pct(value.rate)}</b></div>
    <small>Won revenue</small><strong>${formatMoney(c,value.revenue)}</strong>${delta === null ? '' : `<small>${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp vs previous</small>`}</div>`;
}

function funnel(c, rows) {
  const max = Math.max(1, ...rows.map(row => row.count));
  return `<div class="dash-funnel"><div class="dash-funnel-ticks"><span>0</span><span>${max}</span></div><table><thead class="sr-only"><tr><th>Stage</th><th>Cumulative</th><th>Next step</th></tr></thead><tbody>${rows.map((row,index) => {
    const cumulative = rows[0].count ? row.count / rows[0].count * 100 : index ? 0 : 100;
    const next = index && rows[index - 1].count ? row.count / rows[index - 1].count * 100 : 0;
    return `<tr><td><div><span>${h(row.name)}</span><b>${formatMoney(c,row.value)}</b></div><meter min="0" max="${max}" value="${row.count}" aria-label="${h(row.name)} count"></meter></td><td>${pct(cumulative)}</td><td>${index ? pct(next) : '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function tasks(c, config, range) {
  const options = c.dash.view[config.id] || {};
  const excludes = options.taskStatus === 'Completed' ? false : options.taskStatus !== 'All';
  const owners = [...new Set(c.s.tasks.map(task => task.owner).filter(Boolean))].sort();
  const records = c.s.tasks.filter(task => (options.taskStatus === 'All' || (excludes ? !task.done : task.done)) &&
    (!options.owner || task.owner === options.owner) && dateMatches(task.due?.slice(0,10),range,c.s.profile.timezone));
  records.sort((a,b) => (options.order !== 'desc' ? 1 : -1) * String(a.due || '9999').localeCompare(String(b.due || '9999')));
  const selects = `<div class="dash-card-filters">
    ${selectMarkup('Task status',`data-dash-widget="${config.id}" data-dash-field="taskStatus"`,options.taskStatus || 'Pending',['Pending','Completed','All'].map(label => [label,label]))}
    ${selectMarkup('Sort tasks',`data-dash-widget="${config.id}" data-dash-field="order"`,options.order || 'asc',[['asc','Due date (ASC)'],['desc','Due date (DESC)']])}
    ${selectMarkup('Task owner',`data-dash-widget="${config.id}" data-dash-field="owner"`,options.owner || '',owners.map(label => [label,label]),'All users')}</div>`;
  if (!records.length) return selects + emptyMessage('No tasks found','check','<a href="#contacts/tasks" class="text-link">Go to tasks</a>');
  return selects + `<div class="dash-tasks">${records.map(task => `<div class="dash-task">
    <button type="button" class="dash-task-check" data-task="${task.id}" aria-pressed="${task.done}" aria-label="${h(task.done ? `Reopen ${task.title}` : `Complete ${task.title}`)}">${task.done ? icon('check',14) : ''}</button>
    <div><b>${h(task.title)}</b>${task.notes ? `<p>${h(task.notes)}</p>` : ''}<small>${h(c.s.contacts.find(contact => contact.id === task.contactId)?.name || 'Unlinked')} · Assigned to ${h(task.owner || 'Unassigned')}</small></div>
    <small>${fmt(task.due,'UTC')}</small></div>`).join('')}</div>`;
}

function manual(c, config, range) {
  const view = c.dash.view[config.id] || {};
  const workflows = new Map(c.s.workflows.map(row => [row.id,row.name]));
  for (const item of c.s.manualActions) if (!workflows.has(item.workflowId)) workflows.set(item.workflowId,item.workflowName);
  const assignees = [...new Set(c.s.manualActions.map(row => row.assignee).filter(Boolean))].sort();
  const pending = c.s.manualActions.filter(row => row.status === 'Pending' && (!view.workflow || view.workflow === row.workflowId) &&
    (!view.owner || view.owner === row.assignee) && dateMatches(row.created,range,c.s.profile.timezone));
  const counts = [['Phone',pending.filter(row => row.type === 'Manual Call').length],['SMS',pending.filter(row => row.type === 'Manual SMS').length],['Total pending',pending.length]];
  return `<div class="dash-card-filters">
    ${selectMarkup('Workflow selection',`data-dash-widget="${config.id}" data-dash-field="workflow"`,view.workflow || '',[...workflows],'All workflows')}
    ${selectMarkup('User selection',`data-dash-widget="${config.id}" data-dash-field="owner"`,view.owner || '',assignees.map(label => [label,label]),'All users')}</div>
    <div class="dash-small-stats">${counts.map(([label,value]) => `<div><b>${value}</b><small>${label}</small></div>`).join('')}</div>
    <a href="#conversations/manual-actions" class="text-link dash-widget-link">Go to manual actions ${icon('arrow',15)}</a>`;
}

function sources(c, deals) {
  const rows = sourceTotals(deals);
  if (!rows.length) return emptyMessage();
  return `<div class="dash-table"><table><thead><tr>${['Source','Total leads','Open','Won','Lost','Abandoned','Total value'].map(col => `<th>${col}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr><th>${h(row.source)}</th><td>${row.count}</td>${row.totals.map(status => `<td>${status.count}</td>`).join('')}<td>${formatMoney(c,row.value)}</td></tr>`).join('')}</tbody></table></div>`;
}

function sales(c, deals) {
  const sales = salesTotals(deals);
  const duration = sales.duration >= 86400000 ? `${(sales.duration/86400000).toFixed(1)}d` : sales.duration >= 3600000 ? `${(sales.duration/3600000).toFixed(1)}h` : sales.duration >= 60000 ? `${Math.round(sales.duration/60000)}m` : `${Math.round(sales.duration/1000)}s`;
  return `<div class="dash-small-stats">${[['Average sales duration',duration],['Total sale value',formatMoney(c,sales.value)],['Sales velocity','—']].map(([label,value]) => `<div><b>${value}</b><small>${label}</small></div>`).join('')}</div>`;
}

function widgetBody(c, config, range, comparison) {
  const definition = widgets[config.kind];
  if (definition.provider) return emptyMessage(`${definition.provider} is disconnected`,'external','<a href="#marketplace" class="text-link">View integrations</a>');
  if (config.kind === 'note') return `<p class="dash-note">${h(config.note)}</p>`;
  if (config.kind === 'manual') return manual(c,config,range);
  if (config.kind === 'tasks') return tasks(c,config,range);
  const zone = c.s.profile.timezone;
  if (config.kind === 'contacts') {
    const tag = c.dash.quickTag;
    const total = c.s.contacts.filter(contact => (!tag || contact.tags.includes(tag)) && dateMatches(contact.created,range,zone)).length;
    return `<div class="dash-small-stats"><div><b>${total}</b><small>Contacts created</small></div><a href="#contacts" class="text-link">Go to contacts</a></div>`;
  }
  if (config.kind === 'appointments') {
    const records = c.s.appointments.filter(item => item.status !== 'Canceled' && dateMatches(item.start,range,zone));
    return `<div class="dash-small-stats"><div><b>${records.length}</b><small>Appointments</small></div><a href="#calendars" class="text-link">Go to calendar</a></div>`;
  }
  if (config.kind === 'invoices') {
    const value = c.s.invoices.filter(item => item.status === 'Paid' && dateMatches(item.due,range,zone)).reduce((sum,item) => sum + item.value,0);
    return `<div class="dash-small-stats"><div><b>${formatMoney(c,value)}</b><small>Paid invoices</small></div><a href="#payments" class="text-link">Go to payments</a></div>`;
  }
  const deals = scopedDeals(c.s,config,range,{owner:config.owner});
  const before = comparison ? scopedDeals(c.s,config,comparison,{owner:config.owner}) : null;
  if (config.kind === 'status' || config.kind === 'value') return metricStatus(c,config,deals,before);
  if (config.kind === 'conversion') return conversion(c,deals,before);
  if (config.kind === 'source') return sources(c,deals);
  if (config.kind === 'efficiency') return sales(c,deals);
  const stage = stageTotals(c.s,config.pipeline,deals);
  if (config.kind === 'funnel') return funnel(c,stage.funnel);
  const present = stage.distribution.filter(row => row.count);
  return present.length ? meters(present,row => integer(row.count),row => row.count) : emptyMessage();
}

function widgetCard(c, entry, index, count, range, comparison) {
  const config = effectiveWidget(c.s,entry,c.dash.draft ? {} : c.dash.view[entry.id]);
  const definition = widgets[config.kind];
  const editor = c.dash.draft;
  const caption = definition.pipeline ? dateFields[config.dateField] : definition.period;
  const users = config.kind === 'efficiency' ? [...new Set(c.s.opportunities.map(record => record.owner).filter(Boolean))].sort() : [];
  const pipeline = definition.pipeline ? `<div class="dash-card-filters">
    ${selectMarkup(`${config.title} pipeline`,`data-dash-widget="${entry.id}" data-dash-field="pipeline"`,config.pipeline,c.s.pipelines.map(row => [row.id,row.name]),definition.needsPipeline ? '' : 'Todos os pipelines')}
    ${config.kind === 'efficiency' ? selectMarkup('Opportunity owner',`data-dash-widget="${entry.id}" data-dash-field="owner"`,config.owner || '',users.map(label => [label,label]),'All users') : ''}</div>` : '';
  const editTools = editor ? `<div class="dash-edit-tools">
    <button type="button" class="icon-btn" data-dash-act="up" data-widget="${entry.id}" aria-label="Move ${h(entry.title)} earlier" ${index ? '' : 'disabled'}>${icon('left',15)}</button>
    <button type="button" class="icon-btn" data-dash-act="down" data-widget="${entry.id}" aria-label="Move ${h(entry.title)} later" ${index + 1 < count ? '' : 'disabled'}>${icon('right',15)}</button>
    <button type="button" class="icon-btn" data-dash-act="remove" data-widget="${entry.id}" aria-label="Remove ${h(entry.title)}">${icon('trash',15)}</button></div>` : '';
  const cardSettings = editor || definition.pipeline ? `<button type="button" class="icon-btn dash-card-settings" data-dash-act="widget-settings" data-widget="${entry.id}" aria-label="Configure ${h(entry.title)}" title="Configure widget">${icon('sliders',15)}</button>` : '';
  return `<section class="dash-card dash-w${entry.width} ${index < 3 && ['status','value','conversion'].includes(entry.kind) ? 'dash-primary' : ''} ${entry.kind === 'note' ? 'dash-note-card' : ''}" data-dashboard-card="${entry.id}">
    <header ${editor ? `draggable="true" data-dash-drag="${entry.id}"` : ''}><div><h2>${h(tr(entry.title))}</h2>${caption ? `<p>${h(tr(caption))}</p>` : ''}</div>${editTools}${cardSettings}</header>
    <div class="dash-card-body">${pipeline}${widgetBody(c,config,range,comparison)}</div></section>`;
}

export function dashboard(c) {
  const saved = activeDashboard(c);
  const board = c.dash.draft || saved;
  const range = dashboardRange(c);
  const comparison = c.dash.range.compare ? priorDates(range) : null;
  const editing = Boolean(c.dash.draft);
  const compatible = board.widgets.some(item => widgets[item.kind].quick);
  const labels = Object.entries(dashboardPeriods);
  const period = labels.find(([key]) => key === c.dash.range.period)?.[1] || 'Últimos 30 dias';
  const toolbar = editing ? `<div class="dash-right">
    ${glyph('undo','Desfazer','left')}${glyph('redo','Refazer','right')}${tool('widget-add','Adicionar widget','plus')}${tool('cancel','Cancelar')}
    <button class="primary dash-save" data-dash-act="save">Salvar alterações</button></div>` : `<div class="dash-right">
    ${glyph('refresh','Atualizar painel','refresh')}${glyph('note','Adicionar nota adesiva','note')}${tool('dates',`${period} ${icon('chevron',14)}`,'cal')}
    ${tool('summary',`Resumo do painel ${icon('spark',15)}`)}${tool('edit','Editar painel','edit')}
    ${glyph('report','Enviar como relatório','send')}${glyph('more','Mais ações','dots')}</div>`;
  const tags = [...new Set(c.s.contacts.flatMap(contact => contact.tags))].sort();
  return `<div class="dashboard-page"><div class="dashboard-toolbar" aria-label="Cabeçalho do painel"><div class="dash-switch">
    <h1>${tool(editing ? 'rename' : 'switch',`${h(tr(board.name))} ${icon(editing ? 'edit' : 'chevron',15)}`)}</h1>${editing ? '' : tool('new','Novo','plus')}</div>${toolbar}</div>
    <div class="dash-quick"><button data-dash-act="quick" ${compatible ? '' : 'disabled'}>Filtros rápidos</button>
    ${compatible && c.dash.showQuick ? selectMarkup('Tag do contato','data-dash-quick',c.dash.quickTag,tags.map(label => [label,label]),'Todas as tags') : ''}</div>
    <div class="dashboard-grid" aria-label="Widgets do painel">${board.widgets.map((entry,index) => widgetCard(c,entry,index,board.widgets.length,range,comparison)).join('') ||
      `<div class="dash-card dash-w12">${emptyMessage('Este painel ainda não tem widgets','grid',tool(editing ? 'widget-add' : 'edit',editing ? 'Adicionar widget' : 'Editar painel','plus'))}</div>`}</div></div>`;
}

export function drawDashboardGauges(root) {
  for (const canvas of root.querySelectorAll('[data-dash-gauge]')) {
    const paint = canvas.getContext('2d');
    if (!paint) continue;
    const value = Number(canvas.dataset.dashGauge);
    const start = -Math.PI/2;
    paint.clearRect(0,0,240,240);
    paint.lineWidth = 16;
    paint.strokeStyle = getComputedStyle(canvas).getPropertyValue('--g-gauge-track').trim() || '#e4eaf7';
    paint.beginPath(); paint.arc(120,120,110,0,Math.PI*2); paint.stroke();
    paint.lineCap = 'round';
    paint.strokeStyle = '#ff00bb';
    if (value > 0) {
      paint.beginPath(); paint.arc(120,120,110,start,start+Math.PI*2*value/100); paint.stroke();
    } else {
      paint.fillStyle = '#ff00bb';
      paint.beginPath(); paint.arc(120,10,8,0,Math.PI*2); paint.fill();
    }
  }
}
