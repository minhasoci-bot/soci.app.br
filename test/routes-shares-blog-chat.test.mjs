// Contrato dos módulos de rota (P2.1): o que não é dos compartilhamentos por link, do blog e do widget de chat volta
// como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareRoutes } from '../routes/shares.mjs';
import { createBlogRoutes } from '../routes/blog.mjs';
import { createChatRoutes } from '../routes/chat.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET', extra = {}) => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
  json: () => assert.fail(`json chamado em ${p}`), ...extra });
const spy = touched => new Proxy({ workspaceSegment }, { get: (target, name) => name in target ? target[name] : (...args) => { touched.push(name); return args; } });

test('rotas de compartilhamento, blog e chat devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createShareRoutes, [[`/marcas/${'a'.repeat(64)}`, 'POST'], [`/marcas/${'a'.repeat(63)}`], [`/apresentacao/${'a'.repeat(64)}`, 'POST'], [`/relatorio/demo/${'a'.repeat(32)}`]]],
    [createBlogRoutes, [[`/b/demo/${uuid}`, 'POST'], [`/b/demo/${uuid}/Artigo`], ['/api/blog/ai'], ['/api/blog/outro', 'POST']]],
    [createChatRoutes, [[`/chat/demo/${uuid}`, 'POST'], [`/chat/demo/${uuid}/outro.js`], [`/api/chat/demo/${uuid}/apagar`, 'POST'], ['/api/chat/demo/x/start', 'POST']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, ['/certificado/demo/ABCDEFABCDEF'], ['/api/state']]) assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});

test('o chat recusa método errado e um compartilhamento vencido dá 404', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const chat = createChatRoutes({ workspaceSegment, ready: Promise.resolve(), error, publicAccountPolicy: async () => true, store: { load: async () => ({ chatWidgets: [] }) } });
  await assert.rejects(chat(ctx(`/api/chat/demo/${uuid}/messages`, 'POST')), { status: 405 });
  await assert.rejects(chat(ctx(`/api/chat/demo/${uuid}/send`, 'GET')), { status: 405 });
  const token = 'b'.repeat(64);
  const shares = createShareRoutes({ workspaceSegment, ready: Promise.resolve(), error,
    store: { findAgency: async () => ({ id: 'agency', state: { presentations: [{ share: { id: token, expires: '2020-01-01T00:00:00Z' } }] } }) } });
  await assert.rejects(shares(ctx(`/apresentacao/${token}`)), { status: 404 });
});
