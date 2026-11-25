// Contrato dos módulos de rota (P2.1): o que não é da Reputação pública volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReputationRoutes } from '../routes/reputation.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET', extra = {}) => ({ req: { headers: {}, socket: {} }, res: {}, p, method,
  json: () => assert.fail(`json chamado em ${p}`), ...extra });

test('rotas da Reputação devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({ workspaceSegment }, { get: (target, name) => name in target ? target[name] : (...args) => { touched.push(name); return args; } });
  const route = createReputationRoutes(deps);
  for (const [p, method] of [[`/rw/demo/${uuid}`, 'POST'], [`/v/demo/${uuid}`, 'POST'], [`/depoimento/demo/${uuid}`, 'POST'],
    [`/api/depoimento/demo/${uuid}/apagar`, 'POST'], [`/api/depoimento/demo/${uuid}/start`], ['/avaliar/demo', 'POST'], ['/api/avaliar/demo'],
    ['/assinar/demo'], ['/api/state']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});

test('o script do widget responde 404 sem corpo quando o widget não está ativo', async () => {
  const route = createReputationRoutes({ workspaceSegment, ready: Promise.resolve(), publicAccountPolicy: async () => true,
    store: { load: async () => ({ reviewWidgets: [{ id: uuid, active: false }] }) }, publicBase: () => 'https://x' });
  const out = {};
  await route(ctx(`/rw/demo/${uuid}/widget.js`, 'GET', { res: { writeHead: (status, headers) => Object.assign(out, { status, headers }), end: body => { out.body = body; } } }));
  assert.equal(out.status, 404);
  assert.equal(out.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(out.body, undefined);
});
