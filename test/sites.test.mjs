import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { base, call };
}

test('Funnels start with capture and thank-you steps, and steps can move, get paths, copies and SEO', async t => {
  const { call } = await start(t);
  assert.equal((await call('/api/studio?workspace=demo', { mode: 'blank', kind: 'funnel', name: '' })).status, 400);
  const created = await call('/api/studio?workspace=demo', { mode: 'blank', kind: 'funnel', name: 'Aula gratuita' });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.state.studioProjects.find(p => p.id === id).kind, 'funnel');
  let { doc } = (await call(`/api/studio/doc?workspace=demo&id=${id}`)).body;
  assert.deepEqual(doc.pages.map(p => [p.name, p.slug]), [['Página de captura', 'index'], ['Obrigado', 'obrigado']]);
  assert.match(doc.pages[1].html, /href="page:index"/);

  const page = (op, body) => call(`/api/studio/${op}?workspace=demo`, { id, ...body });
  doc = (await page('page', { action: 'add', name: 'Oferta especial' })).body.doc;
  const offer = doc.pages.at(-1);
  doc = (await page('page', { action: 'move', pageId: offer.id, direction: 'up' })).body.doc;
  assert.deepEqual(doc.pages.map(p => p.slug), ['index', 'oferta-especial', 'obrigado']);
  assert.equal((await page('page', { action: 'move', pageId: offer.id, direction: 'up' })).status, 400, 'nothing moves above the first step');
  assert.equal((await page('page', { action: 'slug', pageId: offer.id, slug: 'obrigado' })).status, 400, 'paths are unique');
  const thanks = doc.pages.find(p => p.slug === 'obrigado');
  doc = (await page('page', { action: 'slug', pageId: thanks.id, slug: 'Muito Obrigado!' })).body.doc;
  assert.equal(doc.pages.find(p => p.id === thanks.id).slug, 'muito-obrigado');
  doc = (await page('page', { action: 'duplicate', pageId: offer.id })).body.doc;
  assert.deepEqual(doc.pages.map(p => p.name), ['Página de captura', 'Oferta especial', 'Oferta especial (cópia)', 'Obrigado']);
  doc = (await page('seo', { pageId: doc.pages[0].id, title: '  Aula   gratuita ', description: 'Aprenda em 1 hora.' })).body.doc;
  assert.deepEqual(doc.pages[0].seo, { title: 'Aula gratuita', description: 'Aprenda em 1 hora.' });

  const meta = await call('/api/action?workspace=demo', { type: 'studio-meta', id, data: { name: 'Aula ao vivo', kind: 'website' } });
  const renamed = meta.body.state.studioProjects.find(p => p.id === id);
  assert.deepEqual([renamed.name, renamed.kind], ['Aula ao vivo', 'website']);
  assert.equal((await call('/api/action?workspace=demo', { type: 'studio-meta', id, data: { kind: 'shop' } })).status, 400);
});

test('A published funnel counts visits and opt-ins, applies SEO and sends each form to the next step', async t => {
  const { base, call } = await start(t);
  const id = (await call('/api/studio?workspace=demo', { mode: 'starter', kind: 'funnel', template: 'landing', brief: 'Clínica Sorriso' })).body.id;
  let { doc } = (await call(`/api/studio/doc?workspace=demo&id=${id}`)).body;
  const [capture, thanks] = doc.pages;
  await call('/api/studio/seo?workspace=demo', { id, pageId: capture.id, title: 'Clareamento em BH', description: 'Agende sua avaliação.' });
  await call('/api/studio/publish?workspace=demo', { id, publish: true });
  const site = `${base}/s/demo/${id}`;

  const html = await (await fetch(site)).text();
  assert.match(html, /<title>Clareamento em BH<\/title>/);
  assert.match(html, /<meta name="description" content="Agende sua avaliação.">/);
  await fetch(site);
  const post = body => fetch(site, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const next = await post('name=Ana&email=ana.funil%40example.test&_page=index');
  assert.equal(next.status, 303);
  assert.equal(next.headers.get('location'), `/s/demo/${id}/obrigado`);
  const last = await post('name=Ana&email=ana.funil%40example.test&_page=obrigado');
  assert.match(last.headers.get('location'), /\/obrigado\?sent=1$/, 'the last step shows the confirmation');

  doc = (await call(`/api/studio/doc?workspace=demo&id=${id}`)).body.doc;
  assert.deepEqual(doc.stats[capture.id], { views: 2, optins: 1 });
  assert.equal(doc.stats[thanks.id].optins, 1);
  assert.ok(doc.statsSince);
  doc = (await call('/api/studio/stats-reset?workspace=demo', { id })).body.doc;
  assert.deepEqual(doc.stats, {});

  await call('/api/action?workspace=demo', { type: 'studio-meta', id, data: { kind: 'website' } });
  const stay = await post('name=Bia&email=bia%40example.test&_page=index');
  assert.match(stay.headers.get('location'), new RegExp(`/s/demo/${id}\\?sent=1$`), 'websites keep the visitor on the page');
});
