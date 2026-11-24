// Contrato dos módulos de rota (P2.1): o que não é da Prancheta volta como NEXT_ROUTE sem tocar em nada;
// e nenhum módulo em routes/ usa caminho relativo "./" (ele apontaria para routes/, não para a raiz).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createPranchetaRoutes } from '../routes/prancheta.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

test('rotas da Prancheta devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const deps = new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });
  const route = createPranchetaRoutes(deps);
  const ctx = (p, method = 'GET') => ({ req: { headers: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
    json: () => assert.fail(`json chamado em ${p}`), send: () => assert.fail(`send chamado em ${p}`) });
  for (const [p, method] of [['/api/state'], ['/api/prancheta'], ['/api/pranchetas/files'], ['/prancheta.js'], ['/api/social/run', 'POST']]) {
    assert.equal(await route(ctx(p, method)), NEXT_ROUTE, p);
  }
  assert.deepEqual(touched, []);
});

test('módulos de routes/ não usam caminhos relativos "./" para módulos da raiz', () => {
  const dir = new URL('../routes/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    const local = [...src.matchAll(/(?:from\s*|import\(\s*)['"]\.\/([^'"]+)['"]/g)].map(m => m[1]);
    assert.deepEqual(local.filter(name => name !== 'next-route.mjs'), [], `${file} importa da própria pasta routes/`);
    assert.doesNotMatch(src, /import\.meta|new URL\(\s*['"]\.\//, file);
  }
});
