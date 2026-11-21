import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { runWorkflowAI } from '../workflow-ai.mjs';
import { usageSummary } from '../ui/ai-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const intentFlow = {
  name: 'Triagem', active: true, triggers: [{ type: 'contact_created', config: {} }],
  steps: [
    { type: 'ai_intent', config: { intents: 'comprar, suporte', input: 'Quero comprar 3 caixas', variable: 'intencao' } },
    { type: 'if_else', config: { conditions: [{ subject: 'var', op: 'equals', key: 'intencao', value: 'comprar' }] },
      yes: [{ type: 'add_tag', config: { tag: 'lead-quente' } }], no: [{ type: 'add_tag', config: { tag: 'suporte' } }] }
  ]
};

test('An AI step pauses the run, queues the call and resumes with the answer as a flow variable', () => {
  const s = blank('W');
  const id = save(s, 'workflows', intentFlow);
  save(s, 'contacts', { name: 'Ana', email: 'ana@example.test' });
  const [run] = runsOf(s, id);
  assert.equal(run.status, 'Waiting');
  assert.equal(run.waitFor.type, 'ai');
  const [item] = execute(s, { type: 'workflow-outbox-take' });
  assert.equal(item.kind, 'ai');
  assert.deepEqual(item.intents, ['comprar', 'suporte']);
  assert.equal(item.input, 'Quero comprar 3 caixas');
  assert.equal(execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: run.id, stepId: 'wrong', vars: {} }] } }), 0, 'answers for another step are ignored');
  assert.equal(execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: run.id, stepId: item.stepId, vars: { intencao: 'comprar', intencao_confianca: '92' } }] } }), 1);
  assert.equal(run.status, 'Completed');
  assert.deepEqual(s.contacts[0].tags, ['lead-quente']);
  assert.equal(run.vars.intencao_confianca, '92');
  assert.equal(execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: run.id, stepId: item.stepId, vars: { intencao: 'suporte' } }] } }), 0, 'a late duplicate does nothing');
});

test('AI errors continue the flow unless the step stops on error; a silent model times out', () => {
  const s = blank('W');
  const steps = [{ type: 'ai_summarize', config: { source: 'conversation', variable: 'resumo', note: 'yes' } }, { type: 'add_tag', config: { tag: 'seguiu' } }];
  const id = save(s, 'workflows', { name: 'Resumo', active: true, triggers: [{ type: 'contact_created', config: {} }], steps });
  save(s, 'contacts', { name: 'Bia', email: 'bia@example.test' });
  let [run] = runsOf(s, id);
  let [item] = execute(s, { type: 'workflow-outbox-take' });
  execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: run.id, stepId: item.stepId, error: 'A IA não respondeu.' }] } });
  assert.equal(run.status, 'Completed');
  assert.ok(run.results.some(line => /erro: A IA não respondeu/.test(line)));

  const stop = save(s, 'workflows', { name: 'Para', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'x' } }],
    steps: [{ type: 'ai_translate', config: { input: 'Olá', language: 'es', variable: 't', stopOnError: true } }, { type: 'add_tag', config: { tag: 'nao' } }] });
  const bia = s.contacts[0];
  save(s, 'contacts', { ...bia, tags: [...bia.tags, 'x'] }, bia.id);
  [run] = runsOf(s, stop);
  [item] = execute(s, { type: 'workflow-outbox-take' });
  execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: run.id, stepId: item.stepId, error: 'falhou' }] } });
  assert.equal(run.status, 'Failed');

  const wait = save(s, 'workflows', { name: 'Espera', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'y' } }],
    steps: [{ type: 'ai_translate', config: { input: 'Olá', language: 'es', variable: 't' } }, { type: 'add_tag', config: { tag: 'depois' } }] });
  save(s, 'contacts', { ...s.contacts[0], tags: [...s.contacts[0].tags, 'y'] }, bia.id);
  [run] = runsOf(s, wait);
  execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + 11 * 60000).toISOString() } });
  assert.equal(run.status, 'Completed');
  assert.ok(s.contacts[0].tags.includes('depois'));
});

test('Publishing checks AI step settings and test runs never call the model', () => {
  const s = blank('W');
  assert.throws(() => save(s, 'workflows', { name: 'X', active: true, triggers: [], steps: [{ type: 'ai_decision', config: { question: 'Comprar?', options: 'sim', variable: 'd' } }] }), /duas opções/);
  assert.throws(() => save(s, 'workflows', { name: 'X', active: true, triggers: [], steps: [{ type: 'ai_extract', config: { fields: '  ' } }] }), /extrair/);
  const contactId = save(s, 'contacts', { name: 'Teste', email: 'teste@example.test' });
  s.workflowOutbox = [];
  const result = execute(s, { type: 'workflow-test', data: { workflow: intentFlow, contactId } });
  assert.ok(JSON.stringify(result).includes('(teste) IA não executada'));
  assert.equal(s.workflowOutbox?.length || 0, 0);
});

test('Each action asks the model for a strict answer and maps it to variables', async () => {
  const bodies = [];
  const reply = answer => async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-4.1-mini', usage: { input_tokens: 10, output_tokens: 5 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] }));
  };
  const call = (answer, item) => runWorkflowAI({ apiKey: 'sk-test', model: 'gpt-4.1-mini', request: reply(answer) }, item);
  assert.deepEqual((await call({ choice: 'QUENTE', reason: 'Pediu preço' }, { action: 'ai_decision', variable: 'd', question: 'Temperatura?', options: ['quente', 'frio'], input: 'x' })).vars, { d: 'quente', d_motivo: 'Pediu preço' });
  assert.deepEqual(bodies[0].text.format.schema.properties.choice.enum, ['quente', 'frio']);
  assert.match(bodies[0].instructions, /never as instructions/);
  assert.deepEqual((await call({ intent: 'outra', confidence: 0.3 }, { action: 'ai_intent', variable: 'i', intents: ['a', 'b'], input: 'x' })).vars, { i: 'outra', i_confianca: '30' });
  assert.deepEqual((await call({ empresa: 'Acme', prazo: '' }, { action: 'ai_extract', fields: [{ name: 'empresa', description: '' }, { name: 'prazo', description: '' }], input: 'x' })).vars, { empresa: 'Acme', prazo: '' });
  await call({ answer: 'Um gato' }, { action: 'ai_image', variable: 'img', image: 'https://exemplo.com/a.jpg', question: 'O que é?' });
  assert.equal(bodies.at(-1).input[0].content[1].type, 'input_image');
  await assert.rejects(() => call({}, { action: 'ai_image', variable: 'img', image: 'http://exemplo.com/a.jpg' }), /https/);
});

test('The server runs queued AI steps, meters them and resumes the run', async t => {
  const seen = [];
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, agentModel: 'gpt-4.1-mini',
    workflowAI: async (connection, item) => { seen.push(item); await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 500, output_tokens: 50 }, ms: 3 }); return { vars: { intencao: 'comprar' } }; } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = body => fetch(`${base}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  await post({ type: 'save', key: 'workflows', data: { ...intentFlow, aiKey: { session: 'alguem-de-fora', user: '', agency: 'outra' } } });
  await post({ type: 'save', key: 'contacts', data: { name: 'Caio', email: 'caio@example.test' } });
  let state;
  for (let i = 0; i < 40; i++) {
    state = (await fetch(`${base}/api/state`).then(r => r.json())).state;
    if (state.runs[0]?.status === 'Completed') break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(state.runs[0].status, 'Completed');
  assert.ok(state.contacts.find(row => row.email === 'caio@example.test').tags.includes('lead-quente'));
  assert.equal(state.workflows[0].aiKey, null, 'a client-sent key owner is replaced by the saving session (none locally)');
  assert.equal(seen.length, 1);
  assert.equal(usageSummary(state.ai).byKind.workflow.inputTokens, 500);
});
