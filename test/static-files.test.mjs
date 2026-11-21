import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { makeServer } from '../server.mjs';

// Every module the app imports must be served, or the whole app stops loading in the browser.
test('Every UI module imported by another UI module is served', async t => {
  const dir = new URL('../ui/', import.meta.url);
  const imported = new Set();
  for (const name of readdirSync(dir).filter(file => file.endsWith('.js'))) {
    for (const [, file] of readFileSync(new URL(name, dir), 'utf8').matchAll(/from '\.\/([\w-]+\.js)'/g)) imported.add(file);
  }
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const missing = [];
  for (const file of imported) {
    const response = await fetch(`${base}/${file}`, { method: 'HEAD' });
    if (response.status !== 200) missing.push(`${file} (${response.status})`);
  }
  assert.deepEqual(missing, []);
});
