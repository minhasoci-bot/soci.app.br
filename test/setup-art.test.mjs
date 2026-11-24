import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { setupTemplates } from '../setup-marketplace.mjs';
import { setupArt, setupArtKey, setupArtBySegment } from '../ui/setup-art.js';

const dir = new URL('../ui/setup-art/', import.meta.url);

test('Every setup template has its own illustration file, and every file belongs to a template', () => {
  const files = readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).sort();
  const templates = setupTemplates();
  const keys = templates.map(t => setupArtKey(t.segment, t.id));
  assert.equal(new Set(keys).size, templates.length, 'each template gets a different illustration');
  assert.deepEqual([...keys].sort(), files);
  for (const t of templates) assert.ok(setupArtBySegment[t.segment].includes(setupArtKey(t.segment, t.id)), `${t.id} is listed under ${t.segment}`);
});

test('Setups that are not official templates get a stable illustration from their own segment', () => {
  const a = setupArtKey('beauty', 'snap-123');
  assert.equal(a, setupArtKey('beauty', 'snap-123'));
  assert.ok(setupArtBySegment.beauty.includes(a));
  assert.ok(setupArtBySegment.other.includes(setupArtKey('unknown-segment', 'x')));
  assert.match(setupArt('auto', 'template-tire-shop', 'Loja <de> Pneus'), /data-ilu="tire-shop"[^>]*>/);
  assert.doesNotMatch(setupArt('auto', 'template-tire-shop', 'Loja <de> Pneus'), /aria-label="[^"]*[<>]/);
});

test('Illustration SVGs recolor through CSS variables and only use prefixed classes', () => {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    const svg = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(svg.startsWith('<svg'), f);
    assert.match(svg, /\.ilu-p\{fill:var\(--ilu-primaria/, f);
    assert.match(svg, /\.ilu-s\{fill:var\(--ilu-secundaria/, f);
    assert.deepEqual([...new Set([...svg.matchAll(/class="([^"]+)"/g)].map(m => m[1]))].filter(c => !/^ilu-[pskw]$/.test(c)), [], f);
    assert.doesNotMatch(svg, /<script|on[a-z]+=|href=/i, f);
  }
});

test('Illustration SVGs stay small: path data optimized (svgo convertPathData, precision 0, curves kept)', () => {
  let total = 0;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    const size = readFileSync(new URL(f, dir)).length;
    total += size;
    assert.ok(size <= 80_000, `${f} has ${size} bytes; optimize it before committing`);
  }
  assert.ok(total <= 5_000_000, `all illustrations together have ${total} bytes`);
});

test('Illustrations are cached by the browser and the CDN; the app shell is not', async t => {
  const { makeServer } = await import('../server.mjs');
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const art = await fetch(`${base}/setup-art/tire-shop.svg`);
  assert.equal(art.status, 200);
  assert.equal(art.headers.get('content-type'), 'image/svg+xml');
  assert.match(art.headers.get('cache-control'), /^public, max-age=86400, s-maxage=31536000/);
  await art.arrayBuffer();
  const shell = await fetch(`${base}/app`);
  assert.equal(shell.headers.get('cache-control'), 'no-store');
  await shell.arrayBuffer();
});
