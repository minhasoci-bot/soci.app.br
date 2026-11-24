// Contrato dos módulos de rota (P2.1): o que não é do Studio volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioRoutes } from '../routes/studio.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas do Studio devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });
  const route = createStudioRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
    json: () => assert.fail(`json chamado em ${p}`) });
  for (const [p, method] of [['/api/studio'], ['/api/studio/plan'], ['/api/studio/discover', 'HEAD'], ['/api/studios', 'POST'], ['/api/state']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});
