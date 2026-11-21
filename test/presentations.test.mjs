import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blankAgency, executeAgency } from '../agency-model.mjs';
import {
  createCanonicalPresentationTemplates,
  createBlankPresentation,
  createPresentationFromTemplate,
  PRESENTATION_LAYOUTS
} from '../ui/presentation-data.js';
import { sanitizePresentation } from '../presentation-model.mjs';

async function start(store = createSqliteStore(':memory:')) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, body: json, text, headers: r.headers };
  };
  return { base, call, store, close: () => new Promise(resolve => server.close(resolve)) };
}

const agencyAction = (local, body, headers) => local.call('/api/agency/action', body, headers);

test('Canonical templates and presentation creation from templates', () => {
  const templates = createCanonicalPresentationTemplates();
  assert.ok(templates.length >= 2, 'Should provide at least Crew Systems and Proposta templates');

  const crew = templates.find(t => t.id === 'template-crewsystems');
  assert.ok(crew, 'Crew Systems template must exist');
  assert.equal(crew.slides.length, 7, 'Crew Systems template must have exactly 7 slides');

  // Verify slide 1: Cover
  assert.equal(crew.slides[0].layout, 'cover');
  assert.match(crew.slides[0].headline, /contractors brasileiros/i);
  assert.match(crew.slides[0].headline, /chatgpt/i);
  assert.equal(crew.slides[0].pills.length, 3);

  // Verify slide 2: Problem / Pain
  assert.equal(crew.slides[1].layout, 'pain');
  assert.equal(crew.slides[1].items.length, 5, 'Pain slide must have 5 pain points');

  // Verify slide 3: Solution
  assert.equal(crew.slides[2].layout, 'solution');
  assert.equal(crew.slides[2].cards.length, 2, 'Solution slide must have 2 core pillars');

  // Verify slide 4: Services / Marketing
  assert.equal(crew.slides[3].layout, 'services');
  assert.equal(crew.slides[3].cards.length, 3, 'Services slide must have 3 cards');

  // Verify slide 5: Sales Mechanism
  assert.equal(crew.slides[4].layout, 'sales');
  assert.equal(crew.slides[4].cards.length, 2, 'Sales mechanism slide must have 2 cards');

  // Verify slide 6: Bundle / Pricing
  assert.equal(crew.slides[5].layout, 'bundle');
  assert.equal(crew.slides[5].cards.length, 5, 'Bundle slide must have 5 items');
  assert.equal(crew.slides[5].pills.length, 3);

  // Verify slide 7: Process / Steps
  assert.equal(crew.slides[6].layout, 'process');
  assert.equal(crew.slides[6].steps.length, 4, 'Process slide must have 4 steps');

  // Create presentation from template
  const pres = createPresentationFromTemplate('template-crewsystems', {
    agencyName: 'Vanguarda Digital',
    agencyLogo: 'https://vanguarda.example/logo.svg',
    primaryColor: '#123456',
    secondaryColor: '#f59e0b'
  });

  assert.equal(pres.agencyName, 'Vanguarda Digital');
  assert.equal(pres.agencyLogo, 'https://vanguarda.example/logo.svg');
  assert.equal(pres.primaryColor, '#123456');
  assert.equal(pres.secondaryColor, '#f59e0b');
  assert.equal(pres.slides.length, 7);
  assert.notEqual(pres.id, crew.id, 'Created presentation must have unique ID');

  // Blank presentation
  const blankPres = createBlankPresentation({ name: 'Apresentação em Branco', agencyName: 'Minha Agência' });
  assert.equal(blankPres.name, 'Apresentação em Branco');
  assert.equal(blankPres.agencyName, 'Minha Agência');
  assert.ok(blankPres.slides.length >= 1);
});

test('Sanitize presentation validates bounds, layout types, and slide structures', () => {
  const valid = createBlankPresentation({ name: 'Teste Sanitização' });
  const sanitized = sanitizePresentation(valid);
  assert.equal(sanitized.name, 'Teste Sanitização');
  assert.ok(sanitized.slides.length >= 1);

  // Invalid: missing title
  assert.throws(() => sanitizePresentation({ ...valid, name: '', title: '' }), /Informe o título/);

  // Invalid: empty slides
  assert.throws(() => sanitizePresentation({ ...valid, slides: [] }), /menos uma lâmina/);

  // Invalid: too many slides
  const manySlides = Array.from({ length: 51 }, (_, i) => ({
    id: `s-${i}`,
    layout: 'cover',
    headline: `Slide ${i}`
  }));
  assert.throws(() => sanitizePresentation({ ...valid, slides: manySlides }), /50 lâminas/);
});

test('Agency model executes presentation-save, presentation-duplicate, presentation-share, and presentation-delete', () => {
  const state = blankAgency();
  assert.deepEqual(state.presentations, []);

  // Save new presentation
  const p1 = createPresentationFromTemplate('template-crewsystems', { agencyName: 'Agência Alfa' });
  executeAgency(state, { type: 'presentation-save', data: p1 });
  assert.equal(state.presentations.length, 1);
  assert.equal(state.presentations[0].agencyName, 'Agência Alfa');
  assert.equal(state.presentations[0].slides.length, 7);

  // Update presentation
  const updatedP1 = { ...state.presentations[0], name: 'Crew Systems Atualizado' };
  executeAgency(state, { type: 'presentation-save', data: updatedP1 });
  assert.equal(state.presentations.length, 1);
  assert.equal(state.presentations[0].name, 'Crew Systems Atualizado');

  // Duplicate presentation
  const dupId = executeAgency(state, { type: 'presentation-duplicate', id: p1.id });
  assert.equal(state.presentations.length, 2);
  const dup = state.presentations.find(p => p.id === dupId);
  assert.ok(dup);
  assert.equal(dup.name, 'Crew Systems Atualizado (Cópia)');
  assert.equal(dup.slides.length, 7);

  // Share presentation with 7 days expiration
  executeAgency(state, { type: 'presentation-share', id: p1.id, data: { action: 'create', days: 7 } });
  const shared = state.presentations.find(p => p.id === p1.id);
  assert.ok(shared.share);
  assert.match(shared.share.id, /^[0-9a-f]{64}$/);
  assert.ok(shared.share.expires);

  // Revoke share
  executeAgency(state, { type: 'presentation-share', id: p1.id, data: { action: 'revoke' } });
  assert.equal(state.presentations.find(p => p.id === p1.id).share, undefined);

  // Re-share without expiration
  executeAgency(state, { type: 'presentation-share', id: p1.id, data: { action: 'create', days: 0 } });
  const reShared = state.presentations.find(p => p.id === p1.id);
  assert.ok(reShared.share);
  assert.equal(reShared.share.expires, '');

  // Delete presentation
  executeAgency(state, { type: 'presentation-delete', id: dupId });
  assert.equal(state.presentations.length, 1);
  assert.equal(state.presentations[0].id, p1.id);
});

test('Public presentation route /apresentacao/:token serves standalone responsive presentation', async t => {
  const local = await start();
  t.after(local.close);

  // Set agency company details
  const companyRes = await agencyAction(local, {
    type: 'company',
    data: {
      name: 'Agência Rocket Sales',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      primary: '#092540',
      secondary: '#f65b00'
    }
  });
  assert.equal(companyRes.status, 200);

  // Create presentation
  const template = createCanonicalPresentationTemplates()[0];
  const pres = {
    ...template,
    id: 'pres-rocket-001',
    name: 'Apresentação Comercial Rocket',
    agencyName: 'Agência Rocket Sales',
    primaryColor: '#092540',
    secondaryColor: '#f65b00'
  };

  const saveRes = await agencyAction(local, { type: 'presentation-save', data: pres });
  assert.equal(saveRes.status, 200);

  // Generate share token
  const shareRes = await agencyAction(local, {
    type: 'presentation-share',
    id: 'pres-rocket-001',
    data: { action: 'create', days: 30 }
  });
  assert.equal(shareRes.status, 200);
  const token = shareRes.body.agency.presentations.find(p => p.id === 'pres-rocket-001').share.id;
  assert.match(token, /^[0-9a-f]{64}$/);

  // Fetch public page
  const pageRes = await local.call(`/apresentacao/${token}`);
  assert.equal(pageRes.status, 200);
  assert.equal(pageRes.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(pageRes.text, /Agência Rocket Sales/);
  assert.match(pageRes.text, /Apresentação Comercial Rocket/);
  assert.match(pageRes.text, /contractors brasileiros/i);
  assert.match(pageRes.text, /id="deck"/);
  assert.match(pageRes.text, /class="controls"/);

  // Non-existent token returns 404
  const notFoundRes = await local.call('/apresentacao/' + 'a'.repeat(64));
  assert.equal(notFoundRes.status, 404);
  assert.match(notFoundRes.text, /não está mais compartilhada/i);
});
