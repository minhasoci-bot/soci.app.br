import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { transformRequest, emailRequest, transformText } from '../content-ai.mjs';
import { usageSummary } from '../ui/ai-data.js';

async function start(t, contentAI) {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, agentModel: 'gpt-4.1-mini', contentAI });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  return async (path, body) => {
    const response = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, ...await response.json() };
  };
}

test('Content AI requests are validated before any model call', () => {
  assert.throws(() => transformRequest({ action: 'improve', kind: 'email', text: '' }), /Escreva um texto/);
  assert.throws(() => transformRequest({ action: 'sing', kind: 'email', text: 'Oi' }), /Escolha o que a IA/);
  assert.throws(() => transformRequest({ action: 'improve', kind: 'fax', text: 'Oi' }), /onde o texto/);
  assert.equal(transformRequest({ action: 'tone', kind: 'blog', text: 'Oi', tone: 'nenhum' }).tone, 'profissional');
  assert.throws(() => emailRequest({ brief: ' ' }), /objetivo do e-mail/);
});

test('A one-line field stays on one line and the instructions keep merge fields and placeholders', async () => {
  let body;
  const request = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-4.1-mini', usage: { input_tokens: 50, output_tokens: 20 },
      output: [{ content: [{ type: 'output_text', text: '{{contact.first_name}}, sua oferta\nchegou' }] }] }), { status: 200 });
  };
  const usage = [];
  const { text } = await transformText({ apiKey: 'sk-test', model: 'gpt-4.1-mini', request, onUsage: call => usage.push(call) },
    { action: 'improve', kind: 'email', field: 'Assunto', text: '{{contact.first_name}}, chegou a oferta' });
  assert.equal(text, '{{contact.first_name}}, sua oferta chegou');
  assert.match(body.instructions, /double curly braces/);
  assert.match(body.instructions, /"Assunto" field/);
  assert.equal(body.store, false);
  assert.equal(usage[0].usage.output_tokens, 20);
});

test('Content AI rewrites, drafts e-mails, is metered per editor and stops at the monthly limit', async t => {
  const calls = [];
  const request = await start(t, {
    async transformText(connection, input) {
      calls.push(input);
      await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 300, output_tokens: 100 }, ms: 5 });
      return { text: input.action === 'translate-es' ? 'Hola' : `${input.text}!` };
    },
    async writeEmail(connection, input) {
      calls.push(input);
      await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 800, output_tokens: 400 }, ms: 5 });
      return { subject: 'Novidade', subjectB: input.ab ? 'Outra' : '', preheader: 'Veja', heading: 'Oi', body: 'Texto', buttonLabel: 'Ver' };
    }
  });
  assert.equal((await request('/api/content-ai/transform', { action: 'improve', kind: 'email', text: '' })).status, 400);
  assert.equal(calls.length, 0);
  const { text } = await request('/api/content-ai/transform', { action: 'translate-es', kind: 'social', text: 'Olá' });
  assert.equal(text, 'Hola');
  await request('/api/content-ai/transform', { action: 'shorten', kind: 'blog', text: 'Um texto longo' });
  const email = await request('/api/content-ai/email', { brief: 'Lançamento do cardápio de verão', ab: true });
  assert.equal(email.subjectB, 'Outra');

  const { state } = await request('/api/state');
  const usage = usageSummary(state.ai);
  assert.equal(usage.calls, 3);
  assert.equal(usage.byKind.social.inputTokens, 300);
  assert.equal(usage.byKind.blog.calls, 1);
  assert.equal(usage.byKind.email.outputTokens, 400);
  assert.equal(state.agentRuns.length, 0, 'content calls are not agent runs');

  await request('/api/ai/limit', { limit: 0.0001 });
  assert.equal((await request('/api/content-ai/transform', { action: 'improve', kind: 'email', text: 'Oi' })).status, 402);
  assert.equal(calls.length, 3);
});

test('Failed content calls are booked with the error', async t => {
  const request = await start(t, { async transformText() { throw Object.assign(new Error('A IA não concluiu o texto. Tente de novo.'), { status: 502 }); } });
  assert.equal((await request('/api/content-ai/transform', { action: 'grammar', kind: 'social', text: 'Oi' })).status, 502);
  const { state } = await request('/api/state');
  assert.equal(usageSummary(state.ai).errors, 1);
});
