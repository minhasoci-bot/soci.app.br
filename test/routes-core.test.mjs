// Contrato dos módulos de rota (P2.1): o que não é do núcleo (favicon, marca do White Label, conta, subconta, agência e
// páginas) volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRoutes, createWhiteLabelRoutes } from '../routes/account.mjs';
import { createAgencyRoutes } from '../routes/agency.mjs';
import { createFaviconRoutes, createPageRoutes } from '../routes/pages.mjs';
import { createWorkspaceRoutes } from '../routes/workspace.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET') => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
  json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`), goTo: () => assert.fail(`goTo chamado em ${p}`) });
const spy = touched => new Proxy({}, { get: (_, name) => {
  if (name === 'workspaceSegment') return '(demo|(?:user-)?[0-9a-f-]{36})';
  if (name === 'staticFiles' || name === 'sessionOnlyFiles') return new Map([['/app.css', 'text/css']]);
  return (...args) => { touched.push(name); return args; };
} });

test('o núcleo devolve NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createFaviconRoutes, [['/favicon.svg'], ['/api/marca']]],
    [createWhiteLabelRoutes, [['/api/marca', 'POST'], ['/api/openai']]],
    [createAccountRoutes, [['/api/workspaces/x'], ['/api/openai/x'], ['/api/marca']]],
    [createWorkspaceRoutes, [['/api/state', 'POST'], ['/api/workflow-test'], ['/api/agency']]],
    [createAgencyRoutes, [['/api/agencies'], ['/api/audit', 'POST'], ['/api/agency/action'], ['/api/state']]],
    [createPageRoutes, [['/api/view/p/demo/nada'], [`/p/demo/${uuid}`, 'POST'], ['/app', 'POST'], ['/nada.html'], ['/api/state']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, [`/cd/demo/${uuid}`], ['/api/media/import', 'POST'], ['/api/apps/install']]) {
      assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
    }
  }
  assert.deepEqual(touched, []);
});

test('favicon, páginas e subconta respondem ou recusam como antes', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const heads = [];
  const res = { writeHead: (status, headers) => heads.push([status, headers.Location]), end: () => 'fim', setHeader: () => {} };
  assert.equal(await createFaviconRoutes()({ res, p: '/favicon.ico' }), 'fim');

  const pages = createPageRoutes({ error, workspaceSegment: '(demo|(?:user-)?[0-9a-f-]{36})', ready: Promise.resolve(),
    publicAccountPolicy: async () => {}, staticFiles: new Map(), sessionOnlyFiles: new Set(), localAccess: false, auth: { hasSession: () => false } });
  await pages({ ...ctx(`/f/demo/${uuid}`), res });
  const login = [];
  await pages({ ...ctx('/app?x=1'), p: '/app', url: new URL('http://x/app?x=1'), goTo: to => login.push(to) });
  assert.deepEqual(heads, [[302, '/favicon.svg'], [302, `/form/demo/${uuid}`]]);
  assert.deepEqual(login, ['/login?next=%2Fapp%3Fx%3D1']);
  await assert.rejects(pages(ctx(`/api/view/p/demo/${uuid}`, 'POST')), { status: 405 });

  const workspace = createWorkspaceRoutes({ error, spaceId: /^demo$/, privateSpace: /^user-/ });
  await assert.rejects(workspace({ ...ctx('/api/state'), id: 'outra' }), { status: 404 });
  await assert.rejects(workspace({ ...ctx('/api/workflow-test', 'POST'), id: 'outra' }), { status: 404 });
});
