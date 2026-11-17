import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

async function start(opts = {}) {
  const store = opts.store || createSqliteStore(':memory:');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0, ...opts });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined
      ? { headers }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const stream = async (path, body, headers = {}) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const raw = await r.text();
    const events = [];
    for (const block of raw.split('\n\n')) {
      if (!block.trim()) continue;
      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) events.push({ event, data: JSON.parse(data.join('\n')) });
    }
    return { status: r.status, contentType: r.headers.get('content-type') || '', events };
  };
  return { base, call, stream, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Pergunte à Soci streams live agency metrics, persists history, branches, feedback, search, rename, export/import', async t => {
  const local = await start(); t.after(local.close);

  // Initial state in local mode
  const initial = await local.call('/api/ask/state');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.config.mode, 'local');
  assert.deepEqual(initial.body.items, []);

  // Create SaaS plan and assign to demo account so MRR is real
  const plan = (await local.call('/api/agency/action', { type: 'save', key: 'plans', data: { name: 'Pro', price: 297 } })).body.result;
  await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status: 'Active', plan } });

  // Stream a real question via SSE
  const first = await local.stream('/api/ask/conversation', {
    action: 'next',
    messages: [{ content: { content_type: 'text', parts: ['Qual é a nossa receita recorrente mensal (MRR)?'] } }]
  });
  assert.equal(first.status, 200);
  assert.match(first.contentType, /text\/event-stream/);
  const meta = first.events.find(e => e.event === 'meta')?.data;
  const done = first.events.find(e => e.event === 'done')?.data;
  const titleEv = first.events.find(e => e.event === 'title')?.data;
  const text = first.events.filter(e => e.event === 'delta').map(e => e.data.v).join('');
  assert.ok(meta?.conversation?.id);
  assert.ok(done?.message?.id);
  assert.match(text, /297/);
  assert.ok(titleEv?.title);

  const convId = meta.conversation.id;
  const userMsgId = meta.user_message_id;
  const assistantMsgId = done.message.id;

  // Regenerate creates a sibling assistant branch
  const regen = await local.stream('/api/ask/conversation', {
    action: 'variant',
    conversation_id: convId,
    parent_message_id: userMsgId
  });
  const secondAssistant = regen.events.find(e => e.event === 'done')?.data?.message;
  assert.ok(secondAssistant?.id && secondAssistant.id !== assistantMsgId);

  const full = await local.call(`/api/ask/conversation?id=${convId}`);
  assert.equal(full.status, 200);
  assert.equal(full.body.mapping[userMsgId].children.length, 2);

  // Switch branch back to first assistant reply
  const switched = await local.call('/api/ask/branch', { id: convId, current_node: assistantMsgId });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.current_node, assistantMsgId);

  // Feedback up and clear
  const fb = await local.call('/api/ask/feedback', { id: convId, messageId: assistantMsgId, rating: 'up' });
  assert.equal(fb.status, 200);
  assert.equal(fb.body.rating, 'up');

  // Rename and search
  const renamed = await local.call('/api/ask/rename', { id: convId, title: 'Análise de MRR' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.title, 'Análise de MRR');
  const found = await local.call('/api/ask/search?q=297');
  assert.equal(found.body.items.length, 1);
  assert.equal(found.body.items[0].id, convId);

  // Export and delete all then re-import
  const exported = await (await fetch(local.base + '/api/ask/export')).json();
  assert.equal(exported.length, 1);
  await local.call('/api/ask/delete-all', {});
  assert.deepEqual((await local.call('/api/ask/state')).body.items, []);
  const imported = await local.call('/api/ask/import', { conversations: exported });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.imported, 1);
  assert.equal((await local.call('/api/ask/state')).body.items.length, 1);

  // Delete single conversation
  const deleted = await local.call('/api/ask/delete', { id: convId });
  assert.equal(deleted.status, 200);
  assert.deepEqual((await local.call('/api/ask/state')).body.items, []);
});

test('Temporary chats are never stored in history and sub-account users are denied access', async t => {
  const local = await start(); t.after(local.close);

  const temp = await local.stream('/api/ask/conversation', {
    action: 'next',
    temporary: true,
    messages: [{ content: { content_type: 'text', parts: ['Quais subcontas ainda não realizaram login?'] } }]
  });
  assert.equal(temp.status, 200);
  const meta = temp.events.find(e => e.event === 'meta')?.data;
  assert.equal(meta.conversation.temporary, true);
  assert.deepEqual((await local.call('/api/ask/state')).body.items, []);

  // Account user cannot access agency Ask Soci routes
  const userId = (await local.call('/api/agency/action', {
    type: 'save',
    key: 'users',
    data: { first: 'Carla', last: 'Dias', email: 'carla@example.test', role: 'Account User', accounts: ['demo'], permissions: ['contacts'] }
  })).body.result;
  const denied = await local.call('/api/ask/state', undefined, { 'X-Go-User': userId });
  assert.equal(denied.status, 403);
});

test('Pergunte à Soci static assets are served cleanly', async t => {
  const local = await start(); t.after(local.close);
  for (const path of ['/soci-chat.js', '/soci-chat.css', '/highlight.js', '/vendor/marked.js', '/vendor/purify.js']) {
    const r = await fetch(local.base + path);
    assert.equal(r.status, 200, `${path} should be served`);
  }
});
