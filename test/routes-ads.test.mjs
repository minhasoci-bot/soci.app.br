// Contrato dos módulos de rota (P2.1): o que não é de anúncios volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdsRoutes } from '../routes/ads.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas de anúncios devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({}, { get: (_, name) => name === 'adsCallbackPath' ? '/api/ads/callback' : (...args) => { touched.push(name); return args; } });
  const route = createAdsRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
    json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
  for (const [p, method] of [['/api/ads/callback', 'POST'], ['/api/ads/outra'], ['/api/ads/workspace'], ['/api/google/workspace/status'], ['/api/state']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});
