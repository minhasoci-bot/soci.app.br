import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { setupTemplateSpecs } from '../setup-templates.mjs';
import { setupArt, setupArtKey, setupArtBySegment } from '../ui/setup-art.js';

const dir = new URL('../ui/setup-art/', import.meta.url);

test('Every setup template has its own illustration file, and every file belongs to a template', () => {
  const files = readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).sort();
  const keys = setupTemplateSpecs.map(t => setupArtKey(t.segment, t.id));
  assert.equal(new Set(keys).size, setupTemplateSpecs.length, 'each template gets a different illustration');
  assert.deepEqual([...keys].sort(), files);
  for (const t of setupTemplateSpecs) assert.ok(setupArtBySegment[t.segment].includes(setupArtKey(t.segment, t.id)), `${t.id} is listed under ${t.segment}`);
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
