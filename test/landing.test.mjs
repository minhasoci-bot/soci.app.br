import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createSupabaseAuth } from '../auth.mjs';
import { blank } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

async function start(options = { auth: null, allowLocalAccess: true }) {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, ...options });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  return { base, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Landing page serves at / with login button, animations and modules', async t => {
  const local = await start();
  t.after(local.close);

  // 1. GET / returns landing page
  const res = await fetch(local.base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>soci — Plataforma para Agências & Negócios Digitais<\/title>/);
  assert.match(html, /Entrar na plataforma/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /id="neuro"/);
  assert.match(html, /id="gallery"/);
  assert.match(html, /id="prompt-form"/);
  assert.match(html, /id="tb-wheel"/);
  assert.match(html, /id="binary"/);
  assert.match(html, /id="login-dialog"/);

  // 1.1 GET / on app.soci.com serves the platform app directly
  const appSubdomainRes = await fetch(local.base + '/', { headers: { 'x-forwarded-host': 'app.soci.com' } });
  assert.equal(appSubdomainRes.status, 200);
  const appSubdomainHtml = await appSubdomainRes.text();
  assert.match(appSubdomainHtml, /<div id="app">/);

  // 2. GET /app and /painel serve the platform app
  const appRes = await fetch(local.base + '/app');
  assert.equal(appRes.status, 200);
  const appHtml = await appRes.text();
  assert.match(appHtml, /<div id="app">/);
  assert.match(appHtml, /src="\/app\.js"/);

  const painelRes = await fetch(local.base + '/painel');
  assert.equal(painelRes.status, 200);
  const painelHtml = await painelRes.text();
  assert.match(painelHtml, /<div id="app">/);

  // 3. Static assets for landing page
  const cssRes = await fetch(local.base + '/landing.css');
  assert.equal(cssRes.status, 200);
  assert.match(cssRes.headers.get('content-type'), /text\/css/);

  const jsRes = await fetch(local.base + '/landing.js');
  assert.equal(jsRes.status, 200);
  assert.match(jsRes.headers.get('content-type'), /text\/javascript/);

  // 4. Google Auth elements in landing HTML
  assert.match(html, /id="nav-google-btn"/);
  assert.match(html, /id="google-signin-btn"/);
  assert.doesNotMatch(html, /id="login-form"|type="password"/);
  assert.doesNotMatch(html, /id="google-picker-dialog"/);

  const redirectScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const redirects = [];
  const location = { pathname: '/login', search: '?next=%2Fapp', hash: '#agency/dashboard', replace: path => redirects.push(path) };
  runInNewContext(redirectScript, { location });
  assert.deepEqual(redirects, []);
  runInNewContext(redirectScript, { location: { ...location, pathname: '/' } });
  assert.deepEqual(redirects, ['/app?next=%2Fapp#agency/dashboard']);
});


const alice = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: 'alice@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }] };
const bob = { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', email: 'bob@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }] };
const owner = { id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', email: 'owner@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }] };
const users = { alice, bob, owner };
const reply = (value, status = 200) => Response.json(value, { status });
const post = (base, route, body, headers = {}) => fetch(base + route, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
  redirect: 'manual'
});
const cookies = result => result.headers.getSetCookie().map(line => line.split(';', 1)[0]).filter(part => !part.endsWith('=')).join('; ');

function session(name, method = 'oauth') {
  const user = users[name];
  const claims = Buffer.from(JSON.stringify({ sub: user.id, amr: [{ method }] })).toString('base64url');
  return { access_token: 'test.' + claims + '.test', refresh_token: name + '-' + method, expires_in: 3600, user };
}

function provider(google = true) {
  const signedOut = new Set();
  const sessions = Object.keys(users).flatMap(name => ['oauth', 'password'].map(method => session(name, method)));
  const projectUrl = 'https://test.supabase.co';
  return createSupabaseAuth({ projectUrl, publishableKey: 'public-key', async request(url, options) {
    assert.equal(url.origin, projectUrl);
    assert.equal(options.headers.apikey, 'public-key');
    const input = options.body && JSON.parse(options.body);
    switch (url.pathname) {
      case '/auth/v1/settings':
        return reply({ external: { google } });
      case '/auth/v1/token': {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'refresh_token') {
          const refreshed = sessions.find(candidate => candidate.refresh_token === input.refresh_token && !signedOut.has(candidate.access_token));
          return refreshed ? reply(refreshed) : reply({}, 400);
        }
        assert.equal(grant, 'pkce');
        assert.match(input.code_verifier, /^[a-zA-Z0-9_-]{43}$/);
        const [name, method] = input.auth_code.split('-');
        return users[name] ? reply(session(name, method)) : reply({}, 400);
      }
      case '/auth/v1/user': {
        const token = options.headers.Authorization.slice('Bearer '.length);
        const current = sessions.find(candidate => candidate.access_token === token && !signedOut.has(token));
        return current ? reply(current.user) : reply({}, 401);
      }
      case '/auth/v1/logout':
        assert.equal(url.searchParams.get('scope'), 'local');
        signedOut.add(options.headers.Authorization.slice('Bearer '.length));
        return new Response(null, { status: 204 });
      default: throw Error('Unexpected Auth API request');
    }
  } });
}

async function oauthLogin(base, code, next = '/app') {
  const start = await post(base, '/api/auth/google', { next });
  assert.equal(start.status, 200);
  return fetch(base + '/api/auth/callback/google?code=' + code, {
    headers: { Cookie: cookies(start) },
    redirect: 'manual'
  });
}

test('Google OAuth requires a PKCE verifier and rejects password sessions', async t => {
  const { base, close } = await start({ auth: provider() });
  t.after(close);
  const app = await fetch(base + '/app', { redirect: 'manual' });
  assert.equal(app.status, 303);
  assert.equal(app.headers.get('location'), '/login?next=%2Fapp');
  assert.equal((await post(base, '/api/auth/login', { email: alice.email, password: 'example' })).status, 404);
  assert.equal((await post(base, '/api/auth/signup', { email: alice.email, password: 'example' })).status, 404);

  const startGoogle = await post(base, '/api/auth/google', { next: '/app#dashboard', email: alice.email, credential: 'fake.jwt.token' });
  assert.doesNotMatch(cookies(startGoogle), /go_access=/);
  const target = new URL((await startGoogle.json()).url);
  assert.equal(target.pathname, '/auth/v1/authorize');
  assert.equal(target.searchParams.get('provider'), 'google');
  assert.equal(target.searchParams.get('redirect_to'), base + '/api/auth/callback/google');
  const flow = cookies(startGoogle).split('=')[1];
  const { verifier } = JSON.parse(Buffer.from(flow, 'base64url').toString('utf8'));
  assert.equal(target.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  const back = base + '/api/auth/callback/google?code=alice-oauth';
  assert.equal((await fetch(back, { redirect: 'manual' })).headers.get('location'), '/login?error=google');
  const result = await fetch(back, { redirect: 'manual', headers: { Cookie: cookies(startGoogle) } });
  assert.equal(result.headers.get('location'), '/app#dashboard');
  assert.match(result.headers.getSetCookie().join('\n'), /go_access=.*HttpOnly; SameSite=Lax/);
  const wrongMethod = await oauthLogin(base, 'alice-password');
  assert.equal(wrongMethod.headers.get('location'), '/login?error=google');
  assert.doesNotMatch(cookies(wrongMethod), /go_access=/);
  for (const cookie of ['go_access=' + session('alice','password').access_token, 'go_refresh=alice-password']) {
    assert.equal((await fetch(base + '/api/state', { headers: { Cookie: cookie } })).status, 401);
  }
});

test('Google sessions isolate personal workspaces and honor agency permissions', async t => {
  const store = createSqliteStore(':memory:');
  const ownerWorkspaceId = 'user-' + owner.id;
  await store.insert(ownerWorkspaceId, blank('Workspace pessoal do proprietário'));
  const { base, close } = await start({ auth: provider(), agencyOwnerId: owner.id, store });
  t.after(close);
  const forged = { 'X-Go-User': owner.id };
  assert.equal((await fetch(base + '/api/state', { headers: forged })).status, 401);
  const login = await oauthLogin(base, 'alice-oauth', '//another-site.example');
  assert.equal(login.headers.get('location'), '/app');
  const headers = { Cookie: cookies(login), ...forged };
  const list = await fetch(base + '/api/workspaces', { headers }).then(r => r.json());
  assert.deepEqual(list.workspaces.map(w => w.id), ['user-' + alice.id]);
  const personalPath = '/api/state?workspace=user-' + alice.id;
  const personal = await fetch(base + personalPath, { headers }).then(r => r.json());
  assert.deepEqual(personal.state.contacts, []);
  assert.equal(personal.access.session.id, alice.id);
  assert.equal(personal.access.agency, false);
  assert.equal((await fetch(base + '/api/state?workspace=demo', { headers })).status, 403);
  assert.equal((await fetch(base + '/api/state?workspace=user-' + bob.id, { headers })).status, 403);
  assert.equal((await fetch(base + '/api/agency', { headers })).status, 403);

  const admin = await oauthLogin(base, 'owner-oauth');
  const adminHeaders = { Cookie: cookies(admin) };
  const agencyResponse = await fetch(base + '/api/agency', { headers: adminHeaders });
  assert.equal(agencyResponse.status, 200);
  const agency = await agencyResponse.json();
  assert.equal(agency.personalWorkspace.id, ownerWorkspaceId);
  assert.ok(agency.overview.accounts.every(w => !w.id.startsWith('user-')));
  const ownerPath = '/api/state?workspace=' + ownerWorkspaceId;
  const ownerResponse = await fetch(base + ownerPath, { headers: adminHeaders });
  assert.equal(ownerResponse.status, 200);
  const ownerState = await ownerResponse.json();
  assert.equal(ownerState.state.profile.name, 'Workspace pessoal do proprietário');
  assert.equal(ownerState.access.agency, true);
  assert.deepEqual(ownerState.workspaces.map(w => w.id).sort(), ['demo', ownerWorkspaceId]);
  assert.equal((await fetch(base + ownerPath, { headers })).status, 403);
  assert.equal((await fetch(base + personalPath, { headers: adminHeaders })).status, 403);
  const membership = await post(base, '/api/agency/action', {
    type: 'save', key: 'users',
    data: { first: 'Bob', last: 'Test', email: bob.email, role: 'Account User', accounts: ['demo'], permissions: ['contacts'] }
  }, adminHeaders);
  assert.equal(membership.status, 200);
  const memberLogin = await oauthLogin(base, 'bob-oauth');
  const memberHeaders = { Cookie: cookies(memberLogin) };
  const memberState = await fetch(base + '/api/state?workspace=demo', { headers: memberHeaders }).then(r => r.json());
  assert.deepEqual(memberState.access.modules, ['contacts']);
  assert.equal((await fetch(base + '/api/agency', { headers: memberHeaders })).status, 403);

  const ownerMembership = await post(base, '/api/agency/action', {
    type: 'save', key: 'users', data: { first: 'Alice', last: 'Test', email: alice.email, role: 'Agency Owner' }
  }, adminHeaders);
  assert.equal(ownerMembership.status, 200);
  const memberAgency = await fetch(base + '/api/agency', { headers });
  assert.equal(memberAgency.status, 200);
  assert.equal((await memberAgency.json()).personalWorkspace.id, 'user-' + alice.id);
  assert.equal((await fetch(base + personalPath, { headers })).status, 200);
  assert.equal((await fetch(base + ownerPath, { headers })).status, 403);

  const renewed = await fetch(base + '/api/workspaces', { headers: { Cookie: 'go_refresh=alice-oauth' } });
  assert.equal(renewed.status, 200);
  assert.match(cookies(renewed), /go_access=/);
  const logout = await post(base, '/api/auth/logout', {}, headers);
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().every(line => line.includes('Max-Age=0')));
  assert.equal((await fetch(base + '/api/workspaces', { headers })).status, 401);
});
