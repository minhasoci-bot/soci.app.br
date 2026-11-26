// Contrato dos módulos de rota (P2.1): o que não é das páginas públicas da prospecção, da API dos apps nem da
// instalação de apps volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppApiRoutes, createAppInstallRoutes } from '../routes/apps.mjs';
import { createProspectPublicRoutes } from '../routes/prospect-public.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET') => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
  json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
const spy = touched => new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });

test('prospecção pública e apps devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createProspectPublicRoutes, [['/prospecting', 'POST'], ['/prospecting/search'], ['/prospecting/report/nada'], [`/prospecting/outro/${uuid}`]]],
    [createAppApiRoutes, [['/api/apps/v1/trigger'], ['/api/v1/subaccounts/nada/contacts'], ['/api/v1/outro'], ['/api/apps/install', 'POST']]],
    [createAppInstallRoutes, [['/api/apps/install'], ['/api/apps/outro', 'POST'], ['/api/apps/v1/trigger', 'POST']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, [`/cd/demo/${uuid}`], ['/api/state'], ['/api/agency/action', 'POST']]) {
      assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
    }
  }
  assert.deepEqual(touched, []);
});

test('atalhos da prospecção redirecionam e a API recusa o que não pode atender', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const heads = [];
  const res = { writeHead: (status, headers) => heads.push([status, headers.Location]), end: () => 'fim' };
  const prospect = createProspectPublicRoutes({ ready: Promise.resolve(), error, store: { findAgency: async () => null } });
  await prospect({ ...ctx('/prospecting/add-prospect'), res });
  await prospect({ ...ctx('/prospecting'), res });
  assert.deepEqual(heads, [[302, '/#agency/prospecting/search'], [302, '/#agency/prospecting']]);
  await assert.rejects(prospect(ctx(`/prospecting/report/${uuid}`, 'POST')), { status: 405 });
  await assert.rejects(prospect(ctx(`/prospecting/widget/${uuid}`)), { status: 404 });

  const api = createAppApiRoutes({ error });
  await assert.rejects(api(ctx('/api/v1/subaccounts', 'POST')), { status: 405 });
  const install = createAppInstallRoutes({ error, spaceId: /^demo$/ });
  await assert.rejects(install({ ...ctx('/api/apps/install', 'POST'), id: 'outra' }), { status: 404 });
});
