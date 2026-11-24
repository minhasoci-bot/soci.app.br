import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { fitScale, pinViewportUnits } from '../ui/design-workspace.js';

test('Viewport heights become fixed pixels, so the page cannot grow with the editor frame', () => {
  assert.equal(pinViewportUnits('height: 100svh;', 740), 'height: 740px;');
  assert.equal(pinViewportUnits('height: calc(100vh - 92px); min-height: 50.5dvh;', 740), 'height: calc(740px - 92px); min-height: 373.7px;');
  assert.equal(pinViewportUnits('width: 100vw; font-size: clamp(40px, 6vw, 90px);', 740), 'width: 100vw; font-size: clamp(40px, 6vw, 90px);');
});

test('Fit shows the whole page while it stays readable, and fits the width when the page is long', () => {
  const area = { width: 1000, height: 800, boardWidth: 1280 };
  assert.equal(fitScale({ ...area, pageHeight: 2000 }), .4, 'short page fits whole');
  assert.equal(fitScale({ ...area, pageHeight: 9000 }), .78125, 'long page fits the width, never 10%');
  assert.equal(fitScale({ width: 2000, height: 800, boardWidth: 1280, pageHeight: 9000 }), 1, 'never above 100%');
});

test('A cached editor preview may still be framed by the app', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const created = await (await fetch(`${base}/api/studio?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'blank', kind: 'website', name: 'Cache' }) })).json();
  const { doc } = await (await fetch(`${base}/api/studio/doc?workspace=demo&id=${created.id}`)).json();
  const url = `${base}/studio-preview/demo/${created.id}/${doc.pages[0].id}`;
  const first = await fetch(url);
  const again = await fetch(url, { headers: { 'If-None-Match': first.headers.get('etag') } });
  assert.equal(again.status, 304);
  assert.equal(again.headers.get('content-security-policy'), first.headers.get('content-security-policy'));
  assert.match(again.headers.get('content-security-policy'), /frame-ancestors 'self'/);
});
