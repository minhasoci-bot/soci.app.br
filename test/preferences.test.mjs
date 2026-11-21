import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { audienceContacts } from '../email-campaign-model.mjs';
import { canMessage } from '../preference-model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Preferences: topics, per-channel and per-topic opt-outs, and the sends that respect them', () => {
  const s = blank();
  assert.throws(() => execute(s, { type: 'preferences-settings', data: { topics: [{ name: '' }] } }), /nome/);
  execute(s, { type: 'preferences-settings', data: { topics: [{ name: 'Novidades' }, { name: 'Promoções' }] } });
  assert.deepEqual(s.preferences.topics.map(t => t.id), ['novidades', 'promocoes']);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', phone: '11999990000', tags: [] });
  save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [] });
  const token = execute(s, { type: 'preferences-link', data: { contactId: ana } });
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.equal(execute(s, { type: 'preferences-link', data: { contactId: ana } }), token, 'the same link every time');
  const changed = save(s, 'workflows', { name: 'Mudou', active: true, triggers: [{ type: 'preferences_changed', config: {} }], steps: [{ type: 'internal_notification', config: { body: 'x' } }] });
  execute(s, { type: 'preferences-save', data: { token, channels: ['email', 'whatsapp'], topics: ['novidades'] } });
  const contactOf = () => s.contacts.find(c => c.id === ana);
  let a = contactOf();
  assert.deepEqual([canMessage(a, 'Email'), canMessage(a, 'SMS'), canMessage(a, 'Email', 'promocoes'), canMessage(a, 'Email', 'novidades')], [true, false, false, true]);
  assert.equal(s.runs.filter(r => r.workflowId === changed).length, 1);
  assert.deepEqual(audienceContacts(s, { mode: 'all', topicId: 'promocoes' }).map(c => c.name), ['Bia'], 'campaign by topic skips who left it');
  assert.deepEqual(audienceContacts(s, { mode: 'all' }).map(c => c.name).sort(), ['Ana', 'Bia']);
  // Workflow send actions check the channel and the topic.
  save(s, 'workflows', { name: 'Promo', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'promo' } }],
    steps: [{ type: 'send_email', config: { subject: 'Oferta', body: 'Desconto', topicId: 'promocoes' } }, { type: 'send_sms', config: { body: 'Oi' } }] });
  save(s, 'contacts', { ...a, tags: ['promo'] }, ana);
  for (let i = 0; i < 3; i++) execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + i * 1000).toISOString() } });
  assert.equal(s.messages.some(m => m.contactId === ana && m.channel === 'Email' && m.body.includes('Desconto')), false);
  assert.equal(s.messages.some(m => m.contactId === ana && m.channel === 'SMS'), false);
  // Leaving everything turns on do-not-disturb and the e-mail unsubscribe.
  execute(s, { type: 'preferences-save', data: { token, all: true } });
  a = contactOf();
  assert.deepEqual([a.dnd, a.emailUnsubscribed, canMessage(a, 'WhatsApp')], [true, true, false]);
  execute(s, { type: 'preferences-save', data: { token, channels: ['email'], topics: [] } });
  a = contactOf();
  assert.deepEqual([a.dnd, a.emailUnsubscribed, canMessage(a, 'Email'), canMessage(a, 'Email', 'novidades')], [false, false, true, false]);
});

test('The public preference page reads and saves with the private link', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const act = body => fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const contact = (await act({ type: 'save', key: 'contacts', data: { name: 'Caio Lima', email: 'caio@x.test', tags: [] } })).id;
  const token = (await act({ type: 'preferences-link', data: { contactId: contact } })).id;
  const page = await fetch(`${base}/preferencias/demo/${token}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Olá, Caio\./);
  assert.match(html, /name="topics" value="promocoes" checked/);
  assert.equal(page.headers.get('referrer-policy'), 'same-origin', 'forms post with their real origin');
  const saved = await fetch(`${base}/preferencias/demo/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: 'channels=email&topics=novidades' });
  assert.equal(saved.status, 200);
  assert.match(await saved.text(), /Preferências salvas/);
  const state = await fetch(`${base}/api/state?workspace=demo`).then(r => r.json());
  const row = state.state.contacts.find(c => c.id === contact);
  assert.deepEqual([row.optOut.sms, row.topics.promocoes, row.topics.novidades], [true, false, true]);
  assert.equal((await fetch(`${base}/preferencias/demo/${'0'.repeat(32)}`)).status, 404);
});
