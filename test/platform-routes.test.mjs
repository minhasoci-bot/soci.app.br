import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseAuth } from '../auth.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const oauthClaims = Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url');
const identity = email => ({ id: randomUUID(), email, email_confirmed_at: '2026-11-18', identities: [{ provider: 'google' }] });
const tokenFor = user => `${user.id}.${oauthClaims}.signature`;
const ROUTES = [['/api/platform/usage'], ['/api/platform/check', {}], ['/api/platform/settings', { twilioMinUsd: 5 }], ['/api/platform/push', { subscription: {} }]];

async function start(t, { withAuth = true } = {}) {
  const owner = identity('dono@example.test');
  const other = identity('outra-agencia@example.test');
  const users = new Map([owner, other].map(user => [tokenFor(user), user]));
  const auth = withAuth ? createSupabaseAuth({
    projectUrl: 'https://test.supabase.co', publishableKey: 'test',
    async request(url, options) {
      const user = users.get(options.headers.Authorization?.slice(7));
      return user ? Response.json(user) : Response.json({}, { status: 401 });
    }
  }) : null;
  const { server, host, ready } = makeServer({
    store: createSqliteStore(':memory:'), auth, agencyOwnerId: owner.id, allowLocalAccess: false, socialScheduler: false, port: 0,
    platformEnv: {}, platformRequest: async () => { throw new Error('rede desligada no teste'); }
  });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, { user, body } = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(user && { Cookie: `go_access=${tokenFor(user)}` }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, text: await response.text() };
  };
  return { owner, other, call };
}

test('o dono da plataforma abre o uso com os 6 serviços e o e-mail de alerta preenchido', async t => {
  const { owner, call } = await start(t);
  const response = await call('/api/platform/usage', { user: owner });
  assert.equal(response.status, 200, response.text);
  const view = JSON.parse(response.text);
  assert.deepEqual(view.services.map(s => s.service), ['supabase', 'vercel', 'cloudflare', 'hostinger', 'evolution', 'twilio']);
  assert.equal(view.services.find(s => s.service === 'supabase').status, 'ok');
  assert.equal(view.services.find(s => s.service === 'vercel').status, 'not-configured');
  assert.equal(view.settings.alertEmail, 'dono@example.test');
  const saved = await call('/api/platform/settings', { user: owner, body: { twilioMinUsd: 15 } });
  assert.equal(JSON.parse(saved.text).settings.twilioMinUsd, 15);
});

test('outra agência recebe 404 em todas as rotas, sem pistas da plataforma', async t => {
  const { other, call } = await start(t);
  for (const [path, body] of ROUTES) {
    const response = await call(path, { user: other, body });
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.text, /platform|plataforma/i, path);
  }
});

test('o acesso da agência marca platform só para o dono', async t => {
  const { owner, other, call } = await start(t);
  assert.equal(JSON.parse((await call('/api/agency', { user: owner })).text).access.platform, true);
  assert.ok(!JSON.parse((await call('/api/agency', { user: other })).text).access.platform);
});

test('sem login as rotas nunca respondem 200', async t => {
  const { call } = await start(t);
  for (const [path, body] of ROUTES) assert.ok([401, 404].includes((await call(path, { body })).status), path);
});
