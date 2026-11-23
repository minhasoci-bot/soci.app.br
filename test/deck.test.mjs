import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blankAgency, executeAgency } from '../agency-model.mjs';
import { createCanonicalPresentationTemplates, createPresentationFromTemplate } from '../ui/presentation-data.js';
import { applyOps, createDeck, createSlide, deckFromLegacy, isDeck, sanitizeDeck, LAYOUTS, PAGE, resolveColor, runsText } from '../ui/deck-model.js';
import { renderSlideSvg, shapePath } from '../ui/deck-render.js';
import { SHAPES } from '../ui/deck-model.js';

async function start(store = createSqliteStore(':memory:')) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, body: json, text };
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)) };
}

test('legacy templates convert into decks with free elements and survive validation', () => {
  for (const tpl of createCanonicalPresentationTemplates()) {
    const deck = deckFromLegacy(createPresentationFromTemplate(tpl.id, { name: 'Agência X', primaryColor: '#123456', accentColor: '#ff6600' }));
    assert.ok(isDeck(deck));
    assert.equal(deck.slides.length, tpl.slides.length);
    assert.equal(deck.theme.colors.dk1, '#123456');
    assert.equal(deck.theme.colors.accent1, '#ff6600');
    for (const slide of deck.slides) assert.ok(slide.elements.length >= 2, 'every converted slide keeps its content');
    const clean = sanitizeDeck(deck);
    assert.equal(clean.slides.length, deck.slides.length);
    const text = clean.slides.flatMap(s => s.elements).map(e => runsText(e.runs)).join(' ');
    assert.match(text, /\S/);
  }
  const crew = deckFromLegacy(createPresentationFromTemplate('template-crewsystems'));
  const headline = crew.slides[0].elements.find(e => /contractors brasileiros/i.test(runsText(e.runs)));
  assert.ok(headline, 'cover headline is a text element');
  assert.ok(headline.runs.some(r => r.color === '@accent1'), 'accent spans become accent-colored runs');
});

test('every operation has an exact inverse (undo restores the deck byte for byte)', () => {
  const deck = sanitizeDeck(createDeck({ title: 'Ops' }));
  deck.slides.push(createSlide('title-body'));
  const before = JSON.stringify(deck);
  const s = deck.slides[0], el = s.elements[0];
  const ops = [
    { t: 'el.set', s: s.id, id: el.id, v: { x: 12, rot: 30, runs: [{ t: 'Olá', b: true }] } },
    { t: 'el.add', s: s.id, el: { id: 'shape-1', type: 'shape', shape: 'star5', x: 10, y: 10, w: 40, h: 40, fill: '@accent1' } },
    { t: 'el.z', s: s.id, id: 'shape-1', i: 0 },
    { t: 'el.set', s: s.id, id: 'shape-1', v: { fill: null } },
    { t: 'slide.add', slide: createSlide('blank'), i: 1 },
    { t: 'slide.move', id: deck.slides[1].id, i: 0 },
    { t: 'slide.set', id: s.id, v: { notes: 'fala', background: '#000000' } },
    { t: 'deck.set', v: { title: 'Outro título' } },
    { t: 'el.del', s: s.id, id: el.id }
  ];
  const inverse = applyOps(deck, ops);
  assert.notEqual(JSON.stringify(deck), before);
  applyOps(deck, inverse);
  assert.equal(JSON.stringify(deck), before);
  assert.throws(() => applyOps(deck, [{ t: 'el.del', s: s.id, id: 'nope' }]), /não encontrado/);
  assert.throws(() => applyOps(deck, [{ t: 'nope' }]), /desconhecida/);
});

test('validation rejects unsafe values and keeps theme colors as tokens', () => {
  const deck = createDeck({ title: 'Seguro' });
  const slide = deck.slides[0];
  slide.elements.push(
    { id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 20, runs: [{ t: '<script>alert(1)</script>', color: 'red;background:url(x)', href: 'javascript:alert(1)' }], style: { color: 'expression(1)', font: 'Comic"' } },
    { id: 'b', type: 'shape', shape: 'hack', x: 0, y: 0, w: 10, h: 10, fill: '@accent3' }
  );
  const clean = sanitizeDeck(deck);
  const [a, b] = clean.slides[0].elements.slice(-2);
  assert.equal(a.runs[0].color, undefined);
  assert.equal(a.runs[0].href, undefined);
  assert.equal(a.style.color, '@dk1');
  assert.equal(a.style.font, '@body');
  assert.equal(b.shape, 'rect');
  assert.equal(b.fill, '@accent3');
  assert.throws(() => sanitizeDeck({ ...deck, slides: [{ elements: [{ type: 'image', x: 0, y: 0, w: 1, h: 1, src: 'javascript:alert(1)' }] }] }), /Imagem inválida/);
  assert.throws(() => sanitizeDeck({ ...deck, slides: [{ elements: [{ type: 'brand', x: 0, y: 0, w: 1, h: 1 }] }] }), /Tipo de elemento/);
  assert.throws(() => sanitizeDeck({ ...deck, slides: [] }), /pelo menos um slide/);
  const svg = renderSlideSvg(clean, clean.slides[0], { index: 0, total: 1 });
  assert.ok(!svg.includes('<script>'), 'text is escaped in the SVG');
  assert.match(svg, /&lt;script&gt;/);
  assert.equal(resolveColor(clean, '@accent3'), clean.theme.colors.accent3);
});

test('renderer draws every shape, layout and the master chrome', () => {
  for (const [id] of SHAPES) assert.match(shapePath(id, 120, 80), /^M/, id);
  const deck = createDeck({ title: 'Layouts', company: { name: 'Agência Y' } });
  LAYOUTS.forEach((layout, i) => {
    const svg = renderSlideSvg(deck, createSlide(layout.id), { index: i, total: LAYOUTS.length, editing: true });
    assert.match(svg, new RegExp(`viewBox="0 0 ${PAGE.width} ${PAGE.height}"`));
    assert.match(svg, /^<svg [^>]*data-no-translate="1"/, 'slide content is never run through the UI translator');
    assert.match(svg, /Agência Y/, 'brand from the theme master');
    assert.match(svg, new RegExp(`${String(i + 1).padStart(2, '0')} / ${String(LAYOUTS.length).padStart(2, '0')}`), 'automatic slide number');
  });
  const empty = renderSlideSvg(deck, createSlide('title-body'), { editing: false });
  assert.ok(!empty.includes('Clique para adicionar'), 'empty placeholders are invisible outside the editor');
});

test('presentation-ops applies batches against the revision and rejects stale writes', () => {
  const state = blankAgency();
  const deck = createDeck({ title: 'Deck com revisão' });
  const id = executeAgency(state, { type: 'presentation-save', data: deck });
  const row = state.presentations.find(p => p.id === id);
  assert.ok(isDeck(row));
  const rev = row.rev;
  const slideId = row.slides[0].id;
  const newRev = executeAgency(state, { type: 'presentation-ops', id, data: { rev, ops: [{ t: 'el.add', s: slideId, el: { id: 'x1', type: 'shape', shape: 'ellipse', x: 1, y: 2, w: 30, h: 30 } }] } });
  assert.equal(newRev, rev + 1);
  assert.ok(row.slides[0].elements.some(e => e.id === 'x1'));
  assert.throws(() => executeAgency(state, { type: 'presentation-ops', id, data: { rev, ops: [{ t: 'deck.set', v: { title: 'velho' } }] } }), err => err.status === 409);
  assert.throws(() => executeAgency(state, { type: 'presentation-ops', id, data: { rev: newRev, ops: [{ t: 'el.del', s: slideId, id: 'missing' }] } }), /não encontrado/);
  assert.equal(row.rev, newRev, 'a failed batch changes nothing');
  executeAgency(state, { type: 'presentation-ops', id, data: { rev: newRev, ops: [{ t: 'deck.set', v: { title: 'Novo título' } }] } });
  assert.equal(row.title, 'Novo título');
  assert.equal(row.name, 'Novo título');

  // A legacy row is converted by saving a deck over it; stale legacy keys do not survive.
  const legacy = createPresentationFromTemplate('template-crewsystems');
  const legacyId = executeAgency(state, { type: 'presentation-save', data: legacy });
  assert.throws(() => executeAgency(state, { type: 'presentation-ops', id: legacyId, data: { rev: 0, ops: [{ t: 'deck.set', v: { title: 'x' } }] } }), /converter|convertê-la/);
  executeAgency(state, { type: 'presentation-share', id: legacyId, data: { action: 'create', days: 0 } });
  const converted = deckFromLegacy(state.presentations.find(p => p.id === legacyId));
  executeAgency(state, { type: 'presentation-save', id: legacyId, data: converted });
  const after = state.presentations.find(p => p.id === legacyId);
  assert.ok(isDeck(after));
  assert.ok(after.share?.id, 'the public link survives the conversion');
  assert.equal(after.slides[0].layout, undefined);
});

test('public link renders a deck as SVG slides without skipped ones', async t => {
  const local = await start();
  t.after(local.close);
  const deck = createDeck({ title: 'Deck público', company: { name: 'Agência Z' } });
  deck.slides[0].elements[0].runs = [{ t: 'Primeiro slide' }];
  const hidden = createSlide('title-only');
  hidden.elements[0].runs = [{ t: 'Slide escondido' }];
  hidden.skipped = true;
  deck.slides.push(hidden);
  const saved = await local.call('/api/agency/action', { type: 'presentation-save', data: deck });
  assert.equal(saved.status, 200);
  const id = saved.body.result;
  const share = await local.call('/api/agency/action', { type: 'presentation-share', id, data: { action: 'create', days: 30 } });
  const token = share.body.agency.presentations.find(p => p.id === id).share.id;
  const stale = await local.call('/api/agency/action', { type: 'presentation-ops', id, data: { rev: 99, ops: [{ t: 'deck.set', v: { title: 'x' } }] } });
  assert.equal(stale.status, 409);
  const page = await local.call(`/apresentacao/${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /class="slide deck-slide active"/);
  assert.match(page.text, /<svg class="sd-svg"/);
  assert.match(page.text, /Primeiro slide/);
  assert.ok(!page.text.includes('Slide escondido'));
  assert.match(page.text, /id="deck"/);
});
