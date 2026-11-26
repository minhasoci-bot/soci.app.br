import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseAuth } from '../auth.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { TRASH_DAYS, trashExpired, trashList } from '../agency-model.mjs';

const oauthClaims = Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url');
const identity = email => ({ id: randomUUID(), email, email_confirmed_at: '2026-11-18', identities: [{ provider: 'google' }] });
const tokenFor = user => `${user.id}.${oauthClaims}.signature`;
const DAY = 86_400_000;

async function start(t) {
  const owner = identity('owner-a@example.test');
  const other = identity('owner-b@example.test');
  const users = new Map([owner, other].map(user => [tokenFor(user), user]));
  const auth = createSupabaseAuth({
    projectUrl: 'https://test.supabase.co', publishableKey: 'test',
    async request(url, options) {
      const user = users.get(options.headers.Authorization?.slice(7));
      return user ? Response.json(user) : Response.json({}, { status: 401 });
    }
  });
  const store = createSqliteStore(':memory:');
  const { server, host, ready, purgeTrash } = makeServer({ store, auth, agencyOwnerId: owner.id, allowLocalAccess: false, socialScheduler: false, port: 0 });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, { user, body } = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: `go_access=${tokenFor(user)}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const created = await call('/api/workspaces', { user: owner, body: { name: 'Padaria Sol' } });
  assert.equal(created.status, 201, created.body.error);
  return { store, owner, other, call, purgeTrash, workspace: created.body.id };
}

test('Excluir subconta: confirma pelo nome, some de tudo, pode ser restaurada e é apagada depois de 30 dias', async t => {
  const { store, owner, other, call, purgeTrash, workspace } = await start(t);
  const action = body => call('/api/agency/action', { user: owner, body });
  const listed = async () => (await call('/api/workspaces', { user: owner })).body.workspaces.map(w => w.id);
  assert.equal((await call(`/api/action?workspace=${workspace}`, { user: owner, body: { type: 'save', key: 'contacts', data: { name: 'Cliente fiel' } } })).status, 200);
  const before = store.load(workspace);

  const wrong = await action({ type: 'account-trash', id: workspace, data: { confirm: 'padaria sol' } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /Digite o nome/);
  assert.equal((await call('/api/agency/action', { user: other, body: { type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } } })).status, 404);
  assert.ok((await listed()).includes(workspace));

  const trashed = await action({ type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } });
  assert.equal(trashed.status, 200, trashed.body.error);
  assert.ok(!(await listed()).includes(workspace));
  assert.ok(!trashed.body.overview.accounts.some(a => a.id === workspace));
  assert.deepEqual(trashed.body.trash.map(row => [row.id, row.name]), [[workspace, 'Padaria Sol']]);
  assert.equal((await call(`/api/state?workspace=${workspace}`, { user: owner })).status, 404);
  assert.equal((await action({ type: 'account-meta', id: workspace, data: { status: 'Active' } })).status, 404);
  assert.equal(store.load('agency').accounts[workspace].status, 'Closed');

  assert.deepEqual(await purgeTrash('agency', Date.now() + (TRASH_DAYS - 1) * DAY), []);
  const restored = await action({ type: 'account-restore', id: workspace });
  assert.equal(restored.status, 200, restored.body.error);
  assert.deepEqual(restored.body.trash, []);
  assert.ok((await listed()).includes(workspace));
  assert.equal(store.load('agency').accounts[workspace].status, 'Active');
  assert.deepEqual(store.load(workspace).contacts, before.contacts);
  assert.equal((await call(`/api/state?workspace=${workspace}`, { user: owner })).status, 200);

  assert.equal((await action({ type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } })).status, 200);
  assert.deepEqual(await purgeTrash('agency', Date.now() + (TRASH_DAYS + 1) * DAY), [workspace]);
  assert.throws(() => store.load(workspace), { status: 404 });
  const agency = store.load('agency');
  assert.equal(agency.accounts[workspace], undefined);
  assert.ok(agency.audit.some(row => row.action === 'Sub-account permanently deleted' && row.target === 'Padaria Sol'));
  assert.deepEqual((await call('/api/agency', { user: owner })).body.trash, []);
});

test('Excluir subconta: uma assinatura de plano em andamento precisa ser cancelada antes', async t => {
  const { store, owner, call, workspace } = await start(t);
  store.change('agency', agency => { agency.accounts[workspace].billing = { status: 'Active' }; });
  const response = await call('/api/agency/action', { user: owner, body: { type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } } });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Cancele a cobrança/);
  assert.equal(store.load('agency').accounts[workspace].trash, undefined);
});

test('Lixeira: lista da mais recente para a mais antiga e vence em 30 dias', () => {
  const agency = { accounts: {
    a: { name: 'Antiga', trash: { at: '2026-10-01T00:00:00.000Z', by: 'Ana' } },
    b: { name: 'Nova', trash: { at: '2026-11-20T00:00:00.000Z', by: 'Bia' } },
    c: { name: 'Ativa' }
  } };
  assert.deepEqual(trashList(agency).map(row => row.id), ['b', 'a']);
  assert.equal(trashList(agency)[1].purgeAt, '2026-10-31T00:00:00.000Z');
  assert.deepEqual(trashExpired(agency, Date.parse('2026-11-25T00:00:00.000Z')), ['a']);
});
