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

export const shareDays = [7, 30, 90, 0];
const email = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const isEmail = value => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]{2,}$/.test(value) && value.length <= 254;

/** True when the report's public link exists and has not expired. */
export const shareActive = (report, at = Date.now()) => Boolean(report?.share?.id && (!report.share.expires || Date.parse(report.share.expires) > at));

function newShare(uid, instant, days, lang) {
  return { id: (uid() + uid()).replaceAll('-', '').slice(0, 64), created: instant,
    expires: days ? new Date(Date.parse(instant) + days * 86_400_000).toISOString() : '', lang: lang === 'es' ? 'es' : 'pt' };
}

// Share link, e-mail schedule and delivery log. They never touch `version`, so an open editor
// can still save its draft after the link or the schedule changes.
function changeDelivery(report,{type,data},uid,instant) {
  if (type === 'report-share') {
    if (data.action === 'revoke') { delete report.share; delete report.schedule; return report.id; }
    const days = Number(data.days);
    if (!shareDays.includes(days)) fail('Escolha a validade do link.');
    report.share = newShare(uid, instant, days, data.lang);
    return report.id;
  }
  if (type === 'report-schedule') {
    if (data.action === 'remove') { delete report.schedule; return report.id; }
    const frequency = ['weekly','monthly'].includes(data.frequency) ? data.frequency : fail('Escolha a frequência do envio.');
    const recipients = [...new Set((Array.isArray(data.recipients) ? data.recipients : String(data.recipients || '').split(/[\s,;]+/)).map(email).filter(Boolean))];
    if (!recipients.length) fail('Informe ao menos um e-mail.');
    if (recipients.length > 10) fail('Envie para até 10 e-mails.');
    const invalid = recipients.find(value => !isEmail(value));
    if (invalid) fail(`E-mail inválido: ${invalid}`);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time) ? data.time : fail('Informe o horário no formato HH:MM.');
    const weekday = Number(data.weekday), monthday = Number(data.monthday);
    if (frequency === 'weekly' && !(Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)) fail('Escolha o dia da semana.');
    if (frequency === 'monthly' && !(Number.isInteger(monthday) && monthday >= 1 && monthday <= 28)) fail('Escolha um dia do mês entre 1 e 28.');
    // A schedule needs a link to send: create one without expiry when there is none.
    if (!shareActive(report, Date.parse(instant))) report.share = newShare(uid, instant, 0, data.lang);
    report.schedule = { frequency, weekday: frequency === 'weekly' ? weekday : null, monthday: frequency === 'monthly' ? monthday : null, time, recipients,
      message: text(data.message, 1000), lastSent: report.schedule?.lastSent || '', lastSlot: report.schedule?.lastSlot || '', lastError: '' };
    return report.id;
  }
  // report-sent: written by the scheduler after each attempt.
  if (!report.schedule) return report.id;
  Object.assign(report.schedule, { lastSlot: text(data.slot, 40), ...(data.error ? { lastError: text(data.error, 300) } : { lastSent: instant, lastError: '' }) });
  return report.id;
}

/**
 * Scheduled reports whose send time has passed today (in the workspace time zone) and that were not
 * sent for this slot yet. A missed slot is sent once, on the next check of the same day.
 */
export function reportsDue(state, at = new Date()) {
  const zone = state.profile?.timezone || 'America/Sao_Paulo';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map(part => [part.type, part.value]));
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday), clock = `${p.hour}:${p.minute}`, today = `${p.year}-${p.month}-${p.day}`;
  return state.customReports.filter(report => {
    const s = report.schedule;
    if (!s || !shareActive(report, +at) || clock < s.time || s.lastSlot === today) return false;
    return s.frequency === 'weekly' ? s.weekday === day : s.monthday === Number(p.day);
  }).map(report => ({ id: report.id, slot: today }));
}

export function changeReport(state,{type,id,data},uid,instant) {
  const prior = state.customReports.find(record => record.id === id);
  if (['report-share','report-schedule','report-sent'].includes(type)) {
    if (!prior) fail('Relatório não encontrado.',404);
    return changeDelivery(prior,{ type, data:data || {} },uid,instant);
  }
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
