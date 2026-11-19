import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

test('MCP Server: exposes JSON-RPC 2.0 endpoint for Claude and ChatGPT AI agents', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body, headers = {}) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    return { status: r.status, body: await r.json() };
  };

  // 1. GET /api/mcp discovery
  const getRes = await fetch(`${base}/api/mcp`);
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.name, 'soci-mcp-server');
  assert.ok(getJson.tools.includes('list_social_accounts'));
  assert.ok(getJson.tools.includes('create_social_post'));

  // 2. initialize
  const initRes = await post('/api/mcp?workspace=demo', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize'
  });
  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.result.serverInfo.name, 'soci-mcp-server');
  assert.equal(initRes.body.result.protocolVersion, '2024-11-05');

  // 3. tools/list
  const toolsRes = await post('/api/mcp?workspace=demo', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  });
  assert.equal(toolsRes.status, 200);
  const tools = toolsRes.body.result.tools;
  assert.ok(tools.some(t => t.name === 'list_social_accounts'));
  assert.ok(tools.some(t => t.name === 'create_social_post'));
  assert.ok(tools.some(t => t.name === 'get_social_analytics'));

  // 4. tools/call -> list_social_accounts
  const callAccts = await post('/api/mcp?workspace=demo', {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'list_social_accounts', arguments: {} }
  });
  assert.equal(callAccts.status, 200);
  assert.equal(callAccts.body.result.isError, false);
  const parsed = JSON.parse(callAccts.body.result.content[0].text);
  assert.ok(Array.isArray(parsed.accounts));

  // 5. tools/call -> get_social_analytics
  const callAnalytics = await post('/api/mcp?workspace=demo', {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_social_analytics', arguments: {} }
  });
  assert.equal(callAnalytics.status, 200);
  const analytics = JSON.parse(callAnalytics.body.result.content[0].text);
  assert.ok(analytics.postsSummary !== undefined);

  // 6. tools/call -> create_social_post (criando rascunho via IA)
  const createPost = await post('/api/mcp?workspace=demo', {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'create_social_post',
      arguments: {
        summary: 'Post gerado pelo Claude MCP',
        accountIds: [],
        mode: 'draft'
      }
    }
  });
  assert.equal(createPost.status, 200);
  const postResult = JSON.parse(createPost.body.result.content[0].text);
  assert.equal(postResult.success, true);
  assert.ok(postResult.postId);

  // 7. tools/call -> list_scheduled_posts (deve encontrar o post recém-criado)
  const listPosts = await post('/api/mcp?workspace=demo', {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'list_scheduled_posts', arguments: { status: 'draft' } }
  });
  assert.equal(listPosts.status, 200);
  const listResult = JSON.parse(listPosts.body.result.content[0].text);
  assert.ok(listResult.posts.some(p => p.id === postResult.postId));

  // 8. tools/call -> send_social_message (enviando direct/resposta pelo MCP)
  const contactsRes = await post('/api/mcp?workspace=demo', {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'list_crm_contacts', arguments: { limit: 1 } }
  });
  assert.equal(contactsRes.status, 200);
  const contact = JSON.parse(contactsRes.body.result.content[0].text).contacts[0];
  if (contact?.id) {
    const sendMsg = await post('/api/mcp?workspace=demo', {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'send_social_message',
        arguments: {
          contactId: contact.id,
          body: 'Olá! Resposta gerada via Claude MCP no Instagram.',
          channel: 'Instagram'
        }
      }
    });
    assert.equal(sendMsg.status, 200);
    const msgResult = JSON.parse(sendMsg.body.result.content[0].text);
    assert.equal(msgResult.ok, true);
    assert.ok(msgResult.messageId);
  }
});
