// Contrato dos módulos de rota (P2.1): o que não é de e-mail volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailRoutes } from '../routes/email.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas de e-mail devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });
  const route = createEmailRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, id: 'demo',
    json: () => assert.fail(`json chamado em ${p}`) });
  for (const [p, method] of [['/api/email/campaign/test'], ['/api/email/inbound'], ['/api/email/outra'], ['/api/email/workspace'], ['/api/ads/workspace/status'], ['/api/state', 'POST']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});
