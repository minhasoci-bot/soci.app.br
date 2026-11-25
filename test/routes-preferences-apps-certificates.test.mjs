// Contrato dos módulos de rota (P2.1): o que não é da central de preferências, dos apps da agência e dos
// certificados volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferenceRoutes } from '../routes/preferences.mjs';
import { createAgencyAppRoutes } from '../routes/agency-apps.mjs';
import { createCertificateRoutes } from '../routes/certificates.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const ctx = (p, method = 'GET', extra = {}) => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), ...extra });
const spy = touched => new Proxy({ workspaceSegment }, { get: (target, name) => name in target ? target[name] : (...args) => { touched.push(name); return args; } });

test('rotas de preferências, apps e certificados devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createPreferenceRoutes, [[`/preferencias/demo/${'a'.repeat(31)}`], [`/preferencias/demo/${'A'.repeat(32)}`], ['/preferencias/demo']]],
    [createAgencyAppRoutes, [['/mobile/agencia', 'GET'], ['/mobile/agencia/', 'POST'], ['/mobile/agencia/outro.js'], ['/desktop/agencia/config.json'], ['/push/sw.js', 'POST'], ['/.well-known/outro.json']]],
    [createCertificateRoutes, [['/certificado/demo/abcdefabcdef'], ['/certificado/demo/ABCDEFABCDEF', 'POST'], ['/certificado/demo']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, ['/agendar/demo'], ['/api/state']]) assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});

test('o worker de push troca o ícone do app pelo favicon e o app não publicado dá 404', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const route = createAgencyAppRoutes({ ready: Promise.resolve(), error, loadAgency: async () => ({ mobileApp: { status: 'draft' } }) });
  const out = {};
  await route(ctx('/push/sw.js', 'GET', { res: { writeHead: (status, headers) => Object.assign(out, { status, headers }), end: body => { out.body = body; } } }));
  assert.equal(out.status, 200);
  assert.doesNotMatch(out.body, /\/mobile\/push\/icon-192\.png/);
  await assert.rejects(route(ctx('/mobile/agencia/')), { status: 404 });
});
