import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { useAdsFetch } from '../ads-providers.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function run(config, attribution) {
  const s = blank();
  const id = save(s, 'workflows', { name: 'Google', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'fechou' } }], steps: [{ type: 'google_ads_conversion', config }] });
  const contactId = save(s, 'contacts', { name: 'Ana Lima', email: 'Ana@X.test', phone: '(81) 99999-0000', tags: [], custom: {} });
  const contact = s.contacts.find(row => row.id === contactId);
  if (attribution) contact.attribution = attribution;
  save(s, 'contacts', { ...contact, tags: ['fechou'] }, contactId);
  return { results: s.runs.find(row => row.workflowId === id).results.join(' '), item: (s.workflowOutbox || []).find(row => row.kind === 'google-ads-conversion') };
}

test('T.1 Google Ads conversion: the click comes from the attribution; e-mail and phone only when chosen, hashed', () => {
  const withClick = run({ actionId: '6543210987', value: '1.500,00', currency: 'BRL' }, { first: { gclid: 'OLD' }, last: { gclid: 'G-LAST' } });
  assert.deepEqual([withClick.item.gclid, withClick.item.actionId, withClick.item.value, withClick.item.email, withClick.item.phone], ['G-LAST', '6543210987', 1500, '', '']);
  const firstOnly = run({ actionId: '1234' }, { first: { gclid: 'G-FIRST' }, last: { gclid: '' } });
  assert.equal(firstOnly.item.gclid, 'G-FIRST');
  assert.match(run({ actionId: '1234' }).results, /sem clique do Google Ads/, 'no click and no identifiers: nothing to send');
  const enhanced = run({ actionId: '1234', identifiers: 'yes' });
  assert.deepEqual([enhanced.item.gclid, enhanced.item.email, enhanced.item.phone], ['', sha('ana@x.test'), sha('+5581999990000')]);
  assert.match(enhanced.results, /pelos dados do contato/);
});

test('T.1 Google Ads conversion through the server: uploaded to the chosen account with the developer token', async t => {
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', GOOGLE_ADS_DEVELOPER_TOKEN: 'DEVTOKEN' });
  t.after(() => { for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN']) delete process.env[key]; });
  const uploads = [], devTokens = new Set();
  useAdsFetch(async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'oauth2.googleapis.com') return reply({ access_token: 'gtoken', refresh_token: 'grefresh', expires_in: 3600 });
    if (u.hostname === 'openidconnect.googleapis.com') return reply({ email: 'ana@agencia.test' });
    devTokens.add(init.headers?.['developer-token']);
    if (u.pathname.endsWith('/customers:listAccessibleCustomers')) return reply({ resourceNames: ['customers/1112223333'] });
    if (u.pathname.endsWith('/googleAds:searchStream')) {
      const query = JSON.parse(init.body || '{}').query || '';
      return reply(/FROM customer/.test(query) ? [{ results: [{ customer: { id: '1112223333', descriptiveName: 'Loja Google', currencyCode: 'BRL', manager: false } }] }] : [{ results: [] }]);
    }
    if (u.pathname.endsWith('/customers/1112223333:uploadClickConversions')) { uploads.push(JSON.parse(init.body)); return reply({ results: [{ conversionAction: 'customers/1112223333/conversionActions/6543210987' }] }); }
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  t.after(() => useAdsFetch((...a) => fetch(...a)));
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

  const go = await fetch(`${base}/api/ads/workspace/connect?workspace=demo&network=google`, { redirect: 'manual' });
  await fetch(`${base}/api/ads/callback?state=${new URL(go.headers.get('location')).searchParams.get('state')}&code=abc`);
  const chosen = await post('/api/ads/workspace/select?workspace=demo', { network: 'google', accountId: '1112223333' });
  assert.equal(chosen.state?.adSettings?.connected?.google, true, JSON.stringify(chosen).slice(0, 300));
  await post('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Venda para o Google', active: true, triggers: [{ type: 'contact_created' }],
    steps: [{ type: 'google_ads_conversion', config: { actionId: '6543210987', value: '99,90', identifiers: 'yes' } }] } });
  await post('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Bia', email: 'Bia.Google@x.test', tags: [], custom: {} } });
  let runRow;
  for (let i = 0; i < 50 && !(runRow?.results || []).some(line => /^Google Ads: /.test(line)); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    runRow = (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state.runs.find(row => row.name === 'Venda para o Google');
  }
  assert.deepEqual([...devTokens], ['DEVTOKEN'], 'every Google Ads API call carries the developer token');
  const [upload] = uploads;
  assert.equal(upload.partialFailure, true);
  const conversion = upload.conversions[0];
  assert.equal(conversion.conversionAction, 'customers/1112223333/conversionActions/6543210987');
  assert.match(conversion.conversionDateTime, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00:00$/);
  assert.deepEqual([conversion.conversionValue, conversion.currencyCode, conversion.gclid], [99.9, 'BRL', undefined]);
  assert.deepEqual(conversion.userIdentifiers, [{ hashedEmail: sha('bia.google@x.test') }]);
  assert.ok(runRow.results.includes('Google Ads: conversão registrada em Loja Google'), runRow.results.join(' | '));
});
