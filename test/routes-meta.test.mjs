// Contrato dos módulos de rota (P2.1): o que não é do webhook da Meta volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaRoutes } from '../routes/meta.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas da Meta devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });
  const route = createMetaRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, p, method, url: new URL(`http://x${p}`),
    json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
  for (const [p, method] of [['/api/meta/webhook/', 'POST'], ['/api/meta/outra'], ['/api/meta'], ['/api/google-leads/demo', 'POST'], ['/api/state']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});
