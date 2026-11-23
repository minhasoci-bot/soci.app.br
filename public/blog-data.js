// Blogs: a safe Markdown subset, slugs, and the public pages (blog home, post, RSS).
// Shared by the server and by the post editor's preview.

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const slugify = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const safeUrl = url => /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : '';

// Inline marks on already escaped text: **bold**, *italic*, `code`, [text](https://...)
function inline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, url) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'));
      return href ? `<a href="${esc(href)}" rel="noopener">${label}</a>` : label;
    });
}

// Markdown subset: ## / ### headings, paragraphs, - and 1. lists, > quotes, ![alt](https://image), --- rules.
// Everything is escaped first, so the author cannot inject HTML.
export function markdown(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null, para = [], quote = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(esc(para.join(' ')))}</p>`); para = []; }
    if (quote.length) { out.push(`<blockquote><p>${inline(esc(quote.join(' ')))}</p></blockquote>`); quote = []; }
    if (list) { out.push(`<${list.tag}>${list.items.map(item => `<li>${inline(esc(item))}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.+)$/))) { flush(); const level = Math.min(4, m[1].length); out.push(`<h${level} id="${slugify(m[2])}">${inline(esc(m[2]))}</h${level}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { flush(); const src = safeUrl(m[2]); if (src) out.push(`<figure><img src="${esc(src)}" alt="${esc(m[1])}" loading="lazy">${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.+)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.+)$/))) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (para.length || quote.length) { const keep = list; list = null; flush(); list = keep; }
      if (list && list.tag !== tag) flush();
      list ||= { tag, items: [] };
      list.items.push(m[1]); continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { if (para.length || list) flush(); quote.push(m[1]); continue; }
    if (list || quote.length) flush();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

export const plainText = source => String(source || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*`_-]+/g, ' ').replace(/\s+/g, ' ').trim();
export const readingTime = source => Math.max(1, Math.round(plainText(source).split(' ').filter(Boolean).length / 200));

/* ───────── Páginas públicas ───────── */

const hex = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#155eef';
const day = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso)) : '';
export const isLive = (post, at = new Date()) => post.status === 'published' && (!post.publishAt || Date.parse(post.publishAt) <= at.getTime());

const css = color => `
*{box-sizing:border-box}body{margin:0;font:17px/1.7 Georgia,"Iowan Old Style","Times New Roman",serif;color:#1d2433;background:#fbfaf7}
a{color:${hex(color)}}a:focus-visible{outline:2px solid ${hex(color)};outline-offset:2px}
.bl-top{border-bottom:1px solid #e7e3da;background:#fff}.bl-top div{max-width:1040px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;gap:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.bl-top a{color:#1d2433;text-decoration:none;font-weight:700;font-size:19px}.bl-top nav{margin-left:auto;display:flex;flex-wrap:wrap;gap:14px;font-size:14px}.bl-top nav a{font-weight:500;font-size:14px;color:#5b6475}
.bl-top nav a[aria-current]{color:${hex(color)}}
main{max-width:1040px;margin:0 auto;padding:40px 20px 72px}.bl-hero{margin-bottom:34px}.bl-hero h1{margin:0;font-size:clamp(32px,5vw,46px);line-height:1.15}.bl-hero p{margin:10px 0 0;color:#5b6475;max-width:60ch}
.bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:28px}
.bl-card{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;background:#fff;border:1px solid #ece8df;transition:transform .15s ease,box-shadow .15s ease}
.bl-card:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(29,36,51,.08)}
.bl-card a{color:inherit;text-decoration:none}.bl-card>a{display:block}.bl-cover{aspect-ratio:16/9;background:linear-gradient(135deg,${hex(color)}22,${hex(color)}55);object-fit:cover;width:100%;display:block}
.bl-card div{padding:18px 20px 22px;display:grid;gap:8px}.bl-card h2{margin:0;font-size:22px;line-height:1.25}.bl-card p{margin:0;color:#5b6475;font-size:15.5px;line-height:1.55}
.bl-meta{font:13px/1.4 system-ui,sans-serif;color:#7a8394}.bl-tags{display:flex;flex-wrap:wrap;gap:6px}.bl-tags a{padding:2px 10px;border-radius:99px;background:${hex(color)}14;color:${hex(color)};font:600 12.5px/1.8 system-ui,sans-serif;text-decoration:none}
.bl-pages{display:flex;justify-content:space-between;margin-top:36px;font:15px system-ui,sans-serif}
.bl-empty{padding:48px;border:1px dashed #d8d2c4;border-radius:14px;text-align:center;color:#5b6475}
article{max-width:720px;margin:0 auto}article header h1{margin:8px 0 12px;font-size:clamp(32px,5vw,44px);line-height:1.15}article header p{margin:0;color:#5b6475;font-size:19px}
article .bl-cover{border-radius:14px;margin:26px 0 30px}.bl-body h2{margin:1.8em 0 .4em;font-size:27px;line-height:1.25}.bl-body h3{margin:1.5em 0 .3em;font-size:22px}.bl-body h4{margin:1.3em 0 .2em;font-size:18px}
.bl-body img{max-width:100%;border-radius:10px}.bl-body figure{margin:1.6em 0}.bl-body figcaption{font:13px system-ui,sans-serif;color:#7a8394;margin-top:6px}
.bl-body blockquote{margin:1.4em 0;padding:4px 0 4px 18px;border-left:3px solid ${hex(color)};color:#3b4456;font-style:italic}
.bl-body code{padding:1px 6px;border-radius:6px;background:#f0ede6;font-size:.9em}.bl-body hr{border:0;border-top:1px solid #e7e3da;margin:2em 0}
.bl-author{display:flex;gap:14px;align-items:center;margin-top:42px;padding:18px;border-radius:14px;background:#fff;border:1px solid #ece8df;font:15px/1.5 system-ui,sans-serif}
.bl-avatar{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:50%;background:${hex(color)};color:#fff;font-weight:700}
.bl-related{max-width:1040px;margin:56px auto 0}.bl-related h2{font-size:24px}
@media (prefers-reduced-motion:reduce){.bl-card{transition:none}.bl-card:hover{transform:none}}
`;

function layout({ blog, base, title, description, canonical, body, categories = [], current = '', image = '', type = 'website' }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
${blog.rss !== false ? `<link rel="alternate" type="application/rss+xml" title="${esc(blog.name)}" href="${esc(base)}/rss.xml">` : ''}<style>${css(blog.color)}</style></head>
<body><header class="bl-top"><div><a href="${esc(base)}">${esc(blog.name)}</a><nav aria-label="Categorias">${categories.map(cat => `<a href="${esc(base)}?categoria=${esc(cat.slug)}"${current === cat.slug ? ' aria-current="page"' : ''}>${esc(cat.name)}</a>`).join('')}</nav></div></header>
<main>${body}</main></body></html>`;
}

const tagsOf = (post, categories, base) => post.categoryIds?.length ? `<div class="bl-tags">${post.categoryIds.map(id => categories.find(cat => cat.id === id)).filter(Boolean).map(cat => `<a href="${esc(base)}?categoria=${esc(cat.slug)}">${esc(cat.name)}</a>`).join('')}</div>` : '';
const card = (post, ctx) => `<article class="bl-card"><a href="${esc(ctx.base)}/${esc(post.slug)}">${post.coverUrl ? `<img class="bl-cover" src="${esc(post.coverUrl)}" alt="" loading="lazy">` : '<span class="bl-cover" aria-hidden="true"></span>'}</a>
  <div>${tagsOf(post, ctx.categories, ctx.base)}<h2><a href="${esc(ctx.base)}/${esc(post.slug)}">${esc(post.title)}</a></h2>${post.summary ? `<p>${esc(post.summary)}</p>` : ''}
  <span class="bl-meta">${esc(day(post.publishAt || post.publishedAt))} · ${readingTime(post.body)} min de leitura${ctx.author(post) ? ` · ${esc(ctx.author(post).name)}` : ''}</span></div></article>`;

const context = (state, blog, base) => {
  const categories = (state.blogCategories || []).filter(cat => (state.blogPosts || []).some(post => post.blogId === blog.id && isLive(post) && post.categoryIds?.includes(cat.id)));
  return { base, categories, author: post => (state.blogAuthors || []).find(row => row.id === post.authorId) };
};

export function blogHome(state, blog, { base, origin = '', category = '', page = 1 }) {
  const ctx = context(state, blog, base);
  const cat = ctx.categories.find(item => item.slug === category);
  const per = Math.max(3, Math.min(30, Number(blog.perPage) || 9));
  const posts = (state.blogPosts || []).filter(post => post.blogId === blog.id && isLive(post) && (!cat || post.categoryIds?.includes(cat.id)))
    .sort((a, b) => String(b.publishAt || b.publishedAt).localeCompare(String(a.publishAt || a.publishedAt)));
  const pages = Math.max(1, Math.ceil(posts.length / per)), at = Math.min(pages, Math.max(1, page));
  const query = n => `${base}?${cat ? `categoria=${cat.slug}&` : ''}pagina=${n}`;
  const body = `<section class="bl-hero"><h1>${esc(cat ? cat.name : blog.name)}</h1>${(cat ? cat.description : blog.description) ? `<p>${esc(cat ? cat.description : blog.description)}</p>` : ''}</section>
    ${posts.length ? `<div class="bl-grid">${posts.slice((at - 1) * per, at * per).map(post => card(post, ctx)).join('')}</div>` : '<p class="bl-empty">Nenhum artigo publicado ainda.</p>'}
    ${pages > 1 ? `<nav class="bl-pages" aria-label="Páginas">${at > 1 ? `<a href="${esc(query(at - 1))}">← Mais recentes</a>` : '<span></span>'}<span>Página ${at} de ${pages}</span>${at < pages ? `<a href="${esc(query(at + 1))}">Mais antigos →</a>` : '<span></span>'}</nav>` : ''}`;
  return layout({ blog, base, title: cat ? `${cat.name} · ${blog.name}` : blog.seoTitle || blog.name, description: (cat ? cat.description : blog.seoDescription || blog.description) || blog.name,
    canonical: origin ? `${origin}${base}${cat ? `?categoria=${cat.slug}` : ''}` : '', body, categories: ctx.categories, current: cat?.slug || '' });
}

export function blogPost(state, blog, post, { base, origin = '', preview = false }) {
  const ctx = context(state, blog, base), author = ctx.author(post);
  const related = (state.blogPosts || []).filter(item => item.blogId === blog.id && item.id !== post.id && isLive(item))
    .map(item => ({ item, shared: (item.categoryIds || []).filter(id => post.categoryIds?.includes(id)).length }))
    .sort((a, b) => b.shared - a.shared || String(b.item.publishAt || b.item.publishedAt).localeCompare(String(a.item.publishAt || a.item.publishedAt))).slice(0, 3).map(row => row.item);
  const body = `<article><header>${tagsOf(post, ctx.categories, base)}<h1>${esc(post.title)}</h1>${post.summary ? `<p>${esc(post.summary)}</p>` : ''}
      <p class="bl-meta">${esc(day(post.publishAt || post.publishedAt || (preview ? new Date().toISOString() : '')))} · ${readingTime(post.body)} min de leitura${author ? ` · ${esc(author.name)}` : ''}${preview ? ' · Prévia' : ''}</p></header>
      ${post.coverUrl ? `<img class="bl-cover" src="${esc(post.coverUrl)}" alt="">` : ''}<div class="bl-body">${markdown(post.body)}</div>
      ${author ? `<aside class="bl-author"><span class="bl-avatar" aria-hidden="true">${esc(author.name.charAt(0).toUpperCase())}</span><div><b>${esc(author.name)}</b>${author.bio ? `<br>${esc(author.bio)}` : ''}</div></aside>` : ''}</article>
    ${related.length ? `<section class="bl-related"><h2>Leia também</h2><div class="bl-grid">${related.map(item => card(item, ctx)).join('')}</div></section>` : ''}`;
  return layout({ blog, base, title: post.seoTitle || `${post.title} · ${blog.name}`, description: post.seoDescription || post.summary || plainText(post.body).slice(0, 155),
    canonical: origin && !preview ? `${origin}${base}/${post.slug}` : '', body, categories: ctx.categories, image: post.coverUrl, type: 'article' });
}

const xml = value => String(value ?? '').replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]);
export function blogRss(state, blog, { base, origin }) {
  const posts = (state.blogPosts || []).filter(post => post.blogId === blog.id && isLive(post))
    .sort((a, b) => String(b.publishAt || b.publishedAt).localeCompare(String(a.publishAt || a.publishedAt))).slice(0, 30);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${xml(blog.name)}</title><link>${xml(origin + base)}</link><description>${xml(blog.description || blog.name)}</description><language>pt-BR</language>
${posts.map(post => `<item><title>${xml(post.title)}</title><link>${xml(`${origin}${base}/${post.slug}`)}</link><guid isPermaLink="false">${xml(post.id)}</guid><pubDate>${new Date(post.publishAt || post.publishedAt).toUTCString()}</pubDate><description>${xml(post.summary || plainText(post.body).slice(0, 300))}</description></item>`).join('\n')}
</channel></rss>`;
}
