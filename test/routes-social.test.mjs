// Contrato dos módulos de rota (P2.1): o que não é do domínio volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialRoutes } from '../routes/social.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas de social devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  // Qualquer uso de uma dependência denuncia que o módulo agiu numa rota que não é dele.
  const deps = new Proxy({}, { get: (_, name) => name === 'socialFilePath' ? /^\/m\/(demo)\/([0-9a-f-]{36})$/
    : name === 'socialInvitePath' ? /^\/social-connect\/(demo)\/?$/ : name === 'socialApprovePath' ? /^\/aprovar\/(demo)\/?$/
    : (...args) => { touched.push(name); return args; } });
  const route = createSocialRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
    json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
  for (const [p, method] of [['/api/state'], ['/api/action', 'POST'], ['/asset/x.png'], ['/m/demo/video/00000000-0000-0000-0000-000000000000'], ['/api/socialx', 'POST'], ['/assinar/demo'], ['/api/social/connect/facebook/extra']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, p);
  }
  assert.deepEqual(touched, []);
});
