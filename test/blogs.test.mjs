import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { markdown, readingTime } from '../ui/blog-data.js';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const save = (key, data, id) => send('/api/action?workspace=demo', { type: 'save', key, id, data });
  return { base, send, save };
}

test('Markdown is rendered without letting HTML or unsafe links through', () => {
  const html = markdown('## Título\n\nTexto com **negrito**, *itálico* e [link](https://example.com).\n\n<script>alert(1)</script>\n\n- um\n- dois\n\n> citação\n\n[ruim](javascript:alert(1))\n\n![Capa](https://example.com/a.jpg)');
  assert.match(html, /<h2 id="titulo">Título<\/h2>/);
  assert.match(html, /<strong>negrito<\/strong>/);
  assert.match(html, /<em>itálico<\/em>/);
  assert.match(html, /<a href="https:\/\/example.com" rel="noopener">link<\/a>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|javascript:/);
  assert.match(html, /<ul><li>um<\/li><li>dois<\/li><\/ul>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<figure><img src="https:\/\/example.com\/a.jpg" alt="Capa"/);
  assert.equal(readingTime('palavra '.repeat(450)), 2);
});

test('A blog publishes posts by date and category, counts views and serves RSS', async t => {
  const { base, send, save } = await start(t);
  const blog = (await save('blogs', { name: 'Blog La Vaca', description: 'Design e marca', active: true, color: '#c4623d' })).body.state.blogs.at(-1);
  const author = (await save('blogAuthors', { name: 'Luiza', bio: 'Designer' })).body.state.blogAuthors.at(-1);
  const category = (await save('blogCategories', { name: 'Identidade visual' })).body.state.blogCategories.at(-1);
  assert.equal(category.slug, 'identidade-visual');
  assert.equal((await save('blogCategories', { name: 'Identidade Visual' })).status, 400, 'category addresses are unique');

  const post = (await save('blogPosts', { blogId: blog.id, title: 'Como escolher a paleta da sua marca', summary: 'Um guia curto.', body: '## Cores\n\nTexto.', authorId: author.id, categoryIds: [category.id], status: 'published', seoTitle: 'Paleta de marca: guia' })).body.state.blogPosts.at(-1);
  assert.equal(post.slug, 'como-escolher-a-paleta-da-sua-marca');
  assert.ok(post.publishedAt);
  assert.equal((await save('blogPosts', { blogId: blog.id, title: 'Outro', slug: post.slug })).status, 400, 'post addresses are unique in a blog');
  await save('blogPosts', { blogId: blog.id, title: 'Rascunho secreto', body: 'x', status: 'draft' });
  await save('blogPosts', { blogId: blog.id, title: 'Agendado para 2099', body: 'x', status: 'published', publishAt: '2099-01-01T12:00:00Z' });

  const home = await (await fetch(`${base}/b/demo/${blog.id}`)).text();
  assert.match(home, /Como escolher a paleta da sua marca/);
  assert.doesNotMatch(home, /Rascunho secreto|Agendado para 2099/, 'drafts and future posts stay hidden');
  assert.match(home, /application\/rss\+xml/);
  assert.match(await (await fetch(`${base}/b/demo/${blog.id}?categoria=identidade-visual`)).text(), /<h1>Identidade visual<\/h1>/);

  const page = await fetch(`${base}/b/demo/${blog.id}/${post.slug}`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /<title>Paleta de marca: guia<\/title>/);
  assert.match(html, /<meta name="description" content="Um guia curto.">/);
  assert.match(html, /<h2 id="cores">Cores<\/h2>/);
  assert.match(html, /Luiza/);
  assert.equal((await fetch(`${base}/b/demo/${blog.id}/agendado-para-2099`)).status, 404);
  assert.equal((await fetch(`${base}/b/demo/${blog.id}/rascunho-secreto?preview=1`)).status, 200, 'the team can preview drafts');

  const rss = await (await fetch(`${base}/b/demo/${blog.id}/rss.xml`)).text();
  assert.match(rss, /<rss version="2.0">/);
  assert.equal((rss.match(/<item>/g) || []).length, 1);

  const state = (await send('/api/state?workspace=demo')).body.state;
  assert.equal(state.blogPosts.find(row => row.id === post.id).views, 1, 'only the public visit counts');

  await save('blogs', { ...blog, active: false }, blog.id);
  assert.equal((await fetch(`${base}/b/demo/${blog.id}`)).status, 404, 'an unpublished blog is offline');
});

test('Without OpenAI the writer returns an outline with placeholders', async t => {
  const { send } = await start(t);
  assert.equal((await send('/api/blog/ai?workspace=demo', { topic: '' })).status, 400);
  const draft = await send('/api/blog/ai?workspace=demo', { topic: 'como precificar serviços de design', keywords: 'preço, design' });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.ai, false);
  assert.match(draft.body.post.body, /## O que é e por que importa/);
  assert.match(draft.body.post.body, /\[\[/);
  assert.equal((await send('/api/blog/ai?workspace=demo', { mode: 'seo', title: 'x', body: 'y' })).status, 409);
});
