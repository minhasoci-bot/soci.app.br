// Contrato dos módulos de rota (P2.1): o que não é da cobrança pela AbacatePay nem da recarga da carteira volta como
// NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAbacatePayRoutes, createAbacatePayWorkspaceRoutes, createWalletRoutes } from '../routes/payments.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET') => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
  json: () => assert.fail(`json chamado em ${p}`) });
const spy = touched => new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });

test('cobrança e carteira devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createAbacatePayRoutes, [['/api/abacatepay/webhook/x'], ['/api/abacatepay/workspace/status'], ['/api/abacatepay', 'POST'], ['/api/abacatepayx/agency/status']]],
    [createAbacatePayWorkspaceRoutes, [['/api/abacatepay/agency/status'], ['/api/abacatepay/webhook/x', 'POST'], ['/api/abacatepay/workspaces/status']]],
    [createWalletRoutes, [['/api/wallet/topup'], ['/api/wallet/topups', 'POST'], ['/api/wallet', 'POST']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, [`/cd/demo/${uuid}`], ['/api/state'], ['/api/agency/action', 'POST'], ['/api/billing/status']]) {
      assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
    }
  }
  assert.deepEqual(touched, []);
});

test('a conta da subconta e a recarga recusam o que não podem atender', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const base = { error, spaceId: /^demo$/, workspaceAccess: async () => ({ agencyId: 'a1', modules: null }), publicBase: () => 'http://x' };
  const workspace = createAbacatePayWorkspaceRoutes({ ...base, abacate: {} });
  await assert.rejects(workspace({ ...ctx('/api/abacatepay/workspace/status'), id: 'outra' }), { status: 404 });
  await assert.rejects(workspace(ctx('/api/abacatepay/workspace/connect')), { status: 405 });

  const wallet = createWalletRoutes({ ...base, store: { load: async () => ({ wallet: { pricing: { sms: 1 } } }) }, payload: async () => ({ amount: 1 }),
    abacate: { connected: async () => assert.fail('não deveria consultar a AbacatePay') } });
  await assert.rejects(wallet(ctx('/api/wallet/topup', 'POST')), { status: 400 });
  const off = createWalletRoutes({ ...base, store: { load: async () => ({}) }, payload: async () => ({ amount: 50 }) });
  await assert.rejects(off(ctx('/api/wallet/topup', 'POST')), { status: 409 });
});
