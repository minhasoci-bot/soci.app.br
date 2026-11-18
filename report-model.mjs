import { boardWidgets } from './dashboard-model.mjs';
import { dashboardPeriods, dashboardThemes, validDay } from './ui/dashboard-data.js';
import { newPage, reportTemplates, templateWidgets } from './ui/report-data.js';

const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const text = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const required = (value,max,label) => text(value,max) || fail(`Preencha ${label}.`);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,60}$/.test(value);

function reportFields(data) {
  const period = Object.hasOwn(dashboardPeriods,data.period) ? data.period : '30';
  if (period === 'custom' && (!validDay(data.start) || !validDay(data.end) || data.start > data.end)) fail('Escolha um período válido.');
  return { name:required(data.name,100,'o nome do relatório'), summary:text(data.summary,4000), period,
    start:period === 'custom' ? data.start : '', end:period === 'custom' ? data.end : '',
    cover:data.cover !== false, theme:Object.hasOwn(dashboardThemes,data.theme) ? data.theme : 'default' };
}

export function changeReport(state,{type,id,data},uid,instant) {
  const prior = state.customReports.find(record => record.id === id);
  if (type === 'report-create') {
    if (state.customReports.length >= 100) fail('O workspace pode ter até 100 relatórios.');
    const source = data.source || 'blank';
    const dashboard = source === 'dashboard' && state.dashboards.find(item => item.id === data.sourceId);
    const copy = source === 'clone' && state.customReports.find(item => item.id === data.sourceId);
    if (source === 'dashboard' && !dashboard) fail('Painel não encontrado.',404);
    if (source === 'clone' && !copy) fail('Relatório não encontrado.',404);
    if (source === 'template' && !Object.hasOwn(reportTemplates,data.sourceId)) fail('Modelo não encontrado.',404);
    if (!['blank','dashboard','clone','template'].includes(source)) fail('Origem do relatório inválida.');
    const first = newPage(uid());
    if (dashboard) first.widgets = dashboard.widgets.map(widget => ({ ...widget, id:uid() }));
    if (source === 'template') first.widgets = templateWidgets(data.sourceId,uid);
    const pages = copy ? copy.pages.map(page => ({ ...page, id:uid(), widgets:page.widgets.map(widget => ({ ...widget, id:uid() })) })) : [first];
    const fields = reportFields({ ...copy, theme:copy?.theme || dashboard?.theme, name:data.name });
    const record = { ...fields, id:uid(), pages, version:1, created:instant, updated:instant };
    state.customReports.push(record);
    return record.id;
  }

  if (!prior) fail('Relatório não encontrado.',404);
  if (data.version !== prior.version) fail('O relatório foi alterado em outra aba. Atualize a página para abrir a versão mais recente.',409);
  if (type === 'report-delete') {
    state.customReports = state.customReports.filter(item => item.id !== id);
    return id;
  }
  const fields = reportFields(data);
  if (!Array.isArray(data.pages) || !data.pages.length || data.pages.length > 20) fail('Use entre 1 e 20 páginas.');
  const ids = new Set();
  const pages = data.pages.map(page => {
    if (!page || !validId(page.id) || ids.has(page.id)) fail('ID de página inválido ou repetido.');
    ids.add(page.id);
    return { id:page.id, name:required(page.name,80,'o nome da página'), widgets:boardWidgets(state,page.widgets) };
  });
  if (pages.reduce((sum,page) => sum + page.widgets.length,0) > 100) fail('O relatório pode ter até 100 elementos.');
  Object.assign(prior,fields,{ pages, version:prior.version + 1, updated:instant });
  return id;
}
