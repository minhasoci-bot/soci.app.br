import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { makeServer, sessionOnlyFiles, staticFiles } from '../server.mjs';
import { smoke, smokePaths } from '../scripts/smoke-deploy.mjs';

// Sem acesso local, como em produção: quem não tem sessão é mandado ao login nas páginas que a exigem.
async function start({ allowLocalAccess = false } = {}) {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  return { base: `http://${host}:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('todo arquivo estático declarado no servidor existe em ui/', () => {
  const missing = [...staticFiles.keys()].filter(path => !existsSync(new URL(`../ui${path}`, import.meta.url)));
  assert.deepEqual(missing, []);
});

test('smoke cobre o login e todos os estáticos, menos o index que exige sessão', () => {
  const paths = smokePaths();
  assert.equal(paths[0], '/login');
  assert.ok(!paths.includes('/index.html'));
  assert.equal(paths.length, staticFiles.size);
});

test('smoke passa no servidor local e acusa o que não responde 200', async t => {
  const local = await start();
  t.after(local.close);

  const ok = await smoke(local.base);
  assert.deepEqual(ok.failures, []);
  assert.equal(ok.checked, smokePaths().length);

  const broken = await smoke(local.base, { paths: ['/login', '/arquivo-que-nao-existe.js'] });
  assert.deepEqual(broken.failures.map(row => row.path), ['/arquivo-que-nao-existe.js']);
  assert.notEqual(broken.failures[0].status, 200);
});

test('páginas que exigem sessão passam só com 303 para o login', async t => {
  assert.ok(sessionOnlyFiles.has('/prancheta-editor.html'));
  for (const path of sessionOnlyFiles) assert.ok(staticFiles.has(path), `${path} também é um estático declarado`);

  // Com sessão (acesso local), o editor abre com 200: para o smoke, que roda sem sessão, isso seria um vazamento.
  const open = await start({ allowLocalAccess: true });
  t.after(open.close);
  const leaked = await smoke(open.base, { paths: ['/login', '/prancheta-editor.html'] });
  assert.deepEqual(leaked.failures, [{ path: '/prancheta-editor.html', status: 200 }]);

  // Um 303 para outro lugar também não serve.
  const elsewhere = async () => new Response(null, { status: 303, headers: { Location: '/outra' } });
  assert.deepEqual((await smoke('http://x.test', { request: elsewhere, paths: ['/prancheta-editor.html'] })).failures, [{ path: '/prancheta-editor.html', status: 303 }]);
});
