import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

// T.1, Agent Studio: "Rodar agente de IA" sends one message to the published agent and keeps the answer.
test('T.1 run AI agent: the published agent answers, the run resumes with the answer and the agent history shows it', async t => {
  const asked = [];
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, agentModel: 'gpt-4.1-mini',
    workflowAI: async () => ({ vars: {} }),
    generateAgentReply: async (request, connection) => {
      asked.push(request);
      await connection.onUsage?.({ model: 'gpt-4.1-mini', usage: { input_tokens: 300, output_tokens: 40 }, ms: 2 });
      return `Resposta para: ${request.messages.at(-1).content}`;
    } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const action = async body => { const r = await call('/api/action?workspace=demo', body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  const until = async check => {
    for (let i = 0; i < 150; i++) { const s = await state(); if (check(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail('timed out waiting for the agent');
  };

  const created = (await call('/api/agents/create?workspace=demo', { name: 'Atendente', instructions: 'Responda com cordialidade.' })).body.agent;
  const steps = [
    { type: 'ai_agent', config: { agentId: created.id, input: 'O cliente {{contact.first_name}} perguntou: {{contact.notes}}', variable: 'resposta' } },
    { type: 'add_note', config: { body: 'Agente: {{vars.resposta}}' } }
  ];
  const draftOnly = await action({ type: 'save', key: 'workflows', data: { name: 'Antes de publicar', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'cedo' } }], steps } });
  const early = await action({ type: 'save', key: 'contacts', data: { name: 'Cedo', email: 'cedo@x.test', notes: 'Oi', tags: ['cedo'], custom: {} } });
  let s = await state();
  assert.match(s.runs.find(run => run.workflowId === draftOnly && run.contactId === early).results.join(' | '), /não está publicado/, 'an unpublished agent stops the step');

  assert.equal((await call('/api/agents/publish?workspace=demo', { id: created.id, revision: created.revision })).status, 200);
  const id = await action({ type: 'save', key: 'workflows', data: { name: 'Agente', active: true, triggers: [{ type: 'contact_created' }], steps } });
  const ana = await action({ type: 'save', key: 'contacts', data: { name: 'Ana Souza', email: 'ana@x.test', notes: 'Vocês abrem sábado?', tags: [], custom: {} } });
  s = await until(s => s.runs.find(run => run.workflowId === id && run.contactId === ana)?.status === 'Completed');
  assert.ok(s.messages.some(row => row.contactId === ana && row.body === 'Agente: Resposta para: O cliente Ana perguntou: Vocês abrem sábado?'));
  assert.equal(asked.length, 1);
  assert.equal(asked[0].messages.length, 1, 'one message, no test history');
  const history = s.agentRuns.find(run => run.agent === created.id && run.kind === 'workflow');
  assert.ok(history, 'the run is in the agent history');
  assert.equal(history.version, 'published');
});
