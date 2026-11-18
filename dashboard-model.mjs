import { dashboardPeriods, dashboardThemes, dateFields, defaultDashboard, reportRows, resolveDates, validDay, widgets } from './ui/dashboard-data.js';

const invalid = (message,status = 400) => { throw Object.assign(new Error(message),{ status }); };
const text = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const required = (value,max,label) => text(value,max) || invalid(`Preencha ${label}.`);
const widths = [3,4,5,6,8,12];
const zones = new Set(Intl.supportedValuesOf('timeZone'));

function httpsUrl(value) {
  const raw = text(value,2000);
  let url;
  try { url = new URL(raw); } catch { invalid('Informe um endereço https válido.'); }
  if (url.protocol !== 'https:' || url.username || url.password) invalid('Use um endereço https sem usuário e senha.');
  return url.href;
}

export function dashboardTimezone(value) {
  const zone = text(value,64);
  if (zone && !zones.has(zone)) invalid('Escolha um fuso horário válido.');
  return zone;
}

const theme = value => Object.hasOwn(dashboardThemes,value) ? value : 'default';

function widgetInput(state,input) {
  if (!input || !Object.hasOwn(widgets,input.kind) || !/^[a-zA-Z0-9-]{1,60}$/.test(input.id || '')) invalid('Widget inválido.');
  const definition = widgets[input.kind];
  const currentPipeline = state.pipelines.find(pipeline => pipeline.id === input.pipeline);
  const content = ['note','heading','text'].includes(input.kind);
  return {
    id:input.id, kind:input.kind, title:required(input.title,100,'o título do widget'),
    width:widths.includes(Number(input.width)) ? Number(input.width) : definition.width,
    pipeline:currentPipeline?.id || '', dateField:Object.hasOwn(dateFields,input.dateField) ? input.dateField : 'status',
    note:content ? (input.kind === 'heading' ? text(input.note,200) : required(input.note,2000,'o texto')) : '',
    url:definition.url ? httpsUrl(input.url) : ''
  };
}

export function boardWidgets(state, list) {
  if (!Array.isArray(list) || list.length > 48) invalid('Um painel pode ter até 48 widgets.');
  const result = list.map(input => widgetInput(state,input));
  if (new Set(result.map(item => item.id)).size !== result.length) invalid('Os widgets precisam ter IDs diferentes.');
  return result;
}

export function changeDashboard(state, command, idFactory, instant) {
  const data = command.data;
  if (command.type === 'dashboard-create') {
    const name = required(data.name,80,'o nome do painel');
    if (state.dashboards.length >= 20) invalid('Um workspace pode ter até 20 painéis.');
    const source = state.dashboards.find(item => item.id === data.copyFrom);
    const imported = Array.isArray(data.widgets) ? boardWidgets(state,data.widgets.map(item => ({ ...item, id:idFactory() }))) : null;
    const dashboard = { ...defaultDashboard(), id:idFactory(), name, theme:theme(data.theme ?? source?.theme),
      timezone:dashboardTimezone(data.timezone ?? source?.timezone ?? ''), widgets:imported || (source ? structuredClone(source.widgets) : []) };
    state.dashboards.push(dashboard);
    return dashboard.id;
  }

  const dashboard = state.dashboards.find(item => item.id === command.id);
  if (!dashboard) invalid('Painel não encontrado.',404);
  if (command.type === 'dashboard-report') {
    const period = Object.hasOwn(dashboardPeriods,data.period) ? data.period : '30';
    if (period === 'custom' && (!validDay(data.start) || !validDay(data.end) || data.start > data.end)) invalid('Escolha um período válido.');
    const zoned = dashboard.timezone ? { ...state, profile:{ ...state.profile, timezone:dashboard.timezone } } : state;
    const ranges = resolveDates({ ...data,period },zoned.profile.timezone,new Date(instant));
    const overrides = {};
    for (const widget of dashboard.widgets) {
      const saved = data.view?.[widget.id];
      if (!saved) continue;
      const pipeline = state.pipelines.some(item => item.id === saved.pipeline) ? saved.pipeline : '';
      const dateField = Object.hasOwn(dateFields,saved.dateField) ? saved.dateField : widget.dateField;
      overrides[widget.id] = { pipeline,dateField,
        owner:text(saved.owner,80),workflow:text(saved.workflow,100),taskStatus:['Pending','Completed','All'].includes(saved.taskStatus) ? saved.taskStatus : 'Pending' };
    }
    const report = { id:idFactory(), name:required(data.name,100,'o nome do relatório'), created:instant, dashboard:dashboard.name,
      ...ranges, rows:reportRows(zoned,dashboard,overrides,ranges,text(data.tag,48),new Date(instant)) };
    if (state.dashboardReports.length >= 100) invalid('Um workspace pode ter até 100 relatórios de painel.');
    state.dashboardReports.push(report);
    return report.id;
  }
  if (command.type === 'dashboard-default') {
    state.defaultDashboard = dashboard.id;
    return dashboard.id;
  }
  if (command.type === 'dashboard-timezone') {
    dashboard.timezone = dashboardTimezone(data.timezone);
    return dashboard.id;
  }
  if (command.type === 'dashboard-delete') {
    if (state.dashboards.length <= 1) invalid('O workspace precisa ter pelo menos um painel.');
    state.dashboards = state.dashboards.filter(item => item.id !== dashboard.id);
    if (state.defaultDashboard === dashboard.id) delete state.defaultDashboard;
    return state.dashboards[0].id;
  }

  if (Number(data.version) !== dashboard.version) invalid('Este painel foi alterado em outra aba. Atualize antes de editar de novo.',409);
  const snapshot = { version:dashboard.version, name:dashboard.name, theme:dashboard.theme || 'default', widgets:structuredClone(dashboard.widgets), when:instant };
  let next;
  if (command.type === 'dashboard-restore') {
    next = dashboard.history.find(entry => entry.version === Number(data.restoreVersion));
    if (!next) invalid('Versão não encontrada.',404);
  } else {
    next = { name:required(data.name,80,'o nome do painel'), theme:theme(data.theme), widgets:boardWidgets(state,data.widgets) };
  }
  dashboard.history = [snapshot,...dashboard.history].slice(0,15);
  dashboard.name = next.name;
  dashboard.theme = theme(next.theme);
  dashboard.widgets = structuredClone(next.widgets);
  dashboard.version++;
  return dashboard.id;
}


