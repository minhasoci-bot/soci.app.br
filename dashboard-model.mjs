import { dashboardPeriods, dateFields, defaultDashboard, reportRows, resolveDates, validDay, widgets } from './ui/dashboard-data.js';

const invalid = (message,status = 400) => { throw Object.assign(new Error(message),{ status }); };
const text = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const required = (value,max,label) => text(value,max) || invalid(`${label} is required.`);
const widths = [3,4,5,6,8,12];

function widgetInput(state,input) {
  if (!input || !Object.hasOwn(widgets,input.kind) || !/^[a-zA-Z0-9-]{1,60}$/.test(input.id || '')) invalid('Invalid widget.');
  const currentPipeline = state.pipelines.find(pipeline => pipeline.id === input.pipeline);
  return {
    id:input.id, kind:input.kind, title:required(input.title,100,'Widget title'),
    width:widths.includes(Number(input.width)) ? Number(input.width) : widgets[input.kind].width,
    pipeline:currentPipeline?.id || '', dateField:Object.hasOwn(dateFields,input.dateField) ? input.dateField : 'status',
    note:input.kind === 'note' ? required(input.note,2000,'Note') : ''
  };
}

export function changeDashboard(state, command, idFactory, instant) {
  const data = command.data;
  if (command.type === 'dashboard-create') {
    const name = required(data.name,80,'Dashboard name');
    if (state.dashboards.length >= 20) invalid('A workspace can have up to 20 dashboards.');
    const source = state.dashboards.find(item => item.id === data.copyFrom);
    const dashboard = { ...defaultDashboard(), id:idFactory(), name, widgets:source ? structuredClone(source.widgets) : [] };
    state.dashboards.push(dashboard);
    return dashboard.id;
  }

  const dashboard = state.dashboards.find(item => item.id === command.id);
  if (!dashboard) invalid('Dashboard not found.',404);
  if (command.type === 'dashboard-report') {
    const period = Object.hasOwn(dashboardPeriods,data.period) ? data.period : '30';
    if (period === 'custom' && (!validDay(data.start) || !validDay(data.end) || data.start > data.end)) invalid('Choose a valid date range.');
    const ranges = resolveDates({ ...data,period },state.profile.timezone,new Date(instant));
    const overrides = {};
    for (const widget of dashboard.widgets) {
      const saved = data.view?.[widget.id];
      if (!saved) continue;
      const pipeline = state.pipelines.some(item => item.id === saved.pipeline) ? saved.pipeline : '';
      const dateField = Object.hasOwn(dateFields,saved.dateField) ? saved.dateField : widget.dateField;
      overrides[widget.id] = { pipeline,dateField,
        owner:text(saved.owner,80),workflow:text(saved.workflow,100),taskStatus:['Pending','Completed','All'].includes(saved.taskStatus) ? saved.taskStatus : 'Pending' };
    }
    const report = { id:idFactory(), name:required(data.name,100,'Report name'), created:instant, dashboard:dashboard.name,
      ...ranges, rows:reportRows(state,dashboard,overrides,ranges,text(data.tag,48)) };
    if (state.dashboardReports.length >= 100) invalid('A workspace can have up to 100 dashboard reports.');
    state.dashboardReports.push(report);
    return report.id;
  }

  if (Number(data.version) !== dashboard.version) invalid('This dashboard changed in another tab. Refresh before editing again.',409);
  const snapshot = { version:dashboard.version, name:dashboard.name, widgets:structuredClone(dashboard.widgets), when:instant };
  let next;
  if (command.type === 'dashboard-restore') {
    next = dashboard.history.find(entry => entry.version === Number(data.restoreVersion));
    if (!next) invalid('Version not found.',404);
  } else {
    if (!Array.isArray(data.widgets) || data.widgets.length > 36) invalid('A dashboard can have up to 36 widgets.');
    next = { name:required(data.name,80,'Dashboard name'), widgets:data.widgets.map(input => widgetInput(state,input)) };
    if (new Set(next.widgets.map(item => item.id)).size !== next.widgets.length) invalid('Widget IDs must be unique.');
  }
  dashboard.history = [snapshot,...dashboard.history].slice(0,15);
  dashboard.name = next.name;
  dashboard.widgets = structuredClone(next.widgets);
  dashboard.version++;
  return dashboard.id;
}
