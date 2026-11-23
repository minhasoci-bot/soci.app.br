import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';

const save = (state, key, data, id = '') => execute(state, { type: 'save', key, id, data });
const plan = () => ({
  brief: { goal: 'Gerar inscrições qualificadas', audience: 'Profissionais em transição', narrative: 'Uma aula prática', offer: 'Mentoria', logistics: 'Online', identity: 'Direto', followup: 'Contato em 24h' },
  items: [
    { id: '3c4ad2e7-7ec3-4b15-a35c-155e081bd240', kind: 'task', title: 'Aprovar página', phase: 'captura', status: 'pendente', team: 'dev', date: '2026-12-01', owner: 'Ana', notes: '' },
    { id: '6ccf69dd-f808-4258-b12c-9d5de1f06c88', kind: 'message', title: 'Convite', phase: 'aquecimento', status: 'rascunho', team: 'copy', channel: 'grupos', date: '2026-12-02', time: '09:00', owner: 'Bia', notes: 'Participe: [link]' },
    { id: '8a1a03c8-1837-4c22-90f1-73512e20d11c', kind: 'agenda', title: 'Abertura', phase: 'evento', status: 'planejado', team: 'estrategia', date: '2026-12-05', time: '19:00', duration: 10, order: 1, owner: '', notes: '' },
    { id: 'b7299d71-5767-4acb-91d5-d1b7e4664d56', kind: 'link', title: 'Inscrição', phase: 'captura', status: 'pendente', team: 'dev', date: '2026-12-01', url: 'https://example.test/inscricao', owner: '', notes: '' }
  ]
});

test('Event planner stores a bounded, validated plan independently of community events', () => {
  const state = blank();
  assert.deepEqual(state.eventPlans, []);
  const id = save(state, 'eventPlans', { title: 'Aula de lançamento', eventDate: '2026-12-05', plan: plan() });
  const event = state.eventPlans.find(row => row.id === id);
  assert.deepEqual([event.status, event.eventDate, event.plan.items.length], ['planejado', '2026-12-05', 4]);
  assert.equal(event.plan.items.find(row => row.kind === 'link').url, 'https://example.test/inscricao');
  assert.equal(state.communityEvents.length, 0, 'event plans do not use the member event collection');

  assert.throws(() => save(state, 'eventPlans', { title: 'Outra aula', eventDate: '2026-02-30', plan: plan() }), /data.*válida/);
  assert.throws(() => save(state, 'eventPlans', { title: 'Outra aula', eventDate: '2026-12-06', plan: { ...plan(), items: [...plan().items, { ...plan().items[0], title: 'Duplicada' }] } }), /identificadores únicos/);
  assert.throws(() => save(state, 'eventPlans', { title: 'Outra aula', eventDate: '2026-12-06', plan: { ...plan(), items: [{ ...plan().items[3], url: 'javascript:alert(1)' }] } }), /link válido/);
  assert.throws(() => save(state, 'eventPlans', { title: 'Aula de lançamento', eventDate: '2026-12-07', plan: plan() }), /Já existe um evento/);
});

test('Event planner duplicate resets progress and generates unique records', () => {
  const state = blank();
  const id = save(state, 'eventPlans', { title: 'Workshop', eventDate: '2026-12-05', status: 'concluido', plan: { ...plan(), items: [{ ...plan().items[0], status: 'feito' }, { ...plan().items[1], status: 'enviado' }, ...plan().items.slice(2)] } });
  const firstCopy = execute(state, { type: 'event-plan-duplicate', id });
  const secondCopy = execute(state, { type: 'event-plan-duplicate', id });
  const copies = state.eventPlans.filter(row => row.id !== id);
  assert.deepEqual(copies.map(row => row.title), ['Workshop (Cópia)', 'Workshop (Cópia 2)']);
  assert.equal(state.eventPlans.find(row => row.id === firstCopy).status, 'planejado');
  assert.equal(state.eventPlans.find(row => row.id === firstCopy).plan.items[0].status, 'pendente');
  assert.equal(state.eventPlans.find(row => row.id === firstCopy).plan.items[1].status, 'rascunho');
  assert.notEqual(state.eventPlans.find(row => row.id === firstCopy).plan.items[0].id, state.eventPlans.find(row => row.id === id).plan.items[0].id);
  assert.ok(secondCopy);
});

test('Hydration gives older workspace state the event planner collection', () => {
  const legacy = { profile: { name: 'Antiga', currency: 'BRL' }, contacts: [], stages: [], opportunities: [] };
  hydrateWorkspace(legacy);
  assert.deepEqual(legacy.eventPlans, []);
});

test('Event planner orchestrates tasks, calendar, Social drafts and e-mail drafts without duplication', () => {
  const state = blank('Orquestradora');
  const source = plan();
  source.items.push(
    { id: '47fa348a-bfa2-4ec1-a774-69120f72bd0b', kind: 'message', title: 'Post de convite', phase: 'aquecimento', status: 'rascunho', team: 'copy', channel: 'instagram', date: '2026-12-02', time: '12:00', owner: '', notes: 'Convite para o evento' },
    { id: 'aebd4f88-6b33-4bb2-9781-47993e3c52d', kind: 'message', title: 'E-mail de convite', phase: 'aquecimento', status: 'rascunho', team: 'copy', channel: 'email', date: '2026-12-03', time: '09:00', owner: '', notes: 'Olá, {{contact.first_name}}! Participe.' }
  );
  const id = save(state, 'eventPlans', { title: 'Evento conectado', eventDate: '2026-12-05', plan: source });
  const created = execute(state, { type: 'event-plan-orchestrate', id, data: {} });
  assert.deepEqual(created, { tasks: 1, calendar: 1, social: 1, email: 1 });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.appointments.length, 1);
  assert.equal(state.socialPosts.length, 1);
  assert.equal(state.socialPosts[0].source, 'event-planner');
  assert.equal(state.emailCampaigns.length, 1);
  assert.equal(state.emailCampaigns[0].status, 'draft');
  const linked = state.eventPlans.find(row => row.id === id).orchestration;
  assert.ok(linked.appointmentId);
  assert.ok(linked.items['3c4ad2e7-7ec3-4b15-a35c-155e081bd240'].taskId);
  assert.ok(linked.items['47fa348a-bfa2-4ec1-a774-69120f72bd0b'].socialPostId);
  assert.ok(linked.items['aebd4f88-6b33-4bb2-9781-47993e3c52d'].emailCampaignId);
  assert.deepEqual(execute(state, { type: 'event-plan-orchestrate', id, data: {} }), { tasks: 0, calendar: 0, social: 0, email: 0 });
});

test('Event plan lifecycle emits custom events for the automation engine', () => {
  const state = blank();
  const workflowId = save(state, 'workflows', {
    name: 'Registrar novo evento', active: true,
    triggers: [{ id: 'event-created', type: 'custom_event', config: { event: 'event_plan_created' } }],
    steps: [{ id: 'event-note', type: 'add_note', config: { body: 'Evento criado' } }]
  });
  save(state, 'eventPlans', { title: 'Evento com automação', eventDate: '2026-12-05', plan: plan() });
  assert.ok(state.runs.some(run => run.workflowId === workflowId && run.event === 'Evento personalizado'));
});

test('Event planner commands are authorised under the marketing module', async () => {
  const { requireWorkspaceCommand } = await import('../authorization.mjs');
  const marketing = { modules: ['marketing'] }, other = { modules: ['contacts'] };
  for (const command of [{ type: 'save', key: 'eventPlans', data: {} }, { type: 'delete', key: 'eventPlans' }, { type: 'event-plan-duplicate', id: 'x' }]) {
    assert.doesNotThrow(() => requireWorkspaceCommand(marketing, command), command.type);
    assert.throws(() => requireWorkspaceCommand(other, command), /módulo|module|acesso|permiss/i, command.type);
  }
});

test('Event plan orchestration also needs the modules it writes into', async () => {
  const { requireWorkspaceCommand } = await import('../authorization.mjs');
  const orchestrate = { type: 'event-plan-orchestrate', id: 'x' };
  assert.doesNotThrow(() => requireWorkspaceCommand({ modules: ['marketing', 'contacts', 'calendars'] }, orchestrate));
  for (const modules of [['marketing'], ['marketing', 'contacts'], ['marketing', 'calendars'], ['contacts', 'calendars']]) {
    assert.throws(() => requireWorkspaceCommand({ modules }, orchestrate), /permissão/, modules.join('+'));
  }
});
