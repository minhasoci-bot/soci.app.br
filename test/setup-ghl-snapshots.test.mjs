import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { workflowRecord } from '../workflow-engine.mjs';
import { eachStep } from '../ui/workflow-data.js';

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

// Where each kind of link inside a workflow must point after the load.
const linkTargets = { stageId: 'stages', formId: 'forms', linkId: 'triggerLinks', widgetId: 'chatWidgets', workflowId: 'workflows', folderId: 'workflowFolders' };

const converted = [
  ['official-imobiliaria-agente-ia', { workflows: 3, agents: 1, knowledgeBases: 1, services: 2, customFields: 7 }],
  ['official-cold-email-ab', { workflows: 3, services: 1, tags: 2, customValues: 5 }],
  ['official-site-inteligente', { workflows: 13, customValues: 46, tags: 13, chatWidgets: 1, forms: 3 }],
  ['official-crewsystems-paisagismo', { workflows: 14, customValues: 46, chatWidgets: 2, agents: 1, forms: 6 }]
];

for (const [id, expected] of converted) {
  test(`GHL snapshot conversion ${id} installs into a sub-account with valid, re-linked workflows`, async t => {
    const local = await start(); t.after(local.close);
    const listing = (await local.call('/api/agency')).body.marketplace.find(item => item.id === id);
    assert.ok(listing, 'listed in the marketplace as an official setup');
    assert.equal(listing.official, true);
    const installed = await local.call('/api/agency/marketplace-install', { id });
    assert.equal(installed.status, 200);
    const account = await local.call('/api/agency/accounts', { name: `Cliente ${id}`, snapshotId: installed.body.result.snapshotId });
    assert.equal(account.status, 200, JSON.stringify(account.body));
    const state = (await local.call(`/api/state?workspace=${account.body.result}`)).body.state;
    for (const [key, count] of Object.entries(expected)) assert.equal(state[key].length, count, `${key} count`);
    assert.ok(state.workflows.every(w => w.active === false), 'workflows arrive as drafts');

    for (const workflow of state.workflows) {
      assert.doesNotThrow(() => workflowRecord(state, { ...workflow, active: false }), `${workflow.name} is a valid draft for the engine`);
      const check = (config, where) => {
        for (const [field, collection] of Object.entries(linkTargets)) {
          const value = config?.[field];
          if (value) assert.ok(state[collection].some(row => row.id === value), `${workflow.name} → ${where}.${field} points at a record of this account`);
        }
      };
      check(workflow, 'workflow');
      for (const trigger of workflow.triggers) check(trigger.config, trigger.type);
      eachStep(workflow.steps, step => check(step.config, step.type));
    }
    for (const agent of state.agents || []) assert.ok(agent.bases.every(base => state.knowledgeBases.some(kb => kb.id === base)), 'agents keep their knowledge base');
    assert.equal(state.contacts.length, 0);
  });
}

test('The cold email sequence keeps the GHL A/B structure: 5 sends split 50/50 with 1 day between them', async () => {
  const { coldEmailSpec } = await import('../setup-ghl-snapshots.mjs');
  const sequence = coldEmailSpec.assets.workflows.find(w => w.id === 'wce-seq');
  const splits = sequence.steps.filter(step => step.type === 'split');
  assert.equal(splits.length, 5);
  assert.ok(splits.every(split => split.routes.length === 2 && split.routes.every(route => route.percent === 50 && route.steps[0].type === 'send_email')));
  assert.equal(sequence.steps.filter(step => step.type === 'wait').length, 4);
});
