import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank, execute } from '../model.mjs';
import { seal } from '../social-providers.mjs';
import { googleLeadFields, metaLeadFields } from '../lead-forms.mjs';
import { metaLeads } from '../meta-messaging.mjs';
import { triggerSpec } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const lead = (overrides = {}) => ({ network: 'google', leadId: 'L-1', formId: '555', campaignId: '777', campaign: '777', test: false,
  fields: { FULL_NAME: 'Carla Dias', EMAIL: 'Carla@Example.test', PHONE_NUMBER: '+55 11 98888-7777', 'Qual o melhor horário?': 'Manhã' }, ...overrides });

test('The answers of Google and Meta leads, and the Lead Ads events of a page webhook', () => {
  assert.deepEqual(googleLeadFields({ user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Carla' }, { column_name: 'Cidade', string_value: 'BH' }, { string_value: 'sem nome' }] }),
    { FULL_NAME: 'Carla', Cidade: 'BH' });
  assert.deepEqual(metaLeadFields({ field_data: [{ name: 'email', values: ['a@b.test'] }, { name: 'interesses', values: ['A', 'B'] }] }), { email: 'a@b.test', interesses: 'A, B' });
  assert.deepEqual(metaLeads({ object: 'page', entry: [{ id: '111', changes: [{ field: 'leadgen', value: { leadgen_id: '444', page_id: '111', form_id: '999', ad_id: '1' } }, { field: 'feed', value: {} }] }] }),
    [{ pageId: '111', leadgenId: '444', formId: '999', adId: '1' }]);
  assert.deepEqual(metaLeads({ object: 'instagram', entry: [] }), []);
  assert.deepEqual(triggerSpec('google_lead_form').fields.map(field => field.key), ['formId', 'campaign', 'test']);
  assert.deepEqual(triggerSpec('meta_lead_form').fields.map(field => field.key), ['formId', 'campaign', 'test']);
});

test('A lead becomes a contact with a note, once; a known phone updates the contact; filters pick form and test leads', () => {
  const s = blank('W');
  const any = save(s, 'workflows', { name: 'Qualquer', active: true, triggers: [{ type: 'google_lead_form', config: {} }], steps: [{ type: 'add_tag', config: { tag: 'veio-do-google' } }] });
  const real = save(s, 'workflows', { name: 'Reais do 555', active: true, triggers: [{ type: 'google_lead_form', config: { formId: '555', test: 'no' } }], steps: [{ type: 'add_tag', config: { tag: 'real' } }] });
  const meta = save(s, 'workflows', { name: 'Meta', active: true, triggers: [{ type: 'meta_lead_form', config: { formId: 'Orçamento' } }], steps: [{ type: 'add_tag', config: { tag: 'meta' } }] });

  const id = execute(s, { type: 'ad-form-lead', data: lead() });
  const carla = s.contacts.find(row => row.id === id);
  assert.deepEqual([carla.name, carla.email, carla.phone], ['Carla Dias', 'carla@example.test', '+55 11 98888-7777']);
  assert.ok(carla.tags.includes('Lead do Google Ads'));
  assert.match(s.messages.find(row => row.contactId === id && row.channel === 'Note').body, /Qual o melhor horário\?: Manhã/);
  assert.equal(execute(s, { type: 'ad-form-lead', data: lead() }), '', 'Google retrying the same lead adds nothing');
  assert.deepEqual([runsOf(s, any).length, runsOf(s, real).length], [1, 1]);

  execute(s, { type: 'ad-form-lead', data: lead({ leadId: 'L-2', test: true, fields: { FULL_NAME: 'Teste', EMAIL: 'teste@example.test' } }) });
  assert.deepEqual([runsOf(s, any).length, runsOf(s, real).length], [2, 1], 'test leads skip the "only real leads" flow');
  assert.ok(s.contacts.find(row => row.email === 'teste@example.test').tags.includes('Lead de teste'));

  const bia = save(s, 'contacts', { name: 'Bia', phone: '(11) 97777-6666', tags: [] });
  const same = execute(s, { type: 'ad-form-lead', data: { network: 'meta', leadId: '444', formId: '999', formName: 'Orçamento rápido', campaign: 'Verão', fields: { full_name: 'Beatriz', phone_number: '+5511977776666', email: 'bia@example.test' } } });
  assert.equal(same, bia, 'the phone (last digits) finds the contact');
  assert.equal(s.contacts.find(row => row.id === bia).email, 'bia@example.test', 'empty fields are filled');
  assert.equal(runsOf(s, meta).length, 1, 'the form filter matches part of the form name');
  assert.throws(() => execute(s, { type: 'ad-form-lead', data: lead({ leadId: 'L-3', fields: { cidade: 'BH' } }) }), /sem nome, e-mail ou telefone/);
});

test('Google posts leads to the sub-account URL with its key; Meta sends Lead Ads through the page webhook', async t => {
  const env = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = 'segredo-app';
  t.after(() => { process.env.META_APP_SECRET = env || ''; });
  const metaFetch = async url => {
    if (url.includes('/444?fields=field_data')) return new Response(JSON.stringify({ form_id: '999', campaign_name: 'Verão 2026', campaign_id: '321', is_organic: false,
      field_data: [{ name: 'full_name', values: ['Davi Rocha'] }, { name: 'email', values: ['davi@example.test'] }, { name: 'cidade', values: ['Recife'] }] }));
    if (url.includes('/999?fields=name')) return new Response(JSON.stringify({ name: 'Orçamento rápido' }));
    return new Response('{}');
  };
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, metaFetch });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  await state();
  const google = (await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Google', active: true, triggers: [{ type: 'google_lead_form', config: {} }], steps: [{ type: 'add_tag', config: { tag: 'lead-google' } }] } })).body.id;
  const facebook = (await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Facebook', active: true, triggers: [{ type: 'meta_lead_form', config: { formId: '999' } }], steps: [{ type: 'add_tag', config: { tag: 'lead-facebook' } }] } })).body.id;

  const url = '/api/google-leads/demo';
  const body = key => ({ lead_id: 'G-1', form_id: 555, campaign_id: 777, gcl_id: 'CLICK-123', is_test: false, google_key: key, api_version: '1.0',
    user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Elisa Prado' }, { column_id: 'EMAIL', string_value: 'elisa@example.test' }] });
  assert.equal((await call(url, body('qualquer'))).status, 403, 'no key generated yet');
  await call('/api/action?workspace=demo', { type: 'tracking-google-lead-key' });
  const key = (await state()).tracking.googleLeadKey;
  assert.match(key, /^[\w-]{24}$/);
  assert.equal((await call(url, body('errada'))).status, 403);
  assert.equal((await call(url, body(key))).status, 200);
  assert.equal((await call(url, body(key))).status, 200, 'a retried lead is accepted and ignored');
  let s = await state();
  const elisa = s.contacts.filter(row => row.email === 'elisa@example.test');
  assert.equal(elisa.length, 1);
  assert.equal(elisa[0].attribution.last.gclid, 'CLICK-123', 'the click goes to the attribution (used by the Google Ads conversion action)');
  assert.equal(elisa[0].attribution.last.channel, 'google_ads');
  assert.deepEqual(runsOf(s, google).map(run => run.contactId), [elisa[0].id]);
  assert.ok(elisa[0].tags.includes('lead-google'));

  store.change('demo', st => { st.socialAccounts.push({ id: 'acc-fb', provider: 'facebook', externalId: '111', name: 'Página', handle: '', status: 'connected' }); });
  store.insert('social-demo', { profile: { name: 'Social Planner' }, tokens: { 'acc-fb': seal({ token: 'PAGE-TOKEN' }) }, pending: {}, states: {} });
  store.insert('social-meta-routes', { profile: { name: 'Meta routes' }, routes: { 111: { workspace: 'demo', accountId: 'acc-fb', network: 'facebook' } } });
  const raw = JSON.stringify({ object: 'page', entry: [{ id: '111', time: 1, changes: [{ field: 'leadgen', value: { leadgen_id: '444', page_id: '111', form_id: '999', ad_id: '1' } }] }] });
  const posted = await fetch(`${base}/api/meta/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${createHmac('sha256', 'segredo-app').update(raw).digest('hex')}` }, body: raw });
  assert.equal(posted.status, 200);
  s = await state();
  const davi = s.contacts.find(row => row.email === 'davi@example.test');
  assert.equal(davi.name, 'Davi Rocha');
  assert.equal(davi.attribution.last.channel, 'meta_ads');
  assert.match(s.messages.find(row => row.contactId === davi.id && row.channel === 'Note').body, /Lead do Facebook · Orçamento rápido · campanha Verão 2026[\s\S]*cidade: Recife/);
  assert.deepEqual(runsOf(s, facebook).map(run => run.contactId), [davi.id]);
});
