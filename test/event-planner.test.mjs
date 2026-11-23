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
