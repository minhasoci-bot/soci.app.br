// Contrato dos módulos de rota (P2.1): o que não é da mídia (imagens, vídeo com IA, Mídia Drive, vídeo de depoimento)
// nem do rastreamento volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveRoutes, createPublicMediaRoutes, createVideoRoutes } from '../routes/media.mjs';
import { createTrackingRoutes } from '../routes/tracking.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET') => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
  json: () => assert.fail(`json chamado em ${p}`) });
const spy = touched => new Proxy({}, { get: (_, name) => name === 'workspaceSegment' ? '(demo|(?:user-)?[0-9a-f-]{36})' : (...args) => { touched.push(name); return args; } });

test('mídia e rastreamento devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createPublicMediaRoutes, [[`/m/demo/video/${uuid}`, 'POST'], ['/m/demo/video/nada'], [`/asset/${'a'.repeat(64)}.png`, 'POST'], ['/asset/nada.png'], ['/api/video']]],
    [createDriveRoutes, [['/api/media/import'], ['/api/media/upload-url'], ['/api/media/outro', 'POST'], ['/api/tracking/events']]],
    [createTrackingRoutes, [['/api/tracking/events', 'POST'], ['/api/tracking/ga4-secret'], ['/api/media/import', 'POST']]],
    [createVideoRoutes, [['/api/video', 'POST'], ['/api/videos'], [`/m/demo/video/${uuid}`]]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, [`/cd/demo/${uuid}`], ['/api/state'], ['/api/agency/action', 'POST']]) {
      assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
    }
  }
  assert.deepEqual(touched, []);
});

test('o Mídia Drive e o segredo do GA4 recusam o que não podem atender', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const base = { error, spaceId: /^demo$/, privateSpace: /^user-/, workspaceAccess: async () => ({ modules: null }), store: { load: async () => ({ files: [] }) } };
  const drive = createDriveRoutes({ ...base, r2: null, payload: async () => ({ mime: 'image/png', size: 10 }) });
  await assert.rejects(drive(ctx('/api/media/upload-url', 'POST')), { status: 503 });
  await assert.rejects(drive({ ...ctx('/api/media/import', 'POST'), id: 'outra' }), { status: 404 });
  const noLink = createDriveRoutes({ ...base, r2: null, payload: async () => ({ url: '  ' }) });
  await assert.rejects(noLink(ctx('/api/media/import', 'POST')), { status: 400 });

  const tracking = createTrackingRoutes({ ...base, payload: async () => ({ secret: 'curto' }) });
  await assert.rejects(tracking(ctx('/api/tracking/ga4-secret', 'POST')), { status: 400 });
});
