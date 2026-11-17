export const salesPipeline = 'sales';
export const opportunityStatuses = ['Open','Won','Lost','Abandoned'];
export const dateFields = { status:'Por mudança de status', created:'Por data de criação', updated:'Por última atualização' };
export const dashboardPeriods = {
  today:'Hoje', yesterday:'Ontem', '7':'Últimos 7 dias', '30':'Últimos 30 dias', '90':'Últimos 90 dias',
  month:'Este mês', previousMonth:'Mês passado', year:'Este ano', all:'Todo o período', custom:'Período personalizado'
};
export const widgets = {
  status:{ title:'Opportunity status', width:5, pipeline:true },
  value:{ title:'Opportunity value', width:4, pipeline:true },
  conversion:{ title:'Conversion rate', width:3, pipeline:true },
  funnel:{ title:'Funnel', width:6, pipeline:true, needsPipeline:true },
  distribution:{ title:'Stages distribution', width:6, pipeline:true, needsPipeline:true },
  tasks:{ title:'Tasks', width:6 },
  manual:{ title:'Manual actions', width:6 },
  source:{ title:'Lead source report', width:12, pipeline:true },
  'ga-count':{ title:'Google Analytics count', width:4, provider:'Google Analytics', period:'Last 12 months' },
  'ga-chart':{ title:'Google Analytics chart', width:8, provider:'Google Analytics', period:'Last 12 months' },
  business:{ title:'Google Business Profile', width:12, provider:'Google Business Profile', period:'Last 30 days' },
  'meta-ads':{ title:'Meta Ads report', width:6, provider:'Meta Ads' },
  'google-ads':{ title:'Google Ads report', width:6, provider:'Google Ads' },
  'email-health':{ title:'Email health report', width:6, provider:'Email delivery' },
  efficiency:{ title:'Sales efficiency', width:6, pipeline:true },
  contacts:{ title:'Contacts created', width:4, quick:true },
  appointments:{ title:'Appointments', width:4 },
  invoices:{ title:'Paid invoices', width:4 },
  note:{ title:'Sticky note', width:4 }
};

const defaultKinds = ['status','value','conversion','funnel','distribution','tasks','manual','source','ga-count','ga-chart',
  'business','meta-ads','google-ads','email-health','efficiency'];

export function newWidget(kind,id) {
  const definition = widgets[kind];
  return { id, kind, title:definition.title, width:definition.width, pipeline:'', dateField:'status', note:'' };
}

export function defaultDashboard() {
  return { id:'dashboard', name:'Dashboard', version:1, widgets:defaultKinds.map(kind => newWidget(kind,kind)), history:[] };
}

export function dayAt(instant, timezone) {
  if (!instant) return '';
  if (typeof instant === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(instant)) return instant;
  const value = new Date(instant);
  if (!Number.isFinite(+value)) return '';
  const parts = new Intl.DateTimeFormat('en',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  const part = type => parts.find(field => field.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(day, count) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0,10);
}

export function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
}

export function resolveDates(filters, timezone, now = new Date()) {
  const today = dayAt(now,timezone);
  const period = filters.period || '30';
  const first = `${today.slice(0,7)}-01`;
  if (period === 'all') return { start:'', end:'' };
  if (period === 'custom' && validDay(filters.start) && validDay(filters.end) && filters.start <= filters.end) {
    return { start:filters.start, end:filters.end };
  }
  if (period === 'today') return { start:today, end:today };
  if (period === 'yesterday') { const yesterday = addDays(today,-1); return { start:yesterday, end:yesterday }; }
  if (period === 'month') return { start:first, end:today };
  if (period === 'previousMonth') { const end = addDays(first,-1); return { start:`${end.slice(0,7)}-01`, end }; }
  if (period === 'year') return { start:`${today.slice(0,4)}-01-01`, end:today };
  return { start:addDays(today,1-(Number(period) || 30)), end:today };
}

export function priorDates(range) {
  if (!range.start) return null;
  const days = Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1;
  return { start:addDays(range.start,-days), end:addDays(range.start,-1) };
}

export function dateMatches(datetime, range, zone) {
  if (!range.start) return true;
  const day = dayAt(datetime,zone);
  return Boolean(day && day >= range.start && day <= range.end);
}

function opportunityDate(record, field) {
  if (field === 'created') return record.created;
  if (field === 'updated') return record.updated || record.created;
  return record.statusChangedAt || record.created;
}

export function scopedDeals(state, widget, range, filters = {}) {
  return state.opportunities.filter(record => (!widget.pipeline || record.pipelineId === widget.pipeline) &&
    (!filters.owner || record.owner === filters.owner) &&
    dateMatches(opportunityDate(record,widget.dateField),range,state.profile.timezone));
}

const totalValue = records => records.reduce((sum,record) => sum + record.value,0);

export function statusTotals(deals) {
  return opportunityStatuses.map(status => {
    const records = deals.filter(record => record.status === status);
    return { status, count:records.length, value:totalValue(records) };
  });
}

export function conversionTotals(deals) {
  const won = deals.filter(record => record.status === 'Won');
  return { rate:deals.length ? 100 * won.length / deals.length : 0, revenue:totalValue(won), count:won.length };
}

export function stageTotals(state, pipelineId, deals) {
  const stages = state.stages.filter(stage => stage.pipelineId === pipelineId && stage.visible !== false);
  const open = deals.filter(record => record.status === 'Open');
  const won = deals.filter(record => record.status === 'Won');
  const lost = deals.filter(record => record.status === 'Lost');
  const abandoned = deals.filter(record => record.status === 'Abandoned');
  const exact = stages.map(stage => {
    const match = open.filter(record => record.stage === stage.id);
    return { name:stage.name, count:match.length, value:totalValue(match) };
  });
  const closed = (name, records) => ({ name, count:records.length, value:totalValue(records) });
  const wonTotal = closed('Won',won);
  const funnel = [...exact.map((row,index) => ({ ...row,
    count:exact.slice(index).reduce((sum,item) => sum + item.count,won.length),
    value:exact.slice(index).reduce((sum,item) => sum + item.value,wonTotal.value)
  })),wonTotal];
  return { funnel, distribution:[...exact,wonTotal,closed('Lost',lost),closed('Abandoned',abandoned)] };
}

export function sourceTotals(deals) {
  const groups = new Map();
  for (const deal of deals) {
    const source = deal.source || 'N/A';
    if (!groups.has(source)) groups.set(source,[]);
    groups.get(source).push(deal);
  }
  return Array.from(groups,([source,records]) => ({ source, count:records.length,
    value:totalValue(records), totals:statusTotals(records) })).sort((a,b) => b.count - a.count || a.source.localeCompare(b.source));
}

export function salesTotals(deals) {
  const won = deals.filter(record => record.status === 'Won');
  const durations = won.map(record => Date.parse(record.statusChangedAt || record.created) - Date.parse(record.created)).filter(ms => ms >= 0);
  return { value:totalValue(won), duration:durations.length ? durations.reduce((sum,ms) => sum + ms,0) / durations.length : 0 };
}

export function effectiveWidget(state, widget, view = {}) {
  const config = { ...widget, ...view };
  const available = state.pipelines.some(item => item.id === config.pipeline);
  if (!available) config.pipeline = widgets[widget.kind].needsPipeline ? state.pipelines[0]?.id || '' : '';
  return config;
}

export function reportRows(state, dashboard, view, range, tag = '') {
  const result = [];
  for (const widget of dashboard.widgets) {
    const config = effectiveWidget(state,widget,view[widget.id]);
    const deals = scopedDeals(state,config,range,{owner:config.owner});
    if (widget.kind === 'status' || widget.kind === 'value') {
      const key = widget.kind === 'status' ? 'count' : 'value';
      result.push(...statusTotals(deals).map(row => [widget.title,row.status,row[key]]));
    }
    if (widget.kind === 'conversion') {
      const conversion = conversionTotals(deals);
      result.push([widget.title,'Conversion %',Number(conversion.rate.toFixed(2))],[widget.title,'Won revenue',conversion.revenue]);
    }
    if (widget.kind === 'funnel' || widget.kind === 'distribution') {
      result.push(...stageTotals(state,config.pipeline,deals)[widget.kind].map(row => [widget.title,row.name,row.count]));
    }
    if (widget.kind === 'source') result.push(...sourceTotals(deals).map(row => [widget.title,row.source,row.count]));
    if (widget.kind === 'efficiency') {
      const sales = salesTotals(deals);
      result.push([widget.title,'Total sale value',sales.value],[widget.title,'Average duration (hours)',Number((sales.duration/3600000).toFixed(2))]);
    }
    if (widget.kind === 'manual') {
      const pending = state.manualActions.filter(row => row.status === 'Pending' && (!config.workflow || row.workflowId === config.workflow) &&
        (!config.owner || row.assignee === config.owner) && dateMatches(row.created,range,state.profile.timezone));
      result.push([widget.title,'Phone',pending.filter(item => item.type === 'Manual Call').length],
        [widget.title,'SMS',pending.filter(item => item.type === 'Manual SMS').length],[widget.title,'Total pending',pending.length]);
    }
    if (widget.kind === 'tasks') {
      const status = config.taskStatus || 'Pending';
      const count = state.tasks.filter(row => (status === 'All' || row.done === (status === 'Completed')) &&
        (!config.owner || row.owner === config.owner) && dateMatches(row.due?.slice(0,10),range,state.profile.timezone)).length;
      result.push([widget.title,status,count]);
    }
    if (widget.kind === 'contacts') result.push([widget.title,'Contacts',state.contacts.filter(row => (!tag || row.tags.includes(tag)) && dateMatches(row.created,range,state.profile.timezone)).length]);
    if (widget.kind === 'appointments') result.push([widget.title,'Appointments',state.appointments.filter(row => row.status !== 'Canceled' && dateMatches(row.start,range,state.profile.timezone)).length]);
    if (widget.kind === 'invoices') result.push([widget.title,'Paid value',state.invoices.filter(row => row.status === 'Paid' && dateMatches(row.due,range,state.profile.timezone)).reduce((sum,row) => sum + row.value,0)]);
  }
  return result;
}
