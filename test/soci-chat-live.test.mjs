import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

// Caminho "ao vivo" do Pergunte à Soci: um provedor compatível com a OpenAI (aqui simulado por
// openAIRequest, sem rede) com streaming, raciocínio e chamadas de ferramenta do Treg.
const AI_BASE = 'http://ia.teste/v1';

function useAiEnv(t) {
  const keys = ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { OPENAI_BASE_URL: AI_BASE, OPENAI_API_KEY: 'chave-teste', OPENAI_MODEL: 'modelo-teste' });
  t.after(() => { for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; });
}

const sse = events => new Response(events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''),
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

// O chat também pede ao modelo, sem streaming, um título para a conversa.
const titleReply = () => Response.json({ choices: [{ message: { content: 'Padarias em Santos' } }] });

async function start(t, openAIRequest) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, openAIRequest });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const ask = async text => {
    const r = await fetch(base + '/api/ask/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next', model: 'modelo-teste', messages: [{ content: { content_type: 'text', parts: [text] } }] }) });
    const events = [];
    for (const block of (await r.text()).split('\n\n')) {
      let event = 'message'; const data = [];
      for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).trimStart()); }
      if (data.length) events.push({ event, data: JSON.parse(data.join('\n')) });
    }
    const text_ = events.filter(e => e.event === 'delta').map(e => e.data.v).join('');
    return { status: r.status, events, text: text_ };
  };
  return { call, ask };
}

test('modelo ao vivo: lista de modelos vem da API, sem embeddings e com o modelo padrão primeiro', async t => {
  useAiEnv(t);
  const local = await start(t, async url => {
    assert.equal(url, `${AI_BASE}/models`);
    return Response.json({ data: [{ id: 'models/modelo-b' }, { id: 'text-embedding-3-small' }, { id: 'modelo-a' }, { id: 'modelo-a' }] });
  });
  const state = await local.call('/api/ask/state');
  assert.equal(state.status, 200);
  assert.equal(state.body.config.mode, 'live');
  assert.deepEqual(state.body.config.models ?? state.body.models, ['modelo-teste', 'modelo-a', 'modelo-b']);
});

test('modelo ao vivo: chama a ferramenta do Treg, devolve o resultado ao modelo e transmite a resposta', async t => {
  useAiEnv(t);
  const original = globalThis.fetch;
  const tregCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith('https://treg.to/')) return original(url, init);
    tregCalls.push({ url: String(url), token: init.headers['X-Treg-Token'], body: JSON.parse(init.body) });
    return Response.json({ output: { places: [{ title: 'Padaria A', place_id: 'p1', phone: '13 3333-0000' }] } });
  });
  const aiCalls = [];
  const local = await start(t, async (url, init) => {
    const payload = JSON.parse(init.body);
    if (!payload.stream) return titleReply(payload);
    aiCalls.push(payload);
    assert.equal(init.headers.Authorization, 'Bearer chave-teste');
    if (aiCalls.length === 1) {
      return sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'procurar_negocios_google', arguments: '{"query":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"padaria santos"}' } }] }, finish_reason: 'tool_calls' }] },
        '[DONE]'
      ]);
    }
    return sse([
      { choices: [{ delta: { reasoning_content: 'Comparando avaliações.' } }] },
      { choices: [{ delta: { content: 'Achei a ' } }] },
      'linha que não é JSON',
      { choices: [{ delta: { content: 'Padaria A.' }, finish_reason: 'stop' }] },
      '[DONE]'
    ]);
  });

  const saved = await local.call('/api/ask/connectors', { treg: { token: 'tok-agencia', googleMaps: true, instagram: false }, verify: false });
  assert.equal(saved.status, 200);

  const answer = await local.ask('Procure padarias em Santos');
  assert.equal(answer.status, 200);
  assert.match(answer.text, /Consultando Google Maps via Treg/);
  assert.match(answer.text, /Achei a Padaria A\./);
  assert.ok(answer.events.some(e => e.event === 'reasoning' && /Comparando/.test(e.data.v)));
  assert.ok(answer.events.some(e => e.event === 'title' && e.data.title === 'Padarias em Santos'), 'título gerado pelo modelo');

  assert.equal(aiCalls.length, 2);
  assert.equal(aiCalls[0].model, 'modelo-teste');
  assert.deepEqual(aiCalls[0].tools.map(tool => tool.function.name), ['procurar_negocios_google'], 'Instagram desligado no conector');
  const toolMessage = aiCalls[1].messages.find(message => message.role === 'tool');
  assert.equal(toolMessage.tool_call_id, 'call_1');
  assert.equal(JSON.parse(toolMessage.content)[0].name, 'Padaria A');
  assert.deepEqual(tregCalls.map(call => [call.token, call.body.q]), [['tok-agencia', 'padaria santos']]);
});

test('modelo ao vivo: API sem suporte a ferramentas recebe a pergunta de novo sem elas', async t => {
  useAiEnv(t);
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, init) => original(url, init));
  const payloads = [];
  const local = await start(t, async (url, init) => {
    const payload = JSON.parse(init.body);
    if (!payload.stream) return titleReply(payload);
    payloads.push(payload);
    if (payload.tools) return new Response(JSON.stringify({ error: { message: 'tools not supported' } }), { status: 400 });
    return sse([{ choices: [{ delta: { content: 'Resposta sem ferramentas.' }, finish_reason: 'stop' }] }, '[DONE]']);
  });
  await local.call('/api/ask/connectors', { treg: { token: 'tok-agencia', googleMaps: true, instagram: true }, verify: false });
  const answer = await local.ask('Oi');
  assert.match(answer.text, /Resposta sem ferramentas\./);
  assert.deepEqual(payloads.map(payload => Boolean(payload.tools)), [true, false]);
});

test('modelo ao vivo: chave recusada vira uma mensagem clara, sem derrubar a conversa', async t => {
  useAiEnv(t);
  const local = await start(t, async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401 }));
  const answer = await local.ask('Oi');
  assert.equal(answer.status, 200);
  assert.match(JSON.stringify(answer.events), /chave da API foi recusada/);
});
