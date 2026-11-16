import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

async function start() {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)) };
}
const action = (local, body, headers) => local.call('/api/agency/action', body, headers);

test('A snapshot copies assets into a new sub-account as drafts and keeps existing ones on reload', async t => {
  const local = await start(); t.after(local.close);
  const save = (key, data) => local.call('/api/action?workspace=demo', { type: 'save', key, data });
  const form = (await save('forms', { name: 'Quote request', active: true })).body.id;
  await save('pages', { name: 'Home', headline: 'Welcome', kind: 'Funnel', formId: form, active: true });
  await save('workflows', { name: 'Follow up', trigger: 'Form submitted', active: true, actions: [{ type: 'Create task', value: 'Call back' }] });

  const created = await local.call('/api/agency/snapshot-create', { workspace: 'demo', name: 'Starter', include: ['pipelines', 'stages', 'forms', 'pages', 'workflows'] });
  assert.equal(created.status, 200);
  const snap = created.body.agency.snapshots[0];
  assert.deepEqual([snap.counts.forms, snap.counts.pages, snap.counts.workflows], [1, 1, 1]);

  const account = await local.call('/api/agency/accounts', { name: 'Client One', email: 'one@example.test', snapshotId: snap.id });
  const id = account.body.result;
  const state = (await local.call(`/api/state?workspace=${id}`)).body.state;
  assert.equal(state.contacts.length, 0, 'contacts are never copied');
  assert.equal(state.pages[0].formId, state.forms[0].id, 'page keeps its form link with the new id');
  assert.notEqual(state.forms[0].id, form);
  assert.equal(state.pages[0].active, false);
  assert.equal(state.workflows[0].active, false);
  assert.equal(state.pipelines.length, 1, 'the existing pipeline with the same name is reused');

  const again = await local.call('/api/agency/snapshot-load', { id: snap.id, workspaces: [id], mode: 'skip' });
  assert.equal(again.body.result[0].added, 0);
  assert.equal((await local.call(`/api/state?workspace=${id}`)).body.state.pages.length, 1);
  const overview = again.body.overview;
  assert.equal(overview.totals.accounts, 2);
  assert.ok(again.body.agency.audit.some(entry => entry.action === 'Snapshot loaded'));
});

test('API keys are shown once, stored as hashes, and private integrations respect scopes', async t => {
  const local = await start(); t.after(local.close);
  const key = await action(local, { type: 'api-key', data: { name: 'Script' } });
  const secret = key.body.result.secret;
  assert.match(secret, /^go_[0-9a-f]{48}$/);
  assert.equal(JSON.stringify(key.body.agency).includes(secret), false);
  assert.equal(key.body.agency.apiKeys[0].hash, undefined);

  assert.equal((await local.call('/api/v1/subaccounts')).status, 401);
  const list = await local.call('/api/v1/subaccounts', undefined, { Authorization: `Bearer ${secret}` });
  assert.deepEqual(list.body.subaccounts.map(w => w.id), ['demo']);

  const pit = await action(local, { type: 'private-integration', data: { name: 'Reader', scopes: ['contacts.read'] } });
  const token = pit.body.result.secret;
  assert.equal((await local.call('/api/v1/subaccounts/demo/contacts', undefined, { Authorization: `Bearer ${token}` })).body.contacts.length, 3);
  const denied = await local.call('/api/v1/subaccounts/demo/contacts', { name: 'Blocked' }, { Authorization: `Bearer ${token}` });
  assert.equal(denied.status, 401);
  const added = await local.call('/api/v1/subaccounts/demo/contacts', { name: 'From API' }, { Authorization: `Bearer ${secret}` });
  assert.equal(added.status, 201);
});

test('Account users only reach their sub-accounts and permitted modules; agency users cannot change settings', async t => {
  const local = await start(); t.after(local.close);
  const other = (await local.call('/api/agency/accounts', { name: 'Other client' })).body.result;
  const user = await action(local, { type: 'save', key: 'users', data: { first: 'Ana', last: 'Lima', email: 'ana@example.test', role: 'Account User', accounts: ['demo'], permissions: ['contacts'] } });
  const userId = user.body.result;
  const as = { 'X-Go-User': userId };
  assert.equal((await local.call(`/api/state?workspace=${other}`, undefined, as)).status, 403);
  const own = await local.call('/api/state?workspace=demo', undefined, as);
  assert.deepEqual(own.body.workspaces.map(w => w.id), ['demo']);
  assert.equal((await local.call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Allowed' } }, as)).status, 200);
  assert.equal((await local.call('/api/action?workspace=demo', { type: 'save', key: 'invoices', data: {} }, as)).status, 403);
  assert.equal((await local.call('/api/agency', undefined, as)).status, 403);

  const staff = (await action(local, { type: 'save', key: 'users', data: { first: 'Bia', last: 'Reis', email: 'bia@example.test', role: 'Agency User' } })).body.result;
  assert.equal((await local.call('/api/agency', undefined, { 'X-Go-User': staff })).status, 200);
  assert.equal((await action(local, { type: 'api-key', data: { name: 'x' } }, { 'X-Go-User': staff })).status, 403);
  const log = (await local.call('/api/agency')).body.agency.audit;
  assert.ok(log.some(entry => entry.actor === 'Ana Lima' && entry.action === 'Saved contacts'));
});

test('Reselling, plans, affiliate payouts and announcements feed the dashboard and sub-accounts', async t => {
  const local = await start(); t.after(local.close);
  const plan = (await action(local, { type: 'save', key: 'plans', data: { name: 'Growth', price: 199 } })).body.result;
  await action(local, { type: 'account-meta', id: 'demo', data: { status: 'Active', plan } });
  assert.equal((await action(local, { type: 'resell', id: 'listings', data: { price: 10, enabled: ['demo'] } })).status, 400);
  const resold = await action(local, { type: 'resell', id: 'listings', data: { price: 45, enabled: [] } });
  assert.deepEqual(resold.body.agency.reselling.listings.disabled, ['demo']);
  assert.equal(resold.body.overview.totals.mrr, 199);

  assert.equal((await action(local, { type: 'affiliate-accept', data: { agree: true } })).status, 400);
  for (const step of ['policy', 'video', 'toolkit', 'flowchart']) await action(local, { type: 'affiliate-step', data: { step } });
  assert.equal((await action(local, { type: 'affiliate-accept', data: { agree: true } })).status, 200);
  await action(local, { type: 'save', key: 'referrals', data: { name: 'Shop', plan: 'Starter', amount: 100, status: 'Active' } });
  const paid = await action(local, { type: 'affiliate-pay' });
  assert.equal(paid.body.result, 40);
  assert.equal((await action(local, { type: 'affiliate-pay' })).status, 400);

  await action(local, { type: 'save', key: 'announcements', data: { title: 'Maintenance', body: 'Tonight', tone: 'Warning', published: true } });
  await action(local, { type: 'save', key: 'menuLinks', data: { title: 'Help desk', url: 'https://help.example.test/', icon: 'help', openIn: 'New tab', showOn: 'Sub-accounts' } });
  const seen = (await local.call('/api/state?workspace=demo')).body.agency;
  assert.equal(seen.announcements[0].title, 'Maintenance');
  assert.equal(seen.menuLinks[0].url, 'https://help.example.test/');

  const install = await local.call('/api/agency/template-install', { template: 'tpl-dental', workspace: 'demo' });
  assert.equal(install.status, 200);
  const pages = (await local.call('/api/state?workspace=demo')).body.state.pages;
  assert.equal(pages[0].name, 'Dental Clinic');
  assert.ok(pages[0].formId);
});
