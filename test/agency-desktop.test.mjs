import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { desktopManifest, desktopOf, publishDesktop, saveDesktop } from '../agency-desktop.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('Desktop app: older settings are upgraded, fields validated, publishing needs the icon', () => {
  const state = { desktopApp: { appName: 'Velha', primary: '#123456', domain: '' } };
  const app = desktopOf(state);
  assert.deepEqual([app.appName, app.theme.button, app.status], ['Velha', '#123456', 'draft'], 'the old color becomes the button color');
  assert.throws(() => saveDesktop(state, { appName: '' }), /nome/);
  assert.throws(() => saveDesktop(state, { theme: { background: 'azul' } }), /Fundo/);
  assert.throws(() => saveDesktop(state, { icon: 'data:image/jpeg;base64,AAAA' }), /PNG/);
  assert.throws(() => publishDesktop(state), /ícone/);
  saveDesktop(state, { appName: 'Agência Norte', title: 'Tudo num lugar', subtitle: 'Entre para começar', theme: { preset: 'oceano', background: '#f0f7fc', text: '#0f2230', button: '#0e6ba8', buttonText: '#ffffff' }, icon: PNG, icon192: PNG, icon512: PNG });
  assert.equal(state.desktopApp.theme.preset, 'oceano');
  saveDesktop(state, { logo: PNG });
  assert.equal(state.desktopApp.icon, PNG, 'images left out are kept');
  saveDesktop(state, { logo: 'remove' });
  assert.equal(state.desktopApp.logo, '');
  publishDesktop(state); publishDesktop(state);
  assert.deepEqual([state.desktopApp.status, state.desktopApp.version], ['published', 2]);
  const manifest = desktopManifest(state.desktopApp, 'agency');
  assert.deepEqual([manifest.name, manifest.display, manifest.start_url, manifest.theme_color, manifest.icons.map(row => row.sizes)], ['Agência Norte', 'standalone', '/desktop/agency/', '#0e6ba8', ['192x192', '512x512', '1024x1024']]);
});

test('Desktop app over HTTP: hidden until published, then the sign-in screen, manifest, icons and worker', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = body => fetch(`${base}/api/agency/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
  assert.equal((await fetch(`${base}/desktop/agency/`)).status, 404);
  assert.equal((await action({ type: 'desktop-app-publish' })).status, 400);
  const saved = await action({ type: 'desktop-app', data: { appName: 'Agência Norte', title: 'Tudo num lugar', subtitle: 'Entre para começar', theme: { preset: 'esmeralda', background: '#f0f9f4', text: '#14261b', button: '#1f7a4d', buttonText: '#ffffff' }, icon: PNG, icon192: PNG, icon512: PNG } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await action({ type: 'desktop-app-publish' })).status, 200);
  const page = await fetch(`${base}/desktop/agency/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>Agência Norte<\/title>/);
  assert.match(html, /rel="manifest" href="\/desktop\/agency\/manifest\.webmanifest"/);
  assert.match(html, /Entrar no Agência Norte/);
  assert.match(page.headers.get('content-security-policy'), /manifest-src 'self'/);
  const manifest = await (await fetch(`${base}/desktop/agency/manifest.webmanifest`)).json();
  assert.equal(manifest.background_color, '#f0f9f4');
  const icon = await fetch(`${base}/desktop/agency/icon-192.png`);
  assert.deepEqual([icon.status, icon.headers.get('content-type')], [200, 'image/png']);
  assert.equal((await icon.arrayBuffer()).byteLength > 50, true);
  const worker = await fetch(`${base}/desktop/agency/sw.js`);
  assert.match(worker.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`${base}/desktop/outra/`)).status, 404);
});
