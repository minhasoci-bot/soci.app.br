// Quem pode usar o servidor MCP: com o login ligado, só uma chave de API válida ou uma sessão com acesso à subconta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseAuth } from '../auth.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const oauthClaims = Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url');
const identity = email => ({ id: randomUUID(), email, email_confirmed_at: '2026-11-18', identities: [{ provider: 'google' }] });
const tokenFor = user => `${user.id}.${oauthClaims}.signature`;
const bearer = secret => ({ Authorization: `Bearer ${secret}` });

async function start(t) {
  const ownerA = identity('owner-a@example.test');
  const ownerB = identity('owner-b@example.test');
  const users = new Map([ownerA, ownerB].map(user => [tokenFor(user), user]));
  const auth = createSupabaseAuth({
    projectUrl: 'https://test.supabase.co', publishableKey: 'test',
    async request(url, options) {
      const user = users.get(options.headers.Authorization?.slice(7));
      return user ? Response.json(user) : Response.json({}, { status: 401 });
    }
  });
  const store = createSqliteStore(':memory:');
  const { server, host, ready } = makeServer({ store, auth, agencyOwnerId: ownerA.id, allowLocalAccess: false, socialScheduler: false, port: 0 });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body, { user, headers } = {}) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(user && { Cookie: `go_access=${tokenFor(user)}` }), ...headers },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const agencyAction = async (user, body) => {
    const response = await post('/api/agency/action', body, { user });
    assert.equal(response.status, 200, response.body.error);
    return response.body.result;
  };
  const tool = (workspace, name, args = {}, options = {}) => post(`/api/mcp?workspace=${workspace}${options.query || ''}`,
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, options);
  const created = await post('/api/workspaces', { name: 'Conta A' }, { user: ownerA });
  assert.equal(created.status, 201, created.body.error);
  const workspace = created.body.id;
  await post(`/api/action?workspace=${workspace}`, { type: 'save', key: 'contacts', data: { name: 'Cliente Sigiloso' } }, { user: ownerA });
  return { store, ownerA, ownerB, post, agencyAction, tool, workspace };
}

const readContacts = response => JSON.parse(response.body.result.content[0].text).contacts;

test('MCP: token inventado não entra, nem no cabeçalho nem na URL', async t => {
  const { store, tool, workspace } = await start(t);
  for (const options of [{}, { headers: bearer('qualquercoisa') }, { query: '&token=qualquercoisa' }]) {
    const response = await tool(workspace, 'list_crm_contacts', {}, options);
    assert.equal(response.status, 401);
    assert.doesNotMatch(JSON.stringify(response.body), /Cliente Sigiloso/);
  }
  const write = await tool(workspace, 'create_social_post', { summary: 'invasor', accountIds: [], mode: 'draft' }, { headers: bearer('x') });
  assert.equal(write.status, 401);
  assert.equal(store.load(workspace).socialPosts.length, 0);
});

test('MCP: uma chave válida na URL também é recusada, porque URL vai parar em registros', async t => {
  const { tool, workspace, agencyAction, ownerA } = await start(t);
  const { secret } = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Claude' } });
  assert.equal((await tool(workspace, 'list_crm_contacts', {}, { query: `&token=${secret}` })).status, 401);
});

test('MCP: o login de outra agência não abre a subconta', async t => {
  const { tool, workspace, ownerA, ownerB } = await start(t);
  assert.equal((await tool(workspace, 'list_crm_contacts', {}, { user: ownerB })).status, 404);
  assert.equal(readContacts(await tool(workspace, 'list_crm_contacts', {}, { user: ownerA }))[0].name, 'Cliente Sigiloso');
});

test('MCP: a chave de API da agência abre só as subcontas dela e para de valer quando revogada', async t => {
  const { tool, workspace, agencyAction, ownerA, ownerB } = await start(t);
  const keyA = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Claude' } });
  const keyB = await agencyAction(ownerB, { type: 'api-key', data: { name: 'Outra' } });
  assert.equal(readContacts(await tool(workspace, 'list_crm_contacts', {}, { headers: bearer(keyA.secret) }))[0].name, 'Cliente Sigiloso');
  assert.equal((await tool(workspace, 'list_crm_contacts', {}, { headers: bearer(keyB.secret) })).status, 404);
  await agencyAction(ownerA, { type: 'api-key-delete', id: keyA.id });
  assert.equal((await tool(workspace, 'list_crm_contacts', {}, { headers: bearer(keyA.secret) })).status, 401);
});

test('MCP: uma chave errada não cai na sessão de quem está logado', async t => {
  const { tool, workspace, ownerA } = await start(t);
  assert.equal((await tool(workspace, 'list_crm_contacts', {}, { user: ownerA, headers: bearer('errada') })).status, 401);
});

test('MCP: integração privada só faz o que os escopos dela permitem', async t => {
  const { store, tool, workspace, agencyAction, ownerA } = await start(t);
  const { secret } = await agencyAction(ownerA, { type: 'private-integration', data: { name: 'Leitura', scopes: ['contacts.read'] } });
  const headers = bearer(secret);
  assert.equal(readContacts(await tool(workspace, 'list_crm_contacts', {}, { headers })).length, 1);
  const post = await tool(workspace, 'create_social_post', { summary: 'x', accountIds: [], mode: 'draft' }, { headers });
  assert.equal(post.body.result.isError, true);
  assert.equal(store.load(workspace).socialPosts.length, 0);
});

test('MCP: cada ferramenta exige o módulo dela no plano da subconta', async t => {
  const { store, tool, workspace, agencyAction, ownerA } = await start(t);
  const { secret } = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Claude' } });
  const headers = bearer(secret);
  const plan = await agencyAction(ownerA, { type: 'save', key: 'plans', data: { name: 'Só marketing', price: 10, modules: ['marketing'] } });
  await agencyAction(ownerA, { type: 'account-meta', id: workspace, data: { status: 'Active', plan } });
  const contacts = await tool(workspace, 'list_crm_contacts', {}, { headers });
  assert.equal(contacts.body.result.isError, true);
  assert.doesNotMatch(contacts.body.result.content[0].text, /Cliente Sigiloso/);
  const contactId = store.load(workspace).contacts[0].id;
  assert.equal((await tool(workspace, 'send_social_message', { contactId, body: 'oi', channel: 'Note' }, { headers })).body.result.isError, true);
  assert.equal(store.load(workspace).messages.length, 0);
  assert.equal((await tool(workspace, 'create_social_post', { summary: 'ok', accountIds: [], mode: 'draft' }, { headers })).body.result.isError, false);
});

test('MCP: subconta pausada recusa leitura e escrita', async t => {
  const { tool, workspace, agencyAction, ownerA } = await start(t);
  const { secret } = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Claude' } });
  await agencyAction(ownerA, { type: 'account-meta', id: workspace, data: { status: 'Paused' } });
  const response = await tool(workspace, 'list_crm_contacts', {}, { headers: bearer(secret) });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'ACCOUNT_SUSPENDED');
});

test('MCP: o erro de uma ferramenta não mostra caminhos do servidor', async t => {
  const { tool, workspace, ownerA } = await start(t);
  const response = await tool(workspace, 'send_social_message', { contactId: 'x', body: 'oi', channel: 'Note' }, { user: ownerA });
  assert.equal(response.body.result.isError, true);
  assert.doesNotMatch(response.body.result.content[0].text, /\.mjs|file:|\n\s+at /);
});

test('MCP: usar a chave várias vezes seguidas não regrava a agência a cada chamada', async t => {
  const { store, tool, workspace, agencyAction, ownerA } = await start(t);
  const { secret } = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Claude' } });
  const used = () => store.load('agency').apiKeys[0].lastUsed;
  await tool(workspace, 'list_crm_contacts', {}, { headers: bearer(secret) });
  const first = used();
  assert.ok(first);
  await new Promise(resolve => setTimeout(resolve, 5));
  await tool(workspace, 'list_crm_contacts', {}, { headers: bearer(secret) });
  assert.equal(used(), first);
});

test('MCP: os escopos da integração privada cobrem cada módulo, separados em ler e gravar', async t => {
  const { store, post, tool, workspace, agencyAction, ownerA } = await start(t);
  const { secret } = await agencyAction(ownerA, { type: 'private-integration', data: { name: 'Posts', scopes: ['marketing.write', 'opportunities.read', 'inventado.write'] } });
  const headers = bearer(secret);
  assert.deepEqual(store.load('agency').privateIntegrations[0].scopes, ['marketing.write', 'opportunities.read']);
  assert.equal((await tool(workspace, 'create_social_post', { summary: 'x', accountIds: [], mode: 'draft' }, { headers })).body.result.isError, false);
  assert.equal((await tool(workspace, 'list_pipelines', {}, { headers })).body.result.isError, false);
  assert.equal((await tool(workspace, 'list_crm_contacts', {}, { headers })).body.result.isError, true);
  const { result } = (await post(`/api/mcp/${workspace}`, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { headers })).body;
  assert.deepEqual(result.tools.map(item => item.name).sort(), ['create_social_post', 'list_opportunities', 'list_pipelines', 'reschedule_social_post', 'review_social_post']);
});

test('MCP: toda ferramenta tem um escopo que existe na tela de integrações', async () => {
  const { apiScopes } = await import('../ui/agency-data.js');
  const { mcpTools } = await import('../mcp-tools.mjs');
  const known = new Set(apiScopes.map(([key]) => key));
  for (const item of mcpTools) assert.ok(known.has(item.scope), `${item.name}: ${item.scope}`);
});
