import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const target = '7f1c5227-63a5-48e7-abd0-6f6c91c4b67e';

test('T.1 copy contact: the run queues the contact data for the other sub-account', () => {
  const s = blank();
  const id = save(s, 'workflows', { name: 'Copiar', active: true, triggers: [{ type: 'contact_created' }],
    steps: [{ type: 'copy_contact', config: { workspace: target, copyTags: 'yes', tags: 'da matriz, {{contact.company}}' } }] });
  save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', phone: '+55 81 99999-0000', company: 'Clínica', tags: ['vip'], custom: { secreto: 'x' } });
  const item = s.workflowOutbox.find(row => row.kind === 'copy-contact');
  assert.equal(item.workspace, target);
  assert.deepEqual(item.contact, { name: 'Ana', email: 'ana@x.test', phone: '+55 81 99999-0000', company: 'Clínica', tags: ['vip'] }, 'custom fields stay behind');
  assert.deepEqual(item.tags, ['da matriz', 'Clínica']);
  assert.match(s.runs.find(run => run.workflowId === id).results.join(' '), /na fila para copiar/);
});

test('T.1 copy contact: the target creates the contact, or completes an existing one without overwriting', () => {
  const s = blank();
  const created = execute(s, { type: 'contact-copy-in', data: { name: 'Ana', email: 'ANA@x.test', phone: '', company: 'Clínica', tags: ['vip'], from: 'Matriz' } });
  assert.equal(created.created, true);
  const ana = s.contacts.find(row => row.id === created.id);
  assert.equal(ana.email, 'ana@x.test');
  assert.match(ana.notes, /Copiado da subconta Matriz/);
  const bia = save(s, 'contacts', { name: 'Bia Local', email: '', phone: '(81) 98888-0000', company: '', tags: ['local'], custom: {} });
  const merged = execute(s, { type: 'contact-copy-in', data: { name: 'Outro nome', email: 'bia@x.test', phone: '+55 81 98888-0000', company: 'Loja', tags: ['nova'] } });
  assert.deepEqual(merged, { id: bia, created: false });
  const row = s.contacts.find(item => item.id === bia);
  assert.equal(row.name, 'Bia Local', 'existing data is kept');
  assert.equal(row.email, 'bia@x.test', 'empty fields are filled');
  assert.equal(row.company, 'Loja');
  assert.deepEqual(row.tags, ['local', 'nova']);
  assert.throws(() => execute(s, { type: 'contact-copy-in', data: {} }), /não tem dados/);
});

async function start() {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)) };
}

test('T.1 copy contact through the server: lands in the other sub-account; the same sub-account is refused', async t => {
  const local = await start(); t.after(local.close);
  const { body: other } = await local.call('/api/workspaces', { name: 'Filial' });
  const flow = steps => local.call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Copiar para a filial', active: true, triggers: [{ type: 'contact_created' }], steps } });
  const same = await flow([{ type: 'copy_contact', config: { workspace: 'demo' } }]);
  assert.equal(same.status, 400);
  assert.match(same.body.error, /outra subconta/);
  const saved = await flow([{ type: 'copy_contact', config: { workspace: other.id, tags: 'veio da matriz' } }]);
  assert.equal(saved.status, 200, saved.body.error);
  await local.call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Carla Cópia', email: 'carla.copia@x.test', tags: [], custom: {} } });
  let copy;
  for (let i = 0; i < 50 && !copy; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    copy = (await local.call('/api/state?workspace=' + other.id)).body.state.contacts.find(row => row.email === 'carla.copia@x.test');
  }
  assert.ok(copy, 'the contact reached the other sub-account');
  assert.deepEqual(copy.tags, ['veio da matriz']);
  const runs = (await local.call('/api/state?workspace=demo')).body.state.runs.filter(run => run.name === 'Copiar para a filial');
  assert.match(runs[0].results.join(' '), /Cópia: Filial: contato criado/);
});
