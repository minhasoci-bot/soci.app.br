import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { couponStatus, forecast } from '../ui/crm-data.js';

async function start() {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const workspace = (await call('/api/workspaces', { name: 'CRM test' })).body.id;
  const act = command => call(`/api/action?workspace=${workspace}`, command);
  const save = (key, data, id = '') => act({ type: 'save', key, id, data });
  const state = async () => (await call(`/api/state?workspace=${workspace}`)).body;
  return { act, save, state, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Custom fields validate the values stored on contacts, opportunities and companies', async t => {
  const local = await start(); t.after(local.close);
  assert.equal((await local.save('customFields', { name: 'Plan', object: 'Contact', type: 'Dropdown (single)', options: '' })).status, 400);
  const plan = (await local.save('customFields', { name: 'Plan', object: 'Contact', type: 'Dropdown (single)', options: 'Basic\nPro' })).body.id;
  const seats = (await local.save('customFields', { name: 'Seats', object: 'Contact', type: 'Number' })).body.id;
  assert.equal((await local.save('customFields', { name: 'plan', object: 'Contact', type: 'Single line' })).status, 400, 'same key per object is refused');
  assert.equal((await local.save('customFields', { name: 'Plan', object: 'Company', type: 'Single line' })).status, 200, 'the same name on another object is fine');

  assert.equal((await local.save('contacts', { name: 'Ana', [`cf_${plan}`]: 'Enterprise' })).status, 400);
  assert.equal((await local.save('contacts', { name: 'Ana', [`cf_${seats}`]: 'many' })).status, 400);
  const ana = (await local.save('contacts', { name: 'Ana', [`cf_${plan}`]: 'Pro', [`cf_${seats}`]: '12', cf_unknown: 'x' })).body.id;
  let s = (await local.state()).state;
  assert.deepEqual(s.contacts.find(c => c.id === ana).custom, { [plan]: 'Pro', [seats]: 12 });
  assert.equal(s.customFields.find(f => f.id === plan).key, 'contact.plan');

  // Deleting a field removes its values from the records.
  await local.act({ type: 'delete', key: 'customFields', id: seats });
  s = (await local.state()).state;
  assert.deepEqual(s.contacts.find(c => c.id === ana).custom, { [plan]: 'Pro' });
});

test('Tags and companies keep contacts in sync when renamed or deleted', async t => {
  const local = await start(); t.after(local.close);
  const vip = (await local.save('tags', { name: 'VIP' })).body.id;
  assert.equal((await local.save('tags', { name: 'vip' })).status, 400);
  const acme = (await local.save('companies', { name: 'Acme', website: 'acme.example' })).body.id;
  await local.save('contacts', { name: 'Bia', tags: 'VIP, Lead', company: 'acme' });
  await local.save('tags', { name: 'Gold' }, vip);
  await local.save('companies', { name: 'Acme Inc' }, acme);
  let s = (await local.state()).state;
  assert.deepEqual(s.contacts[0].tags, ['Gold', 'Lead']);
  assert.equal(s.contacts[0].company, 'Acme Inc');
  assert.equal(s.companies[0].website, '');
  await local.act({ type: 'delete', key: 'tags', id: vip });
  s = (await local.state()).state;
  assert.deepEqual(s.contacts[0].tags, ['Lead']);
});

test('Payments: recurring products, a paid invoice books one transaction, coupons and product deletes are guarded', async t => {
  const local = await start(); t.after(local.close);
  const contact = (await local.save('contacts', { name: 'Caio' })).body.id;
  const once = (await local.save('products', { name: 'Setup', price: 500, kind: 'One time', active: true })).body.id;
  const monthly = (await local.save('products', { name: 'Care plan', price: 99.9, kind: 'Recurring', interval: 'Monthly', active: true })).body.id;
  assert.equal((await local.save('subscriptions', { contactId: contact, productId: once, start: '2026-11-01' })).status, 400);
  assert.equal((await local.save('subscriptions', { contactId: contact, productId: monthly, start: '2026-11-01' })).status, 200);
  assert.equal((await local.save('paymentLinks', { name: 'Setup link', productId: once, active: true })).status, 200);
  assert.equal((await local.act({ type: 'delete', key: 'products', id: monthly })).status, 409);

  const invoice = (await local.save('invoices', { title: 'Nov', contactId: contact, value: 250, due: '2026-11-30', status: 'Open' })).body.id;
  await local.save('invoices', { title: 'Nov', contactId: contact, value: 250, due: '2026-11-30', status: 'Paid' }, invoice);
  await local.save('invoices', { title: 'Nov (edited)', contactId: contact, value: 250, due: '2026-11-30', status: 'Paid' }, invoice);
  const { state: s } = await local.state();
  assert.equal(s.transactions.length, 1);
  assert.equal(s.transactions[0].amount, 250);
  assert.equal(s.transactions[0].source, 'Invoice');

  assert.equal((await local.save('coupons', { name: 'Big', code: 'BIG', kind: 'Percent', amount: 150 })).status, 400);
  assert.equal((await local.save('coupons', { name: 'Ten', code: 'ten-off', kind: 'Percent', amount: 10, active: true })).body.id.length > 0, true);
  assert.equal((await local.save('coupons', { name: 'Again', code: 'TEN-OFF', kind: 'Fixed', amount: 5 })).status, 400);
  const at = Date.parse('2026-11-17T12:00:00Z');
  assert.equal(couponStatus({ active: true, start: '2026-12-01', end: '' }, at), 'Scheduled');
  assert.equal(couponStatus({ active: true, start: '', end: '2026-11-16' }, at), 'Expired');
  assert.equal(couponStatus({ active: true, start: '', end: '2026-11-17' }, at), 'Active');
  assert.equal(couponStatus({ active: false }, at), 'Inactive');
});

test('Bulk actions apply per record, log the result, run stage triggers and reach the sub-account audit log', async t => {
  const local = await start(); t.after(local.close);
  const ids = [];
  for (const name of ['A', 'B', 'C']) ids.push((await local.save('contacts', { name, tags: 'Old' })).body.id);
  await local.save('workflows', { name: 'Stage watcher', trigger: 'Opportunity stage changed', active: true, actions: [{ type: 'Create task', value: 'Call after move' }] });
  const deal = (await local.save('opportunities', { title: 'Deal', contactId: ids[0], stage: 'new', value: 100 })).body.id;

  let r = await local.act({ type: 'bulk', data: { object: 'contacts', ids: [ids[0], ids[1], 'missing'], operation: 'add-tag', value: 'Hot' } });
  assert.equal(r.status, 200);
  const log = r.body.state.bulkActions.at(-1);
  assert.deepEqual([log.done, log.failed, log.status], [2, 1, 'Partially completed']);
  assert.deepEqual(r.body.state.contacts.find(c => c.id === ids[0]).tags, ['Old', 'Hot']);
  assert.equal((await local.act({ type: 'bulk', data: { object: 'contacts', ids, operation: 'add-tag', value: '' } })).status, 400);

  r = await local.act({ type: 'bulk', data: { object: 'opportunities', ids: [deal], operation: 'move-stage', value: 'proposal' } });
  assert.equal(r.body.state.opportunities[0].stage, 'proposal');
  assert.ok(r.body.state.tasks.some(task => task.title === 'Call after move'));

  r = await local.act({ type: 'bulk', data: { object: 'contacts', ids: [ids[2]], operation: 'delete' } });
  assert.equal(r.body.state.contacts.length, 2);
  const view = await local.state();
  assert.ok(view.audit.some(a => a.action === 'Bulk add-tag on contacts'));
  assert.ok(view.audit.some(a => a.action === 'Bulk delete on contacts'));
});

test('Forecast uses opportunity or stage probability and flags slipped, late and incomplete deals', () => {
  const s = blank();
  const add = (key, data) => execute(s, { type: 'save', key, data });
  execute(s, { type: 'stage', id: 'proposal', data: { name: 'Proposal', probability: 50 } });
  const contactId = add('contacts', { name: 'Dora' });
  const a = add('opportunities', { title: 'A', contactId, stage: 'proposal', value: 1000, closeDate: '2026-12-10' });
  add('opportunities', { title: 'B', contactId, stage: 'new', value: 400, probability: 25, closeDate: '2026-12-20' });
  add('opportunities', { title: 'C', contactId, stage: 'new', value: 300 });
  add('opportunities', { title: 'D', contactId, stage: 'won', value: 900, status: 'Won' });
  // Pushing the close date later counts as a slip.
  execute(s, { type: 'save', key: 'opportunities', id: a, data: { title: 'A', contactId, stage: 'proposal', value: 1000, closeDate: '2026-12-31' } });
  execute(s, { type: 'save', key: 'opportunities', id: a, data: { title: 'A', contactId, stage: 'proposal', value: 1000, closeDate: '2027-01-15' } });
  const f = forecast(s, { at: Date.parse('2026-11-17T12:00:00Z') });
  assert.equal(f.potential, 1700);
  assert.equal(f.expected, 600);
  assert.equal(f.won, 900);
  assert.deepEqual(f.timeline.map(m => [m.month, m.count]), [['2026-12', 1], ['2027-01', 1]]);
  assert.deepEqual(f.risk.High.map(x => x.deal.title), ['A']);
  assert.deepEqual(f.missingClose.map(d => d.title), ['C']);
  assert.deepEqual(f.missingChance.map(d => d.title), ['C']);
  assert.throws(() => execute(s, { type: 'save', key: 'opportunities', data: { title: 'E', contactId, stage: 'new', probability: 140 } }), /Probability/);
});

test('CSV import keeps a history and bulk logs cannot be written directly', async t => {
  const local = await start(); t.after(local.close);
  await local.act({ type: 'import', data: { file: 'leads.csv', rows: [{ name: 'One', email: 'one@example.test' }, { name: 'Two', email: 'one@example.test' }] } });
  const { state: s } = await local.state();
  assert.deepEqual([s.imports[0].file, s.imports[0].found, s.imports[0].added, s.imports[0].skipped], ['leads.csv', 2, 1, 1]);
  assert.equal((await local.save('bulkActions', { label: 'fake' })).status, 400);
});
