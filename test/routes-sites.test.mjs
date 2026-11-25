// Contrato dos módulos de rota (P2.1): o que não é de sites, webinars e QR codes públicos volta como NEXT_ROUTE
// sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteRoutes } from '../routes/sites.mjs';
import { createWebinarRoutes } from '../routes/webinars.mjs';
import { createQrRoutes } from '../routes/qr.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const trackingPath = new RegExp(`^/t/${workspaceSegment}(\\.js|/pixels\\.js|/e)$`);
const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET', extra = {}) => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`),
  json: () => assert.fail(`json chamado em ${p}`), ...extra });
const spy = touched => new Proxy({ workspaceSegment, trackingPath }, { get: (target, name) => name in target ? target[name] : (...args) => { touched.push(name); return args; } });

test('rotas de sites, webinars e QR codes devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const routes = [createSiteRoutes(spy(touched)), createWebinarRoutes(spy(touched)), createQrRoutes(spy(touched))];
  const others = [['/studio-template/a/b', 'POST'], [`/studio-preview/demo/${uuid}/${uuid}`, 'POST'], ['/t/demo.css'], [`/s/demo/${uuid}/Página`],
    [`/w/demo/${uuid}`, 'POST'], [`/w/demo/${uuid}/outra`], [`/api/webinar/demo/${uuid}/cancel`, 'POST'], [`/q/demo/${uuid}`, 'POST'], [`/q/demo/${uuid}/x`],
    ['/avaliar/demo'], ['/api/state']];
  for (const route of routes) {
    for (const [p, method] of others) {
      const mine = (route === routes[1] && /^\/(w|api\/webinar)\//.test(p) && !/outra|cancel/.test(p) && method !== 'POST')
        || (route === routes[0] && p.startsWith('/t/demo.js'));
      if (!mine) assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
    }
  }
  assert.deepEqual(touched, []);
});

test('o QR code inativo mostra a página 404 própria e não conta leitura', async () => {
  const changes = [];
  const route = createQrRoutes({ workspaceSegment, ready: Promise.resolve(), publicAccountPolicy: async () => true, publicBase: () => 'https://x',
    store: { load: async () => ({ qrCodes: [{ id: uuid, active: false }] }) }, change: (...args) => changes.push(args) });
  const out = {};
  await route(ctx(`/q/demo/${uuid}`, 'GET', { res: { writeHead: (status, headers) => Object.assign(out, { status, headers }), end: body => { out.body = body; } } }));
  assert.equal(out.status, 404);
  assert.match(out.body, /Este QR Code não está ativo/);
  assert.deepEqual(changes, []);
});

test('a API do webinar só aceita POST', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const route = createWebinarRoutes({ workspaceSegment, ready: Promise.resolve(), error });
  await assert.rejects(route(ctx(`/api/webinar/demo/${uuid}/register`, 'GET')), { status: 405 });
});
