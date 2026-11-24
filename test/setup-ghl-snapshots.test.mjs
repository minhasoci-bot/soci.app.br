import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { AGENCY_ID, blankAgency } from '../agency-model.mjs';
import { workflowRecord } from '../workflow-engine.mjs';
import { eachStep } from '../ui/workflow-data.js';
import { ghlSnapshotSpecs, seedSetups } from '../setup-ghl-snapshots.mjs';

// `seed` runs on the agency document before the server first reads it (the server caches agencies).
async function start(seed) {
  const store = createSqliteStore(':memory:');
  if (seed) { const agency = blankAgency(); seed(agency); store.insert(AGENCY_ID, agency); }
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)) };
}

// Where each kind of link inside a workflow must point after the load.
const linkTargets = { stageId: 'stages', formId: 'forms', linkId: 'triggerLinks', widgetId: 'chatWidgets', workflowId: 'workflows', folderId: 'workflowFolders' };
function assertLoadedAccount(state, label) {
  assert.ok(state.workflows.every(w => w.active === false), `${label}: workflows arrive as drafts`);
  for (const workflow of state.workflows) {
    assert.doesNotThrow(() => workflowRecord(state, { ...workflow, active: false }), `${label} · ${workflow.name} is a valid draft for the engine`);
    const check = (config, where) => {
      for (const [field, collection] of Object.entries(linkTargets)) {
        const value = config?.[field];
        if (value) assert.ok(state[collection].some(row => row.id === value), `${label} · ${workflow.name} → ${where}.${field} points at a record of this account`);
      }
    };
    check(workflow, 'workflow');
    for (const trigger of workflow.triggers) check(trigger.config, trigger.type);
    eachStep(workflow.steps, step => check(step.config, step.type));
  }
  for (const agent of state.agents || []) assert.ok(agent.bases.every(base => state.knowledgeBases.some(kb => kb.id === base)), `${label}: agents keep their knowledge base`);
  assert.equal(state.contacts.length, 0);
}

const converted = [
  ['ghl-imobiliaria-agente-ia', { workflows: 3, agents: 1, knowledgeBases: 1, services: 2, customFields: 7 }],
  ['ghl-cold-email-ab', { workflows: 3, services: 1, tags: 2, customValues: 5 }],
  ['ghl-site-inteligente', { workflows: 13, customValues: 46, tags: 13, chatWidgets: 1, forms: 3 }],
  ['ghl-crewsystems-paisagismo', { workflows: 14, customValues: 46, chatWidgets: 2, agents: 1, forms: 6 }]
];

test('The 4 converted GHL snapshots are the agency\'s own setups, not official marketplace items, and seeding twice adds nothing', async t => {
  const local = await start(agency => seedSetups(agency));
  t.after(local.close);
  const { agency, marketplace } = (await local.call('/api/agency')).body;
  const seeded = agency.snapshots.filter(s => s.seedId);
  assert.deepEqual(seeded.map(s => s.seedId).sort(), ghlSnapshotSpecs.map(s => s.id).sort());
  assert.ok(seeded.every(s => s.kind === 'mine' && !s.official && s.assets), 'listed under Meus setups with their records');
  assert.ok(!marketplace.some(item => ghlSnapshotSpecs.some(spec => spec.id === item.id)), 'not in the official marketplace');
  const again = blankAgency(); seedSetups(again); assert.deepEqual(seedSetups(again).added, []);
});

for (const [id, expected] of converted) {
  test(`Converted setup ${id} loads into a new sub-account with valid, re-linked workflows`, async t => {
    const local = await start(agency => seedSetups(agency));
    t.after(local.close);
    const snap = (await local.call('/api/agency')).body.agency.snapshots.find(s => s.seedId === id);
    const account = await local.call('/api/agency/accounts', { name: `Cliente ${id}`, snapshotId: snap.id });
    assert.equal(account.status, 200, JSON.stringify(account.body));
    const state = (await local.call(`/api/state?workspace=${account.body.result}`)).body.state;
    for (const [key, count] of Object.entries(expected)) assert.equal(state[key].length, count, `${key} count`);
    assertLoadedAccount(state, id);
  });
}

test('The cold email sequence keeps the GHL A/B structure: 5 sends split 50/50 with 1 day between them', () => {
  const sequence = ghlSnapshotSpecs.find(s => s.id === 'ghl-cold-email-ab').assets.workflows.find(w => w.id === 'wce-seq');
  const splits = sequence.steps.filter(step => step.type === 'split');
  assert.equal(splits.length, 5);
  assert.ok(splits.every(split => split.routes.length === 2 && split.routes.every(route => route.percent === 50 && route.steps[0].type === 'send_email')));
  assert.equal(sequence.steps.filter(step => step.type === 'wait').length, 4);
});

test('The setup template gallery is empty and a removed template no longer creates a sub-account', async t => {
  const local = await start(); t.after(local.close);
  assert.deepEqual((await local.call('/api/agency/setup-templates', {})).body.result, []);
  const before = Object.keys((await local.call('/api/agency')).body.agency.accounts || {}).length;
  const account = await local.call('/api/agency/accounts', { name: 'Clínica Sorriso', templateId: 'template-dental' });
  assert.equal(account.status, 400);
  assert.equal(Object.keys((await local.call('/api/agency')).body.agency.accounts || {}).length, before);
});
