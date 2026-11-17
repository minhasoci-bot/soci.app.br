import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

async function start(t, generateAgentReply, agentModel = 'fixture-model', designAgentConfig) {
  const { server, host } = makeServer({
    dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true,
    socialScheduler: false, agentModel, generateAgentReply, ...(designAgentConfig && { designAgentConfig })
  });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  return async (path, body, headers = {}) => {
    const response = await fetch(base + path, body === undefined ? { headers } : {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, ...await response.json() };
  };
}

test('Agent drafts autosave against a revision and run separately from the published configuration', async t => {
  const calls = [];
  const request = await start(t, async context => {
    calls.push(context);
    return context.draft.knowledge[0].text;
  });
  const send = (op, data) => request(`/api/agents/${op}`, data);
  assert.equal((await send('create', { name: 'a'.repeat(51) })).status, 400);
  const { status, agent: initial } = await send('create', { name: 'Trocas e devoluções' });
  assert.equal(status, 201);
  assert.equal(initial.active, false);
  const draft = { id: initial.id, revision: initial.revision, name: initial.name, role: 'Assistente de trocas',
    instructions: 'Use a política da loja.', knowledge: [{ title: 'Política', text: 'Prazo de 30 dias.' }] };
  assert.equal((await send('save', { ...draft, knowledge: [{ title: '', text: 'Sem título' }] })).status, 400);
  const { agent: saved } = await send('save', draft);
  assert.equal((await send('save', draft)).status, 409);
  const { agent: release } = await send('publish', { id: saved.id, revision: saved.revision });
  assert.equal(release.published.version, 1);
  assert.equal(release.published.model, 'fixture-model');
  const { agent: edited } = await send('save', { ...draft, revision: release.revision,
    knowledge: [{ title: 'Política', text: 'Prazo de 45 dias.' }] });

  const testInput = { id: edited.id, revision: edited.revision, messages: ['Qual é o prazo?'] };
  assert.equal((await send('test', { ...testInput, version: 'published' })).reply, 'Prazo de 30 dias.');
  assert.equal((await send('test', { ...testInput, version: 'draft' })).reply, 'Prazo de 45 dias.');
  assert.deepEqual(calls[0].messages, [{ role: 'user', content: 'Qual é o prazo?' }]);
  assert.equal(calls[0].model, 'fixture-model');
  const { state } = await request('/api/state');
  assert.deepEqual(state.agents.find(agent => agent.id === edited.id), edited);
  const { agent: unpublished } = await send('unpublish', testInput);
  assert.equal(unpublished.published, null);
  assert.equal((await send('test', { ...testInput, revision: unpublished.revision, version: 'published' })).status, 404);
});

test('Agent routes honor module and workspace permissions and snapshots start from drafts', async t => {
  const request = await start(t, undefined, '');
  const { id, revision } = (await request('/api/agents/create', { name: 'Legado' })).agent;
  assert.equal((await request('/api/agents/test', { id, revision, version: 'draft', messages: ['Olá'] })).status, 503);
  assert.equal((await request('/api/agents/publish', { id, revision })).status, 200);
  const { agency } = await request('/api/agency/snapshot-create', { workspace: 'demo', name: 'Modelo de agentes', include: ['agents'] });
  const { result: workspace } = await request('/api/agency/accounts', { name: 'Nova subconta', snapshotId: agency.snapshots[0].id });
  const [copy] = (await request(`/api/state?workspace=${workspace}`)).state.agents;
  assert.notEqual(copy.id, id);
  assert.equal(copy.active, false);
  assert.equal(copy.published, undefined);
  assert.equal((await request(`/api/agents/delete?workspace=${workspace}`, { id, revision })).status, 404);

  const { result: onlyContacts } = await request('/api/agency/action', { type: 'save', key: 'users', data: {
    first: 'Ana', last: 'Lima', email: 'ana@example.test', role: 'Account User', accounts: ['demo'], permissions: ['contacts']
  } });
  const headers = { 'X-Go-User': onlyContacts };
  assert.equal((await request('/api/agents/create', { name: 'Bloqueado' }, headers)).status, 403);
  assert.deepEqual((await request('/api/state', undefined, headers)).state.agents, []);
  assert.deepEqual((await request('/api/action', { type: 'save', key: 'contacts', data: { name: 'Contato' } }, headers)).state.agents, []);
});

test('Studio agents start from templates, keep triggers, subagents and resources, and log each test run', async t => {
  const calls = [];
  const request = await start(t, async context => { calls.push(context); return 'Resposta de teste'; });
  const send = (op, data) => request(`/api/agents/${op}`, data);
  assert.equal((await send('create', { template: 'nao-existe' })).status, 404);
  const { agent } = await send('create', { template: 'social' });
  assert.equal(agent.name, 'Posts para redes sociais');
  assert.deepEqual(agent.triggers, [{ type: 'chat' }]);
  assert.equal(agent.subagents.length, 1);
  assert.deepEqual(agent.resources, { webSearch: true, memory: false, approval: true });

  const base = { id: agent.id, revision: agent.revision, name: agent.name, icon: 'send', description: agent.description,
    instructions: agent.instructions, knowledge: [], subagents: agent.subagents, resources: { ...agent.resources, memory: true } };
  assert.equal((await send('save', { ...base, triggers: [{ type: 'desconhecido' }] })).status, 400);
  assert.equal((await send('save', { ...base, triggers: [{ type: 'tag' }] })).status, 400);
  assert.equal((await send('save', { ...base, triggers: [{ type: 'schedule', value: 'Toda hora' }] })).status, 400);
  const { agent: saved } = await send('save', { ...base, triggers: [{ type: 'chat' }, { type: 'tag', value: 'vip' }, { type: 'tag', value: 'VIP' }, { type: 'schedule', value: 'Semanalmente' }] });
  assert.deepEqual(saved.triggers, [{ type: 'chat' }, { type: 'tag', value: 'vip' }, { type: 'schedule', value: 'Semanalmente' }]);

  const { agent: remembered } = await send('memory', { id: saved.id, action: 'add', kind: 'person', text: 'A Ana prefere e-mail.' });
  assert.equal(remembered.revision, saved.revision);
  assert.equal((await send('memory', { id: saved.id, action: 'add', kind: 'outro', text: 'x' })).status, 400);
  const { reply, run } = await send('test', { id: saved.id, revision: saved.revision, version: 'draft', messages: ['Crie um post'] });
  assert.equal(reply, 'Resposta de teste');
  assert.deepEqual(calls[0].memory, [{ kind: 'person', text: 'A Ana prefere e-mail.' }]);
  assert.equal(calls[0].draft.subagents[0].name, 'Pesquisador de marca');
  assert.equal(run.agent, saved.id);
  assert.equal(run.input, 'Crie um post');
  const { state } = await request('/api/state');
  assert.equal(state.agentRuns[0].id, run.id);

  const { agent: moved } = await send('move', { id: saved.id, revision: saved.revision, folder: 'Marketing' });
  assert.equal(moved.folder, 'Marketing');
  await send('delete', { id: moved.id, revision: moved.revision });
  assert.deepEqual((await request('/api/state')).state.agentRuns, []);
});

test('The builder chat rewrites the configuration but keeps the knowledge sources', async t => {
  const requests = [];
  const request = await start(t, undefined, 'fixture-model', async (build, connection) => {
    requests.push({ build, connection });
    return { summary: 'Adicionei o gatilho de formulário.', draft: { ...build.current, name: 'Qualificador', knowledge: [],
      triggers: [{ type: 'form-submitted' }], resources: { webSearch: true, memory: false, approval: false } } };
  });
  const send = (op, data) => request(`/api/agents/${op}`, data);
  const { agent } = await send('create', { name: 'Leads' });
  const { agent: withSource } = await send('save', { ...agent, knowledge: [{ title: 'ICP', text: 'Clínicas em SP.' }] });
  assert.equal((await send('build', { id: agent.id, revision: agent.revision, request: 'Adicione formulário' })).status, 409);
  const { agent: built, summary } = await send('build', { id: withSource.id, revision: withSource.revision, request: 'Qualifique leads de formulário' });
  assert.equal(summary, 'Adicionei o gatilho de formulário.');
  assert.equal(requests[0].build.request, 'Qualifique leads de formulário');
  assert.equal(requests[0].connection, null);
  assert.equal(built.name, 'Qualificador');
  assert.deepEqual(built.triggers, [{ type: 'form-submitted' }]);
  assert.deepEqual(built.knowledge, [{ title: 'ICP', text: 'Clínicas em SP.' }]);
  assert.notEqual(built.revision, withSource.revision);
});
