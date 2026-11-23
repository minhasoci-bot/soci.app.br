// Contrato dos módulos de rota (P2.1): o que não é /api/action (POST) volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionRoutes } from '../routes/action.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rota de ações devolve NEXT_ROUTE para outros caminhos e para GET', async () => {
  const touched = [];
  const deps = new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });
  const route = createActionRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
    json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
  for (const [p, method] of [['/api/action'], ['/api/action/', 'POST'], ['/api/actions', 'POST'], ['/api/agency', 'POST'], ['/api/state']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});
