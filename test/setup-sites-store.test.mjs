// Páginas de setup guardadas fora do estado da agência: um setup importado do GHL pode ter dezenas de páginas,
// e o documento da agência não pode crescer com o HTML delas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { AGENCY_ID } from '../agency-model.mjs';
import { loadSetupSites, removeSetupSites, saveSetupSites } from '../setup-sites-store.mjs';

async function start(store) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)) };
}

const site = (name, html) => ({ profile: { name }, pages: [{ id: `${name}-1`, name: 'Início', slug: 'index', html }], versions: [] });

test('round-trips the sites of a setup', async () => {
  const store = createSqliteStore(':memory:');
  const sites = { p1: site('Um', '<h1>Um</h1>'), p2: site('Dois', '<h1>Dois</h1>') };
  await saveSetupSites(store, 'snap1', sites);
  assert.deepEqual(await loadSetupSites(store, 'snap1'), sites);
  assert.deepEqual(await loadSetupSites(store, 'outro'), {});
  // The rows are documents, never sub-accounts: a row read back raw is exactly what was saved.
  assert.deepEqual(await store.load('setup-sites-snap1-p1'), sites.p1);
});

/** A setup made from the demo account's site, then moved to stored rows like an imported one. */
async function storedSetup(t) {
  const store = createSqliteStore(':memory:');
  const local = await start(store); t.after(local.close);
  const studio = await local.call('/api/studio?workspace=demo', { mode: 'starter', template: 'landing', brief: 'Página de uma clínica' });
  assert.equal(studio.status, 201);
  const created = await local.call('/api/agency/snapshot-create', { workspace: 'demo', name: 'Importado', include: ['studioProjects'] });
  assert.equal(created.status, 200);
  const snapId = created.body.result;
  let moved = null;
  await store.change(AGENCY_ID, agency => {
    const snap = agency.snapshots.find(s => s.id === snapId);
    moved = snap.studioSites;
    delete snap.studioSites;
    snap.sitesStored = true;
  });
  assert.ok(Object.keys(moved).length >= 1);
  await saveSetupSites(store, snapId, moved);
  return { store, local, snapId, moved };
}

test('an account created from a stored setup gets its sites', async t => {
  const { local, snapId, moved } = await storedSetup(t);
  const account = await local.call('/api/agency/accounts', { name: 'Clínica Nova', snapshotId: snapId });
  assert.equal(account.status, 200);
  const state = (await local.call(`/api/state?workspace=${account.body.result}`)).body.state;
  assert.equal(state.studioProjects.length, Object.keys(moved).length);
  const doc = await local.call(`/api/studio/doc?workspace=${account.body.result}&id=${state.studioProjects[0].id}`);
  assert.equal(doc.status, 200);
  assert.match(doc.body.doc.pages[0].html, /^<!doctype html>/i);
  // Loading the setup into an existing account brings the pages too.
  const other = (await local.call('/api/agency/accounts', { name: 'Outra' })).body.result;
  const loaded = await local.call('/api/agency/snapshot-load', { id: snapId, workspaces: [other] });
  assert.equal(loaded.status, 200);
  const otherState = (await local.call(`/api/state?workspace=${other}`)).body.state;
  const otherDoc = await local.call(`/api/studio/doc?workspace=${other}&id=${otherState.studioProjects[0].id}`);
  assert.match(otherDoc.body.doc.pages[0].html, /^<!doctype html>/i);
});

test('importing a shared stored setup copies its site rows', async t => {
  const { store, local, snapId, moved } = await storedSetup(t);
  const shared = await local.call('/api/agency/action', { type: 'snapshot-share', id: snapId });
  assert.equal(shared.status, 200);
  const imported = await local.call('/api/agency/action', { type: 'snapshot-import', data: { code: shared.body.result } });
  assert.equal(imported.status, 200);
  assert.notEqual(imported.body.result, snapId);
  assert.deepEqual(Object.keys(await loadSetupSites(store, imported.body.result)), Object.keys(moved));
});

test('deleting the setup removes its site rows', async t => {
  const { store, local, snapId } = await storedSetup(t);
  const removed = await local.call('/api/agency/action', { type: 'snapshot-delete', id: snapId });
  assert.equal(removed.status, 200);
  assert.deepEqual(await loadSetupSites(store, snapId), {});
  await removeSetupSites(store, snapId);
});
