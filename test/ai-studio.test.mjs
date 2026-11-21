import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { chunkText, modelPrice, retrieveKnowledge, usageCost, usageSummary } from '../ui/ai-data.js';

async function start(t, generateAgentReply, designAgentConfig) {
  const { server, host } = makeServer({
    dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true,
    socialScheduler: false, agentModel: 'gpt-4.1-mini', generateAgentReply, ...(designAgentConfig && { designAgentConfig })
  });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  return async (path, body) => {
    const response = await fetch(base + path, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, ...await response.json() };
  };
}

test('Prices follow the model family and retrieval prefers the passages that match the question', () => {
  assert.deepEqual(modelPrice('gpt-4.1-mini-2025-04-14'), { input: 0.4, output: 1.6, known: true });
  assert.equal(modelPrice('gpt-4.1').input, 2);
  assert.equal(modelPrice('desconhecido').known, false);
  assert.equal(usageCost('gpt-4.1-mini', 1_000_000, 500_000), 1.2);
  assert.ok(chunkText('a'.repeat(2000), 900).every(part => part.length <= 900));
  const bases = [{ name: 'Loja', sources: [
    { title: 'Entrega', text: 'Entregamos em todo o Brasil em até 7 dias úteis.' },
    { title: 'Trocas', text: 'Trocas são aceitas em até 30 dias com nota fiscal.' }
  ] }];
  assert.equal(retrieveKnowledge(bases, 'Qual o prazo para trocas?')[0].title, 'Trocas');
  assert.equal(retrieveKnowledge(bases, 'xyz').length, 2, 'without a match, small bases still give context');
  const summary = usageSummary({ limit: 1, alertAt: 0.8, ledger: [
    { at: new Date().toISOString(), kind: 'agent-test', agent: 'a', model: 'gpt-4.1-mini', inputTokens: 10, outputTokens: 5, cost: 0.9 }
  ] });
  assert.equal(summary.calls, 1);
  assert.equal(summary.warning, true);
  assert.equal(summary.blocked, false);
});

test('Knowledge bases feed agents, every AI call is metered and the monthly limit stops new calls', async t => {
  const calls = [];
  const request = await start(t, async (context, connection) => {
    calls.push(context);
    await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 1000, output_tokens: 500 }, ms: 40 });
    return context.retrieved.map(item => item.text).join(' ') || 'sem base';
  });
  const { status, base } = await request('/api/ai/kb-create', { name: 'Políticas da loja' });
  assert.equal(status, 201);
  assert.equal((await request('/api/ai/kb-save', { id: base.id, name: 'Políticas', sources: [{ title: '', text: 'x' }] })).status, 400);
  const { base: saved } = await request('/api/ai/kb-save', { id: base.id, name: 'Políticas', description: 'Trocas e entregas', sources: [
    { kind: 'text', title: 'Trocas', text: 'Trocas são aceitas em até 30 dias com nota fiscal.' },
    { kind: 'faq', title: 'Frete', question: 'Vocês cobram frete?', text: 'O frete é grátis acima de R$ 200.' }
  ] });
  assert.equal(saved.sources.length, 2);

  const { agent } = await request('/api/agents/create', { name: 'Atendimento' });
  assert.equal((await request('/api/agents/save', { ...agent, bases: ['inexistente'] })).status, 409);
  const { agent: linked } = await request('/api/agents/save', { ...agent, bases: [base.id] });
  assert.deepEqual(linked.bases, [base.id]);

  const { reply, run } = await request('/api/agents/test', { id: linked.id, revision: linked.revision, version: 'draft', messages: ['Qual o prazo de trocas?'] });
  assert.match(reply, /30 dias/);
  assert.equal(run.model, 'gpt-4.1-mini');
  assert.equal(run.inputTokens, 1000);
  assert.equal(run.cost, 0.0012);
  assert.deepEqual(run.sources, ['Trocas']);

  const { usage } = await request('/api/ai/usage');
  assert.equal(usage.calls, 1);
  assert.equal(usage.byKind['agent-test'].outputTokens, 500);
  assert.equal(usage.byAgent[linked.id].cost, 0.0012);

  assert.equal((await request('/api/ai/limit', { limit: -1 })).status, 400);
  const { usage: limited } = await request('/api/ai/limit', { limit: 0.001 });
  assert.equal(limited.blocked, true);
  const blocked = await request('/api/agents/test', { id: linked.id, revision: linked.revision, version: 'draft', messages: ['Oi'] });
  assert.equal(blocked.status, 402);
  assert.equal(calls.length, 1, 'a blocked call never reaches the model');
  await request('/api/ai/limit', { limit: 0 });

  const { template } = await request('/api/ai/template-save', { agent: linked.id, name: 'Atendimento da loja' });
  assert.deepEqual(template.bases, [base.id]);
  assert.equal(template.memory, undefined);
  const { agent: copy } = await request('/api/agents/create', { template: template.id });
  assert.equal(copy.name, 'Atendimento da loja');
  assert.deepEqual(copy.bases, [base.id]);

  assert.equal((await request('/api/ai/kb-delete', { id: base.id })).status, 200);
  const { state } = await request('/api/state');
  assert.deepEqual(state.agents.find(item => item.id === copy.id).bases, []);
  assert.equal(state.knowledgeBases.length, 0);
  assert.equal(state.agentRuns[0].kind, 'test');
});

test('Failed model calls are logged with the error and the builder is metered too', async t => {
  const request = await start(t, async () => { throw Object.assign(new Error('A OpenAI recusou a chave.'), { status: 422 }); },
    async (build, connection) => {
      await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 200, output_tokens: 100 }, ms: 10 });
      return { summary: 'Tom ajustado.', draft: { ...build.current, instructions: 'Seja breve.' } };
    });
  const { agent } = await request('/api/agents/create', { name: 'Vendas' });
  const failed = await request('/api/agents/test', { id: agent.id, revision: agent.revision, version: 'draft', messages: ['Oi'] });
  assert.equal(failed.status, 422);
  const built = await request('/api/agents/build', { id: agent.id, revision: agent.revision, request: 'Deixe mais breve' });
  assert.equal(built.agent.instructions, 'Seja breve.');
  const { state } = await request('/api/state');
  const [build, test] = state.agentRuns;
  assert.equal(build.kind, 'build');
  assert.equal(test.error, 'A OpenAI recusou a chave.');
  const usage = usageSummary(state.ai);
  assert.equal(usage.calls, 2);
  assert.equal(usage.errors, 1);
  assert.equal(usage.byKind['agent-build'].inputTokens, 200);
});
