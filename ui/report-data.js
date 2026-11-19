import { dashboardPeriods, newWidget, reportRows, resolveDates, widgets } from './dashboard-data.js';

export const reportTemplates = {
  sales: { title:'Desempenho comercial', kinds:['status','value','conversion','funnel','source'] },
  activity: { title:'Atividade do workspace', kinds:['m-contacts-count','m-appointments-count','tasks','manual'] },
  revenue: { title:'Receita e pagamentos', kinds:['m-revenue-trend','invoices','value'] },
  social: { title:'Desempenho de Redes Sociais', kinds:['m-posts-published','m-posts-scheduled','m-posts-review','m-posts-status','m-posts-trend'] }
};
export const newPage = (id, number = 1) => ({ id, name:`Página ${number}`, widgets:[] });
export const reportRange = (state, report) => resolveDates(report,state.profile.timezone);
export const reportPeriod = (report, range) => range.start ? `${range.start.split('-').reverse().join('/')} – ${range.end.split('-').reverse().join('/')}` : dashboardPeriods[report.period];
export function templateWidgets(template, uid) {
  return (reportTemplates[template]?.kinds || []).map(kind => newWidget(kind,uid()));
}

export function reportCsv(state, report) {
  const quote = value => {
    const str = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(str) ? "'" + str : str;
    return '"' + safe.replaceAll('"','""') + '"';
  };
  const range = reportRange(state,report);
  const data = report.pages.flatMap(page => reportRows(state,{ widgets:page.widgets.filter(widget => widgets[widget.kind]) },{},range)
    .map(row => [page.name,...row]));
  return '\uFEFF' + [['Página','Widget','Métrica','Valor'],...data].map(row => row.map(quote).join(',')).join('\r\n');
}
