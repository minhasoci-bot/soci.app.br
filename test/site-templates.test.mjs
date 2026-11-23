import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { siteTemplatePages, siteTemplatePreview } from '../site-templates/index.mjs';
import { createHash } from 'node:crypto';
import { publicHeaders, renderPublic, sanitizeHtml, SITE_LIMITS, withMotion } from '../studio-site.mjs';
import { siteTemplateCategories, siteTemplates } from '../ui/site-template-data.js';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://${host}:${server.address().port}`;
}

test('Every catalog template renders static pt-BR pages that survive the sanitizer', () => {
  const categories = new Set(siteTemplateCategories.map(([id]) => id));
  for (const meta of siteTemplates) {
    assert.ok(categories.has(meta.category), `${meta.id}: unknown category`);
    const pages = siteTemplatePages(meta.id, { brand: 'Marca <Teste>', kind: 'funnel' });
    assert.deepEqual(pages.filter(p => p.slug !== 'obrigado').map(p => p.name), meta.pages, `${meta.id}: page list matches the catalog`);
    assert.equal(pages[0].slug, 'index');
    const slugs = new Set(pages.map(p => p.slug));
    for (const page of pages) {
      const where = `${meta.id}/${page.slug}`;
      assert.equal(sanitizeHtml(page.html), page.html, `${where}: sanitizer changes nothing`);
      assert.ok(page.html.length < SITE_LIMITS.html, `${where}: under the page size limit`);
      assert.match(page.html, /<html lang="pt-BR" data-motion/, `${where}: Portuguese, with the motion layer`);
      assert.doesNotMatch(page.html, /<script/i, `${where}: no scripts`);
      assert.match(page.html, /Marca &lt;Teste&gt;/, `${where}: brand is escaped`);
      assert.doesNotMatch(page.html, /Marca <Teste>/, `${where}: brand never raw`);
      for (const [, slug] of page.html.matchAll(/href="page:([a-z0-9-]+)/g)) assert.ok(slugs.has(slug), `${where}: link to page:${slug} exists`);
    }
    assert.ok(pages.some(p => /<form data-go-lead/.test(p.html)), `${meta.id}: captures leads somewhere`);
  }
});

test('Thumbnail previews swap videos for their poster and keep links inside the preview', () => {
  const full = siteTemplatePreview('corretora', 'index');
  assert.match(full, /<video /);
  assert.match(full, /href="\/studio-template\/corretora\/imoveis"/);
  const thumb = siteTemplatePreview('corretora', 'index', { thumb: true });
  assert.doesNotMatch(thumb, /<video/);
  assert.throws(() => siteTemplatePreview('corretora', 'nada'), /Página não encontrada/);
});

test('Published pages keep in-page anchors on internal links and allow https media', () => {
  const html = renderPublic({ slug: 'index', html: '<!doctype html><a href="page:index#servicos">a</a><a href="page:contato">b</a>' }, { base: '/s/w/p' });
  assert.match(html, /href="\/s\/w\/p#servicos"/);
  assert.match(html, /href="\/s\/w\/p\/contato"/);
});

test('The motion script runs only on marked pages, allowed by its exact hash', () => {
  const page = siteTemplatePages('corretora')[0].html;
  assert.doesNotMatch(page, /<script/i, 'stored pages never carry the script');
  const [headers, html] = withMotion(publicHeaders, page);
  const script = html.match(/<script>([\s\S]*?)<\/script><\/body>/)?.[1];
  assert.ok(script, 'script injected right before </body>');
  const hash = createHash('sha256').update(script).digest('base64');
  const scriptSrc = headers['Content-Security-Policy'].split(';').map(p => p.trim()).find(p => p.startsWith('script-src'));
  assert.equal(scriptSrc, `script-src 'sha256-${hash}'`, 'only the exact motion script may run');
  const [plainHeaders, plain] = withMotion(publicHeaders, '<!doctype html><html lang="pt-BR"><body>oi</body></html>');
  assert.equal(plain, '<!doctype html><html lang="pt-BR"><body>oi</body></html>');
  assert.equal(plainHeaders, publicHeaders);
  assert.match(sanitizeHtml(html), /<\/body>/);
  assert.doesNotMatch(sanitizeHtml(html), /<script/i, 'a saved copy of a served page loses the script');
});

test('Sites can be created from a template, and the gallery preview is served', async t => {
  const base = await start(t);
  const post = body => fetch(`${base}/api/studio?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await post({ mode: 'starter', kind: 'website', siteTemplate: 'nao-existe', name: 'X', brief: 'X' })).status, 400);

  const created = await post({ mode: 'starter', kind: 'website', siteTemplate: 'corretora', name: 'Casa Mar Imóveis', brief: 'Casa Mar Imóveis' });
  assert.equal(created.status, 201);
  const { id, state } = await created.json();
  assert.equal(state.studioProjects.find(p => p.id === id).name, 'Casa Mar Imóveis');
  const { doc } = await (await fetch(`${base}/api/studio/doc?workspace=demo&id=${id}`)).json();
  assert.deepEqual(doc.pages.map(p => p.slug), ['index', 'imoveis', 'contato']);
  assert.match(doc.pages[0].html, /Casa Mar Imóveis/);

  const funnel = await post({ mode: 'starter', kind: 'funnel', siteTemplate: 'interiores', name: '', brief: 'Ateliê' });
  const funnelId = (await funnel.json()).id;
  const funnelDoc = (await (await fetch(`${base}/api/studio/doc?workspace=demo&id=${funnelId}`)).json()).doc;
  assert.deepEqual(funnelDoc.pages.map(p => p.slug), ['index', 'obrigado']);
  assert.match(funnelDoc.pages[0].html, /Ateliê Lume/, 'falls back to the template brand');

  const preview = await fetch(`${base}/studio-template/litoral/index`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-security-policy'), /media-src https:/);
  assert.match(preview.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(preview.headers.get('content-security-policy'), /script-src 'sha256-/);
  assert.match(await preview.text(), /<script>\(function siteMotion/);
  const thumb = await fetch(`${base}/studio-template/litoral/index?thumb`);
  assert.doesNotMatch(thumb.headers.get('content-security-policy'), /script-src/);
  assert.equal((await fetch(`${base}/studio-template/nao-existe/index`)).status, 404);
  assert.equal((await fetch(`${base}/site-template-data.js`)).status, 200);
});
