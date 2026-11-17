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
  assert.match(html, /<title>graao — Plataforma para Agências & Negócios Digitais<\/title>/);
  assert.match(html, /Entrar na plataforma/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /id="neuro"/);
  assert.match(html, /id="gallery"/);
  assert.match(html, /id="prompt-form"/);
  assert.match(html, /id="tb-wheel"/);
  assert.match(html, /id="binary"/);
  assert.match(html, /id="login-dialog"/);

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
});
