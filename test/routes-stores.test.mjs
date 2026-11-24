// Contrato dos módulos de rota (P2.1): o que não é das lojas volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoreApiRoutes, createStorePageRoutes } from '../routes/stores.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const workspace = '(demo|(?:user-)?[0-9a-f-]{36})';
const fixed = {
  storePath: new RegExp(`^/loja/${workspace}/([0-9a-f-]{36})(?:/(carrinho)|/p/([a-z0-9-]{1,80}))?/?$`),
  storeApi: new RegExp(`^/api/store/${workspace}/([0-9a-f-]{36})/(quote|checkout|cart|restore|review|view)$`)
};
const id = '00000000-0000-0000-0000-000000000000';

for (const [name, create, others] of [
  ['vitrine', createStorePageRoutes, [[`/loja/demo/${id}`, 'POST'], ['/loja/demo'], [`/loja/demo/${id}/p/Com Espaço`], [`/api/store/demo/${id}/quote`, 'POST'], ['/api/state']]],
  ['API da vitrine', createStoreApiRoutes, [[`/api/store/demo/${id}/outra`, 'POST'], ['/api/store/demo/x/quote', 'POST'], [`/loja/demo/${id}`], ['/api/state']]]
]) {
  test(`rotas das lojas (${name}) devolvem NEXT_ROUTE para caminhos de outros domínios`, async () => {
    const touched = [];
    const deps = new Proxy({}, { get: (_, key) => key in fixed ? fixed[key] : (...args) => { touched.push(key); return args; } });
    const route = create(deps);
    for (const [p, method = 'GET'] of others) {
      const ctx = { req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${encodeURI(p)}`),
        json: () => assert.fail(`json chamado em ${p}`) };
      assert.equal(await route(ctx), NEXT_ROUTE, `${method} ${p}`);
    }
    assert.deepEqual(touched, []);
  });
}
