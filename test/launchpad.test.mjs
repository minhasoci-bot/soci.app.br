import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank } from '../model.mjs';
import { workspaceView } from '../authorization.mjs';
import { launchpad, launchpadGuide } from '../ui/launchpad.js';
import { setupProgress, setupTasks } from '../ui/launchpad-data.js';

test('Setup milestones use saved records, distinguish draft and published, and respect module access', () => {
  const state = blank('Conta nova');
  assert.equal(setupProgress(setupTasks(state)).percent, 0);
  state.studioProjects.push({ id: 'draft', kind: 'funnel' });
  state.forms.push({ id: 'form', active: false });
  const task = id => setupTasks(state).find(row => row.id === id);
  assert.equal(task('funnel').percent, 0);
  state.forms[0].active = true;
  assert.equal(task('funnel').percent, 50);
  state.studioProjects[0].publishedAt = new Date().toISOString();
  assert.equal(task('funnel').percent, 100);
  state.imports.push({ object: 'opportunities', status: 'Completed', added: 2 });
  assert.equal(task('import').percent, 0);
  state.imports.push({ status: 'Completed', added: 0 });
  assert.equal(task('import').percent, 0);
  state.imports.push({ status: 'Completed', added: 2 });
  assert.equal(task('import').percent, 100);
  assert.equal(setupTasks(state, null, { status: 'connecting' }).find(row => row.id === 'communication').percent, 0);
  assert.equal(setupTasks(state, null, { status: 'connected' }).find(row => row.id === 'communication').percent, 100);

  const access = { modules: ['contacts'] };
  const projected = workspaceView(access, state).state;
  assert.deepEqual(setupTasks(projected, access).map(row => row.id), ['contact']);
  assert.equal(launchpadGuide({ s: projected, access }, 'product'), null);
  const html = launchpad({ s: projected, access, tab: 'commerce' });
  assert.match(html, /Configuração inicial/);
  assert.doesNotMatch(html, /#payments|#settings|#sites|#dashboard/);
  assert.match(launchpad({ s: state, access: { modules: [] } }), /Nenhuma tarefa disponível/);
});

test('Setup progress survives reload, stays isolated per workspace, and assets are served', async t => {
  const { server, host, ready } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const res = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.ok(res.ok, `${path}: ${res.status}`);
    return res.json();
  };
  const one = await call('/api/workspaces', { name: 'Conta A' });
  const two = await call('/api/workspaces', { name: 'Conta B' });
  const get = async id => (await call(`/api/state?workspace=${id}`)).state;
  assert.equal(setupProgress(setupTasks(await get(one.id))).percent, 0);
  await call(`/api/action?workspace=${one.id}`, { type: 'save', key: 'contacts', data: { name: 'Primeiro contato', email: 'primeiro@example.test' } });
  assert.equal(setupTasks(await get(one.id)).find(row => row.id === 'contact').percent, 100);
  assert.equal(setupTasks(await get(two.id)).find(row => row.id === 'contact').percent, 0);
  const reloaded = await get(one.id);
  assert.equal(setupTasks(reloaded).find(row => row.id === 'contact').percent, 100);
  for (const path of ['/launchpad.js', '/launchpad-data.js', '/launchpad.css']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), path.endsWith('.css') ? /text\/css/ : /javascript/);
  }
});
