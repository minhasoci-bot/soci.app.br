import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank } from '../model.mjs';
import { blankAgency, executeAgency } from '../agency-model.mjs';
import { brandGroupCsv, brandGroupData, brandGroupHtml } from '../ui/brand-group-data.js';

const DAY = 86_400_000, NOW = Date.parse('2026-11-20T12:00:00Z');
const ago = days => new Date(NOW - days * DAY).toISOString();

async function start() {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, body: json, text, csp: r.headers.get('content-security-policy') };
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)) };
}

function brand(name, currency = 'BRL') {
  const s = blank();
  s.profile.name = name; s.profile.currency = currency;
  return s;
}

test('A brand group consolidates the period, compares it with the one before and keeps currencies apart', () => {
  const sol = brand('Padaria Sol'), lua = brand('Café Lua'), mx = brand('Pan MX', 'MXN');
  sol.socialPosts.push({ status: 'published', publishedAt: ago(2) }, { status: 'published', publishedAt: ago(10) }, { status: 'published', publishedAt: ago(40) },
    { status: 'scheduled', scheduleDate: ago(-2) }, { status: 'in_review' }, { status: 'failed', publishedAt: ago(1) });
  sol.socialAccounts.push({ status: 'connected' }, { status: 'expired' });
  sol.contacts.push({ created: ago(3) }, { created: ago(45) });
  sol.messages.push({ direction: 'Inbound', created: ago(1) }, { direction: 'Outbound', created: ago(1) });
  sol.opportunities.push({ status: 'Won', value: 1000, closeDate: ago(5).slice(0, 10) }, { status: 'Open', value: 300 });
  sol.invoices.push({ status: 'Paid', value: 200, updated: ago(4) }, { status: 'Open', value: 999, updated: ago(4) });
  lua.socialPosts.push({ status: 'published', publishedAt: ago(1) });
  mx.invoices.push({ status: 'Paid', value: 50, updated: ago(2) });

  const group = { name: 'Rede Sol', period: '30', accountIds: ['sol', 'lua', 'mx', 'gone'] };
  const data = brandGroupData(group, [{ id: 'sol', name: 'Padaria Sol', state: sol }, { id: 'lua', name: 'Café Lua', state: lua }, { id: 'mx', name: 'Pan MX', state: mx }], NOW);
  assert.equal(data.missing, 1, 'a sub-account no longer available is only counted');
  assert.deepEqual(data.brands.map(b => b.name), ['Padaria Sol', 'Café Lua', 'Pan MX'], 'brands rank by posts published');
  assert.deepEqual(data.totals, { published: 3, scheduled: 1, review: 1, failed: 1, networks: 1, contacts: 1, inbound: 1 });
  assert.equal(data.previous.published, 1, 'the post 40 days ago belongs to the previous period');
  assert.equal(data.previous.contacts, 1);
  assert.deepEqual(data.money.wonValue, { BRL: 1000, MXN: 0 });
  assert.deepEqual(data.money.paid, { BRL: 200, MXN: 50 }, 'money in different currencies is not added together');
  assert.deepEqual(data.money.openValue, { BRL: 300, MXN: 0 });

  const html = brandGroupHtml(data);
  assert.match(html, /Padaria Sol/);
  assert.match(html, /\+200% vs\. período anterior/, 'published posts went from 1 to 3');
  assert.match(html, /1 subconta do grupo não está mais disponível/);
  assert.match(brandGroupHtml(data, { lang: 'es' }), /Publicaciones publicadas/);
  assert.doesNotMatch(brandGroupHtml({ ...data, brands: [{ ...data.brands[0], name: '<img src=x onerror=alert(1)>' }] }), /<img src=x/, 'brand names are escaped');
  const csv = brandGroupCsv({ ...data, brands: [{ ...data.brands[0], name: '=HYPERLINK("x")' }] });
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/, 'spreadsheet formulas are neutralised');
});

test('Brand groups only use the agency sub-accounts and their link can be renewed or revoked', () => {
  const agency = blankAgency(), options = { accountIds: ['a', 'b'], actor: 'Dona' };
  assert.throws(() => executeAgency(agency, { type: 'brand-group-save', data: { name: 'Rede', accountIds: ['a', 'z'] } }, options), /não existe mais/);
  assert.throws(() => executeAgency(agency, { type: 'brand-group-save', data: { name: 'Rede', accountIds: [] } }, options), /ao menos uma subconta/);
  assert.throws(() => executeAgency(agency, { type: 'brand-group-save', data: { name: '', accountIds: ['a'] } }, options), /nome do grupo/);
  const id = executeAgency(agency, { type: 'brand-group-save', data: { name: 'Rede', accountIds: ['a', 'b', 'a'], period: '999' } }, options);
  assert.deepEqual(agency.brandGroups[0], { ...agency.brandGroups[0], name: 'Rede', accountIds: ['a', 'b'], period: '30' });
  assert.throws(() => executeAgency(agency, { type: 'brand-group-share', id, data: { action: 'create', days: 2 } }, options), /validade/);
  executeAgency(agency, { type: 'brand-group-share', id, data: { action: 'create', days: 7, lang: 'es' } }, options);
  const first = agency.brandGroups[0].share;
  assert.match(first.id, /^[0-9a-f]{64}$/);
  executeAgency(agency, { type: 'brand-group-share', id, data: { action: 'create', days: 0 } }, options);
  assert.notEqual(agency.brandGroups[0].share.id, first.id);
  executeAgency(agency, { type: 'brand-group-share', id, data: { action: 'revoke' } }, options);
  assert.equal(agency.brandGroups[0].share, undefined);
  assert.ok(agency.audit.some(row => row.action === 'Brand group created'), 'changes are audited');
});

test('The agency opens a brand group report and shares it by a public link without exposing ids', async t => {
  const local = await start(); t.after(local.close);
  const make = async name => (await local.call('/api/workspaces', { name })).body.id;
  const [sol, lua] = [await make('Padaria Sol'), await make('Café Lua')];
  await local.call(`/api/action?workspace=${sol}`, { type: 'save', key: 'contacts', data: { name: 'Cliente Novo', email: 'novo@cliente.com' } });

  const created = await local.call('/api/agency/action', { type: 'brand-group-save', data: { name: 'Rede Sol & Lua', accountIds: [sol, lua], period: '7' } });
  const id = created.body.result;
  const report = (await local.call('/api/agency/brand-group-report', { id })).body.result;
  assert.deepEqual(report.brands.map(b => b.name).sort(), ['Café Lua', 'Padaria Sol']);
  assert.equal(report.totals.contacts, 1);
  assert.equal((await local.call('/api/agency/brand-group-report', { id: 'nope' })).status, 404);

  await local.call('/api/agency/action', { type: 'brand-group-share', id, data: { action: 'create', days: 30 } });
  const token = (await local.call('/api/agency')).body.agency.brandGroups.find(g => g.id === id).share.id;
  const page = await local.call(`/marcas/${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Rede Sol &amp; Lua/);
  assert.match(page.text, /Padaria Sol/);
  assert.doesNotMatch(page.text, /<script/i);
  assert.doesNotMatch(page.text, new RegExp(`${sol}|${lua}|novo@cliente\\.com`), 'sub-account ids and contacts stay private');
  assert.match(page.csp, /default-src 'none'/);
  assert.match((await local.call(`/marcas/${token}?lang=es`)).text, /Nuevos contactos/);
  assert.equal((await local.call(`/marcas/${'0'.repeat(64)}`)).status, 404);

  await local.call('/api/agency/action', { type: 'brand-group-share', id, data: { action: 'revoke' } });
  assert.equal((await local.call(`/marcas/${token}`)).status, 404);
  await local.call('/api/agency/action', { type: 'brand-group-delete', id });
  assert.equal((await local.call('/api/agency')).body.agency.brandGroups.length, 0);
});
