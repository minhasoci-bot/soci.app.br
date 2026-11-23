import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { ASSET_MIN, assetBytes, extractAssets, isAssetUrl, saveAssets, splitDataImage } from '../asset-store.mjs';

// PNG válido com bytes aleatórios suficientes para passar de ASSET_MIN em base64.
function bigPng(seed = 1) {
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const width = 64, height = 64, raw = Buffer.alloc((width * 3 + 1) * height);
  let x = seed; for (let i = 0; i < raw.length; i++) { x = (x * 1103515245 + 12345) >>> 0; raw[i] = i % (width * 3 + 1) === 0 ? 0 : x >>> 24; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

test('só imagens em base64 grandes saem do documento; o resto fica como está', () => {
  const big = bigPng();
  assert.ok(big.length >= ASSET_MIN);
  const small = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const state = { company: { logo: big, name: 'x' }, list: [small, big, { deep: big }], text: 'data:image/png;base64,' + 'A'.repeat(ASSET_MIN) + '!' };
  const found = extractAssets(state);
  assert.equal(found.size, 1, 'a mesma imagem vira uma linha só');
  const { url } = [...found.values()][0];
  assert.ok(isAssetUrl(url) && url.endsWith('.png'));
  assert.deepEqual(state, { company: { logo: url, name: 'x' }, list: [small, url, { deep: url }], text: state.text });
  assert.equal(splitDataImage(small), null);
});

test('assetBytes lê base64 e asset gravado; endereço inexistente ou com extensão trocada dá null', async () => {
  const store = createSqliteStore(':memory:');
  const big = bigPng(7);
  const found = extractAssets({ logo: big });
  await saveAssets(store, found);
  await saveAssets(store, found);
  const { url, data } = [...found.values()][0];
  const fromAsset = await assetBytes(store, url);
  assert.equal(fromAsset.mime, 'image/png');
  assert.equal(fromAsset.bytes.toString('base64'), data);
  assert.equal((await assetBytes(store, big)).bytes.toString('base64'), data);
  assert.equal(await assetBytes(store, url.replace('.png', '.jpg')), null);
  assert.equal(await assetBytes(store, '/asset/' + '0'.repeat(64) + '.png'), null);
  assert.equal(await assetBytes(store, 'https://example.com/a.png'), null);
});

test('logo e ícones grandes da agência viram /asset/<hash> e são servidos pelo app', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = async body => {
    const r = await fetch(base + '/api/agency/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };

  const logo = bigPng(3);
  const company = { name: 'Agência Asset', timezone: 'America/Sao_Paulo', currency: 'BRL', primary: '#7c5cf0', secondary: '#00c49a', logo };
  const saved = await action({ type: 'company', data: company });
  assert.equal(saved.status, 200);
  const url = saved.body.agency.company.logo;
  assert.ok(isAssetUrl(url), `logo virou endereço: ${String(url).slice(0, 40)}`);
  assert.ok(!JSON.stringify(store.load('agency')).includes(logo.slice(30, 200)), 'os bytes não ficam no documento');

  const served = await fetch(base + url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.match(served.headers.get('cache-control'), /immutable/);
  assert.equal(Buffer.from(await served.arrayBuffer()).toString('base64'), logo.split(',')[1]);
  assert.equal((await fetch(base + '/asset/' + '0'.repeat(64) + '.png')).status, 404);

  const resent = await action({ type: 'company', data: { ...company, logo: url } });
  assert.equal(resent.status, 200, 'reenviar o endereço do logo continua válido');
  assert.equal(resent.body.agency.company.logo, url);

  const icon = bigPng(5);
  const desktop = await action({ type: 'desktop-app', data: { appName: 'Agência Asset', title: 'Tudo num lugar', subtitle: 'Entre para começar', icon, icon192: icon, icon512: icon } });
  assert.equal(desktop.status, 200);
  assert.ok(isAssetUrl(desktop.body.agency.desktopApp.icon192));
  assert.equal((await action({ type: 'desktop-app-publish' })).status, 200);
  const png = await fetch(`${base}/desktop/agency/icon-192.png`);
  assert.equal(png.status, 200);
  assert.equal(Buffer.from(await png.arrayBuffer()).toString('base64'), icon.split(',')[1]);
});
