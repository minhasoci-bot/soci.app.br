import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { blank, execute } from '../model.mjs';
import { blankAgency } from '../agency-model.mjs';
import { addInstall, installedCopy, marketplaceFor, publishStudioApp, saveStudioApp, setInstalledApp, deleteStudioApp } from '../app-studio-model.mjs';
import { makeServer } from '../server.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const crm = { name: 'CRM Externo', tagline: 'Leva os leads para o ERP', category: 'CRM', webhookUrl: 'https://apps.example.com/hook',
  events: ['contact_created', 'payment_received', 'nope'], scopes: ['contacts.read'], actions: 'Enviar lead: manda o contato para o ERP\nCriar pedido',
  triggers: 'Pedido pago', menuLabel: 'Abrir ERP', menuUrl: 'https://erp.example.com/?conta={{location.id}}' };

test('App Studio: validation, keys, publishing and what a sub-account sees', () => {
  const agency = blankAgency();
  const ctx = { accountIds: ['demo', 'outra'], actor: 'Dona' };
  assert.throws(() => saveStudioApp(agency, { data: { name: '' } }, ctx), /nome/);
  assert.throws(() => saveStudioApp(agency, { data: { name: 'X', events: ['contact_created'] } }, ctx), /webhook/);
  assert.throws(() => saveStudioApp(agency, { data: { name: 'X', webhookUrl: 'http://inseguro.com' } }, ctx), /https/);
  assert.throws(() => saveStudioApp(agency, { data: { name: 'X' } }, ctx), /precisa fazer algo/);
  assert.throws(() => saveStudioApp(agency, { data: { ...crm, actions: 'Enviar\nenviar' } }, ctx), /repetidas/);
  assert.throws(() => saveStudioApp(agency, { data: { ...crm, availability: 'chosen' } }, ctx), /subconta/);
  const app = saveStudioApp(agency, { data: crm }, ctx);
  assert.deepEqual(app.events, ['contact_created', 'payment_received'], 'unknown events are dropped');
  assert.deepEqual(app.actions.map(a => [a.key, a.label, a.description]), [['enviar-lead', 'Enviar lead', 'manda o contato para o ERP'], ['criar-pedido', 'Criar pedido', '']]);
  assert.equal(app.status, 'draft');
  assert.throws(() => saveStudioApp(agency, { data: { ...crm, tagline: 'outro' } }, ctx), /Já existe/);
  assert.deepEqual(marketplaceFor(agency, 'demo'), [], 'drafts stay out of the marketplace');
  assert.throws(() => addInstall(agency, app.id, 'demo'), err => err.status === 403);

  publishStudioApp(agency, app.id, true);
  const [entry] = marketplaceFor(agency, 'demo');
  assert.equal(entry.name, 'CRM Externo');
  assert.equal(entry.webhookUrl, undefined, 'the webhook address never reaches the sub-account');
  saveStudioApp(agency, { id: app.id, data: { ...crm, availability: 'chosen', accounts: ['outra'], actions: 'Criar pedido\nEnviar lead' } }, ctx);
  assert.deepEqual(marketplaceFor(agency, 'demo'), []);
  assert.deepEqual(agency.studioApps[0].actions.map(a => a.key), ['criar-pedido', 'enviar-lead'], 'keys stay when the list changes');
  const { install, token } = addInstall(agency, app.id, 'outra', 'Bia');
  assert.match(token, /^soci_app_[0-9a-f]{48}$/);
  assert.notEqual(install.tokenHash, token, 'only the hash is kept');
  assert.throws(() => addInstall(agency, app.id, 'outra'), err => err.status === 409);
  assert.equal(marketplaceFor(agency, 'outra')[0].installed, true);
  assert.throws(() => deleteStudioApp(agency, app.id), err => err.status === 409);
});

test('Installed app in the sub-account: events queued, workflow action and trigger', () => {
  const agency = blankAgency();
  const app = publishStudioApp(agency, saveStudioApp(agency, { data: crm }, { accountIds: ['demo'] }).id, true);
  const { install } = addInstall(agency, app.id, 'demo');
  const s = blank();
  setInstalledApp(s, installedCopy(app, install));
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [] });
  const queued = s.workflowOutbox.filter(item => item.kind === 'app');
  assert.equal(queued.length, 1);
  assert.deepEqual([queued[0].appId, queued[0].body.event, queued[0].body.contact.email], [app.id, 'contact_created', 'ana@x.test']);
  save(s, 'contacts', { ...s.contacts.find(c => c.id === ana), tags: ['vip'] }, ana);
  assert.equal(s.workflowOutbox.filter(item => item.kind === 'app').length, 1, 'contact_tag is not subscribed');

  s.workflowOutbox = [];
  const flow = save(s, 'workflows', { name: 'Para o ERP', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'cliente' } }],
    steps: [{ type: 'app_action', config: { action: `${app.id}:enviar-lead`, data: 'Lead {{contact.first_name}}' } }] });
  save(s, 'contacts', { ...s.contacts.find(c => c.id === ana), tags: ['vip', 'cliente'] }, ana);
  const run = s.runs.find(r => r.workflowId === flow);
  assert.match(run.results.join(' '), /CRM Externo · Enviar lead: na fila/);
  const action = s.workflowOutbox.find(item => item.kind === 'app' && item.body.type === 'action');
  assert.deepEqual([action.body.action, action.body.data, action.body.contact.name, action.runId], ['enviar-lead', 'Lead Ana', 'Ana', run.id]);

  const fired = save(s, 'workflows', { name: 'Pedido pago', active: true, triggers: [{ type: 'app_trigger', config: { trigger: `${app.id}:pedido-pago` } }],
    steps: [{ type: 'internal_notification', config: { body: 'Pago' } }] });
  assert.throws(() => execute(s, { type: 'app-trigger', data: { appId: app.id, key: 'outro' } }), err => err.status === 404 && /pedido-pago/.test(err.message));
  const out = execute(s, { type: 'app-trigger', data: { appId: app.id, key: 'pedido-pago', contact: { name: 'Caio', email: 'caio@x.test' }, payload: { pedido: 42 } } });
  const caio = s.contacts.find(c => c.id === out.contactId);
  assert.deepEqual([caio.name, caio.source], ['Caio', 'CRM Externo']);
  const triggered = s.runs.find(r => r.workflowId === fired);
  assert.equal(triggered.contactId, caio.id);
  assert.equal(s.appLog[0].text, 'Gatilho recebido: Pedido pago · Caio');
  execute(s, { type: 'app-trigger', data: { appId: app.id, key: 'pedido-pago', contact: { email: 'CAIO@x.test' } } });
  assert.equal(s.contacts.filter(c => c.email === 'caio@x.test').length, 1, 'the contact is found again by e-mail');
  assert.equal(s.runs.filter(r => r.workflowId === fired).length, 2);

  execute(s, { type: 'app-removed', data: { appId: app.id } });
  s.workflowOutbox = [];
  save(s, 'contacts', { ...s.contacts.find(c => c.id === ana), tags: [] }, ana);
  save(s, 'contacts', { ...s.contacts.find(c => c.id === ana), tags: ['cliente'] }, ana);
  assert.match(s.runs.filter(r => r.workflowId === flow).at(-1).results.join(' '), /erro: o app desta ação não está mais instalado/);
  assert.equal(s.workflowOutbox.filter(item => item.kind === 'app').length, 0);
});

test('Over HTTP: publish, install with a signed token, API limited to one sub-account, triggers and events', async t => {
  const sent = [];
  const appRequest = async (url, init) => { sent.push({ url: String(url), headers: init.headers, body: init.body }); return new Response('{}', { status: 200 }); };
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false,
    openAISecret: 'app-studio-test-secret-32-chars!!!', appRequest, appResolve: async () => [{ address: '93.184.216.34' }] });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body, headers = {}) => { const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const until = async check => { for (let i = 0; i < 50 && !check(); i++) await new Promise(r => setTimeout(r, 20)); };

  const created = await send('/api/agency/action', { type: 'studio-app-save', data: crm });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const appId = created.body.result;
  assert.deepEqual((await send('/api/state?workspace=demo')).body.agency.apps, []);
  assert.equal((await send('/api/apps/install?workspace=demo', { appId })).status, 403, 'not published yet');
  await send('/api/agency/action', { type: 'studio-app-publish', id: appId, data: { published: true } });
  assert.equal((await send('/api/state?workspace=demo')).body.agency.apps[0].id, appId);

  const installed = await send('/api/apps/install?workspace=demo', { appId });
  assert.equal(installed.status, 201, JSON.stringify(installed.body));
  assert.equal(installed.body.state.appInstalls[0].name, 'CRM Externo');
  const notice = sent.find(row => JSON.parse(row.body).type === 'app.installed');
  assert.equal(notice.url, 'https://apps.example.com/hook');
  const { secret } = (await send('/api/agency/studio-app-secret', { id: appId })).body.result;
  const expected = `sha256=${createHmac('sha256', secret).update(`${notice.headers['x-soci-timestamp']}.${notice.body}`).digest('hex')}`;
  assert.equal(notice.headers['x-soci-signature'], expected, 'signed with the secret the agency sees');
  const token = JSON.parse(notice.body).token;
  assert.match(token, /^soci_app_/);
  assert.equal(JSON.stringify((await send('/api/agency')).body).includes(token), false, 'the token never reaches the agency screens');

  const auth = { Authorization: `Bearer ${token}` };
  const subaccounts = await send('/api/v1/subaccounts', undefined, auth);
  assert.deepEqual(subaccounts.body.subaccounts.map(w => w.id), ['demo']);
  assert.equal((await send('/api/v1/subaccounts/demo/contacts', undefined, auth)).status, 200);
  assert.equal((await send('/api/v1/subaccounts/demo/contacts', { name: 'Sem permissão' }, auth)).status, 403, 'contacts.write was not declared');
  assert.equal((await send('/api/v1/subaccounts/demo/contacts', undefined, { Authorization: 'Bearer soci_app_' + '0'.repeat(48) })).status, 401);

  await send('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Pago', active: true, triggers: [{ type: 'app_trigger', config: { trigger: `${appId}:pedido-pago` } }], steps: [{ type: 'internal_notification', config: { body: 'Pedido {{trigger.payload.pedido}}' } }] } });
  const fired = await send('/api/apps/v1/trigger', { trigger: 'pedido-pago', contact: { name: 'Caio', email: 'caio@x.test' }, data: { pedido: 7 } }, auth);
  assert.equal(fired.status, 202, JSON.stringify(fired.body));
  assert.equal((await send('/api/apps/v1/trigger', { trigger: 'pedido-pago' })).status, 401, 'no token, no trigger');
  const state = (await send('/api/state?workspace=demo')).body.state;
  assert.ok(state.runs.some(r => r.name === 'Pago' && r.contactId === fired.body.contactId));

  sent.length = 0;
  await send('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Dora', email: 'dora@x.test', tags: [] } });
  await until(() => sent.length);
  const event = JSON.parse(sent[0]?.body || '{}');
  assert.deepEqual([event.type, event.event, event.contact?.name, event.workspace], ['event', 'contact_created', 'Dora', 'demo']);
  let log = [];
  for (let i = 0; i < 50 && !log.some(row => /contact_created/.test(row.text)); i++) {
    log = (await send('/api/state?workspace=demo')).body.state.appLog;
    await new Promise(r => setTimeout(r, 20));
  }
  assert.ok(log.some(row => /Evento contact_created: enviado \(200\)/.test(row.text)), JSON.stringify(log));

  await send('/api/agency/action', { type: 'studio-app-save', id: appId, data: { ...crm, triggers: 'Pedido pago\nPedido cancelado' } });
  assert.equal((await send('/api/state?workspace=demo')).body.state.appInstalls[0].triggers.length, 2, 'edits reach the installed copy');
  assert.equal((await send('/api/agency/action', { type: 'studio-app-delete', id: appId })).status, 409);

  sent.length = 0;
  const installId = (await send('/api/state?workspace=demo')).body.state.appInstalls[0].installId;
  const removed = await send('/api/apps/uninstall?workspace=demo', { installId });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.deepEqual(removed.body.state.appInstalls, []);
  assert.equal(JSON.parse(sent[0].body).type, 'app.uninstalled');
  assert.equal((await send('/api/v1/subaccounts/demo/contacts', undefined, auth)).status, 401, 'the token dies with the install');
  assert.equal((await send('/api/agency/action', { type: 'studio-app-delete', id: appId })).status, 200);
});
