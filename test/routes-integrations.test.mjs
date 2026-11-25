// Contrato dos módulos de rota (P2.1): o que não é do WhatsApp/WAHA, dos conectores de apps, do telefone ou das
// notificações push volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsappRoutes, createWhatsappWebhookRoutes } from '../routes/whatsapp.mjs';
import { createConnectorHookRoutes, createConnectorRoutes } from '../routes/connectors.mjs';
import { createPhoneRoutes, createTwilioWebhookRoutes } from '../routes/phone.mjs';
import { createPushRoutes } from '../routes/push.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET') => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo', isVercel: false,
  json: () => assert.fail(`json chamado em ${p}`) });
const spy = touched => new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });

test('WhatsApp, conectores, telefone e push devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createWhatsappWebhookRoutes, [['/api/whatsapp/webhook/x'], ['/api/whatsapp/agency/status', 'POST']]],
    [createWhatsappRoutes, [['/api/whatsapp/webhook/x', 'POST'], ['/api/whatsapp'], ['/api/wahax/test']]],
    [createConnectorHookRoutes, [[`/api/connectors/hook/demo/slack/${'a'.repeat(24)}`], [`/api/connectors/hook/demo/slack/${'a'.repeat(10)}`, 'POST'], ['/api/connectors/status']]],
    [createConnectorRoutes, [[`/api/connectors/hook/demo/slack/${'a'.repeat(24)}`, 'POST'], ['/api/connector/status']]],
    [createTwilioWebhookRoutes, [['/api/phone/twilio/voice'], ['/api/phone/calls', 'POST']]],
    [createPhoneRoutes, [['/api/phones'], ['/api/phonex/calls']]],
    [createPushRoutes, [['/api/push/key', 'POST'], ['/api/push/subscribe'], ['/api/mobile-app/package', 'POST'], ['/api/push/outro', 'POST']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, [`/cd/demo/${uuid}`], ['/api/state']]) assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});

test('o webhook de conector recusa token errado e a chave de push vem do ambiente', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const hooks = createConnectorHookRoutes({ ready: Promise.resolve(), error, store: { load: async () => ({ connectors: { slack: { hook: 'b'.repeat(24) } } }) } });
  const req = { headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); } };
  await assert.rejects(hooks({ ...ctx(`/api/connectors/hook/demo/slack/${'a'.repeat(24)}`, 'POST'), req }), { status: 404 });
  await assert.rejects(hooks({ ...ctx(`/api/connectors/hook/demo/outro/${'b'.repeat(24)}`, 'POST'), req }), { status: 404 });

  const push = createPushRoutes({ pushEnv: {} });
  let answer;
  await push({ ...ctx('/api/push/key'), json: body => { answer = body; return body; } });
  assert.deepEqual(answer, { key: '' });
});
