import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { readReference, sanitizeHtml } from '../studio-site.mjs';

async function start() {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { base, call, close: () => new Promise(resolve => server.close(resolve)) };
}

async function project(local) {
  const created = await local.call('/api/studio?workspace=demo', { mode: 'starter', template: 'landing', brief: 'Estúdio de teste' });
  assert.equal(created.status, 201);
  const { doc } = (await local.call(`/api/studio/doc?workspace=demo&id=${created.body.id}`)).body;
  return { id: created.body.id, doc };
}

test('Studio pages are real HTML, saved without scripts, versioned and restorable', async t => {
  const local = await start(); t.after(local.close);
  const { id, doc } = await project(local);
  const home = doc.pages[0];
  assert.equal(home.slug, 'index');
  assert.match(home.html, /^<!doctype html>/i);
  assert.match(home.html, /data-go-lead/);

  const unsafe = home.html.replace('</body>', '<script>alert(1)</script><a href="javascript:alert(2)" onclick="steal()">x</a><iframe src="https://example.com"></iframe></body>');
  const saved = await local.call('/api/studio/save?workspace=demo', { id, pageId: home.id, html: unsafe, label: 'Unsafe edit' });
  assert.equal(saved.status, 200);
  const html = saved.body.doc.pages[0].html;
  assert.doesNotMatch(html, /<script|javascript:|onclick|<iframe/i);

  const added = await local.call('/api/studio/page?workspace=demo', { id, action: 'add', name: 'Sobre nós' });
  assert.deepEqual(added.body.doc.pages.map(p => p.slug), ['index', 'sobre-nos']);
  assert.equal((await local.call('/api/studio/page?workspace=demo', { id, action: 'delete', pageId: home.id })).status, 400, 'home page cannot be deleted');

  const created = added.body.doc.versions.find(v => v.label === 'Created');
  const restored = await local.call('/api/studio/restore?workspace=demo', { id, versionId: created.id });
  assert.equal(restored.body.doc.pages.length, 1);
  assert.match(restored.body.doc.versions[0].label, /^Restored/);
  const meta = restored.body.state.studioProjects.find(p => p.id === id);
  assert.deepEqual(meta.pages.map(p => p.slug), ['index'], 'workspace metadata follows the site');

  const preview = await fetch(`${local.base}/studio-preview/demo/${id}/${home.id}`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(preview.headers.get('content-security-policy'), /script-src/);
});

test('A published site serves its pages and turns form posts into contacts', async t => {
  const local = await start(); t.after(local.close);
  const { id } = await project(local);
  const site = `${local.base}/s/demo/${id}`;
  assert.equal((await fetch(site)).status, 404, 'drafts are not public');

  const published = await local.call('/api/studio/publish?workspace=demo', { id, publish: true });
  const meta = published.body.state.studioProjects.find(p => p.id === id);
  assert.ok(meta.publishedAt);
  assert.ok(published.body.state.forms.some(f => f.id === meta.formId && f.active));

  const page = await fetch(site);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(page.headers.get('referrer-policy'), /same-origin/);
  assert.match(html, new RegExp(`action="/s/demo/${id}" method="post"`));

  const post = body => fetch(site, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: local.base }, body });
  const ok = await post('name=Ana+Lead&email=ANA.LEAD%40example.test&phone=1&_page=index');
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('location'), /\?sent=1$/);
  const bad = await post('name=&email=nope&_page=index');
  assert.match(bad.headers.get('location'), /\?error=1$/);
  const thanks = await (await fetch(`${site}?sent=1`)).text();
  assert.match(thanks, /Obrigado! Seus dados foram enviados\./);

  const state = (await local.call('/api/state?workspace=demo')).body.state;
  assert.ok(state.contacts.some(c => c.email === 'ana.lead@example.test'));
  assert.equal(state.submissions.filter(s => s.formId === meta.formId).length, 1);

  await local.call('/api/studio/publish?workspace=demo', { id, publish: false });
  assert.equal((await fetch(site)).status, 404);
});

test('Projects from before HTML pages open as a page built from their sections', async t => {
  const local = await start(); t.after(local.close);
  const old = await local.call('/api/action?workspace=demo', { type: 'save', key: 'studioProjects', data: {
    name: 'Projeto antigo', headline: 'Título antigo', summary: 'Resumo', brief: 'x', theme: 'forest', template: 'landing',
    blocks: [{ title: 'Seção A', body: 'Texto A' }] } });
  const { doc } = (await local.call(`/api/studio/doc?workspace=demo&id=${old.body.id}`)).body;
  assert.match(doc.pages[0].html, /Título antigo/);
  assert.match(doc.pages[0].html, /Seção A/);
});

test('Sanitizer strips editor markers and the reference reader refuses private addresses', async () => {
  const clean = sanitizeHtml('<body data-go-ready="1"><p contenteditable="true" data-go-selected>Oi</p><form data-go-lead></form></body>');
  assert.doesNotMatch(clean, /data-go-ready|contenteditable|data-go-selected/);
  assert.match(clean, /data-go-lead/);
  for (const address of ['http://127.0.0.1/', 'http://localhost/', 'http://192.168.0.10/', 'file:///etc/passwd']) {
    await assert.rejects(readReference(address), /public/);
  }
});
