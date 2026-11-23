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
    owner: str(value.owner, 120), notes: str(value.notes, 10000), date: day(value.date)
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
    time: time(value.time), team: one(value.team || 'copy', eventPlanTeams, 'o time')
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
    const title = req(pick('title'), 'O nome do evento', 160);
    if (s.eventPlans.some(row => row.id !== d.id && row.title.toLocaleLowerCase('pt-BR') === title.toLocaleLowerCase('pt-BR'))) fail(`Já existe um evento chamado “${title}”.`);
    return {
      title,
      eventDate: day(pick('eventDate'), 'a data do evento'),
      status: one(pick('status') || 'planejado', eventPlanStatuses, 'o status do evento'),
      plan: plan(pick('plan') || { brief: {}, items: [] })
    };
  }
};

export function eventPlanCommand(s, command, { add, now }) {
  if (command.type !== 'event-plan-duplicate') return undefined;
  const source = s.eventPlans.find(row => row.id === command.id) || fail('Evento não encontrado.', 404);
  if (s.eventPlans.length >= 100) fail('A subconta pode ter até 100 eventos planejados.');
  const { id: ignoredId, created: ignoredCreated, updated: ignoredUpdated, ...data } = structuredClone(source);
  const stem = source.title.replace(/ \(Cópia(?: \d+)?\)$/, '');
  let suffix = 1, title = `${stem} (Cópia)`;
  while (s.eventPlans.some(row => row.title === title)) title = `${stem} (Cópia ${++suffix})`;
  const copy = {
    ...data,
    title: title.slice(0, 160),
    status: 'planejado',
    plan: {
      brief: data.plan?.brief || {},
      items: (data.plan?.items || []).map(row => ({ ...row, id: randomUUID(), status: resetStatus(row) }))
    },
    created: now()
  };
  return add(s, 'eventPlans', copy).id;
}

function resetStatus(row) {
  if (row.kind === 'task') return 'pendente';
  if (row.kind === 'message') return 'rascunho';
  if (row.kind === 'agenda') return 'planejado';
  return 'pendente';
}
