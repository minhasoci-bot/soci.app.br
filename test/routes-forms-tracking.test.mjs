// Contrato dos módulos de rota (P2.1): o que não é do formulário público, do webhook de entrada das automações, dos
// contadores, do rastreio de e-mail ou dos links curtos volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormRoutes } from '../routes/forms.mjs';
import { createWorkflowHookRoutes } from '../routes/workflow-hooks.mjs';
import { createCountdownRoutes } from '../routes/countdowns.mjs';
import { createEmailTrackingRoutes } from '../routes/email-tracking.mjs';
import { createLinkRoutes } from '../routes/links.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const uuid = '11111111-2222-3333-4444-555555555555';
const token = 'a'.repeat(24);
const ctx = (p, method = 'GET') => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`),
  json: () => assert.fail(`json chamado em ${p}`) });
const spy = touched => new Proxy({ workspaceSegment }, { get: (target, name) => name in target ? target[name] : (...args) => { touched.push(name); return args; } });

test('formulário, webhook, contadores, rastreio de e-mail e links devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createFormRoutes, [[`/form/demo/${uuid}/x`], [`/form/outra/${uuid}`], [`/f/demo/${uuid}`]]],
    [createWorkflowHookRoutes, [[`/hooks/demo/${uuid}/abcdef`], [`/hooks/demo/${uuid}/abc`, 'POST'], [`/hooks/demo/${uuid}`, 'POST']]],
    [createCountdownRoutes, [[`/cd/demo/${uuid}`, 'POST'], [`/cd/demo/${uuid}.png`], [`/cd/demo/${uuid}/`]]],
    [createEmailTrackingRoutes, [[`/e/o/demo/${token}`, 'PUT'], [`/e/x/demo/${token}`], [`/e/c/demo/${token}/1234`], [`/e/u/demo/${'a'.repeat(23)}`]]],
    [createLinkRoutes, [[`/r/demo/${uuid}`, 'POST'], [`/r/demo/${uuid}/`], ['/r/demo/abc']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, [`/chat/demo/${uuid}`], ['/api/state']]) assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});

test('o webhook recusa chave errada e o contador inexistente devolve o GIF transparente', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const flow = { id: uuid, active: true, triggers: [{ id: 'gatilho1', type: 'inbound_webhook', config: { secret: 'segredo-certo' } }] };
  const hooks = createWorkflowHookRoutes({ workspaceSegment, ready: Promise.resolve(), error, store: { load: async () => ({ workflows: [flow] }) } });
  const hookCtx = key => ({ ...ctx(`/hooks/demo/${uuid}/gatilho1`, 'POST'), url: new URL(`http://x/hooks/demo/${uuid}/gatilho1?key=${key}`) });
  await assert.rejects(hooks(hookCtx('segredo-errad')), { status: 404 });
  await assert.rejects(hooks(hookCtx('curta')), { status: 404 });

  const sent = {};
  const res = { writeHead: (status, headers) => Object.assign(sent, { status, headers }), end: body => Object.assign(sent, { body }) };
  const countdowns = createCountdownRoutes({ workspaceSegment, ready: Promise.resolve(), publicAccountPolicy: async () => true, store: { load: async () => ({ countdownTimers: [] }) } });
  await countdowns({ ...ctx(`/cd/demo/${uuid}.gif`), res });
  assert.equal(sent.status, 200);
  assert.equal(sent.headers['Content-Type'], 'image/gif');
  assert.equal(sent.body.toString('base64'), 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
});
