import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { chatDefaults } from '../ui/chat-widget-data.js';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  const action = command => send('/api/action?workspace=demo', command);
  return { base, send, action };
}

test('Widget settings are validated', async t => {
  const { action } = await start(t);
  assert.equal((await action({ type: 'save', key: 'chatWidgets', data: { ...chatDefaults('X'), askEmail: 'off', askPhone: 'off' } })).status, 400);
  const saved = await action({ type: 'save', key: 'chatWidgets', data: { ...chatDefaults('Site'), color: 'red', position: 'top', promptDelay: 999, tags: 'chat, site' } });
  const widget = saved.body.state.chatWidgets.at(-1);
  assert.deepEqual([widget.color, widget.position, widget.promptDelay, widget.tags], ['#155eef', 'right', 120, ['chat', 'site']]);
});

test('A visitor starts a live chat, the team replies in Conversas and the visitor sees it', async t => {
  const { base, send, action } = await start(t);
  const saved = await action({ type: 'save', key: 'chatWidgets', data: { ...chatDefaults('Chat do site'), active: true, tags: 'chat-site' } });
  const widget = saved.body.state.chatWidgets.at(-1);
  const api = `/api/chat/demo/${widget.id}`;

  const loader = await fetch(`${base}/chat/demo/${widget.id}/widget.js`);
  assert.match(loader.headers.get('content-type'), /javascript/);
  assert.match(await loader.text(), new RegExp(`/chat/demo/${widget.id}`));
  const panel = await fetch(`${base}/chat/demo/${widget.id}`);
  assert.match(panel.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.match(await panel.text(), /Iniciar conversa/);
  assert.equal((await fetch(`${base}/chat/demo/${widget.id}/demo`)).status, 200);

  assert.equal((await send(`${api}/start`, { name: 'Lia', body: 'Oi' })).status, 400, 'email is required by default');
  const started = await send(`${api}/start`, { name: 'Lia', email: 'LIA@example.com', body: 'Vocês fazem sites?' });
  assert.equal(started.status, 201);
  const token = started.body.token;
  assert.match(token, /^[0-9a-f]{48}$/);
  assert.deepEqual(started.body.messages.map(m => [m.direction, m.body]), [['Inbound', 'Vocês fazem sites?']]);

  const state = (await send('/api/state?workspace=demo')).body.state;
  const contact = state.contacts.find(item => item.email === 'lia@example.com');
  assert.ok(contact, 'the chat creates the contact');
  assert.deepEqual(contact.tags, ['chat-site']);
  const inbound = state.messages.find(m => m.contactId === contact.id);
  assert.deepEqual([inbound.channel, inbound.direction, inbound.read], ['Live chat', 'Inbound', false]);
  assert.ok(!JSON.stringify(state.chatSessions).includes(token), 'only a hash of the token is stored');

  const reply = await action({ type: 'message', data: { contactId: contact.id, channel: 'Live chat', direction: 'Outbound', body: 'Fazemos sim! Qual o seu segmento?' } });
  assert.equal(reply.status, 200);
  const polled = await send(`${api}/messages`, undefined, { 'X-Chat-Token': token });
  assert.deepEqual(polled.body.messages.map(m => m.direction), ['Inbound', 'Outbound']);

  const more = await send(`${api}/send`, { body: 'Moda feminina' }, { 'X-Chat-Token': token });
  assert.equal(more.body.messages.at(-1).body, 'Moda feminina');
  assert.equal((await send(`${api}/messages`, undefined, { 'X-Chat-Token': 'f'.repeat(48) })).status, 401, 'another token sees nothing');
  assert.equal((await send(`${api}/send`, { body: 'x' })).status, 401);
});

test('An SMS and email widget takes the first message and does not keep a live thread', async t => {
  const { send, action } = await start(t);
  const saved = await action({ type: 'save', key: 'chatWidgets', data: { ...chatDefaults('Recado'), type: 'sms', active: true, askEmail: 'optional', askPhone: 'required' } });
  const widget = saved.body.state.chatWidgets.at(-1);
  const started = await send(`/api/chat/demo/${widget.id}/start`, { name: 'Rui', phone: '+55 31 98888-7777', body: 'Me liguem' });
  assert.equal(started.status, 201);
  const state = (await send('/api/state?workspace=demo')).body.state;
  assert.equal(state.messages.at(-1).channel, 'SMS');
  assert.equal((await send(`/api/chat/demo/${widget.id}/send`, { body: 'Oi?' }, { 'X-Chat-Token': started.body.token })).status, 409);

  await action({ type: 'save', key: 'chatWidgets', id: widget.id, data: { ...widget, active: false } });
  assert.equal((await send(`/api/chat/demo/${widget.id}/start`, { name: 'Rui', phone: '+55 31 98888-7777', body: 'Oi' })).status, 404, 'a draft widget takes no chats');
});
