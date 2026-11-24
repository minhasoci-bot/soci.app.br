// Contrato dos módulos de rota (P2.1): o que não é do Google volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleRoutes } from '../routes/google.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas do Google devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const fixed = { googleCallbackPath: '/api/google/callback', workspaceSegment: '(demo|(?:user-)?[0-9a-f-]{36})' };
  const deps = new Proxy({}, { get: (_, name) => name in fixed ? fixed[name] : (...args) => { touched.push(name); return args; } });
  const route = createGoogleRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
    json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
  for (const [p, method] of [['/api/google/callback', 'POST'], ['/api/google/outra'], ['/api/google/workspace'], ['/api/google-leads/demo'], ['/api/google-leads/xyz', 'POST'], ['/api/ads/workspace/status'], ['/api/state']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});
