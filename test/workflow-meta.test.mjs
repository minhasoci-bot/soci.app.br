import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { useAdsFetch } from '../ads-providers.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function run(steps, contact = {}, pixel = '123456789012') {
  const s = blank();
  s.tracking = { ...(s.tracking || {}), metaPixel: pixel };
  const id = save(s, 'workflows', { name: 'Meta', active: true, triggers: [{ type: 'contact_created' }], steps });
  const contactId = save(s, 'contacts', { name: 'Ana Maria Lima', email: ' Ana@X.test ', phone: '(81) 99999-0000', tags: [], custom: {}, ...contact });
  return { s, contactId, run: s.runs.find(row => row.workflowId === id), outbox: s.workflowOutbox || [] };
}

test('T.1 Meta conversion: the event carries only hashed, normalized contact data, the value and a dedupe id', () => {
  const { contactId, run: r, outbox } = run([{ type: 'meta_conversion', config: { event: 'Purchase', value: 'R$ 1.234,56', currency: 'BRL', testCode: 'TEST1' } }]);
  const item = outbox.find(row => row.kind === 'meta-capi');
  assert.equal(item.pixel, '123456789012');
  assert.equal(item.testCode, 'TEST1');
  const { event } = item;
  assert.equal(event.event_name, 'Purchase');
  assert.equal(event.action_source, 'system_generated');
  assert.match(event.event_id, new RegExp(`^${r.id}:`));
  assert.deepEqual(event.custom_data, { value: 1234.56, currency: 'BRL' });
  assert.deepEqual(event.user_data, { em: [sha('ana@x.test')], ph: [sha('5581999990000')], fn: [sha('ana')], ln: [sha('lima')], external_id: [sha(contactId)] });
  assert.doesNotMatch(JSON.stringify(item), /ana@x|99999|Lima/i, 'nothing in clear text');
});

test('T.1 Meta conversion and audience: custom event names, missing pixel, contact without e-mail or phone', () => {
  const custom = run([{ type: 'meta_conversion', config: { event: 'custom', customEvent: 'lead qualificado!' } }]);
  assert.equal(custom.outbox.find(row => row.kind === 'meta-capi').event.event_name, 'lead_qualificado_');
  assert.equal(custom.outbox.find(row => row.kind === 'meta-capi').event.custom_data, undefined, 'no value, no custom data');
  assert.match(run([{ type: 'meta_conversion', config: { event: 'Lead' } }], {}, '').run.results.join(' '), /configure o Pixel da Meta/);
  assert.match(run([{ type: 'meta_conversion', config: { event: 'Lead' } }], { email: '', phone: '' }).run.results.join(' '), /sem e-mail nem telefone/);
  const audience = run([{ type: 'meta_audience', config: { op: 'remove', audienceId: '238 5123 4567' } }], { phone: '' });
  const item = audience.outbox.find(row => row.kind === 'meta-audience');
  assert.deepEqual([item.audience, item.remove, item.row], ['23851234567', true, [sha('ana@x.test'), '']], 'an empty phone stays empty, never the hash of nothing');
});

test('T.1 Meta through the server: the token of the Meta Ads connection sends the event and changes the audience', async t => {
  Object.assign(process.env, { META_APP_ID: 'app', META_APP_SECRET: 'secret' });
  t.after(() => { delete process.env.META_APP_ID; delete process.env.META_APP_SECRET; });
  const posted = [];
  useAdsFetch(async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/oauth/access_token')) return reply({ access_token: u.searchParams.get('fb_exchange_token') ? 'long' : 'short', expires_in: 5_000_000 });
    if (u.pathname.endsWith('/me')) return reply({ name: 'Ana Ads' });
    if (u.pathname.endsWith('/me/adaccounts')) return reply({ data: [{ id: 'act_1', name: 'Loja', currency: 'BRL', account_status: 1 }] });
    if (u.pathname.endsWith('/me/accounts')) return reply({ data: [] });
    if (/\/(events|users)$/.test(u.pathname)) posted.push({ path: u.pathname, method: init.method, auth: init.headers?.Authorization, body: JSON.parse(init.body || '{}') });
    if (u.pathname.endsWith('/act_1/campaigns') || u.pathname.endsWith('/act_1/insights')) return reply({ data: [] });
    if (u.pathname.endsWith('/123456789012/events')) return reply({ events_received: 1, fbtrace_id: 'x' });
    if (u.pathname.endsWith('/23851234567/users')) return reply({ audience_id: '23851234567', num_received: 1, num_invalid_entries: 0 });
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  t.after(() => useAdsFetch((...a) => fetch(...a)));
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = async command => (await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })).json();

  await action({ type: 'tracking-settings', data: { metaPixel: '123456789012' } });
  await action({ type: 'save', key: 'workflows', data: { name: 'Lead para a Meta', active: true, triggers: [{ type: 'contact_created' }], steps: [
    { type: 'meta_conversion', config: { event: 'Lead' } }, { type: 'meta_audience', config: { op: 'add', audienceId: '23851234567' } }] } });
  const created = async () => {
    await action({ type: 'save', key: 'contacts', data: { name: 'Carla', email: 'carla.meta@x.test', tags: [], custom: {} } });
    let row;
    for (let i = 0; i < 50 && (row?.results || []).filter(line => /^Meta: /.test(line)).length < 2; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      row = (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state.runs.find(r => r.name === 'Lead para a Meta');
    }
    return row;
  };
  const before = await created();
  assert.match(before.results.join(' '), /Meta: erro: conecte o Meta Ads/, 'without the connection the step says what to do');

  const go = await fetch(`${base}/api/ads/workspace/connect?workspace=demo&network=meta`, { redirect: 'manual' });
  await fetch(`${base}/api/ads/callback?state=${new URL(go.headers.get('location')).searchParams.get('state')}&code=abc`);
  await action({ type: 'save', key: 'contacts', data: { name: 'Bia', email: 'bia.meta@x.test', tags: [], custom: {} } });
  let runs = [];
  for (let i = 0; i < 50 && posted.length < 2; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    runs = (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state.runs.filter(r => r.name === 'Lead para a Meta');
  }
  const [events, audience] = posted;
  assert.equal(events.auth, 'Bearer long');
  assert.equal(events.body.data[0].event_name, 'Lead');
  assert.deepEqual(events.body.data[0].user_data.em, [sha('bia.meta@x.test')]);
  assert.equal(audience.method, 'POST');
  assert.deepEqual(audience.body.payload, { schema: ['EMAIL_SHA256', 'PHONE_SHA256'], data: [[sha('bia.meta@x.test'), '']] });
  runs = (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state.runs.filter(r => r.name === 'Lead para a Meta');
  const last = runs.find(r => r.results.some(line => /recebido pela Meta/.test(line)));
  assert.ok(last, 'the run shows that Meta received the event');
  assert.ok(last.results.some(line => /incluído no público 23851234567/.test(line)));
});
