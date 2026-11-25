// Contrato dos módulos de rota (P2.1): o que não é de afiliados, ofertas e agenda públicos volta como NEXT_ROUTE
// sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAffiliateRoutes } from '../routes/affiliates.mjs';
import { createOfferApiRoutes, createOfferPageRoutes } from '../routes/offers.mjs';
import { createBookingRoutes } from '../routes/booking.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET', extra = {}) => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`),
  json: () => assert.fail(`json chamado em ${p}`), ...extra });
const spy = touched => new Proxy({ workspaceSegment }, { get: (target, name) => name in target ? target[name] : (...args) => { touched.push(name); return args; } });

test('rotas de afiliados, ofertas e agenda devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createAffiliateRoutes, [['/r/demo/ab', 'GET'], ['/r/demo/codigo', 'POST'], ['/afiliados/demo', 'POST'], ['/api/afiliados/demo/signup', 'GET'], ['/api/afiliados/demo/x', 'POST']]],
    [createOfferPageRoutes, [[`/oferta/demo/${uuid}`, 'POST'], ['/oferta/demo/x'], [`/api/offer/demo/${uuid}`, 'POST']]],
    [createOfferApiRoutes, [[`/oferta/demo/${uuid}`], [`/api/offer/demo/${uuid}/x`, 'POST'], ['/api/offer/demo', 'POST']]],
    [createBookingRoutes, [['/agendar/demo/x'], ['/agendar/outra'], ['/agenda/demo']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, ['/q/demo/x'], ['/api/state']]) assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});

test('a API da oferta só aceita POST e o link de afiliado em HEAD não conta clique', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const offers = createOfferApiRoutes({ workspaceSegment, ready: Promise.resolve(), error });
  await assert.rejects(offers(ctx(`/api/offer/demo/${uuid}`, 'GET')), { status: 405 });
  const changes = [];
  const affiliates = createAffiliateRoutes({ workspaceSegment, ready: Promise.resolve(), error, publicAccountPolicy: async () => true, change: (...args) => changes.push(args) });
  await assert.rejects(affiliates(ctx('/r/demo/codigo', 'HEAD')), { status: 404 });
  assert.deepEqual(changes, []);
});
