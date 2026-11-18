// Rule engine for opportunities: the advanced filters, saved lists and per-pipeline smart tags all use it.
// A rule set is a list of groups. Groups are joined with OR; the conditions inside a group are joined with AND.
// Pure module: the browser renders the builder from these tables and model.mjs validates saved smart tags with them.

export const ruleTypes = {
  text: [['is','É'],['isNot','Não é'],['contains','Contém'],['notContains','Não contém'],['empty','Está vazio'],['notEmpty','Não está vazio']],
  number: [['eq','Igual a'],['ne','Diferente de'],['lt','Menor que'],['gt','Maior que'],['lte','Menor ou igual a'],['gte','Maior ou igual a'],['empty','Está vazio'],['notEmpty','Não está vazio']],
  choice: [['anyOf','É qualquer um de'],['noneOf','Não é nenhum de']],
  list: [['hasAny','Contém algum de'],['hasNone','Não contém nenhum de'],['empty','Está vazio'],['notEmpty','Não está vazio']],
  date: [['is','É'],['isNot','Não é']]
};
export const datePresets = [
  ['yesterday','Ontem'],['today','Hoje'],['thisWeek','Esta semana'],['thisMonth','Este mês'],['thisQuarter','Este trimestre'],['thisYear','Este ano'],
  ['on','Na data'],['after','Depois de'],['before','Antes de'],['between','Entre'],['inLast','Nos últimos (dias)'],['moreThan','Há mais de (dias)'],['lessThan','Há menos de (dias)'],
  ['empty','Sem data'],['notEmpty','Com data']
];
export const noValueOps = new Set(['empty','notEmpty']);

const chance = (deal, ctx) => {
  const stage = ctx.stages?.get(deal.stage);
  const pipeline = ctx.pipelines?.get(deal.pipelineId);
  return pipeline?.dealProbability === false ? stage?.probability ?? null : deal.probability ?? stage?.probability ?? null;
};
const lateDays = (deal, ctx) => deal.status === 'Open' && deal.closeDate ? Math.max(0, daysBetween(deal.closeDate, ctx.today)) : 0;
const closedAt = status => deal => deal.status === status ? deal.statusChangedAt || deal.updated || deal.created : '';

/** Filterable fields: [key, label, type, group, read(deal, ctx)]. Choice fields list their options through ctx. */
export const ruleFields = [
  ['owner','Responsável','text','Oportunidade',deal => deal.owner],
  ['followers','Seguidores','list','Oportunidade',deal => deal.followers],
  ['status','Status','choice','Oportunidade',deal => deal.status],
  ['stage','Etapa','choice','Oportunidade',deal => deal.stage],
  ['source','Origem','text','Oportunidade',deal => deal.source],
  ['tags','Tags da oportunidade','list','Oportunidade',deal => deal.tags],
  ['contactTags','Tags do contato principal','list','Oportunidade',(deal, ctx) => ctx.contacts?.get(deal.contactId)?.tags],
  ['value','Valor','number','Oportunidade',deal => deal.value],
  ['stageChangedAt','Última mudança de etapa','date','Oportunidade',deal => deal.stageChangedAt || deal.created],
  ['statusChangedAt','Última mudança de status','date','Oportunidade',deal => deal.statusChangedAt || deal.created],
  ['created','Criada em','date','Oportunidade',deal => deal.created],
  ['updated','Atualizada em','date','Oportunidade',deal => deal.updated || deal.created],
  ['closeDate','Previsão de fechamento','date','Oportunidade',deal => deal.closeDate],
  ['probability','Probabilidade (%)','number','Oportunidade',chance],
  ['slips','Adiamentos da previsão','number','Oportunidade',deal => deal.slips || 0],
  ['lateDays','Atraso da previsão (dias)','number','Oportunidade',lateDays],
  ['wonAt','Ganha em','date','Oportunidade',closedAt('Won')],
  ['lostAt','Perdida em','date','Oportunidade',closedAt('Lost')],
  ['lostReason','Motivo da perda','text','Oportunidade',deal => deal.lostReason],
  ['company','Empresa principal','text','Associações',(deal, ctx) => deal.company || ctx.contacts?.get(deal.contactId)?.company],
  ['contact','Contato principal','text','Associações',(deal, ctx) => {
    const contact = ctx.contacts?.get(deal.contactId);
    return contact ? [contact.name, contact.email, contact.phone].filter(Boolean).join(' ') : '';
  }]
];
export const ruleField = key => ruleFields.find(field => field[0] === key);

const fold = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
const list = value => (Array.isArray(value) ? value : String(value ?? '').split(',')).map(item => String(item).trim()).filter(Boolean);
const day = 86400000;

/** Calendar day (YYYY-MM-DD) of an ISO timestamp or date in a time zone. Bare dates are already days. */
export function dayIn(value, timeZone = 'UTC') {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const at = new Date(value);
  if (Number.isNaN(+at)) return '';
  try { return new Intl.DateTimeFormat('en-CA',{ timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).format(at); }
  catch { return at.toISOString().slice(0,10); }
}
const utc = key => Date.parse(`${key}T00:00:00Z`);
const shift = (key, days) => new Date(utc(key) + days * day).toISOString().slice(0,10);
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / day);
/** First and last day of the period containing `today`. Weeks start on Monday. */
export function periodOf(kind, today) {
  const [y, m] = today.split('-').map(Number);
  const iso = (year, month, date) => new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0,10);
  if (kind === 'week') { const weekday = (new Date(utc(today)).getUTCDay() + 6) % 7; return [shift(today,-weekday), shift(today,6 - weekday)]; }
  if (kind === 'month') return [iso(y,m,1), iso(y,m + 1,0)];
  if (kind === 'quarter') { const first = Math.floor((m - 1) / 3) * 3 + 1; return [iso(y,first,1), iso(y,first + 3,0)]; }
  return [iso(y,1,1), iso(y,12,31)];
}

function dateMatch(key, rule, today) {
  const preset = rule.value;
  if (preset === 'empty') return !key;
  if (preset === 'notEmpty') return Boolean(key);
  if (!key) return false;
  const within = ([first, last]) => key >= first && key <= last;
  const n = Math.max(0, Math.floor(Number(rule.days) || 0));
  switch (preset) {
    case 'yesterday': return key === shift(today,-1);
    case 'today': return key === today;
    case 'thisWeek': return within(periodOf('week',today));
    case 'thisMonth': return within(periodOf('month',today));
    case 'thisQuarter': return within(periodOf('quarter',today));
    case 'thisYear': return within(periodOf('year',today));
    case 'on': return key === rule.date;
    case 'after': return Boolean(rule.date) && key > rule.date;
    case 'before': return Boolean(rule.date) && key < rule.date;
    case 'between': return Boolean(rule.date && rule.date2) && key >= rule.date && key <= rule.date2;
    case 'inLast': return key >= shift(today,-n) && key <= today;
    case 'moreThan': return key < shift(today,-n);
    case 'lessThan': return key > shift(today,-n) && key <= today;
    default: return false;
  }
}

/** True when one condition holds for a deal. Unknown fields or operators never match. */
export function matchesRule(deal, rule, ctx) {
  const field = ruleField(rule.field);
  if (!field) return false;
  const [, , type, , read] = field;
  const raw = read(deal, ctx);
  if (type === 'date') {
    const hit = dateMatch(dayIn(raw, ctx.timeZone), rule, ctx.today);
    return rule.op === 'isNot' ? !hit : hit;
  }
  if (type === 'choice') {
    const wanted = list(rule.value);
    const hit = wanted.includes(String(raw ?? ''));
    return rule.op === 'noneOf' ? !hit : rule.op === 'anyOf' && hit;
  }
  if (type === 'list') {
    const values = list(raw).map(fold), wanted = list(rule.value).map(fold);
    if (rule.op === 'empty') return !values.length;
    if (rule.op === 'notEmpty') return values.length > 0;
    const hit = wanted.some(item => values.includes(item));
    return rule.op === 'hasNone' ? !hit : rule.op === 'hasAny' && hit;
  }
  if (type === 'number') {
    const empty = raw === null || raw === undefined || raw === '';
    if (rule.op === 'empty') return empty;
    if (rule.op === 'notEmpty') return !empty;
    if (empty || rule.value === '' || rule.value === undefined) return false;
    const a = Number(raw), b = Number(rule.value);
    return { eq:a === b, ne:a !== b, lt:a < b, gt:a > b, lte:a <= b, gte:a >= b }[rule.op] ?? false;
  }
  const text = fold(raw), wanted = fold(rule.value);
  switch (rule.op) {
    case 'empty': return !text;
    case 'notEmpty': return Boolean(text);
    case 'is': return text === wanted;
    case 'isNot': return text !== wanted;
    case 'contains': return Boolean(wanted) && text.includes(wanted);
    case 'notContains': return !wanted || !text.includes(wanted);
    default: return false;
  }
}

/** OR across groups, AND inside a group. An empty rule set matches everything. */
export function matchesRules(deal, groups, ctx) {
  const usable = (groups || []).filter(group => group?.length);
  return !usable.length || usable.some(group => group.every(rule => matchesRule(deal, rule, ctx)));
}

/** Lookup tables the rules read. `at` is the clock, `timeZone` the workspace zone. */
export function ruleContext(state, { at = Date.now(), timeZone = state.profile?.timezone || 'UTC' } = {}) {
  return {
    contacts: new Map(state.contacts.map(contact => [contact.id, contact])),
    stages: new Map(state.stages.map(stage => [stage.id, stage])),
    pipelines: new Map(state.pipelines.map(pipeline => [pipeline.id, pipeline])),
    timeZone, today: dayIn(new Date(at).toISOString(), timeZone)
  };
}

/** Normalizes untrusted rules (from storage or the API). Drops unknown fields and operators; caps sizes. */
export function cleanRules(groups) {
  if (!Array.isArray(groups)) return [];
  const text = (value, max = 200) => String(value ?? '').slice(0, max);
  return groups.slice(0, 10).map(group => (Array.isArray(group) ? group : []).slice(0, 10).map(rule => {
    const field = ruleField(rule?.field);
    if (!field) return null;
    const type = field[2], ops = ruleTypes[type].map(op => op[0]);
    const op = ops.includes(rule.op) ? rule.op : ops[0];
    const clean = { field:field[0], op };
    if (type === 'date') {
      clean.value = datePresets.some(([key]) => key === rule.value) ? rule.value : 'today';
      if (['on','after','before','between'].includes(clean.value)) clean.date = /^\d{4}-\d{2}-\d{2}$/.test(rule.date) ? rule.date : '';
      if (clean.value === 'between') clean.date2 = /^\d{4}-\d{2}-\d{2}$/.test(rule.date2) ? rule.date2 : '';
      if (['inLast','moreThan','lessThan'].includes(clean.value)) clean.days = Math.min(3650, Math.max(0, Math.floor(Number(rule.days) || 0)));
    } else if (type === 'choice' || type === 'list') clean.value = list(rule.value).slice(0, 30).map(item => text(item, 80));
    else if (type === 'number') clean.value = rule.value === '' || rule.value === undefined || Number.isNaN(Number(rule.value)) ? '' : Number(rule.value);
    else clean.value = text(rule.value);
    return clean;
  }).filter(Boolean)).filter(group => group.length);
}

export const ruleCount = groups => (groups || []).reduce((sum, group) => sum + group.length, 0);

// ---- Smart tags ----------------------------------------------------------------------------------
export const smartTagColors = ['orange','blue','green','red','purple','pink','slate','gray'];
export const prebuiltSmartTags = [
  { key:'high-value', name:'Alto valor', color:'green', description:'Valor acima de 10.000', rules:[[{ field:'value', op:'gt', value:10000 }]] },
  { key:'new-lead', name:'Lead novo', color:'blue', description:'Criada nos últimos 3 dias', rules:[[{ field:'created', op:'is', value:'inLast', days:3 }]] },
  { key:'unassigned', name:'Sem responsável', color:'orange', description:'Responsável vazio', rules:[[{ field:'owner', op:'empty', value:'' }]] },
  { key:'hot-deal', name:'Negócio quente', color:'red', description:'Criada nesta semana com valor acima de 5.000', rules:[[{ field:'created', op:'is', value:'thisWeek' },{ field:'value', op:'gt', value:5000 }]] },
  { key:'stale', name:'Parada', color:'slate', description:'Sem atualização há mais de 30 dias', rules:[[{ field:'status', op:'anyOf', value:['Open'] },{ field:'updated', op:'is', value:'moreThan', days:30 }]] }
];

/** Smart tags of a pipeline, plus the ones another pipeline shares with every pipeline. */
export function smartTagsFor(state, pipelineId) {
  return state.pipelines.flatMap(pipeline => (pipeline.smartTags || [])
    .filter(tag => pipeline.id === pipelineId || tag.allPipelines));
}
export const smartTagsOf = (deal, tags, ctx) => tags.filter(tag => matchesRules(deal, tag.rules, ctx));

/** Plain-language summary of one condition, used in lists and descriptions. */
export function describeRule(rule, choiceLabel = value => value) {
  const field = ruleField(rule.field);
  if (!field) return '';
  const [, label, type] = field;
  const op = ruleTypes[type].find(([key]) => key === rule.op)?.[1] || '';
  if (type === 'date') {
    const preset = datePresets.find(([key]) => key === rule.value)?.[1] || '';
    const extra = rule.value === 'between' ? ` ${rule.date || '?'} e ${rule.date2 || '?'}` : ['on','after','before'].includes(rule.value) ? ` ${rule.date || '?'}` : ['inLast','moreThan','lessThan'].includes(rule.value) ? ` ${rule.days ?? 0}` : '';
    return `${label} ${op.toLowerCase()} ${preset.toLowerCase()}${extra}`;
  }
  if (noValueOps.has(rule.op)) return `${label} ${op.toLowerCase()}`;
  const value = Array.isArray(rule.value) ? rule.value.map(choiceLabel).join(', ') : rule.value;
  return `${label} ${op.toLowerCase()} ${value}`;
}
