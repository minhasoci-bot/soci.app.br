import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { validDesign, validPlan } from '../ui/studio-design.js';
import { chatEntry, newSiteDoc, restoreVersion, savePage } from '../studio-site.mjs';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  return async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
}

test('Design answers are validated and plans get unique paths with the first page at the root', () => {
  const design = validDesign({ palette: { name: 'X', colors: ['#000000', 'red', '#ffffff', '#123456'] }, fonts: { heading: 'Bad<font>', body: 'Inter' }, layout: 'diagonal' });
  assert.equal(design.palette.colors.length, 4);
  assert.notEqual(design.palette.colors[1], 'red', 'invalid colors fall back to a full palette');
  assert.equal(design.fonts.heading, 'Inter');
  assert.equal(design.layout, 'split');
  const plan = validPlan({ name: 'Loja', pages: [{ name: 'Oferta', slug: 'oferta' }, { name: 'Oferta', slug: 'oferta' }, { name: 'Lead', slug: 'lead' }] }, 'funnel');
  assert.deepEqual(plan.pages.map(page => page.slug), ['index', 'oferta', 'pagina']);
});

test('The builder asks design questions, plans the pages and builds each one with the chosen design', async t => {
  const call = await start(t);
  const brief = 'Funil para um estúdio de design em BH com diagnóstico gratuito';
  const discovery = await call('/api/studio/discover?workspace=demo', { brief, kind: 'funnel' });
  assert.equal(discovery.status, 200);
  assert.equal(discovery.body.ai, false);
  assert.deepEqual(discovery.body.questions.map(q => [q.type, q.options.length]), [['palette', 4], ['fonts', 4], ['layout', 4]]);
  assert.equal((await call('/api/studio/discover?workspace=demo', { brief: '' })).status, 400);

  const design = { palette: { name: 'Noir & Gold', colors: ['#0d0d0f', '#1c1b1f', '#c9a24a', '#f2d58c'] }, fonts: { name: 'Elegante', heading: 'Instrument Serif', body: 'Work Sans' }, layout: 'split' };
  const { plan } = (await call('/api/studio/plan?workspace=demo', { brief, kind: 'funnel', design })).body;
  assert.equal(plan.pages[0].slug, 'index');
  assert.match(plan.pages.at(-1).name, /Obrigado/);

  const created = await call('/api/studio?workspace=demo', { mode: 'starter', kind: 'funnel', brief, template: 'landing', design, plan });
  assert.equal(created.status, 201);
  const project = created.body.state.studioProjects.find(item => item.id === created.body.id);
  assert.equal(project.name, plan.name);
  assert.equal(project.design.fonts.heading, 'Instrument Serif');
  let { doc } = (await call(`/api/studio/doc?workspace=demo&id=${project.id}`)).body;
  assert.equal(doc.pages.length, 1, 'only the entry page is built with the project');
  assert.match(doc.pages[0].html, /Instrument\+Serif/);
  assert.match(doc.pages[0].html, /#c9a24a/);
  assert.match(doc.pages[0].html, /data-go-lead/);

  const added = await call('/api/studio/page?workspace=demo', { id: project.id, action: 'add', name: 'Obrigado', slug: 'obrigado', description: 'Confirma o envio' });
  doc = added.body.doc;
  assert.deepEqual(doc.pages.map(page => page.slug), ['index', 'obrigado']);
  assert.match(doc.pages[1].html, /Recebemos seus dados/);
  assert.doesNotMatch(doc.pages[1].html, /data-go-lead/);

  const noted = await call('/api/studio/note?workspace=demo', { id: project.id, ask: brief, reply: 'Construí o funil.' });
  assert.equal(noted.body.doc.chat.at(-1).reply, 'Construí o funil.');
  assert.equal((await call('/api/studio/chat-undo?workspace=demo', { id: project.id, entryId: noted.body.doc.chat.at(-1).id })).status, 400, 'notes have nothing to undo');
});

test('An AI chat entry keeps the version from before the change so it can be restored', () => {
  const doc = newSiteDoc({ workspace: 'demo', project: { id: 'p' }, pages: [{ name: 'Home', slug: 'index', html: '<!doctype html><html><body><h1>Antes</h1></body></html>' }] });
  const before = doc.versions.at(-1).id;
  savePage(doc, doc.pages[0].id, '<!doctype html><html><body><h1>Depois</h1></body></html>', 'AI: troque o título');
  const entry = chatEntry(doc, { ask: 'Troque o título', reply: 'Troquei.', before, page: 'Home' });
  assert.equal(doc.chat.find(item => item.id === entry).before, before);
  restoreVersion(doc, before);
  assert.match(doc.pages[0].html, /Antes/);
});
