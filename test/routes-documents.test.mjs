// Contrato dos módulos de rota (P2.1): o que não é dos documentos públicos volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentRoutes } from '../routes/documents.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const ctx = (p, method = 'GET', extra = {}) => ({ req: { headers: {}, socket: {} }, res: { setHeader() {} }, p, method,
  json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`), ...extra });

test('rotas dos documentos devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({ workspaceSegment }, { get: (target, name) => name in target ? target[name] : (...args) => { touched.push(name); return args; } });
  const route = createDocumentRoutes(deps);
  for (const [p, method] of [['/assinar/demo', 'POST'], ['/orcamento/demo', 'HEAD'], ['/fatura/outra'], ['/api/assinar/demo/x', 'POST'],
    ['/api/fatura'], ['/avaliar/demo'], ['/api/state']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${method || 'GET'} ${p}`);
  }
  assert.deepEqual(touched, []);
});

test('a página do orçamento sai com a política própria e a API recusa ação desconhecida', async () => {
  const policy = [], headers = {};
  const error = (message, status) => Object.assign(new Error(message), { status });
  const route = createDocumentRoutes({ workspaceSegment, ready: Promise.resolve(), root: process.cwd(), error, allowSign: () => true,
    payload: async () => ({ action: 'apagar', token: 'x' }), publicAccountPolicy: async (...args) => { policy.push(args); return true; } });
  let sent;
  await route(ctx('/orcamento/demo/', 'GET', { res: { setHeader: (k, v) => { headers[k] = v; } }, send: (status, type) => { sent = [status, type]; } }));
  assert.deepEqual(sent, [200, 'text/html; charset=utf-8']);
  assert.equal(headers['X-Robots-Tag'], 'noindex');
  assert.deepEqual(policy, [['demo', false, 'payments']]);
  await assert.rejects(route(ctx('/api/orcamento/demo', 'GET')), { status: 405 });
  await assert.rejects(route(ctx('/api/orcamento/demo', 'POST')), { status: 400 });
});
