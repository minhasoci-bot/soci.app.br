// Contrato dos módulos de rota (P2.1): o que não é do portal volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalRoutes } from '../routes/portal.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas do portal devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({}, { get: (_, name) =>
    name === 'portalApi' ? /^\/api\/client-portal\/(demo)\/(admin|home|exchange|logout|course|progress|community-admin|community|offer-grant|loyalty|admin-enter|files|push)(?:\/([0-9a-f-]{36}))?$/
    : name === 'portalPage' ? /^\/portal\/(demo)\/?$/
    : (...args) => { touched.push(name); return args; } });
  const route = createPortalRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo', proto: 'http',
    json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
  for (const [p, method] of [['/api/state'], ['/api/social/run', 'POST'], ['/portal/demo', 'POST'], ['/api/client-portal/demo/nada'], ['/portal/outro'], ['/favicon.ico']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});
