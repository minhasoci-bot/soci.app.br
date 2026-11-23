import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { makeServer, staticFiles } from '../server.mjs';
import { smoke, smokePaths } from '../scripts/smoke-deploy.mjs';

async function start() {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true });
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
