// Catálogo de widgets de métrica do painel. Cada métrica é calculada só com os dados do workspace.
// type: number (um valor), breakdown (valores por grupo) ou trend (valores ao longo do tempo).

export function dayAt(instant, timezone) {
  if (!instant) return '';
  if (typeof instant === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(instant)) return instant;
  const value = new Date(instant);
  if (!Number.isFinite(+value)) return '';
  const parts = new Intl.DateTimeFormat('en',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  const part = type => parts.find(field => field.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function dateMatches(datetime, range, zone) {
  if (!range.start) return true;
  const day = dayAt(datetime,zone);
  return Boolean(day && day >= range.start && day <= range.end);
}

export const metricCategories = [
  ['general', 'Geral'], ['contacts', 'Contatos'], ['appointments', 'Agendamentos'], ['opportunities', 'Oportunidades'],
  ['conversations', 'Conversas'], ['payments', 'Pagamentos'], ['campaigns', 'E-mail e campanhas'], ['social', 'Social Planner'],
  ['reputation', 'Reputação'], ['sites', 'Formulários e sites'], ['tasks', 'Tarefas'], ['integrations', 'Integrações']
];

const list = key => s => s[key] || [];
const created = r => r.created;
const sum = (rows, amount) => rows.reduce((total, row) => total + (Number(amount(row)) || 0), 0);
const paid = r => r.status === 'Paid';
const succeeded = r => r.status === 'Succeeded';
const today = x => x.today;

// Builders keep each catalog entry to one line.
const number = (kind, category, title, text, spec) => ({ kind, category, title, text, type: 'number', width: 3, unit: 'count', ...spec });
const breakdown = (kind, category, title, text, spec) => ({ kind, category, title, text, type: 'breakdown', width: 4, unit: 'count', ...spec });
const trend = (kind, category, title, text, spec) => ({ kind, category, title, text, type: 'trend', width: 6, unit: 'count', ...spec });

const contacts = list('contacts'), appointments = list('appointments'), deals = list('opportunities'), messages = list('messages');
const invoices = list('invoices'), transactions = list('transactions'), subscriptions = list('subscriptions'), campaigns = list('campaigns');
const posts = list('socialPosts'), reviews = list('reviews'), submissions = list('submissions'), tasks = list('tasks');
const dealDate = r => r.statusChangedAt || r.created;
const postDate = r => r.publishedAt || r.scheduleDate || r.created;
const stageName = s => r => s.stages.find(stage => stage.id === r.stage)?.name || 'Sem etapa';
const formName = s => r => s.forms.find(form => form.id === r.formId)?.name || 'Formulário removido';

export const metricWidgets = [
  // Contatos
  number('m-contacts-count', 'contacts', 'Contagem de contatos', 'Contatos criados no período', { items: contacts, date: created, quick: true }),
  trend('m-contacts-trend', 'contacts', 'Contatos ao longo do tempo', 'Novos contatos por dia, semana ou mês', { items: contacts, date: created, quick: true }),
  breakdown('m-contacts-tags', 'contacts', 'Contatos por tag', 'Compare contatos por tag', { items: contacts, date: created, groups: r => r.tags?.length ? r.tags : ['Sem tag'] }),
  breakdown('m-contacts-company', 'contacts', 'Contatos por empresa', 'Compare contatos por empresa', { items: contacts, date: created, by: r => r.company || 'Sem empresa', quick: true }),
  number('m-contacts-email', 'contacts', 'Contatos com e-mail', 'Contatos que você pode receber por e-mail', { items: contacts, date: created, where: r => r.email, quick: true }),
  number('m-contacts-no-email', 'contacts', 'Contatos sem e-mail', 'Contatos sem endereço de e-mail', { items: contacts, date: created, where: r => !r.email, quick: true }),
  number('m-contacts-phone', 'contacts', 'Contatos com telefone', 'Contatos que você pode ligar', { items: contacts, date: created, where: r => r.phone, quick: true }),
  number('m-contacts-no-phone', 'contacts', 'Contatos sem telefone', 'Contatos sem número de telefone', { items: contacts, date: created, where: r => !r.phone, quick: true }),
  number('m-contacts-total', 'contacts', 'Total de contatos (até hoje)', 'Todos os contatos já criados', { items: contacts, date: created, fixed: 'all', quick: true }),
  number('m-contacts-month', 'contacts', 'Contatos criados este mês', 'Contatos criados no mês atual', { items: contacts, date: created, fixed: 'month', quick: true }),

  // Agendamentos
  number('m-appointments-count', 'appointments', 'Contagem de agendamentos', 'Agendamentos no período', { items: appointments, date: r => r.start }),
  trend('m-appointments-trend', 'appointments', 'Agendamentos ao longo do tempo', 'Agendamentos por dia, semana ou mês', { items: appointments, date: r => r.start }),
  breakdown('m-appointments-status', 'appointments', 'Agendamentos por status', 'Compare agendamentos por status', { items: appointments, date: r => r.start, by: r => r.status }),
  number('m-appointments-confirmed', 'appointments', 'Agendamentos confirmados', 'Quantos estão confirmados', { items: appointments, date: r => r.start, where: r => r.status === 'Confirmed' }),
  number('m-appointments-completed', 'appointments', 'Agendamentos concluídos', 'Quantos clientes compareceram', { items: appointments, date: r => r.start, where: r => r.status === 'Completed' }),
  number('m-appointments-canceled', 'appointments', 'Agendamentos cancelados', 'Quantos foram cancelados', { items: appointments, date: r => r.start, where: r => r.status === 'Canceled' }),
  trend('m-appointments-canceled-trend', 'appointments', 'Cancelamentos ao longo do tempo', 'Acompanhe os cancelamentos', { items: appointments, date: r => r.start, where: r => r.status === 'Canceled' }),
  number('m-appointments-next', 'appointments', 'Próximos agendamentos (7 dias)', 'Agendamentos da próxima semana', { items: appointments, date: r => r.start, where: r => r.status !== 'Canceled', fixed: 'next7' }),
  number('m-appointments-last-month', 'appointments', 'Agendados no mês passado', 'Agendamentos do mês anterior', { items: appointments, date: r => r.start, fixed: 'previousMonth' }),

  // Oportunidades
  number('m-deals-count', 'opportunities', 'Contagem de oportunidades', 'Oportunidades no período', { items: deals, date: dealDate }),
  trend('m-deals-trend', 'opportunities', 'Oportunidades ao longo do tempo', 'Novas oportunidades por período', { items: deals, date: created }),
  trend('m-deals-value-trend', 'opportunities', 'Valor das oportunidades ao longo do tempo', 'Valor criado por período', { items: deals, date: created, amount: r => r.value, unit: 'money' }),
  breakdown('m-deals-status', 'opportunities', 'Oportunidades por status', 'Compare oportunidades por status', { items: deals, date: dealDate, by: r => r.status }),
  breakdown('m-deals-stage', 'opportunities', 'Oportunidades por etapa', 'Compare oportunidades abertas por etapa', { items: deals, date: dealDate, where: r => r.status === 'Open', byState: stageName }),
  breakdown('m-deals-owner', 'opportunities', 'Oportunidades por responsável', 'Compare o valor por responsável', { items: deals, date: dealDate, by: r => r.owner || 'Sem responsável', amount: r => r.value, unit: 'money' }),
  breakdown('m-deals-source', 'opportunities', 'Oportunidades por origem', 'Compare oportunidades por origem', { items: deals, date: dealDate, by: r => r.source || 'Sem origem' }),
  number('m-deals-won', 'opportunities', 'Oportunidades ganhas', 'Quantas foram ganhas', { items: deals, date: dealDate, where: r => r.status === 'Won' }),
  number('m-deals-won-value', 'opportunities', 'Valor ganho', 'Soma das oportunidades ganhas', { items: deals, date: dealDate, where: r => r.status === 'Won', amount: r => r.value, unit: 'money' }),
  number('m-deals-won-month', 'opportunities', 'Valor ganho este mês', 'Ganhos do mês atual', { items: deals, date: dealDate, where: r => r.status === 'Won', amount: r => r.value, unit: 'money', fixed: 'month' }),
  number('m-deals-lost', 'opportunities', 'Oportunidades perdidas', 'Quantas foram perdidas', { items: deals, date: dealDate, where: r => r.status === 'Lost' }),
  number('m-deals-lost-value', 'opportunities', 'Valor perdido', 'Soma das oportunidades perdidas', { items: deals, date: dealDate, where: r => r.status === 'Lost', amount: r => r.value, unit: 'money' }),
  number('m-deals-open', 'opportunities', 'Oportunidades em aberto', 'Quantas estão em aberto', { items: deals, date: dealDate, where: r => r.status === 'Open' }),
  number('m-deals-open-value', 'opportunities', 'Valor em aberto', 'Soma das oportunidades em aberto', { items: deals, date: dealDate, where: r => r.status === 'Open', amount: r => r.value, unit: 'money' }),
  number('m-deals-abandoned', 'opportunities', 'Oportunidades abandonadas', 'Quantas foram abandonadas', { items: deals, date: dealDate, where: r => r.status === 'Abandoned' }),
  number('m-deals-total-value', 'opportunities', 'Valor total das oportunidades', 'Soma de todas as oportunidades', { items: deals, date: dealDate, amount: r => r.value, unit: 'money' }),

  // Conversas
  number('m-messages-in', 'conversations', 'Mensagens recebidas', 'Mensagens recebidas no período', { items: messages, date: created, where: r => r.direction === 'Inbound' }),
  number('m-messages-out', 'conversations', 'Mensagens enviadas', 'Mensagens enviadas no período', { items: messages, date: created, where: r => r.direction === 'Outbound' }),
  trend('m-messages-trend', 'conversations', 'Mensagens ao longo do tempo', 'Volume de mensagens por período', { items: messages, date: created }),
  breakdown('m-messages-channel', 'conversations', 'Mensagens por canal', 'Compare mensagens por canal', { items: messages, date: created, by: r => r.channel || 'Nota' }),
  number('m-messages-unread', 'conversations', 'Mensagens não lidas', 'Mensagens recebidas ainda não lidas', { items: messages, date: created, where: r => r.direction === 'Inbound' && !r.read, fixed: 'all' }),

  // Pagamentos
  number('m-revenue', 'payments', 'Receita', 'Transações aprovadas no período', { items: transactions, date: r => r.date, where: succeeded, amount: r => r.amount, unit: 'money' }),
  trend('m-revenue-trend', 'payments', 'Receita ao longo do tempo', 'Receita aprovada por período', { items: transactions, date: r => r.date, where: succeeded, amount: r => r.amount, unit: 'money' }),
  number('m-revenue-last-month', 'payments', 'Receita do mês passado', 'Receita aprovada no mês anterior', { items: transactions, date: r => r.date, where: succeeded, amount: r => r.amount, unit: 'money', fixed: 'previousMonth' }),
  breakdown('m-revenue-method', 'payments', 'Receita por forma de pagamento', 'Compare a receita por forma de pagamento', { items: transactions, date: r => r.date, where: succeeded, by: r => r.method, amount: r => r.amount, unit: 'money' }),
  number('m-ticket', 'payments', 'Ticket médio', 'Valor médio por transação aprovada', { items: transactions, date: r => r.date, where: succeeded, average: r => r.amount, unit: 'money' }),
  number('m-invoices-paid', 'payments', 'Faturas pagas', 'Valor das faturas pagas no período', { items: invoices, date: r => r.due, where: paid, amount: r => r.value, unit: 'money' }),
  number('m-invoices-open', 'payments', 'Faturas em aberto', 'Valor das faturas a receber', { items: invoices, date: r => r.due, where: r => r.status === 'Open', amount: r => r.value, unit: 'money' }),
  breakdown('m-invoices-status', 'payments', 'Faturas por status', 'Compare faturas por status', { items: invoices, date: r => r.due, by: r => r.status }),
  number('m-subscriptions', 'payments', 'Assinaturas ativas', 'Assinaturas ativas hoje', { items: subscriptions, date: r => r.start, where: r => r.status === 'Active', fixed: 'all' }),

  // E-mail e campanhas
  number('m-campaigns-planned', 'campaigns', 'Campanhas planejadas', 'Campanhas com data no período', { items: campaigns, date: r => r.date || r.created, where: r => r.status === 'Planned' }),
  breakdown('m-campaigns-status', 'campaigns', 'Campanhas por status', 'Compare campanhas por status', { items: campaigns, date: r => r.date || r.created, by: r => r.status }),
  breakdown('m-campaigns-channel', 'campaigns', 'Campanhas por canal', 'Compare campanhas de e-mail e social', { items: campaigns, date: r => r.date || r.created, by: r => r.channel }),

  // Social Planner
  number('m-posts-published', 'social', 'Posts publicados', 'Posts publicados no período', { items: posts, date: postDate, where: r => r.status === 'published' }),
  number('m-posts-scheduled', 'social', 'Posts agendados', 'Posts esperando a data de publicação', { items: posts, date: postDate, where: r => r.status === 'scheduled', fixed: 'all' }),
  number('m-posts-review', 'social', 'Posts aguardando aprovação', 'Posts em revisão', { items: posts, date: postDate, where: r => r.status === 'in_review', fixed: 'all' }),
  breakdown('m-posts-status', 'social', 'Posts por status', 'Compare posts por status', { items: posts, date: postDate, by: r => ({ draft: 'Rascunho', scheduled: 'Agendado', published: 'Publicado', failed: 'Com erro', in_review: 'Em revisão' })[r.status] || r.status }),
  trend('m-posts-trend', 'social', 'Posts ao longo do tempo', 'Posts publicados e agendados por período', { items: posts, date: postDate }),

  // Reputação
  number('m-reviews-count', 'reputation', 'Avaliações recebidas', 'Avaliações registradas no período', { items: reviews, date: created }),
  number('m-reviews-average', 'reputation', 'Nota média', 'Média das avaliações no período', { items: reviews, date: created, average: r => r.score, unit: 'rating' }),
  breakdown('m-reviews-score', 'reputation', 'Avaliações por nota', 'Distribuição de 1 a 5 estrelas', { items: reviews, date: created, by: r => `${r.score} ${r.score === 1 ? 'estrela' : 'estrelas'}` }),
  number('m-reviews-unanswered', 'reputation', 'Avaliações sem resposta', 'Avaliações que ainda pedem resposta', { items: reviews, date: created, where: r => !r.reply }),
  trend('m-reviews-trend', 'reputation', 'Avaliações ao longo do tempo', 'Novas avaliações por período', { items: reviews, date: created }),

  // Formulários e sites
  number('m-submissions', 'sites', 'Envios de formulário', 'Formulários enviados no período', { items: submissions, date: created }),
  trend('m-submissions-trend', 'sites', 'Envios ao longo do tempo', 'Envios de formulário por período', { items: submissions, date: created }),
  breakdown('m-submissions-form', 'sites', 'Envios por formulário', 'Compare os envios de cada formulário', { items: submissions, date: created, byState: formName }),
  number('m-pages-active', 'sites', 'Páginas ativas', 'Páginas e funis publicados', { items: list('pages'), date: created, where: r => r.active, fixed: 'all' }),

  // Tarefas
  number('m-tasks-open', 'tasks', 'Tarefas pendentes', 'Tarefas ainda abertas', { items: tasks, date: created, where: r => !r.done, fixed: 'all' }),
  number('m-tasks-overdue', 'tasks', 'Tarefas atrasadas', 'Tarefas abertas com prazo vencido', { items: tasks, date: created, where: (r, x) => !r.done && r.due && dayAt(r.due, x.zone) < today(x), fixed: 'all' }),
  number('m-tasks-done', 'tasks', 'Tarefas concluídas', 'Tarefas concluídas com prazo no período', { items: tasks, date: r => r.due || r.created, where: r => r.done }),
  breakdown('m-tasks-owner', 'tasks', 'Tarefas abertas por responsável', 'Compare a carga de cada pessoa', { items: tasks, date: created, where: r => !r.done, by: r => r.owner || 'Sem responsável', fixed: 'all' })
];

export const metricByKind = Object.fromEntries(metricWidgets.map(metric => [metric.kind, metric]));

function addDays(day, count) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function metricRange(metric, ctx) {
  const first = `${ctx.today.slice(0, 7)}-01`;
  if (metric.fixed === 'all') return { start: '', end: '' };
  if (metric.fixed === 'month') return { start: first, end: ctx.today };
  if (metric.fixed === 'previousMonth') { const end = addDays(first, -1); return { start: `${end.slice(0, 7)}-01`, end }; }
  if (metric.fixed === 'next7') return { start: ctx.today, end: addDays(ctx.today, 6) };
  return ctx.range;
}

export const fixedCaption = { all: 'Até hoje', month: 'Este mês', previousMonth: 'Mês passado', next7: 'Próximos 7 dias' };

function records(metric, state, ctx, range) {
  return metric.items(state).filter(row => (!metric.where || metric.where(row, ctx)) &&
    (!ctx.tag || !metric.quick || (row.tags || []).includes(ctx.tag)) && dateMatches(metric.date(row), range, ctx.zone));
}

export function metricValue(metric, state, ctx, range = metricRange(metric, ctx)) {
  const rows = records(metric, state, ctx, range);
  if (metric.average) return rows.length ? sum(rows, metric.average) / rows.length : null;
  return metric.amount ? sum(rows, metric.amount) : rows.length;
}

export function metricGroups(metric, state, ctx) {
  const rows = records(metric, state, ctx, metricRange(metric, ctx));
  const label = metric.byState ? metric.byState(state) : metric.by;
  const totals = new Map();
  for (const row of rows) {
    for (const group of metric.groups ? metric.groups(row) : [label(row)]) {
      totals.set(group, (totals.get(group) || 0) + (metric.amount ? Number(metric.amount(row)) || 0 : 1));
    }
  }
  return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name)));
}

const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const dayName = day => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// Buckets cover the selected range: days up to 31 days, weeks up to 26 weeks, months beyond.
export function metricTrend(metric, state, ctx) {
  const range = metricRange(metric, ctx);
  const rows = records(metric, state, ctx, range);
  const days = rows.map(row => dayAt(metric.date(row), ctx.zone)).filter(Boolean);
  let start = range.start, end = range.end || ctx.today;
  if (!start) {
    const earliest = days.length ? days.reduce((a, b) => (a < b ? a : b)) : end;
    start = earliest < addDays(end, -364) ? addDays(end, -364) : earliest;
  }
  const span = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const unit = span <= 31 ? 'day' : span <= 182 ? 'week' : 'month';
  const keyOf = day => unit === 'day' ? day : unit === 'month' ? `${day.slice(0, 7)}-01`
    : addDays(start, Math.floor((Date.parse(day) - Date.parse(start)) / 86400000 / 7) * 7);
  const buckets = [];
  for (let day = keyOf(start); day <= end && buckets.length < 400;) {
    buckets.push({ key: day, value: 0, name: unit === 'month' ? monthName.format(new Date(`${day}T00:00:00Z`)) : dayName(day) });
    if (unit === 'day') day = addDays(day, 1);
    else if (unit === 'week') day = addDays(day, 7);
    else { const next = new Date(`${day}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); day = next.toISOString().slice(0, 10); }
  }
  const index = new Map(buckets.map((bucket, position) => [bucket.key, position]));
  for (const row of rows) {
    const day = dayAt(metric.date(row), ctx.zone);
    const at = day ? index.get(keyOf(day)) : undefined;
    if (at !== undefined) buckets[at].value += metric.amount ? Number(metric.amount(row)) || 0 : 1;
  }
  return { unit, buckets };
}
