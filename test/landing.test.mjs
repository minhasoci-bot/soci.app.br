import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

async function start() {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0 });
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
  assert.match(html, /id="google-picker-dialog"/);
  assert.match(html, /accounts\.google\.com\/gsi\/client/);
});

test('Google Auth endpoints allow configuration check and user sign-in', async t => {
  const local = await start();
  t.after(local.close);

  // 1. GET /api/auth/google/config
  const cfgRes = await fetch(local.base + '/api/auth/google/config');
  assert.equal(cfgRes.status, 200);
  const cfg = await cfgRes.json();
  assert.equal(cfg.provider, 'google');
  assert.equal(typeof cfg.configured, 'boolean');

  // 2. POST /api/auth/google invalid email
  const badRes = await fetch(local.base + '/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.equal(badRes.status, 400);

  // 3. POST /api/auth/google valid sign-in
  const loginRes = await fetch(local.base + '/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'luiz@caramelo.co',
      name: 'Luiz Caramelo',
      picture: 'https://lh3.googleusercontent.com/a/photo'
    })
  });
  assert.equal(loginRes.status, 200);
  const logged = await loginRes.json();
  assert.equal(logged.ok, true);
  assert.equal(logged.user.email, 'luiz@caramelo.co');
  assert.equal(logged.user.name, 'Luiz Caramelo');
  assert.equal(logged.user.picture, 'https://lh3.googleusercontent.com/a/photo');
  assert.ok(logged.user.id);
});
