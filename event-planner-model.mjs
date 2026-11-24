// Strategic event planner records. These are intentionally separate from communityEvents:
// community events manage attendance and delivery; an event plan coordinates the launch work of a sub-account.
import { randomUUID } from 'node:crypto';

export const eventPlanCollections = ['eventPlans'];
export const eventPlanStatuses = ['planejado', 'em_andamento', 'concluido', 'arquivado'];
export const eventPlanPhases = ['captura', 'aquecimento', 'evento', 'vendas', 'pos'];
export const eventPlanTeams = ['estrategia', 'comercial', 'design', 'copy', 'video', 'dev'];
export const eventPlanKinds = ['task', 'message', 'agenda', 'link'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value).slice(0, limit) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} é obrigatório.`);
const one = (value, options, label) => options.includes(value) ? value : fail(`Escolha ${label} válido.`);
const id = value => /^[0-9a-f-]{16,64}$/i.test(str(value, 64)) ? str(value, 64) : randomUUID();
const time = value => {
  const v = str(value, 5);
  if (!v) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail('Informe o horário no formato HH:MM.');
  return v;
};
const day = (value, label = 'a data') => {
  const v = str(value, 10);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) !== v) fail(`Informe ${label} válida.`);
  return v;
};
const url = value => {
  const v = str(value, 2000);
  if (!v) return '';
  try {
    const parsed = new URL(v);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href;
  } catch { /* report below */ }
  return fail('Informe um link válido (http ou https).');
};
const number = (value, min, max, fallback = 0) => {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail(`Informe um número entre ${min} e ${max}.`);
  return Math.round(parsed);
};

const briefKeys = ['goal', 'audience', 'narrative', 'offer', 'logistics', 'identity', 'followup'];
function brief(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(briefKeys.map(key => [key, str(input[key], 5000)]));
}

function item(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Um item do planejador é inválido.');
  const kind = one(value.kind, eventPlanKinds, 'o tipo de item');
  const base = {
    id: id(value.id), kind, title: req(value.title, 'O título', 240),
    phase: one(value.phase || 'aquecimento', eventPlanPhases, 'a fase'),
    owner: str(value.owner, 120), ownerId: str(value.ownerId, 64), notes: str(value.notes, 10000), date: day(value.date)
  };
  if (kind === 'task') return {
    ...base,
    status: one(value.status || 'pendente', ['pendente', 'andamento', 'feito'], 'o status'),
    team: one(value.team || 'estrategia', eventPlanTeams, 'o time')
  };
  if (kind === 'message') return {
    ...base,
    status: one(value.status || 'rascunho', ['rascunho', 'revisao', 'pronto', 'agendado', 'enviado', 'cancelado'], 'o status'),
    channel: one(value.channel || 'grupos', ['grupos', 'privado', 'instagram', 'email', 'outro'], 'o canal'),
    time: time(value.time), team: one(value.team || 'copy', eventPlanTeams, 'o time'), code: str(value.code, 40)
  };
  if (kind === 'agenda') return {
    ...base,
    status: one(value.status || 'planejado', ['planejado', 'confirmado', 'feito'], 'o status'),
    time: time(value.time), duration: number(value.duration, 0, 1440, 30),
    team: one(value.team || 'estrategia', eventPlanTeams, 'o time'), order: number(value.order, 0, 999, 0)
  };
  return {
    ...base,
    status: one(value.status || 'pendente', ['pendente', 'pronto'], 'o status'),
    url: url(value.url), team: one(value.team || 'dev', eventPlanTeams, 'o time')
  };
}

function plan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('O plano do evento é inválido.');
  const items = Array.isArray(value.items) ? value.items : [];
  if (items.length > 300) fail('Um evento pode ter até 300 itens no planejador.');
  const cleaned = items.map(item);
  const identifiers = new Set();
  for (const row of cleaned) {
    if (identifiers.has(row.id)) fail('Os itens do planejador precisam ter identificadores únicos.');
    identifiers.add(row.id);
  }
  return { brief: brief(value.brief), items: cleaned };
}

export const eventPlanFields = {
  eventPlans: (s, d) => {
    const prior = d.id ? s.eventPlans.find(row => row.id === d.id) : null;
    const pick = key => d[key] === undefined ? prior?.[key] : d[key];
    if (prior && d.revision !== undefined && Number(d.revision) !== (prior.revision || 0)) fail('O evento foi atualizado em outra sessão. Copie o que ainda não foi salvo e recarregue a página para ver a versão mais nova.', 409);
    const title = req(pick('title'), 'O nome do evento', 160);
    if (s.eventPlans.some(row => row.id !== d.id && row.title.toLocaleLowerCase('pt-BR') === title.toLocaleLowerCase('pt-BR'))) fail(`Já existe um evento chamado “${title}”.`);
    return {
      title,
      eventDate: day(pick('eventDate'), 'a data do evento'),
      status: one(pick('status') || 'planejado', eventPlanStatuses, 'o status do evento'),
      plan: plan(pick('plan') || { brief: {}, items: [] }),
      orchestration: orchestrator(pick('orchestration')),
      revision: prior ? (prior.revision || 0) + 1 : 1
    };
  }
};

const orchestrator = value => {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const items = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {};
  const cleaned = {};
  for (const [itemId, binding] of Object.entries(items)) {
    if (!/^[0-9a-f-]{16,64}$/i.test(itemId) || !binding || typeof binding !== 'object') continue;
    cleaned[itemId] = {
      taskId: str(binding.taskId, 64), socialPostId: str(binding.socialPostId, 64), emailCampaignId: str(binding.emailCampaignId, 64), updated: str(binding.updated, 40)
    };
  }
  return { appointmentId: str(raw.appointmentId, 64), items: cleaned, syncedAt: str(raw.syncedAt, 40) };
};
const eventPayload = event => ({ eventId: event.id, title: event.title, eventDate: event.eventDate, status: event.status });

export function eventPlanAfterSave(prior, event, emit) {
  emit('custom_event', { event: prior ? 'event_plan_updated' : 'event_plan_created', ...eventPayload(event), payload: eventPayload(event) });
  if (prior && prior.status !== event.status) emit('custom_event', { event: 'event_plan_status_changed', ...eventPayload(event), previousStatus: prior.status, payload: { ...eventPayload(event), previousStatus: prior.status } });
}

export function eventPlanCommand(s, command, { add, now, save, createSocial, emit, calendarInstant }) {
  if (command.type === 'event-plan-duplicate') {
    const source = s.eventPlans.find(row => row.id === command.id) || fail('Evento não encontrado.', 404);
    if (s.eventPlans.length >= 100) fail('A subconta pode ter até 100 eventos planejados.');
    const { id: ignoredId, created: ignoredCreated, updated: ignoredUpdated, orchestration: ignoredOrchestration, ...data } = structuredClone(source);
    const stem = source.title.replace(/ \(Cópia(?: \d+)?\)$/, '');
    let suffix = 1, title = stem + ' (Cópia)';
    while (s.eventPlans.some(row => row.title === title)) title = stem + ' (Cópia ' + (++suffix) + ')';
    const copy = {
      ...data,
      title: title.slice(0, 160),
      status: 'planejado',
      plan: { brief: data.plan?.brief || {}, items: (data.plan?.items || []).map(row => ({ ...row, id: randomUUID(), status: resetStatus(row) })) },
      orchestration: orchestrator(), revision: 1, created: now()
    };
    return add(s, 'eventPlans', copy).id;
  }
  if (command.type !== 'event-plan-orchestrate') return undefined;
  const event = s.eventPlans.find(row => row.id === command.id) || fail('Evento não encontrado.', 404);
  const options = command.data && typeof command.data === 'object' ? command.data : {};
  const integration = orchestrator(event.orchestration);
  const items = event.plan?.items || [];
  const result = { tasks: 0, calendar: 0, social: 0, email: 0 };

  if (options.tasks !== false) for (const item of items.filter(row => row.kind === 'task')) {
    const bound = integration.items[item.id] || {};
    if (bound.taskId && s.tasks.some(row => row.id === bound.taskId)) continue;
    const taskId = save('tasks', { title: item.title, due: item.date || event.eventDate, owner: item.owner, notes: ['Evento: ' + event.title, item.notes].filter(Boolean).join('\n\n') });
    integration.items[item.id] = { ...bound, taskId, updated: now() }; result.tasks++;
  }

  if (options.calendar !== false && !integration.appointmentId) {
    const agenda = items.filter(row => row.kind === 'agenda' && row.date && row.time && Number(row.duration) > 0).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    if (agenda.length) {
      const first = agenda[0], last = agenda.reduce((picked, row) => (row.date + row.time > picked.date + picked.time ? row : picked), first);
      const startAt = calendarInstant(first.date, first.time);
      const start = new Date(startAt).toISOString();
      const endDate = new Date(calendarInstant(last.date, last.time) + Math.max(1, Number(last.duration) || 30) * 60000).toISOString();
      integration.appointmentId = save('appointments', { title: event.title, start, end: endDate, notes: agenda.map(row => row.time + ' · ' + row.title + ' (' + row.duration + ' min)').join('\n'), source: 'event-planner' });
      result.calendar++;
    }
  }

  if (options.social !== false) for (const item of items.filter(row => row.kind === 'message' && row.channel === 'instagram' && row.notes)) {
    const bound = integration.items[item.id] || {};
    if (bound.socialPostId && s.socialPosts.some(row => row.id === bound.socialPostId)) continue;
    const socialPostId = createSocial({ type: 'post', summary: item.notes, overrides: {}, accountIds: [], media: [], link: '', firstComment: '', location: '', userTags: '', categoryId: '', tags: [event.title], needsApproval: false, source: 'event-planner', mode: 'draft', scheduleDate: '', recurrence: null });
    integration.items[item.id] = { ...bound, socialPostId, updated: now() }; result.social++;
  }

  if (options.email !== false) for (const item of items.filter(row => row.kind === 'message' && row.channel === 'email' && row.notes)) {
    const bound = integration.items[item.id] || {};
    if (bound.emailCampaignId && s.emailCampaigns.some(row => row.id === bound.emailCampaignId)) continue;
    const emailCampaignId = save('emailCampaigns', { name: (event.title + ' · ' + item.title).slice(0, 120), subject: item.title, preheader: '', fromName: s.profile?.name || '', replyTo: '', blocks: [{ type: 'heading', text: event.title, level: 1, align: 'left' }, { type: 'text', text: item.notes, align: 'left' }], style: {}, audience: { mode: 'all', tags: [] }, ab: { enabled: false } });
    integration.items[item.id] = { ...bound, emailCampaignId, updated: now() }; result.email++;
  }

  integration.syncedAt = now(); event.orchestration = integration; event.updated = now();
  const payload = { ...eventPayload(event), created: result, appointmentId: integration.appointmentId };
  emit('custom_event', { event: 'event_plan_orchestrated', ...payload, payload });
  return result;
}

function resetStatus(row) {
  if (row.kind === 'task') return 'pendente';
  if (row.kind === 'message') return 'rascunho';
  if (row.kind === 'agenda') return 'planejado';
  return 'pendente';
}
