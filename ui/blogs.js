// Sites → Blogs: blog sites, posts (Markdown editor with preview, schedule, SEO, AI writing), authors and categories.
import { aiTool } from './content-ai.js';
import { icon } from './icons.js';
import { h, pageShell, utabs } from './screens.js';
import { siteTabs } from './forms.js';
import { isLive, markdown, readingTime, slugify } from './blog-data.js';

let aiOn = false;
const aiWrap = (html, target, field) => aiOn ? `<div class="ai-wrap">${html}${aiTool(target, 'blog', field)}</div>` : html;

export const blogTabs = ['blogs', 'blog', 'post', 'blog-settings'];
const bv = { postId: '', rev: '', draft: null, dirty: false, write: 'edit', query: '', status: '', blogSection: 'posts', settings: 'authors', busy: false };
let env = null;
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const norm = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const blogUrl = (c, blog) => `/b/${c.workspace}/${blog.id}`;
const postState = post => post.status !== 'published' ? ['Rascunho', ''] : isLive(post) ? ['Publicado', 'green'] : ['Agendado', 'blue'];
const weekViews = posts => { const since = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10); return posts.reduce((sum, post) => sum + Object.entries(post.viewsByDay || {}).filter(([day]) => day >= since).reduce((a, [, n]) => a + n, 0), 0); };

function shell(c, body, cta = '') {
  return pageShell({ title: 'Sites', desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.', cta, className: 'sites-page bl-page',
    tabs: { key: 'sites', label: 'Seções de sites', current: 'blogs', items: siteTabs },
    content: utabs({ key: 'sites-blogs-sub', nested: true, label: 'Blogs', current: c.tab,
      items: [{ value: 'blogs', label: 'Blogs', href: '#sites/blogs' }, { value: 'blog-settings', label: 'Autores e categorias', href: '#sites/blog-settings' }], content: body }) });
}

function listView(c) {
  const blogs = [...c.s.blogs].sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const button = `<button class="primary" data-bl-new-blog>${icon('plus', 16)} Novo blog</button>`;
  const rows = blogs.map(blog => {
    const posts = c.s.blogPosts.filter(post => post.blogId === blog.id);
    return `<tr><td><a class="site-name" href="#sites/blog/${blog.id}">${icon('note', 16)}<span>${h(blog.name)}</span></a></td><td>${blog.active ? badge('Publicado', 'green') : badge('Rascunho')}</td>
      <td class="bl-desc">${h(blog.description || '—')}</td><td>${posts.filter(post => isLive(post)).length} de ${posts.length}</td><td>${when(blog.updated || blog.created)}</td>
      <td class="site-row-actions">${blog.active ? `<a class="icon-btn" href="${blogUrl(c, blog)}" target="_blank" rel="noopener" title="Ver blog" aria-label="Ver ${h(blog.name)}">${icon('external', 15)}</a>` : ''}<a class="secondary site-open" href="#sites/blog/${blog.id}">Abrir</a></td></tr>`;
  }).join('');
  return shell(c, `<div class="metrics three"><div class="surface metric"><span>Artigos</span><b>${c.s.blogPosts.length}</b></div><div class="surface metric"><span>Blogs publicados</span><b>${blogs.filter(blog => blog.active).length}</b></div><div class="surface metric"><span>Visitas na semana</span><b>${weekViews(c.s.blogPosts)}</b></div></div>
    ${rows ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Blog</th><th scope="col">Status</th><th scope="col">Descrição</th><th scope="col">Artigos publicados</th><th scope="col">Atualizado</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="surface empty site-empty">${icon('note', 26)}<strong>Nenhum blog ainda</strong><p>Publique artigos com SEO, categorias, autores e RSS. A IA pode escrever o primeiro rascunho.</p>${button}</div>`}`, button);
}

function settingsView(c) {
  const kind = bv.settings, rows = kind === 'authors' ? c.s.blogAuthors : c.s.blogCategories;
  const count = row => c.s.blogPosts.filter(post => kind === 'authors' ? post.authorId === row.id : post.categoryIds?.includes(row.id)).length;
  return shell(c, `<div class="bl-settings"><div class="fm-range" role="tablist" aria-label="Configurações do blog">${[['authors', 'Autores'], ['categories', 'Categorias']].map(([id, label]) => `<button role="tab" class="${kind === id ? 'selected' : ''}" aria-selected="${kind === id}" data-bl-settings="${id}">${label}</button>`).join('')}</div>
    <form class="surface padded bl-inline-form" data-bl-add="${kind}"><label>${kind === 'authors' ? 'Nome do autor' : 'Nome da categoria'}<input name="name" required maxlength="${kind === 'authors' ? 80 : 60}"></label>
      <label>${kind === 'authors' ? 'Biografia curta' : 'Descrição'}<input name="${kind === 'authors' ? 'bio' : 'description'}" maxlength="300"></label><button class="primary">${icon('plus', 15)} Adicionar</button><p class="form-status" role="alert"></p></form>
    ${rows.length ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Nome</th><th scope="col">${kind === 'authors' ? 'Biografia' : 'Endereço'}</th><th scope="col">Artigos</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
      ${rows.map(row => `<tr><td><b>${h(row.name)}</b></td><td>${h(kind === 'authors' ? row.bio || '—' : `?categoria=${row.slug}`)}</td><td>${count(row)}</td><td class="site-row-actions"><button class="icon-btn" data-bl-remove="${kind === 'authors' ? 'blogAuthors' : 'blogCategories'}" data-id="${row.id}" aria-label="Remover ${h(row.name)}" title="Remover">${icon('trash', 15)}</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="surface empty"><strong>${kind === 'authors' ? 'Nenhum autor' : 'Nenhuma categoria'}</strong><p>${kind === 'authors' ? 'Autores aparecem no fim de cada artigo.' : 'Categorias viram filtros no menu do blog.'}</p></div>`}</div>`);
}

/* ───────── Blog ───────── */

function blogView(c) {
  const blog = c.s.blogs.find(row => row.id === c.studio.project);
  if (!blog) return `<div class="page sites-page"><div class="surface empty"><strong>Blog não encontrado</strong><a class="primary" href="#sites/blogs">Voltar aos blogs</a></div></div>`;
  const query = norm(bv.query.trim());
  const posts = c.s.blogPosts.filter(post => post.blogId === blog.id && norm(post.title).includes(query) && (!bv.status || postState(post)[0] === bv.status))
    .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const all = c.s.blogPosts.filter(post => post.blogId === blog.id);
  const body = bv.blogSection === 'settings' ? `<form class="fb-settings" data-bl-blog-form>
      <section class="surface padded"><h2>Blog</h2><label>Nome<input name="name" value="${h(blog.name)}" required maxlength="80"></label><label>Descrição<textarea name="description" rows="2" maxlength="400">${h(blog.description)}</textarea></label>
        <div class="fb-two"><label>Cor de destaque<span class="fb-color"><input type="color" name="color" value="${h(blog.color)}"></span></label><label>Artigos por página<input type="number" name="perPage" min="3" max="30" value="${blog.perPage}"></label></div>
        <label class="check"><input type="checkbox" name="rss"${blog.rss !== false ? ' checked' : ''}> Publicar feed RSS (${h(blogUrl(c, blog))}/rss.xml)</label></section>
      <section class="surface padded"><h2>SEO da página inicial</h2><label>Título<input name="seoTitle" value="${h(blog.seoTitle)}" maxlength="70"></label><label>Descrição<textarea name="seoDescription" rows="2" maxlength="170">${h(blog.seoDescription)}</textarea></label></section>
      <div class="inline-gap"><button class="primary">Salvar configurações</button><button type="button" class="secondary danger" data-bl-delete-blog>Excluir blog</button></div><p class="form-status" role="alert"></p></form>`
    : `<div class="toolbar"><label class="search">${icon('search', 15)}<input type="search" data-bl-search value="${h(bv.query)}" placeholder="Buscar artigos" aria-label="Buscar artigos"></label>
        <select data-bl-status aria-label="Filtrar por status"><option value="">Todos os status</option>${['Publicado', 'Agendado', 'Rascunho'].map(label => `<option${bv.status === label ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      ${posts.length ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Artigo</th><th scope="col">Status</th><th scope="col">Categorias</th><th scope="col">Visitas</th><th scope="col">Atualizado</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
        ${posts.map(post => `<tr><td><a class="site-name" href="#sites/post/${post.id}"><span>${h(post.title)}</span></a></td><td>${badge(...postState(post))}${postState(post)[0] === 'Agendado' ? ` <small class="dim">${when(post.publishAt)}</small>` : ''}</td>
          <td>${h((post.categoryIds || []).map(id => c.s.blogCategories.find(cat => cat.id === id)?.name).filter(Boolean).join(', ') || '—')}</td><td>${post.views || 0}</td><td>${when(post.updated || post.created)}</td>
          <td class="site-row-actions">${isLive(post) && blog.active ? `<a class="icon-btn" href="${blogUrl(c, blog)}/${post.slug}" target="_blank" rel="noopener" title="Ver artigo" aria-label="Ver ${h(post.title)}">${icon('external', 15)}</a>` : ''}<a class="secondary site-open" href="#sites/post/${post.id}">Editar</a></td></tr>`).join('')}</tbody></table></div>`
        : all.length ? '<div class="surface empty"><strong>Nenhum artigo encontrado</strong><p>Tente outra busca ou status.</p></div>'
        : `<div class="surface empty site-empty">${icon('note', 26)}<strong>Nenhum artigo ainda</strong><p>Escreva do zero ou peça um rascunho para a IA.</p><div class="inline-gap"><button class="primary" data-bl-ai>${icon('spark', 16)} Escrever com IA</button><button class="secondary" data-bl-new-post>Artigo em branco</button></div></div>`}`;
  return `<div class="fb dw-workspace bl-blog"><header class="fb-top dw-header"><a class="secondary fb-back" href="#sites/blogs">${icon('left', 15)} Blogs</a>
      <div class="fb-title"><h1>${h(blog.name)}</h1>${blog.active ? badge('Publicado', 'green') : badge('Rascunho')}</div>
      <div class="fb-top-actions">${blog.active ? `<a class="secondary" href="${blogUrl(c, blog)}" target="_blank" rel="noopener">${icon('external', 14)} Ver blog</a>` : `<a class="secondary" href="${blogUrl(c, blog)}?preview=1" target="_blank" rel="noopener">${icon('external', 14)} Prévia</a>`}
        <button class="secondary" data-bl-blog-publish="${blog.active ? 'off' : 'on'}">${blog.active ? 'Despublicar' : 'Publicar blog'}</button>
        <button class="secondary" data-bl-ai>${icon('spark', 15)} Escrever com IA</button><button class="primary" data-bl-new-post>${icon('plus', 15)} Novo artigo</button></div></header>
    <nav class="fb-sections" aria-label="Seções do blog">${[['posts', `Artigos (${all.length})`], ['settings', 'Configurações']].map(([id, label]) => `<button class="${bv.blogSection === id ? 'selected' : ''}" aria-current="${bv.blogSection === id ? 'page' : 'false'}" data-bl-blog-section="${id}">${label}</button>`).join('')}</nav>
    <div class="bl-blog-body">${body}</div></div>`;
}

/* ───────── Artigo ───────── */

function loadPost(c) {
  const post = c.s.blogPosts.find(row => row.id === c.studio.project);
  if (!post) return null;
  if (bv.postId !== post.id || (!bv.dirty && bv.rev !== (post.updated || post.created))) {
    if (bv.postId !== post.id) bv.write = 'edit';
    Object.assign(bv, { postId: post.id, rev: post.updated || post.created, dirty: false, draft: structuredClone(post) });
  }
  return post;
}

const tools = [['h2', 'Título', '## '], ['h3', 'Subtítulo', '### '], ['bold', 'Negrito', '**'], ['italic', 'Itálico', '*'], ['link', 'Link', '['], ['list', 'Lista', '- '], ['quote', 'Citação', '> '], ['image', 'Imagem', '![']];
const counter = (value, max) => `<small class="bl-count${value.length > max ? ' over' : ''}">${value.length}/${max}</small>`;
const local = iso => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';

function sidePanel(c, blog) {
  const d = bv.draft, scheduled = d.status === 'published' && d.publishAt && Date.parse(d.publishAt) > Date.now();
  const seoTitle = d.seoTitle || d.title, seoDesc = d.seoDescription || d.summary || '';
  return `<aside class="surface bl-side" aria-label="Detalhes do artigo">
    <section><h2>Publicação</h2><fieldset class="cw-segment"><legend class="sr-only">Status</legend>${[['draft', 'Rascunho'], ['published', 'Publicar']].map(([id, label]) => `<label><input type="radio" name="bl-status" data-bl-set="status" value="${id}"${d.status === id ? ' checked' : ''}> ${label}</label>`).join('')}</fieldset>
      ${d.status === 'published' ? `<label>Data de publicação <small class="dim">vazio = agora</small><input type="datetime-local" data-bl-set="publishAt" value="${local(d.publishAt)}"></label>${scheduled ? `<p class="bl-note">${icon('clock', 14)} Agendado para ${when(d.publishAt)}.</p>` : ''}` : ''}</section>
    <section><h2>Endereço</h2><label>Caminho<input data-bl-set="slug" value="${h(d.slug)}" maxlength="80" aria-describedby="bl-url"></label><small id="bl-url" class="dim bl-url">${h(blogUrl(c, blog))}/${h(slugify(d.slug || d.title) || 'artigo')}</small></section>
    <section><h2>Resumo e capa</h2>${aiWrap(`<label>Resumo${counter(d.summary || '', 400)}<textarea data-bl-set="summary" rows="3" maxlength="400">${h(d.summary)}</textarea></label>`, '[data-bl-set="summary"]', 'Resumo')}
      <label>Imagem de capa (https://)<input type="url" data-bl-set="coverUrl" value="${h(d.coverUrl)}" maxlength="600" placeholder="https://"></label>${d.coverUrl && /^https:\/\//.test(d.coverUrl) ? `<img class="bl-cover-preview" src="${h(d.coverUrl)}" alt="">` : ''}</section>
    <section><h2>Autor e categorias</h2><label>Autor<select data-bl-set="authorId"><option value="">Sem autor</option>${c.s.blogAuthors.map(row => `<option value="${row.id}"${d.authorId === row.id ? ' selected' : ''}>${h(row.name)}</option>`).join('')}</select></label>
      ${c.s.blogCategories.length ? `<fieldset class="bl-cats"><legend>Categorias</legend>${c.s.blogCategories.map(cat => `<label class="check"><input type="checkbox" data-bl-cat="${cat.id}"${d.categoryIds?.includes(cat.id) ? ' checked' : ''}> ${h(cat.name)}</label>`).join('')}</fieldset>` : ''}
      <a class="text-link" href="#sites/blog-settings">Gerenciar autores e categorias</a></section>
    <section><div class="bl-side-head"><h2>SEO</h2><button type="button" class="secondary" data-bl-seo-ai>${icon('spark', 14)} Gerar com IA</button></div>
      <label>Título para o Google${counter(d.seoTitle || '', 60)}<input data-bl-set="seoTitle" value="${h(d.seoTitle)}" maxlength="70" placeholder="${h(d.title)}"></label>
      <label>Descrição${counter(d.seoDescription || '', 155)}<textarea data-bl-set="seoDescription" rows="3" maxlength="170" placeholder="${h(d.summary || '')}">${h(d.seoDescription)}</textarea></label>
      <div class="bl-serp" aria-label="Prévia no Google"><small>${h(location.host)} › ${h(slugify(d.slug || d.title) || 'artigo')}</small><b>${h(seoTitle.slice(0, 60))}${seoTitle.length > 60 ? '…' : ''}</b><p>${h(seoDesc.slice(0, 155))}${seoDesc.length > 155 ? '…' : ''}</p></div></section></aside>`;
}

function postView(c) {
  const post = loadPost(c);
  if (!post) return `<div class="page sites-page"><div class="surface empty"><strong>Artigo não encontrado</strong><a class="primary" href="#sites/blogs">Voltar aos blogs</a></div></div>`;
  const blog = c.s.blogs.find(row => row.id === post.blogId), d = bv.draft;
  const live = isLive(post) && blog.active;
  return `<div class="fb dw-workspace bl-editor"><header class="fb-top dw-header"><a class="secondary fb-back" href="#sites/blog/${blog.id}">${icon('left', 15)} ${h(blog.name)}</a>
      <div class="fb-title"><h1>${h(d.title || 'Sem título')}</h1>${badge(...postState(post))}${bv.dirty ? badge('Alterações não salvas', 'blue') : ''}</div>
      <div class="fb-top-actions"><a class="secondary" href="${blogUrl(c, blog)}/${post.slug}${live ? '' : '?preview=1'}" target="_blank" rel="noopener">${icon('external', 14)} ${live ? 'Ver artigo' : 'Prévia'}</a>
        <button class="primary" data-bl-save${bv.dirty ? '' : ' disabled'}>Salvar</button><button class="icon-btn" data-bl-delete-post aria-label="Excluir artigo" title="Excluir artigo">${icon('trash', 16)}</button></div></header>
    <div class="bl-edit"><div class="bl-main surface">
      <label class="sr-only" for="bl-title">Título</label><input id="bl-title" class="bl-title-input" data-bl-set="title" value="${h(d.title)}" maxlength="160" placeholder="Título do artigo">
      <div class="bl-bar"><div class="fm-range" role="tablist" aria-label="Modo">${[['edit', 'Escrever'], ['preview', 'Pré-visualizar']].map(([id, label]) => `<button role="tab" class="${bv.write === id ? 'selected' : ''}" aria-selected="${bv.write === id}" data-bl-write="${id}">${label}</button>`).join('')}</div>
        ${bv.write === 'edit' ? `<div class="bl-tools" role="toolbar" aria-label="Formatação">${aiOn ? aiTool('#bl-body', 'blog', 'Texto do artigo') : ''}${tools.map(([id, label]) => `<button type="button" class="icon-btn bl-tool" data-bl-tool="${id}" title="${label}" aria-label="${label}">${{ h2: 'H2', h3: 'H3', bold: '<b>B</b>', italic: '<i>I</i>', link: icon('link', 14), list: icon('list', 14), quote: '❝', image: icon('folder', 14) }[id]}</button>`).join('')}</div>` : ''}
        <span class="dim bl-words">${readingTime(d.body)} min de leitura</span></div>
      ${bv.write === 'edit' ? `<label class="sr-only" for="bl-body">Texto do artigo</label><textarea id="bl-body" class="bl-body-input" data-bl-set="body" placeholder="Escreva o artigo. Use ## para títulos, - para listas, **negrito**, [link](https://...)">${h(d.body)}</textarea>
        <p class="dim bl-hint">Markdown: <code>## Título</code> · <code>**negrito**</code> · <code>*itálico*</code> · <code>[texto](https://…)</code> · <code>- item</code> · <code>&gt; citação</code> · <code>![descrição](https://imagem)</code></p>`
        : `<div class="bl-preview" data-bl-preview>${markdown(d.body) || '<p class="dim">Nada escrito ainda.</p>'}</div>`}
    </div>${sidePanel(c, blog)}</div></div>`;
}

export function blogScreen(c) {
  aiOn = Boolean(c.features?.contentAI);
  if (c.tab === 'post') return postView(c);
  if (c.tab === 'blog') return blogView(c);
  if (c.tab === 'blog-settings') return settingsView(c);
  return listView(c);
}

/* ───────── Ações ───────── */

function dialog(title, body, label, onSubmit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" class="site-dialog fm-dialog" aria-labelledby="bl-title-d"><header><div><h2 id="bl-title-d">${h(title)}</h2></div><button class="icon-btn" type="button" aria-label="Fechar" data-bl-close>${icon('close', 17)}</button></header>
    <form><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-bl-close>Cancelar</button><button class="primary">${h(label)}</button></footer></form></dialog>`;
  const el = document.getElementById('dialog');
  el.showModal(); el.querySelector('input,textarea')?.focus();
  el.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = el.querySelector('.form-status'), button = el.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try { await onSubmit(Object.fromEntries(new FormData(event.target)), status); close(); } catch (error) { status.classList.remove('confirmed'); status.textContent = error.message; button.disabled = false; }
  });
}
const close = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };

export function installBlogs(environment) {
  env = environment;
  const { c, api, url, mutate, flash, render } = env;
  const inPost = () => c.view === 'sites' && c.tab === 'post';
  const blogOfPage = () => c.tab === 'blog' ? c.s.blogs.find(row => row.id === c.studio.project) : c.s.blogs.find(row => row.id === bv.draft?.blogId);
  const touch = () => {
    if (bv.dirty) return;
    bv.dirty = true;
    const save = document.querySelector('[data-bl-save]'); if (save) save.disabled = false;
    document.querySelector('.bl-editor .fb-title')?.insertAdjacentHTML('beforeend', badge('Alterações não salvas', 'blue'));
  };
  const savePost = async () => { await mutate({ type: 'save', key: 'blogPosts', id: bv.postId, data: bv.draft }); bv.dirty = false; bv.rev = ''; };
  const newPost = async (blog, data = {}) => {
    const id = await mutate({ type: 'save', key: 'blogPosts', data: { blogId: blog.id, title: 'Novo artigo / Nuevo artículo', body: '', status: 'draft', ...data } });
    bv.postId = ''; location.hash = `#sites/post/${id}`;
  };

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-bl-close],[data-bl-new-blog],[data-bl-new-post],[data-bl-ai],[data-bl-settings],[data-bl-remove],[data-bl-blog-section],[data-bl-blog-publish],[data-bl-delete-blog],[data-bl-write],[data-bl-tool],[data-bl-save],[data-bl-delete-post],[data-bl-seo-ai]');
    if (!target || !(c.view === 'sites' || target.closest('#overlay'))) return;
    const d = target.dataset;
    try {
      if ('blClose' in d) { close(); return; }
      if ('blNewBlog' in d) {
        dialog('Novo blog', `<label>Nome<input name="name" required maxlength="80" placeholder="Ex. Blog da La Vaca"></label><label>Descrição<textarea name="description" rows="2" maxlength="400" placeholder="Sobre o que você escreve"></textarea></label>`, 'Criar blog', async data => {
          const id = await mutate({ type: 'save', key: 'blogs', data: { name: data.name, description: data.description, active: false } });
          bv.blogSection = 'posts'; location.hash = `#sites/blog/${id}`; flash('Blog criado. Escreva o primeiro artigo.');
        });
        return;
      }
      if ('blNewPost' in d) { await newPost(blogOfPage()); return; }
      if ('blAi' in d) {
        const blog = blogOfPage();
        dialog('Escrever com IA', `<label>Sobre o que é o artigo?<textarea name="topic" rows="3" required maxlength="1500" placeholder="Ex. Como escolher a paleta de cores de uma cafeteria"></textarea></label>
          <label>Título (opcional)<input name="title" maxlength="160"></label><label>Palavras-chave (opcional)<input name="keywords" maxlength="300" placeholder="paleta de cores, identidade visual"></label>
          <div class="fb-two"><label>Tom<select name="tone"><option>profissional e próximo</option><option>didático</option><option>inspirador</option><option>direto ao ponto</option></select></label>
          <label>Tamanho<select name="length"><option value="curto">Curto (~500 palavras)</option><option value="medio" selected>Médio (~900)</option><option value="longo">Longo (~1.500)</option></select></label></div>
          <p class="dim">${c.features?.studioAI ? 'Com a OpenAI conectada, o artigo leva de 30 segundos a 2 minutos.' : 'Sem a OpenAI conectada, você recebe um roteiro com marcadores [[...]] para preencher.'}</p>`, 'Escrever rascunho', async (data, status) => {
          status.classList.add('confirmed'); status.textContent = 'Escrevendo…';
          const result = await api(url('/api/blog/ai'), { ...data, mode: 'write' });
          const { title, summary, body, seoTitle, seoDescription } = result.post;
          await newPost(blog, { title, summary, body, seoTitle, seoDescription });
          flash(result.ai ? 'Rascunho escrito pela IA. Revise antes de publicar.' : 'Roteiro criado. Preencha os marcadores [[...]].');
        });
        return;
      }
      if (d.blSettings) { bv.settings = d.blSettings; render(); return; }
      if (d.blRemove) { await mutate({ type: 'delete', key: d.blRemove, id: d.id }); render(); flash('Removido.'); return; }
      if (d.blBlogSection) { bv.blogSection = d.blBlogSection; render(); return; }
      if (d.blBlogPublish) { const blog = blogOfPage(); await mutate({ type: 'save', key: 'blogs', id: blog.id, data: { ...blog, active: d.blBlogPublish === 'on' } }); render(); flash(d.blBlogPublish === 'on' ? 'Blog publicado.' : 'Blog fora do ar.'); return; }
      if ('blDeleteBlog' in d) {
        const blog = blogOfPage(), n = c.s.blogPosts.filter(post => post.blogId === blog.id).length;
        dialog('Excluir blog?', `<p>“${h(blog.name)}” sai do ar e ${n ? `os ${n} artigos dele são apagados` : 'é apagado'}. Isso não pode ser desfeito.</p>`, 'Excluir', async () => { await mutate({ type: 'delete', key: 'blogs', id: blog.id }); location.hash = '#sites/blogs'; flash('Blog excluído.'); });
        return;
      }
      if (!inPost()) return;
      if (d.blWrite) { bv.write = d.blWrite; render(); return; }
      if (d.blTool) {
        const area = document.querySelector('[data-bl-set="body"]'); if (!area) return;
        const { selectionStart: a, selectionEnd: b, value } = area, picked = value.slice(a, b);
        const lineStart = value.lastIndexOf('\n', a - 1) + 1;
        const wrap = { bold: [`**${picked || 'texto'}**`], italic: [`*${picked || 'texto'}*`], link: [`[${picked || 'texto'}](https://)`], image: [`![${picked || 'descrição'}](https://)`] }[d.blTool];
        let next, caret;
        if (wrap) { next = value.slice(0, a) + wrap[0] + value.slice(b); caret = a + wrap[0].length; }
        else { const prefix = { h2: '## ', h3: '### ', list: '- ', quote: '> ' }[d.blTool]; next = value.slice(0, lineStart) + prefix + value.slice(lineStart); caret = b + prefix.length; }
        area.value = next; bv.draft.body = next; area.focus(); area.setSelectionRange(caret, caret); touch(); return;
      }
      if ('blSave' in d) { target.disabled = true; await savePost(); render(); flash('Artigo salvo.'); return; }
      if ('blSeoAi' in d) {
        target.disabled = true; target.textContent = 'Gerando…';
        const result = await api(url('/api/blog/ai'), { mode: 'seo', title: bv.draft.title, body: bv.draft.body });
        Object.assign(bv.draft, { seoTitle: result.seo.seoTitle, seoDescription: result.seo.seoDescription, summary: bv.draft.summary || result.seo.summary });
        bv.dirty = true; render(); flash('SEO gerado. Revise e salve.'); return;
      }
      if ('blDeletePost' in d) {
        const blog = blogOfPage();
        dialog('Excluir artigo?', `<p>“${h(bv.draft.title)}” sai do blog e é apagado. Isso não pode ser desfeito.</p>`, 'Excluir', async () => { await mutate({ type: 'delete', key: 'blogPosts', id: bv.postId }); bv.dirty = false; bv.postId = ''; location.hash = `#sites/blog/${blog.id}`; flash('Artigo excluído.'); });
      }
    } catch (error) { flash(error.message, true); render(); }
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-bl-add],[data-bl-blog-form]');
    if (!form || c.view !== 'sites') return;
    event.preventDefault();
    const note = form.querySelector('.form-status'), data = Object.fromEntries(new FormData(form));
    try {
      if (form.dataset.blAdd) { await mutate({ type: 'save', key: form.dataset.blAdd === 'authors' ? 'blogAuthors' : 'blogCategories', data }); render(); flash('Adicionado.'); return; }
      const blog = blogOfPage();
      await mutate({ type: 'save', key: 'blogs', id: blog.id, data: { ...blog, ...data, rss: Boolean(data.rss), perPage: Number(data.perPage) } }); render(); flash('Configurações salvas.');
    } catch (error) { if (note) note.textContent = error.message; else flash(error.message, true); }
  });

  document.addEventListener('input', event => {
    const el = event.target;
    if (el.matches?.('[data-bl-search]')) { bv.query = el.value; const at = el.selectionStart; render(); const next = document.querySelector('[data-bl-search]'); next?.focus(); next?.setSelectionRange(at, at); return; }
    if (!inPost() || !bv.draft) return;
    if (el.dataset.blCat) { const ids = new Set(bv.draft.categoryIds || []); el.checked ? ids.add(el.dataset.blCat) : ids.delete(el.dataset.blCat); bv.draft.categoryIds = [...ids]; touch(); return; }
    if (!el.dataset.blSet) return;
    const key = el.dataset.blSet;
    bv.draft[key] = key === 'publishAt' ? (el.value ? new Date(el.value).toISOString() : '') : el.value;
    if (key === 'title') document.querySelector('.bl-editor .fb-title h1').textContent = el.value || 'Sem título';
    touch();
    if (['status', 'coverUrl'].includes(key) || el.type === 'radio') { render(); document.querySelector(`[data-bl-set="${key}"]${el.type === 'radio' ? `[value="${el.value}"]` : ''}`)?.focus(); return; }
    if (['slug', 'title', 'seoTitle', 'seoDescription', 'summary'].includes(key)) {
      const side = document.querySelector('.bl-side'), top = side?.scrollTop || 0, focused = document.activeElement?.dataset?.blSet, caret = document.activeElement?.selectionStart;
      if (side && key !== 'title') { side.outerHTML = sidePanel(c, blogOfPage()); const nextSide = document.querySelector('.bl-side'); nextSide.scrollTop = top; const again = document.querySelector(`[data-bl-set="${focused}"]`); again?.focus(); try { again?.setSelectionRange(caret, caret); } catch {} }
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches?.('[data-bl-status]')) { bv.status = event.target.value; render(); }
    if (inPost() && event.target.dataset?.blSet === 'authorId') { bv.draft.authorId = event.target.value; touch(); }
  });

  let last = location.hash;
  addEventListener('hashchange', () => {
    const was = last; last = location.hash;
    if (!bv.dirty || !was.startsWith(`#sites/post/${bv.postId}`) || location.hash.startsWith(`#sites/post/${bv.postId}`)) return;
    if (confirm('Descartar as alterações não salvas deste artigo?')) { bv.dirty = false; bv.rev = ''; bv.postId = ''; return; }
    last = was; history.replaceState(null, '', was); dispatchEvent(new HashChangeEvent('hashchange'));
  }, true);
  addEventListener('beforeunload', event => { if (bv.dirty && inPost()) event.preventDefault(); });
}
